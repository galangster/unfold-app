/**
 * useCheckInNotifications — Keeps the midday check-in and evening wind-down
 * notification schedules in sync with premium state and user preferences.
 *
 * Why this exists:
 *
 * Check-in notifications are premium-only. We must not schedule new premium
 * reminders from a stale persisted mirror of RevenueCat state. Previously the
 * gate was a boolean from `useUnfoldStore`:
 *
 *   const isPremium = useUnfoldStore((s) => s.user?.isPremium ?? false);
 *
 * But that boolean is a persisted MIRROR of RevenueCat state. On cold start,
 * it can still hold the *last known* answer from before a user churned —
 * RevenueCat has not reported in for this session yet. During that brief
 * window, a naive `useEffect` could read `isPremium === true` and schedule
 * notifications against a user who cancelled their subscription yesterday.
 *
 * The opposite edge matters too: actively cancelling an existing DAILY/WEEKLY
 * OS schedule while policy is still `unknown` can make a legitimate premium
 * user miss today's reminder if RevenueCat is slow, offline, or still
 * migrating identity. So `unknown` means "defer without touching the OS
 * queue". Once RevenueCat definitively resolves, this owner either schedules
 * fresh reminders (`granted`) or cancels both (`denied`).
 *
 * Strategy (ported from `useDailyReminderSync`, sharpened for premium gating):
 *   1. Tri-state premium policy (`usePremiumAccessPolicy`) — `unknown` means
 *      "do not schedule new premium reminders yet; preserve existing OS
 *      schedules until the source resolves."
 *   2. Single reactive owner — one hook mounted once at the root layout.
 *      Every write to the OS queue flows through `runSync`. No imperative
 *      "just reschedule tomorrow" helpers at call sites (those have been
 *      deleted — they silently downgraded DAILY triggers to one-shot DATE
 *      triggers, breaking recurrence).
 *   3. Fingerprint + debounce — coalesce rapid changes, serialize in-flight
 *      runs, re-read state at execution time, stale-check after await.
 *   4. Passive permission — never prompt from sync, only use existing state.
 *   5. AppState foreground reconcile — catches backgrounded churn events
 *      (user cancels subscription in System Settings while Unfold is
 *      backgrounded; RC callback fires on next foreground).
 *
 * Mount this ONCE in src/app/_layout.tsx alongside useDailyReminderSync.
 *
 * See also:
 *   - ~/vault/standards/persisted-external-state-is-cache-not-truth.md
 *   - ~/vault/standards/one-owner-per-os-resource.md
 *   - ~/vault/gotchas/expo-reschedule-helpers-silent-one-shot-downgrade.md
 */

import { useEffect, useRef } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import { useUnfoldStore, useHasHydrated } from '@/lib/store';
import { getTodayCarryLine } from '@/lib/home-devotional-state';
import { usePremiumAccessPolicy } from '@/hooks/usePremiumAccessPolicy';
import { getEffectivePremiumAccessPolicy } from '@/lib/premium-state';
import {
  scheduleMiddayCheckIn,
  scheduleEveningWindDown,
  cancelMiddayCheckIn,
  cancelEveningWindDown,
  areNotificationsEnabled,
} from '@/lib/notifications';
import { logger } from '@/lib/logger';
import { getCheckInNotificationGatePlan } from '@/lib/check-in-notification-sync-policy';

const DEBOUNCE_MS = 500;

/**
 * Build a fingerprint of every piece of state that affects whether or when
 * check-in notifications should fire. If you add a new branch to `runSync`,
 * add its inputs here.
 *
 * Deliberately EXCLUDES `lastMiddayCompletedDate` / `lastEveningCompletedDate`:
 * those fields track completion for analytics and as a state-based alternative
 * to imperative rescheduling — but they do NOT change the schedule. We always
 * schedule DAILY/WEEKLY regardless of today's completion (the recurring
 * triggers recur tomorrow on their own). Including them would cause an
 * unnecessary re-run on every check-in completion without changing the
 * scheduling output.
 *
 * If we ever introduce a "skip today only" mode, wire those fields in here.
 *
 * INCLUDES `middayCheckInByDay` / `eveningWindDownByDay`: these drive the
 * DAILY-vs-WEEKLY branching in `scheduleMiddayCheckIn` / `scheduleEveningWindDown`.
 * Without them in the fingerprint, the per-day customize UI in
 * `checkin-schedule.tsx` would silently write dead state and the owner hook
 * would never reconcile. That was a pre-existing dead-write bug Codex caught
 * during the churned-user audit — see
 * ~/vault/standards/grep-read-path-when-touching-ui.md
 */
