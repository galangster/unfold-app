/**
 * useDailyReminderSync — Keeps the daily reminder notification payload in sync
 * with the current devotional/day content.
 *
 * Why this exists:
 * expo-notifications' DAILY recurring trigger bakes `content.title` and
 * `content.body` into the scheduled request at schedule time. iOS stores the
 * UNNotificationRequest in the OS, Android persists it in SharedPreferences —
 * neither platform re-reads JS state on fire. So once a user deletes or
 * switches the current devotional, the old payload keeps firing at 8am forever
 * until we re-call `scheduleDailyReminder()` with fresh content.
 *
 * Previously nothing did that. Users got notifications for devotionals they
 * had deleted weeks ago ("When God Signs His Name - Day 5").
 *
 * Strategy (recommended by Codex adversarial review):
 * 1. Build a fingerprint string from all state that affects notification copy.
 * 2. Subscribe to that fingerprint in a single hook mounted at the root layout.
 * 3. On change, debounce 750ms (to coalesce rapid switches) then reschedule.
 * 4. Also reschedule on app foreground (catches midnight rollover / overdue).
 * 5. Hydration-gate the first run so we don't overwrite a good pending payload
 *    with the pre-hydration fallback copy.
 * 6. Never prompt for permission from passive sync — only use existing
 *    permission state.
 *
 * Mount this ONCE in src/app/_layout.tsx alongside useCheckInNotifications.
 */

import { useEffect, useRef } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import { useUnfoldStore, useHasHydrated } from '@/lib/store';
import {
  scheduleDailyReminder,
  cancelNotificationById,
  areNotificationsEnabled,
  NOTIFICATION_IDS,
} from '@/lib/notifications';
import { logger } from '@/lib/logger';
import { usePremiumAccessPolicy } from '@/hooks/usePremiumAccessPolicy';
import { buildDailyReminderFingerprint } from '@/lib/daily-reminder-content';

const DEBOUNCE_MS = 750;

/**
 * Build a fingerprint of every piece of state that feeds `getNotificationContent()`.
 * If this string changes, the notification payload is stale and must be rescheduled.
 *
 * NOTE: This must mirror EXACTLY the fields that `getNotificationContent()` reads
 * in src/lib/notifications.ts. If you add a branch in that function, add the
 * dependent fields here.
 */
function useReminderFingerprint(premiumPolicy: ReturnType<typeof usePremiumAccessPolicy>): string {
  return useUnfoldStore((state) => {
    const reminderTime = state.user?.reminderTime ?? '';
    const dailyReminderEnabled = state.user?.dailyReminderEnabled ?? Boolean(reminderTime);
    const currentDevotional =
      state.devotionals.find((devotional) => devotional.id === state.currentDevotionalId) ?? null;

    return buildDailyReminderFingerprint({
      reminderTime,
      dailyReminderEnabled,
      currentDevotional,
      premiumPolicy,
    });
  });
}

