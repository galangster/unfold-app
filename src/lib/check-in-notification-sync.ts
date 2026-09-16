/**
 * The OS-queue write for midday check-in and evening wind-down.
 *
 * `useCheckInNotifications` is the React owner: it watches fingerprints,
 * debounces, and reconciles on foreground. The BGAppRefresh task calls the
 * same write so a reader who does not open the app still gets a 14-day
 * refill. Both paths go through here — one cancel-then-write, one identifier
 * space, one trial-notice-safe budget. Do not add a second scheduler.
 *
 * Module-level in-flight state serializes a foreground reconcile against a
 * background wake in the same JS runtime. A fresh process (terminated app)
 * starts empty, so the first background run always writes.
 */

import { useUnfoldStore } from '@/lib/store';
import { getTodayCarryLine } from '@/lib/home-devotional-state';
import { getEffectivePremiumAccessPolicy } from '@/lib/premium-state';
import {
  scheduleMiddayCheckIn,
  scheduleEveningWindDown,
  cancelMiddayCheckIn,
  cancelEveningWindDown,
  areNotificationsEnabled,
} from '@/lib/notifications';
import { readTrialCheckInSkipDate } from '@/lib/trial-notification';
import { logger } from '@/lib/logger';
import { getCheckInNotificationGatePlan } from '@/lib/check-in-notification-sync-policy';
import { useUIState } from '@/lib/ui-state';
import { getDeviceTimezone } from '@/lib/device-timezone';
import {
  buildCheckInFingerprint,
  type CheckInFingerprintInputs,
} from '@/lib/check-in-notification-fingerprint';

export { buildCheckInFingerprint };
export type { CheckInFingerprintInputs };

export type CheckInSyncReason = 'hydration' | 'fingerprint' | 'foreground' | 'background';

export type CheckInSyncOutcome =
  | { kind: 'skipped'; reason: 'not-hydrated' | 'same-day-fingerprint' | 'in-flight' }
  | { kind: 'deferred'; reason: 'premium-unknown' | 'no-permission' }
  | { kind: 'cancelled'; reason: 'onboarding-incomplete' | 'premium-denied' }
  | { kind: 'synced'; midday: number; evening: number }
  | { kind: 'retry'; reason: 'stale' | 'incomplete' | 'error' };

export function readCheckInFingerprintInputs(): CheckInFingerprintInputs {
  const state = useUnfoldStore.getState();
  const ui = useUIState.getState();
  return {
    policy: getEffectivePremiumAccessPolicy(),
    middayEnabled: state.middayCheckInEnabled,
    eveningEnabled: state.eveningWindDownEnabled,
    middayTime: state.middayCheckInTime,
    eveningTime: state.eveningWindDownTime,
    middayByDay: state.middayCheckInByDay,
    eveningByDay: state.eveningWindDownByDay,
    hasCompletedOnboarding: !!state.user?.hasCompletedOnboarding,
    todayCarryLine: getTodayCarryLine(state.devotionals, state.currentDevotionalId) ?? '',
    notificationPermissionEpoch: ui.notificationPermissionEpoch,
    trialNoticeEpoch: ui.trialNoticeEpoch,
    deviceTimezone: getDeviceTimezone() ?? '',
  };
}

export function readCheckInFingerprint(): string {
  return buildCheckInFingerprint(readCheckInFingerprintInputs());
}

let lastApplied = '';
let lastAppliedDay = '';
let needsRetry = false;
let inFlight = false;
let pending = false;

/** Test-only: clear the skip/in-flight latch between suites. */
export function resetCheckInNotificationSyncForTests(): void {
  lastApplied = '';
  lastAppliedDay = '';
  needsRetry = false;
  inFlight = false;
  pending = false;
}