function useCheckInFingerprint(): string {
  const policy = usePremiumAccessPolicy();
  const middayEnabled = useUnfoldStore((s) => s.middayCheckInEnabled);
  const eveningEnabled = useUnfoldStore((s) => s.eveningWindDownEnabled);
  const middayTime = useUnfoldStore((s) => s.middayCheckInTime);
  const eveningTime = useUnfoldStore((s) => s.eveningWindDownTime);
  const middayByDay = useUnfoldStore((s) => s.middayCheckInByDay);
  const eveningByDay = useUnfoldStore((s) => s.eveningWindDownByDay);
  const hasCompletedOnboarding = useUnfoldStore((s) => !!s.user?.hasCompletedOnboarding);
  // INCLUDED: today's carry line. scheduleMiddayCheckIn writes it into the
  // notification body, so when the reader finishes today's day (isRead flips
  // and the carry line becomes available) the schedule must be rewritten —
  // otherwise the generic copy scheduled at app start fires instead. The
  // wall-clock-day check in runSync clears yesterday's line on a new day.
  const todayCarryLine = useUnfoldStore(
    (s) => getTodayCarryLine(s.devotionals, s.currentDevotionalId) ?? '',
  );

  return JSON.stringify([
    policy,
    middayEnabled ? '1' : '0',
    eveningEnabled ? '1' : '0',
    middayTime,
    eveningTime,
    middayByDay,
    eveningByDay,
    hasCompletedOnboarding ? '1' : '0',
    todayCarryLine,
  ]);
}

