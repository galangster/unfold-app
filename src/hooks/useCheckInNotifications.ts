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
 * The opposite edge matters too: actively cancelling an existing check-in
 * schedule while policy is still `unknown` can make a legitimate premium
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
 *      Every write to the OS queue flows through `runCheckInNotificationSync`.
 *      The BGAppRefresh task calls that same write so the 14-day horizon
 *      refills without an open. No second scheduler.
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
import { useUIState } from '@/lib/ui-state';
import { getDeviceTimezone } from '@/lib/device-timezone';
import { buildCheckInFingerprint } from '@/lib/check-in-notification-fingerprint';
import { runCheckInNotificationSync } from '@/lib/check-in-notification-sync';

const DEBOUNCE_MS = 500;

/**
 * Build a fingerprint of every piece of state that affects whether or when
 * check-in notifications should fire. If you add a new branch to
 * `runCheckInNotificationSync`, add its inputs here.
 *
 * Deliberately EXCLUDES `lastMiddayCompletedDate` / `lastEveningCompletedDate`:
 * those fields track completion for analytics — they do NOT change the
 * schedule. Completing today's check-in does not remove tomorrow's occurrence,
 * and the horizon is rewritten on the next foreground anyway. Including them
 * would re-run this sync on every completion without changing its output.
 *
 * If we ever introduce a "skip today only" mode, wire those fields in here.
 *
 * INCLUDES `middayCheckInByDay` / `eveningWindDownByDay`: these drive the
 * per-weekday branching in `scheduleMiddayCheckIn` / `scheduleEveningWindDown`.
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
  const notificationPermissionEpoch = useUIState((s) => s.notificationPermissionEpoch);
  const trialNoticeEpoch = useUIState((s) => s.trialNoticeEpoch);
  // INCLUDED: the device timezone. Occurrences are written as absolute
  // instants, so a reader who flies London -> New York keeps receiving a
  // 12:30 London schedule at 07:30 local until it is rewritten. Nothing else
  // here would catch that: the fingerprint is otherwise unchanged and
  // `toDateString()` often still matches, so the foreground reconcile would
  // hit the skip gate in runSync and never rewrite. The retired DAILY trigger
  // fired on clock-time components and needed no such rewrite.
  const deviceTimezone = getDeviceTimezone() ?? '';

  return buildCheckInFingerprint({
    policy,
    middayEnabled,
    eveningEnabled,
    middayTime,
    eveningTime,
    middayByDay,
    eveningByDay,
    hasCompletedOnboarding,
    todayCarryLine,
    notificationPermissionEpoch,
    trialNoticeEpoch,
    deviceTimezone,
  });
}

export function useCheckInNotifications() {
  const hasHydrated = useHasHydrated();
  const fingerprint = useCheckInFingerprint();

  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestFingerprintRef = useRef<string>(fingerprint);

  // Keep the latest fingerprint in a ref so queued runs read the freshest
  // value when they finally execute (not the value at enqueue time).
  latestFingerprintRef.current = fingerprint;

  async function runSync(reason: 'hydration' | 'fingerprint' | 'foreground'): Promise<void> {
    if (!hasHydrated) return;
    await runCheckInNotificationSync(reason, {
      fingerprint: latestFingerprintRef.current,
      getLiveFingerprint: () => latestFingerprintRef.current,
    });
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