export function useDailyReminderSync() {
  const hasHydrated = useHasHydrated();
  const premiumPolicy = usePremiumAccessPolicy();
  const fingerprint = useReminderFingerprint(premiumPolicy);

  // Refs coordinate async work so rapid fingerprint changes coalesce into
  // at most one in-flight schedule + one pending rerun.
  const lastAppliedRef = useRef<string>('');
  // Tracks the wall-clock day string (`toDateString()`) of the last successful
  // schedule. Needed because `getNotificationContent()` has an "overdue" branch
  // that flips on midnight rollover — a change the fingerprint alone can't
  // detect without a re-render.
  const lastAppliedDayRef = useRef<string>('');
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inFlightRef = useRef(false);
  const pendingRef = useRef(false);
  const latestFingerprintRef = useRef<string>(fingerprint);
  const latestPremiumPolicyRef = useRef(premiumPolicy);

  // Keep the latest fingerprint/policy in refs so `runSync` always reads the
  // freshest value when a queued or foreground run finally executes.
  latestFingerprintRef.current = fingerprint;
  latestPremiumPolicyRef.current = premiumPolicy;

  async function runSync(reason: 'hydration' | 'fingerprint' | 'foreground'): Promise<void> {
    if (!hasHydrated) return;
    const targetPremiumPolicy = latestPremiumPolicyRef.current;
    if (targetPremiumPolicy === 'unknown') {
      logger.log(`[useDailyReminderSync] Premium policy unknown; deferring daily reminder sync (reason=${reason})`);
      return;
    }

    const target = latestFingerprintRef.current;
    const todayStr = new Date().toDateString();

    // Skip no-op runs. A sync is a no-op iff:
    //   - fingerprint is unchanged (same content inputs), AND
    //   - the wall-clock day is unchanged (overdue branch can't have flipped)
    // We apply the skip to fingerprint AND foreground runs — foreground used
    // to be unconditional, which caused a race: rescheduling at 7:59:59 would
    // cancel today's pending 8:00 notification and recreate it after the fire
    // time, silently dropping a day.
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
      // Re-read state at execution time so a queued run picks up the freshest
      // values, not whatever was current when it was enqueued.
      const state = useUnfoldStore.getState();
      const reminderTime = state.user?.reminderTime;
      const dailyReminderEnabled = state.user?.dailyReminderEnabled ?? Boolean(reminderTime);

      if (!reminderTime || !dailyReminderEnabled) {
        // No reminder configured or user disabled it — make sure nothing is
        // pending in the OS without touching check-in notifications.
        await cancelNotificationById(NOTIFICATION_IDS.DAILY_REMINDER);
        lastAppliedRef.current = latestFingerprintRef.current;
        lastAppliedDayRef.current = todayStr;
        logger.log(`[useDailyReminderSync] Daily reminder disabled; cancelled daily reminder (reason=${reason})`);
        return;
      }

      // Passive sync — NEVER prompt. If permission is off, leave it off.
      const hasPermission = await areNotificationsEnabled();
      if (!hasPermission) {
        logger.log('[useDailyReminderSync] No permission; skipping schedule');
        return;
      }

      await scheduleDailyReminder(reminderTime);

      // Post-schedule stale-check: if state changed during the await (e.g.
      // user tapped "Delete Everything" mid-flight and we just recreated a
      // notification against dead state), cancel it and let the next run
      // converge. Without this, a scheduleNotificationAsync() call racing
      // with `reset()` can leak a ghost notification past cancelAllReminders.
      const freshState = useUnfoldStore.getState();
      const freshReminderTime = freshState.user?.reminderTime;
      const freshDailyReminderEnabled = freshState.user?.dailyReminderEnabled ?? Boolean(freshReminderTime);
      if (!freshReminderTime || !freshDailyReminderEnabled || latestFingerprintRef.current !== target) {
        await cancelNotificationById(NOTIFICATION_IDS.DAILY_REMINDER);
        // Force another run to converge on the new state.
        pendingRef.current = true;
        logger.log('[useDailyReminderSync] State changed during schedule; cancelled and re-queuing');
        return;
      }

      lastAppliedRef.current = latestFingerprintRef.current;
      lastAppliedDayRef.current = todayStr;
      logger.log(`[useDailyReminderSync] Rescheduled daily reminder (reason=${reason})`);
    } catch (error) {
      logger.error('[useDailyReminderSync] Sync failed:', error);
    } finally {
      inFlightRef.current = false;
      if (pendingRef.current) {
        pendingRef.current = false;
        // Drain the pending run without re-awaiting from the caller.
        void runSync('fingerprint');
      }
    }
  }

  // Fire first run after hydration completes. Without this gate the store is
  // empty on cold start and we'd overwrite a good pending notification with
  // "Ready for something new?" fallback copy.
  useEffect(() => {
    if (!hasHydrated) return;
    void runSync('hydration');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasHydrated]);

  // Debounced fingerprint watcher. Coalesces rapid devotional switches.
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

  // Foreground reconciliation. Catches:
  //  - Midnight rollover (overdue copy branch in getNotificationContent)
  //  - Permission changes from OS settings
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
