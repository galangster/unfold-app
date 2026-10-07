/**
 * The OS-queue write for the morning reading reminder.
 *
 * `useDailyReminderSync` is the React owner: it watches the fingerprint,
 * debounces, and reconciles on foreground. The BGAppRefresh task
 * (`check-in-background-topup`) calls the same write so a reader who stops
 * opening the app keeps getting mornings past the first horizon. Both paths
 * go through `scheduleDailyReminderHorizon`: one owner decision, one
 * builder, one identifier family.
 */

import { useUnfoldStore, type Devotional } from '@/lib/store';
import {
  areNotificationsEnabled,
  beginDailyReminderOperation,
  isDailyReminderOriginCurrent,
  scheduleDailyReminderMornings,
} from '@/lib/notifications';
import {
  buildDailyReminderFingerprint,
  buildDailyReminderSchedule,
  getDailyReminderOwner,
  type DailyReminderOwner,
} from '@/lib/daily-reminder-content';
import { getCurrentDevotional, hasReadAnyDayToday } from '@/lib/home-devotional-state';
import { getEffectivePremiumAccessPolicy } from '@/lib/premium-state';
import type { PremiumAccessPolicy } from '@/lib/premium-access-policy';
import { parseReminderClock } from '@/lib/push-notification-helpers';
import { captureSyncSession } from '@/lib/sync-session-fence';
import { getDeviceTimezone } from '@/lib/device-timezone';
import { logger } from '@/lib/logger';

/**
 * Appends the device timezone, read at the moment of the call, to a
 * reminder fingerprint.
 *
 * The horizon is absolute instants. The retired DAILY trigger fired at the
 * device's clock time in whatever zone it was in; a dated morning keeps the
 * zone it was built in. A reader who flies New York to Los Angeles keeps an
 * 08:00 New York morning, which fires at 05:00 local, until the horizon is
 * rewritten. Nothing else in the fingerprint changes on a flight, and the
 * date often does not either, so without this every skip gate (the hook's
 * same-fingerprint-same-day check, the background latch) holds the old
 * zone's mornings. Read it when the run executes, not at the last render:
 * a foreground after landing re-renders nothing. Same pitfall as
 * check-in-schedule.ts and useCheckInNotifications.
 */
export function withDeviceTimezone(fingerprint: string): string {
  return `${fingerprint}|tz:${getDeviceTimezone() ?? ''}`;
}

/**
 * Mirrors "the local queue holds the morning the next day opens" onto the
 * profile. The backend reads it at send time and skips its ready push only
 * then, so the reader never gets two banners that morning. A server-owned
 * slot still has local mornings after it; those do not count. Only writes
 * on change: the profile sync hook ships every user write to the server.
 */
export function mirrorLocalReminderScheduled(scheduled: boolean): void {
  const state = useUnfoldStore.getState();
  if (!state.user || state.user.localDailyReminderScheduled === scheduled) return;
  state.updateUser({ localDailyReminderScheduled: scheduled });
}

function getLatestReadAt(devotional: Devotional | null | undefined): Date | null {
  let latest: Date | null = null;
  for (const day of devotional?.days ?? []) {
    if (!day.isRead || !day.readAt) continue;
    const readAt = new Date(day.readAt);
    if (Number.isNaN(readAt.getTime())) continue;
    if (!latest || readAt > latest) latest = readAt;
  }
  return latest;
}

export interface DailyReminderHorizonWrite {
  owner: DailyReminderOwner;
  /** Every morning landed; only then may the caller record the sync. */
  complete: boolean;
  /**
   * The local queue holds the next morning, so the server must not push on
   * it. Mirror this onto the profile whenever the operation is still
   * current, complete or not: a partial write that holds the next morning
   * must not let the server's ready push land on top of it.
   */
  holdsNextMorning: boolean;
}

/**
 * Decide who owns the next morning and write the local horizon. When the
 * server owns it, that morning is not in the horizon, so the local queue
 * never holds it.
 */
export async function scheduleDailyReminderHorizon(
  reminderTime: string,
  premiumPolicy: PremiumAccessPolicy,
  originatingSession: number,
  originatingOperation: number,
  now = new Date(),
): Promise<DailyReminderHorizonWrite> {
  const state = useUnfoldStore.getState();
  const currentDevotional = getCurrentDevotional(state.devotionals, state.currentDevotionalId);
  const owner = getDailyReminderOwner({
    currentDevotional,
    premiumPolicy,
    pushRegistered: Boolean(state.user?.pushRegisteredAt),
  });
  const dates = buildDailyReminderSchedule({
    clock: parseReminderClock(reminderTime),
    owner,
    readToday: hasReadAnyDayToday(state.devotionals, now),
    lastReadAt: getLatestReadAt(currentDevotional),
    now,
  });
  const write = await scheduleDailyReminderMornings(dates, owner, originatingSession, originatingOperation);
  return {
    owner,
    complete: write.complete,
    holdsNextMorning: owner === 'local' && write.holdsFirstMorning,
  };
}

export type DailyReminderTopupOutcome = 'written' | 'skipped' | 'deferred' | 'failed';

// Same-day latch, like the check-in sync's: a fresh process (terminated
// app) starts empty and always refills; later wakes that day do not churn
// the queue. Keyed on the device timezone too, so a wake after a flight
// rewrites the old zone's mornings (withDeviceTimezone).
let lastBackgroundRefill = '';

/** Test-only: clear the same-day latch between cases. */
export function resetDailyReminderBackgroundTopupForTests(): void {
  lastBackgroundRefill = '';
}

/**
 * BGAppRefresh refill. The caller has hydrated the store and resolved
 * premium. Fail closed: an unresolved policy, a reminder switched off, or
 * no permission leave the queue as the foreground owner left it.
 */
export async function runDailyReminderBackgroundTopup(now = new Date()): Promise<DailyReminderTopupOutcome> {
  try {
    const premiumPolicy = getEffectivePremiumAccessPolicy();
    if (premiumPolicy === 'unknown') return 'deferred';

    const state = useUnfoldStore.getState();
    const reminderTime = state.user?.reminderTime;
    const dailyReminderEnabled = state.user?.dailyReminderEnabled ?? Boolean(reminderTime);
    if (!reminderTime || !dailyReminderEnabled) return 'skipped';

    const refill = `${withDeviceTimezone(buildDailyReminderFingerprint({
      reminderTime,
      dailyReminderEnabled,
      currentDevotional: getCurrentDevotional(state.devotionals, state.currentDevotionalId),
      premiumPolicy,
      pushRegistered: Boolean(state.user?.pushRegisteredAt),
      readToday: hasReadAnyDayToday(state.devotionals, now),
    }))}|${now.toDateString()}`;
    if (refill === lastBackgroundRefill) return 'skipped';

    if (!(await areNotificationsEnabled())) return 'deferred';

    const originatingSession = captureSyncSession();
    const originatingOperation = beginDailyReminderOperation();
    const { owner, complete, holdsNextMorning } = await scheduleDailyReminderHorizon(
      reminderTime,
      premiumPolicy,
      originatingSession,
      originatingOperation,
      now,
    );
    if (!isDailyReminderOriginCurrent(originatingSession, originatingOperation)) return 'skipped';

    mirrorLocalReminderScheduled(holdsNextMorning);
    // Not latched: the next wake retries the mornings that did not land.
    if (!complete) return 'failed';
    lastBackgroundRefill = refill;
    logger.log(`[daily-reminder-topup] Refilled the morning reminder (owner=${owner})`);
    return 'written';
  } catch (error) {
    logger.error('[daily-reminder-topup] Refill failed:', error);
    return 'failed';
  }
}