export async function runCheckInNotificationSync(
  reason: CheckInSyncReason,
  options?: {
    fingerprint?: string;
    getLiveFingerprint?: () => string;
  },
): Promise<CheckInSyncOutcome> {
  if (!useUnfoldStore.persist.hasHydrated()) {
    return { kind: 'skipped', reason: 'not-hydrated' };
  }

  const target = options?.fingerprint ?? readCheckInFingerprint();
  const liveFingerprint = options?.getLiveFingerprint ?? readCheckInFingerprint;
  const todayStr = new Date().toDateString();

  // Same skip as the owner hook: unchanged inputs on the same wall-clock
  // day, unless the last write failed. Background is included — a same-day
  // wake after a successful foreground write still has a full 14-day
  // horizon, and a cancel-then-write here would only churn the OS queue
  // next to the trial notice. A new day, a failed write, or a fresh
  // process (empty latch) still refills.
  if (
    reason !== 'hydration'
    && !needsRetry
    && target === lastApplied
    && todayStr === lastAppliedDay
  ) {
    return { kind: 'skipped', reason: 'same-day-fingerprint' };
  }

  if (inFlight) {
    pending = true;
    return { kind: 'skipped', reason: 'in-flight' };
  }

  inFlight = true;
  try {
    const state = useUnfoldStore.getState();
    const hasCompletedOnboarding = !!state.user?.hasCompletedOnboarding;
    const middayEnabled = state.middayCheckInEnabled;
    const eveningEnabled = state.eveningWindDownEnabled;

    const policy = getEffectivePremiumAccessPolicy();
    const gatePlan = getCheckInNotificationGatePlan({
      hasCompletedOnboarding,
      policy,
    });

    if (gatePlan.kind === 'cancel-both') {
      await cancelMiddayCheckIn();
      await cancelEveningWindDown();
      needsRetry = false;
      lastApplied = target;
      lastAppliedDay = todayStr;
      logger.log(
        `[useCheckInNotifications] ${gatePlan.reason}; cancelled both (reason=${reason})`,
      );
      return { kind: 'cancelled', reason: gatePlan.reason };
    }

    if (gatePlan.kind === 'defer') {
      // Do not schedule from a stale persisted premium mirror, and do not
      // delete an existing queue. Background inherits this: a wake before
      // RevenueCat answers is a no-op, not a wipe.
      logger.log(`[useCheckInNotifications] Policy unknown; deferred without touching OS queue (reason=${reason})`);
      return { kind: 'deferred', reason: 'premium-unknown' };
    }

    const hasPermission = await areNotificationsEnabled();
    if (!hasPermission) {
      logger.log('[useCheckInNotifications] No OS permission; skipping schedule');
      return { kind: 'deferred', reason: 'no-permission' };
    }

    const clock = { localDate: readTrialCheckInSkipDate(), now: new Date() };
    const [midday, evening] = await Promise.all([
      middayEnabled
        ? scheduleMiddayCheckIn(clock)
        : cancelMiddayCheckIn().then(() => ({ ids: [], complete: true })),
      eveningEnabled
        ? scheduleEveningWindDown(clock)
        : cancelEveningWindDown().then(() => ({ ids: [], complete: true })),
    ]);

    const freshPolicy = getEffectivePremiumAccessPolicy();
    if (liveFingerprint() !== target || freshPolicy !== 'granted') {
      await cancelMiddayCheckIn();
      await cancelEveningWindDown();
      needsRetry = true;
      pending = true;
      logger.log('[useCheckInNotifications] State changed during schedule; cancelled and re-queuing');
      return { kind: 'retry', reason: 'stale' };
    }

    if (!midday.complete || !evening.complete) {
      needsRetry = true;
      logger.error('[useCheckInNotifications] Incomplete write; leaving unsynced to retry');
      return { kind: 'retry', reason: 'incomplete' };
    }

    needsRetry = false;
    lastApplied = target;
    lastAppliedDay = todayStr;
    logger.log(
      `[useCheckInNotifications] Synced (reason=${reason}, midday=${midday.ids.length}, evening=${evening.ids.length})`,
    );
    return { kind: 'synced', midday: midday.ids.length, evening: evening.ids.length };
  } catch (error) {
    needsRetry = true;
    logger.error('[useCheckInNotifications] Sync failed:', error);
    return { kind: 'retry', reason: 'error' };
  } finally {
    inFlight = false;
    if (pending) {
      pending = false;
      void runCheckInNotificationSync('fingerprint');
    }
  }
}
