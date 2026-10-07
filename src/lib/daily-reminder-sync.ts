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
  scheduleDailyReminder,
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
import { logger } from '@/lib/logger';

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

/**
 * Decide who owns the next morning and write the local horizon. The caller
 * mirrors `owner === 'local'` once it confirms the operation is current.
 */
export async function scheduleDailyReminderHorizon(
  reminderTime: string,
  premiumPolicy: PremiumAccessPolicy,
  originatingSession: number,
  originatingOperation: number,
  now = new Date(),
): Promise<{ owner: DailyReminderOwner; scheduledId: string | null }> {
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
  const scheduledId = await scheduleDailyReminder(
    reminderTime,
    originatingSession,
    originatingOperation,
    { kind: 'dates', dates },
  );
  return { owner, scheduledId };
}

export type DailyReminderTopupOutcome = 'written' | 'skipped' | 'deferred' | 'failed';

// Same-day latch, like the check-in sync's: a fresh process (terminated
// app) starts empty and always refills; later wakes that day do not churn
// the queue.
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

    const refill = `${buildDailyReminderFingerprint({
      reminderTime,
      dailyReminderEnabled,
      currentDevotional: getCurrentDevotional(state.devotionals, state.currentDevotionalId),
      premiumPolicy,
      pushRegistered: Boolean(state.user?.pushRegisteredAt),
      readToday: hasReadAnyDayToday(state.devotionals, now),
    })}|${now.toDateString()}`;
    if (refill === lastBackgroundRefill) return 'skipped';

    if (!(await areNotificationsEnabled())) return 'deferred';

    const originatingSession = captureSyncSession();
    const originatingOperation = beginDailyReminderOperation();
    const { owner, scheduledId } = await scheduleDailyReminderHorizon(
      reminderTime,
      premiumPolicy,
      originatingSession,
      originatingOperation,
      now,
    );
    if (!isDailyReminderOriginCurrent(originatingSession, originatingOperation)) return 'skipped';
    if (scheduledId == null) return 'failed';

    mirrorLocalReminderScheduled(owner === 'local');
    lastBackgroundRefill = refill;
    logger.log(`[daily-reminder-topup] Refilled the morning reminder (owner=${owner})`);
    return 'written';
  } catch (error) {
    logger.error('[daily-reminder-topup] Refill failed:', error);
    return 'failed';
  }
}