export function useCheckInNotifications() {
  const hasHydrated = useHasHydrated();
  const fingerprint = useCheckInFingerprint();

  // Coordination refs for debounce + in-flight serialization.
  // See useDailyReminderSync for the rationale on each ref.
  const lastAppliedRef = useRef<string>('');
  const lastAppliedDayRef = useRef<string>('');
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inFlightRef = useRef(false);
  const pendingRef = useRef(false);
  const latestFingerprintRef = useRef<string>(fingerprint);

  // Keep the latest fingerprint in a ref so queued runs read the freshest
  // value when they finally execute (not the value at enqueue time).
  latestFingerprintRef.current = fingerprint;

  async function runSync(reason: 'hydration' | 'fingerprint' | 'foreground'): Promise<void> {
    if (!hasHydrated) return;

    const target = latestFingerprintRef.current;
    const todayStr = new Date().toDateString();

    // Skip no-op runs. A sync is a no-op iff:
    //   - fingerprint is unchanged (same inputs), AND
    //   - the wall-clock day is unchanged
    // Hydration runs always proceed so we establish the baseline in lastApplied.
    if (
      reason !== 'hydration' &&
      target === lastAppliedRef.current &&
      todayStr === lastAppliedDayRef.current
    ) {
      return;
    }

    if (inFlightRef.current) {
      pendingRef.current = true;
      return;
    }

    inFlightRef.current = true;
    try {
      // Re-read state at execution time so queued runs pick up the freshest
      // values — not whatever was current when they were enqueued.
      const state = useUnfoldStore.getState();
      const hasCompletedOnboarding = !!state.user?.hasCompletedOnboarding;
      const middayEnabled = state.middayCheckInEnabled;
      const eveningEnabled = state.eveningWindDownEnabled;

      // Tri-state premium gate. Re-read via the non-React getter so we get
      // the freshest values at execution time (not whatever was captured in
      // the hook closure when the fingerprint was built).
      const policy = getEffectivePremiumAccessPolicy();
      const gatePlan = getCheckInNotificationGatePlan({
        hasCompletedOnboarding,
        policy,
      });

      if (gatePlan.kind === 'cancel-both') {
        // Onboarding incomplete means the user is not ready for check-in
        // reminders at all. Premium denied means RevenueCat has definitively
        // told us to remove premium-only reminders. Both are hard cancels.
        await cancelMiddayCheckIn();
        await cancelEveningWindDown();
        lastAppliedRef.current = target;
        lastAppliedDayRef.current = todayStr;
        logger.log(
          `[useCheckInNotifications] ${gatePlan.reason}; cancelled both (reason=${reason})`,
        );
        return;
      }

      if (gatePlan.kind === 'defer') {
        // RevenueCat has not reported in this session yet. Do not schedule new
        // premium reminders from a potentially stale persisted mirror — but
        // also do not delete existing DAILY/WEEKLY OS schedules. Deleting on
        // every cold start/foreground can make active premium users miss the
        // same-day midday/evening reminder if RC is slow, offline, or still
        // migrating identity. When RC resolves, the policy fingerprint changes
        // and this owner will either schedule fresh reminders (granted) or
        // cancel both (denied). Deliberately do NOT mark this fingerprint as
        // applied, so foreground reconciles keep checking while unresolved.
        logger.log(`[useCheckInNotifications] Policy unknown; deferred without touching OS queue (reason=${reason})`);
        return;
      }

      // policy === 'granted'
      // Passive permission check — NEVER prompt from sync. Do NOT mark applied
      // on this branch: if the user later grants permission in iOS Settings and
      // foregrounds the app, we want the foreground reconcile to re-run and
      // converge. Marking applied here would leave the skip check at the top
      // of runSync matching (F1, D1) and silently bail out, stranding the user
      // without check-in notifications until the fingerprint changes for an
      // unrelated reason.
      const hasPermission = await areNotificationsEnabled();
      if (!hasPermission) {
        logger.log('[useCheckInNotifications] No OS permission; skipping schedule');
        return;
      }

      if (middayEnabled) {
        await scheduleMiddayCheckIn();
      } else {
        await cancelMiddayCheckIn();
      }

      if (eveningEnabled) {
        await scheduleEveningWindDown();
      } else {
        await cancelEveningWindDown();
      }

      // Post-schedule stale-check: if state changed during any of the awaits
      // above (e.g. user churned mid-flight and RC callback fired, or user
      // tapped "Delete Everything"), the just-scheduled notifications may be
      // against dead state. Cancel both and let the next run converge on
      // the new state. Without this, a scheduleNotificationAsync() call
      // racing with a churn event can leak notifications to a non-premium
      // user.
      const freshPolicy = getEffectivePremiumAccessPolicy();
      if (latestFingerprintRef.current !== target || freshPolicy !== 'granted') {
        await cancelMiddayCheckIn();
        await cancelEveningWindDown();
        pendingRef.current = true;
        logger.log('[useCheckInNotifications] State changed during schedule; cancelled and re-queuing');
        return;
      }

      lastAppliedRef.current = target;
      lastAppliedDayRef.current = todayStr;
      logger.log(
        `[useCheckInNotifications] Synced (reason=${reason}, midday=${middayEnabled}, evening=${eveningEnabled})`,
      );
    } catch (error) {
      logger.error('[useCheckInNotifications] Sync failed:', error);
    } finally {
      inFlightRef.current = false;
      if (pendingRef.current) {
        pendingRef.current = false;
        // Drain the pending run without re-awaiting from the caller.
        void runSync('fingerprint');
      }
    }
  }

  // First run after hydration. Before hydration the store is empty — we'd
  // be evaluating the policy against default state and potentially cancelling
  // real pending notifications.
  useEffect(() => {
    if (!hasHydrated) return;
    void runSync('hydration');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasHydrated]);

  // Debounced fingerprint watcher. Coalesces rapid state changes — toggle
  // taps, time picker adjustments, policy transitions from RC listener.
  useEffect(() => {
    if (!hasHydrated) return;
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    debounceTimerRef.current = setTimeout(() => {
      void runSync('fingerprint');
    }, DEBOUNCE_MS);
    return () => {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasHydrated, fingerprint]);

  // Foreground reconcile. Catches:
  //  - Churn events that happened while backgrounded (RC listener fires on
  //    foreground, but we also re-read policy here as a safety net)
  //  - iOS Settings permission changes
  //  - Drift if the app sat in the background through state changes
  useEffect(() => {
    const handle = (nextState: AppStateStatus) => {
      if (nextState !== 'active') return;
      void runSync('foreground');
    };
    const sub = AppState.addEventListener('change', handle);
    return () => sub.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasHydrated]);
}
