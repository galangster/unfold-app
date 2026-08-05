import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { useUnfoldStore, type Devotional } from './store';
import { getEffectivePremiumAccessPolicy } from './premium-state';
import { logger } from '@/lib/logger';
import { getMessageForToday, MIDDAY_MESSAGES, EVENING_MESSAGES } from '@/constants/check-in-messages';
import { getTodayCarryLine } from '@/lib/home-devotional-state';
import { buildDevotionalReadyNotificationData } from '@/lib/push-notification-helpers';
import { getDailyReminderContent } from '@/lib/daily-reminder-content';

// Notification identifiers for targeted cancel/reschedule.
//
// Midday / evening check-ins now support two scheduling modes:
//   - Uniform mode (byDay === null): one DAILY trigger with the id below
//   - Per-day mode (byDay !== null): up to 7 WEEKLY triggers, one per day,
//     with the base id + "-{day}" suffix (e.g. 'unfold-midday-checkin-mon').
//
// The cancel path in `cancelMiddayCheckIn` / `cancelEveningWindDown` always
// clears BOTH the DAILY id and all 7 weekday ids on every run so that mode
// transitions don't leave orphan triggers in the OS queue. Cancelling a
// nonexistent identifier is a no-op in expo-notifications, so this is safe.
export const NOTIFICATION_IDS = {
  DAILY_REMINDER: 'unfold-daily-reminder',
  MIDDAY_CHECKIN: 'unfold-midday-checkin',
  EVENING_WINDDOWN: 'unfold-evening-winddown',
} as const;

// Day keys used across the store + UI + notifications layers.
// Order matters: WEEKLY ops are emitted in this order regardless of how the
// byDay map is keyed, so the test invariants can compare deterministically.
const CHECKIN_DAY_KEYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;
type CheckInDayKey = (typeof CHECKIN_DAY_KEYS)[number];

// Apple weekday convention used by expo-notifications WeeklyTriggerInput:
// Sun=1, Mon=2, Tue=3, Wed=4, Thu=5, Fri=6, Sat=7. This matches
// iOS Calendar.current and NSDateComponents. Do NOT switch to ISO 8601
// (Mon=1..Sun=7) — it will silently fire on the wrong day.
const WEEKDAY_NUMBER: Record<CheckInDayKey, number> = {
  Sun: 1,
  Mon: 2,
  Tue: 3,
  Wed: 4,
  Thu: 5,
  Fri: 6,
  Sat: 7,
};

// Discriminated schedule op. The pure decision function emits these; the
// live schedule functions loop them and call the appropriate
// scheduleNotificationAsync trigger type.
type ScheduleOp =
  | { kind: 'daily'; id: string; hour: number; minute: number }
  | { kind: 'weekly'; id: string; weekday: number; hour: number; minute: number };

// Parse "HH:mm" (24-hour) with graceful fallback. Mirrors the logic tested
// in src/lib/__tests__/notifications-scheduling.test.ts. Returns the
// fallback on any parse error or out-of-range values.
function parseHhMm(
  time: string,
  fallback: { hour: number; minute: number },
): { hour: number; minute: number } {
  const match = /^(\d{1,2}):(\d{2})$/.exec(time.trim());
  if (!match) return fallback;
  const hour = parseInt(match[1], 10);
  const minute = parseInt(match[2], 10);
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return fallback;
  return { hour, minute };
}

/**
 * Pure decision function for check-in scheduling. Given an identifier base,
 * a default time, an optional per-day override map, and a fallback time,
 * returns the list of schedule operations to install.
 *
 * Contract (see notifications-scheduling.test.ts for full invariants):
 *   - `byDay === null`  → single DAILY op at defaultTime with id=idBase
 *   - `byDay !== null`  → up to 7 WEEKLY ops, one per populated non-null day
 *   - Empty map or all-null map → empty array (no notifications scheduled)
 *   - Output is always in Mon→Sun order for deterministic tests
 */
function buildCheckInSchedule(
  idBase: string,
  defaultTime: string,
  byDay: Record<string, string | null> | null,
  fallback: { hour: number; minute: number },
): ScheduleOp[] {
  if (byDay === null) {
    const { hour, minute } = parseHhMm(defaultTime, fallback);
    return [{ kind: 'daily', id: idBase, hour, minute }];
  }

  const ops: ScheduleOp[] = [];
  for (const day of CHECKIN_DAY_KEYS) {
    const value = byDay[day];
    if (value === undefined || value === null) continue;
    const { hour, minute } = parseHhMm(value, fallback);
    ops.push({
      kind: 'weekly',
      id: `${idBase}-${day.toLowerCase()}`,
      weekday: WEEKDAY_NUMBER[day],
      hour,
      minute,
    });
  }
  return ops;
}

/**
 * All identifiers that belong to a given check-in (1 DAILY + 7 WEEKLY).
 * Cancel functions call this and clear every id on every run so that mode
 * transitions (uniform ↔ per-day, enable ↔ disable) never leave orphan
 * triggers in the OS queue. Cancelling a nonexistent id is a no-op.
 */
function getAllCheckInIdentifiers(idBase: string): string[] {
  return [idBase, ...CHECKIN_DAY_KEYS.map((d) => `${idBase}-${d.toLowerCase()}`)];
}

const MIDDAY_FALLBACK = { hour: 12, minute: 30 };
const EVENING_FALLBACK = { hour: 20, minute: 30 };

// Configure how notifications appear when the app is in the foreground
// This is critical for showing notifications when the user is in the app
Notifications.setNotificationHandler({
  handleNotification: async (notification) => {
    logger.log('[Notifications] Received notification in foreground:', notification.request.content.title);
    return {
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
      shouldShowBanner: true,
      shouldShowList: true,
    };
  },
});

// Request permission to send notifications
export async function requestNotificationPermissions(): Promise<boolean> {
  if (Platform.OS === 'web') {
    return false;
  }

  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  return finalStatus === 'granted';
}

// Check if notifications are enabled
export async function areNotificationsEnabled(): Promise<boolean> {
  if (Platform.OS === 'web') {
    return false;
  }

  const { status } = await Notifications.getPermissionsAsync();
  return status === 'granted';
}

// Cancel a specific scheduled notification by its identifier
export async function cancelNotificationById(identifier: string): Promise<void> {
  if (Platform.OS === 'web') return;
  await Notifications.cancelScheduledNotificationAsync(identifier);
  logger.log(`[Notifications] Cancelled notification: ${identifier}`);
}

// Parse time string like "8:00 AM" to hours and minutes
function parseTimeString(timeString: string): { hours: number; minutes: number } {
  const match = timeString.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
  if (!match) {
    return { hours: 8, minutes: 0 }; // Default to 8:00 AM
  }

  let hours = parseInt(match[1], 10);
  const minutes = parseInt(match[2], 10);
  const period = match[3].toUpperCase();

  if (period === 'PM' && hours !== 12) {
    hours += 12;
  } else if (period === 'AM' && hours === 12) {
    hours = 0;
  }

  return { hours, minutes };
}

// Reading-state-aware notification content
export function getNotificationContent(): { title: string; body: string } {
  const state = useUnfoldStore.getState();
  const currentDevotional = state.devotionals.find((d) => d.id === state.currentDevotionalId);
  return getDailyReminderContent({
    currentDevotional,
    premiumPolicy: getEffectivePremiumAccessPolicy(),
  });
}

function getCurrentDevotionalNotificationData(): ReturnType<typeof buildDevotionalReadyNotificationData> {
  const state = useUnfoldStore.getState();
  const currentDevotional = state.devotionals.find((d) => d.id === state.currentDevotionalId);
  if (!currentDevotional) return null;
  return buildDevotionalReadyNotificationData(currentDevotional, currentDevotional.currentDay);
}

// Schedule a daily reminder notification
export async function scheduleDailyReminder(timeString: string): Promise<string | null> {
  if (Platform.OS === 'web') {
    logger.log('[Notifications] Not available on web');
    return null;
  }

  // Cancel only the daily reminder (not midday/evening)
  await cancelNotificationById(NOTIFICATION_IDS.DAILY_REMINDER);

  const hasPermission = await requestNotificationPermissions();
  if (!hasPermission) {
    logger.log('[Notifications] Permission not granted');
    return null;
  }

  const { hours, minutes } = parseTimeString(timeString);
  const { title, body } = getNotificationContent();
  const data = getCurrentDevotionalNotificationData();

  try {
    const identifier = await Notifications.scheduleNotificationAsync({
      identifier: NOTIFICATION_IDS.DAILY_REMINDER,
      content: {
        title,
        body,
        sound: true,
        ...(data ? { data } : {}),
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DAILY,
        hour: hours,
        minute: minutes,
      },
    });

    logger.log(`[Notifications] Daily reminder scheduled for ${timeString} (${hours}:${minutes})`);
    logger.log(`[Notifications] Content: "${title}" — "${body.substring(0, 50)}..."`);
    return identifier;
  } catch (error) {
    logger.error('[Notifications] Failed to schedule:', error);
    return null;
  }
}

// Cancel all Unfold reminders (daily + midday + evening) by ID
export async function cancelAllReminders(): Promise<void> {
  if (Platform.OS === 'web') {
    return;
  }

  await Promise.all([
    cancelNotificationById(NOTIFICATION_IDS.DAILY_REMINDER),
    ...getAllCheckInIdentifiers(NOTIFICATION_IDS.MIDDAY_CHECKIN).map((identifier) =>
      cancelNotificationById(identifier),
    ),
    ...getAllCheckInIdentifiers(NOTIFICATION_IDS.EVENING_WINDDOWN).map((identifier) =>
      cancelNotificationById(identifier),
    ),
  ]);
  logger.log('[Notifications] All Unfold reminders cancelled');
}

// Send a test notification immediately
export async function sendTestNotification(): Promise<boolean> {
  if (Platform.OS === 'web') {
    logger.log('[Notifications] Not available on web');
    return false;
  }

  const hasPermission = await requestNotificationPermissions();
  if (!hasPermission) {
    logger.log('[Notifications] Permission not granted');
    return false;
  }

  const { title, body } = getNotificationContent();

  try {
    await Notifications.scheduleNotificationAsync({
      content: { title, body, sound: true },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
        seconds: 3,
      },
    });

    logger.log('[Notifications] Test notification scheduled for 3 seconds');
    logger.log(`[Notifications] Content: "${title}" — "${body.substring(0, 50)}..."`);
    return true;
  } catch (error) {
    logger.error('[Notifications] Failed to send test:', error);
    return false;
  }
}

// Get all scheduled notifications (for debugging)
export async function getScheduledNotifications(): Promise<Notifications.NotificationRequest[]> {
  if (Platform.OS === 'web') {
    return [];
  }

  return Notifications.getAllScheduledNotificationsAsync();
}

// Send a notification when Day 1 is ready (user may have left the app)
export async function sendDay1ReadyNotification(title: string): Promise<boolean> {
  if (Platform.OS === 'web') {
    logger.log('[Notifications] Not available on web');
    return false;
  }

  const hasPermission = await areNotificationsEnabled();
  logger.log('[Notifications] Day 1 ready - permission status:', hasPermission);

  if (!hasPermission) {
    logger.log('[Notifications] Permission not granted for Day 1 notification');
    return false;
  }

  try {
    const notificationId = await Notifications.scheduleNotificationAsync({
      content: {
        title: 'Day 1 is ready',
        body: `"${title}" — your first day is waiting for you.`,
        sound: true,
      },
      trigger: null, // Send immediately
    });

    logger.log('[Notifications] Day 1 ready notification sent, id:', notificationId);
    return true;
  } catch (error) {
    logger.error('[Notifications] Failed to send Day 1 notification:', error);
    return false;
  }
}

// Send a notification when devotional is ready
export async function sendDevotionalReadyNotification(title: string): Promise<boolean> {
  if (Platform.OS === 'web') {
    logger.log('[Notifications] Not available on web');
    return false;
  }

  const hasPermission = await areNotificationsEnabled();
  logger.log('[Notifications] Devotional ready - permission status:', hasPermission);

  if (!hasPermission) {
    logger.log('[Notifications] Permission not granted for completion notification');
    return false;
  }

  try {
    const notificationId = await Notifications.scheduleNotificationAsync({
      content: {
        title: 'Your devotional is ready',
        body: `"${title}" has been created. Open Unfold to begin.`,
        sound: true,
      },
      trigger: null, // Send immediately
    });

    logger.log('[Notifications] Devotional ready notification sent, id:', notificationId);
    return true;
  } catch (error) {
    logger.error('[Notifications] Failed to send completion notification:', error);
    return false;
  }
}

export async function scheduleDevotionalReadyTapTestNotification(
  devotional: Pick<Devotional, 'id' | 'title' | 'totalDays' | 'days'>,
  {
    dayNumber = 1,
    delaySeconds = 2,
  }: {
    dayNumber?: number;
    delaySeconds?: number;
  } = {},
): Promise<boolean> {
  if (Platform.OS === 'web') {
    logger.log('[Notifications] Not available on web');
    return false;
  }

  let hasPermission = await areNotificationsEnabled();
  logger.log('[Notifications] Devotional tap-test permission status:', hasPermission);
  if (!hasPermission) {
    const permission = await Notifications.requestPermissionsAsync();
    hasPermission = permission.status === 'granted';
    logger.log('[Notifications] Devotional tap-test permission request result:', permission.status);
  }
  if (!hasPermission) {
    logger.log('[Notifications] Permission not granted for devotional tap-test notification');
    return false;
  }

  const data = buildDevotionalReadyNotificationData(devotional, dayNumber);
  if (!data) {
    logger.warn('[Notifications] Cannot schedule devotional tap-test notification: day missing', {
      devotionalId: devotional.id,
      dayNumber,
    });
    return false;
  }

  try {
    const notificationId = await Notifications.scheduleNotificationAsync({
      content: {
        title: dayNumber === 1 ? 'Day 1 is ready' : 'Your devotional is ready',
        body:
          dayNumber === 1
            ? `"${data.dayTitle}" — your first day is waiting for you.`
            : `"${data.dayTitle}" is ready in ${data.seriesTitle}.`,
        sound: true,
        data,
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
        seconds: Math.max(1, Math.floor(delaySeconds)),
      },
    });

    logger.log('[Notifications] Devotional tap-test notification scheduled', {
      notificationId,
      devotionalId: data.devotionalId,
      dayNumber: data.dayNumber,
      delaySeconds: Math.max(1, Math.floor(delaySeconds)),
    });
    return true;
  } catch (error) {
    logger.error('[Notifications] Failed to schedule devotional tap-test notification:', error);
    return false;
  }
}

// Schedule midday check-in notification (Phase 2).
//
// Two scheduling modes based on the store's `middayCheckInByDay` field:
//   - Uniform (byDay === null): single DAILY trigger at `middayCheckInTime`.
//   - Per-day (byDay !== null): up to 7 WEEKLY triggers, one per populated
//     non-null weekday. Days set to null or absent are skipped.
//
// OS boundary gate: this function is the last line of defense against
// scheduling premium-only notifications for a non-premium user. It re-checks
// the tri-state premium access policy at call time and fails closed unless
// the policy is `granted`. If anything above this layer regresses (e.g. a new
// call site bypasses `useCheckInNotifications`), the gate here still holds.
//
// Defense-in-depth, not redundancy: the hook-level gate prevents normal
// scheduling from firing at the wrong moment; this gate prevents any lib
// caller — present or future — from writing to the OS queue without
// RevenueCat's blessing.
//
// Cancel-then-write pattern: EVERY call cancels all 8 possible identifiers
// (1 daily + 7 weekly) before scheduling. That way, mode transitions like
// uniform→per-day or disabling a specific day never leave orphan triggers in
// the OS queue.
//
// Returns an array of the identifiers that were actually scheduled (0-7
// items; empty array is a valid, no-error outcome when the user has every
// day set to skip).
export async function scheduleMiddayCheckIn(): Promise<string[]> {
  if (Platform.OS === 'web') return [];

  // Tri-state premium gate at the OS boundary. Fail closed on `unknown`
  // (RevenueCat hasn't reported in this session yet) and `denied` (churned).
  // Never cancel from this path — cancellation is the caller's job via
  // `cancelMiddayCheckIn()`. Returning an empty array here avoids touching
  // OS state and signals to the caller that the schedule was refused.
  const policy = getEffectivePremiumAccessPolicy();
  if (policy !== 'granted') {
    logger.log(`[Notifications] scheduleMiddayCheckIn refused — policy=${policy}`);
    return [];
  }

  // Cancel all possible ids (uniform + per-day) before writing fresh ones.
  // This keeps mode transitions clean with no orphan triggers.
  await cancelMiddayCheckIn();

  const hasPermission = await areNotificationsEnabled();
  if (!hasPermission) return [];

  // Read state fresh and compute the op list.
  const store = useUnfoldStore.getState();
  const timeStr = store.middayCheckInTime || '12:30';
  const byDay = store.middayCheckInByDay ?? null;
  const ops = buildCheckInSchedule(
    NOTIFICATION_IDS.MIDDAY_CHECKIN,
    timeStr,
    byDay,
    MIDDAY_FALLBACK,
  );

  // Per-day with every day skipped is a valid no-op — don't treat it as
  // an error, just log and return.
  if (ops.length === 0) {
    logger.log('[Notifications] Midday check-in: per-day mode with no enabled days; nothing scheduled');
    return [];
  }

  // Prefer the carry line from the day the reader completed today — the
  // devotional following them into their afternoon. Falls back to rotating
  // generic copy when they haven't read today. Weekly ops only use it for
  // today's weekday; a line scheduled onto another weekday would be stale
  // by the time it fired. (expo WEEKLY weekday: 1=Sunday … 7=Saturday.)
  const todayCarryLine = getTodayCarryLine(
    store.devotionals,
    store.currentDevotionalId,
  );
  const expoWeekdayToday = new Date().getDay() + 1;

  const scheduled: string[] = [];
  for (const op of ops) {
    try {
      const carryLineApplies =
        op.kind === 'daily' || op.weekday === expoWeekdayToday;
      const body =
        carryLineApplies && todayCarryLine
          ? todayCarryLine
          : getMessageForToday(MIDDAY_MESSAGES);
      if (op.kind === 'daily') {
        const id = await Notifications.scheduleNotificationAsync({
          identifier: op.id,
          content: {
            title: 'Quick check-in',
            body,
            sound: true,
            data: { type: 'midday-checkin' },
          },
          trigger: {
            type: Notifications.SchedulableTriggerInputTypes.DAILY,
            hour: op.hour,
            minute: op.minute,
          },
        });
        scheduled.push(id);
        logger.log(`[Notifications] Midday check-in scheduled DAILY for ${op.hour}:${op.minute.toString().padStart(2, '0')} (id=${id})`);
      } else {
        const id = await Notifications.scheduleNotificationAsync({
          identifier: op.id,
          content: {
            title: 'Quick check-in',
            body,
            sound: true,
            data: { type: 'midday-checkin' },
          },
          trigger: {
            type: Notifications.SchedulableTriggerInputTypes.WEEKLY,
            weekday: op.weekday,
            hour: op.hour,
            minute: op.minute,
          },
        });
        scheduled.push(id);
        logger.log(`[Notifications] Midday check-in scheduled WEEKLY weekday=${op.weekday} ${op.hour}:${op.minute.toString().padStart(2, '0')} (id=${id})`);
      }
    } catch (error) {
      logger.error(`[Notifications] Failed to schedule midday op ${op.id}:`, error);
    }
  }

  return scheduled;
}

// NOTE: cancelAndRescheduleMiddayForTomorrow was deleted on 2026-04-12.
// It silently downgraded the repeating DAILY trigger to a one-shot DATE
// trigger, which broke recurrence after the user completed one check-in.
// Check-in completion is now tracked in store state via
// `markMiddayCheckInCompleted()`, and the single-owner `useCheckInNotifications`
// hook keeps the DAILY trigger alive on its own schedule.
// See ~/vault/gotchas/expo-reschedule-helpers-silent-one-shot-downgrade.md

// Schedule evening wind-down notification (Phase 5).
//
// Two scheduling modes based on the store's `eveningWindDownByDay` field —
// see `scheduleMiddayCheckIn` above for the full rationale. This function
// is a thin mirror: same cancel-then-write pattern, same tri-state gate,
// same per-day / uniform branching, just with evening identifiers, content,
// and 20:30 fallback.
export async function scheduleEveningWindDown(): Promise<string[]> {
  if (Platform.OS === 'web') return [];

  // Tri-state premium gate at the OS boundary. Fail closed on anything
  // other than `granted`.
  const policy = getEffectivePremiumAccessPolicy();
  if (policy !== 'granted') {
    logger.log(`[Notifications] scheduleEveningWindDown refused — policy=${policy}`);
    return [];
  }

  // Cancel all possible ids (uniform + per-day) before writing fresh ones.
  await cancelEveningWindDown();

  const hasPermission = await areNotificationsEnabled();
  if (!hasPermission) return [];

  // Read state fresh and compute the op list.
  const store = useUnfoldStore.getState();
  const timeStr = store.eveningWindDownTime || '20:30';
  const byDay = store.eveningWindDownByDay ?? null;
  const ops = buildCheckInSchedule(
    NOTIFICATION_IDS.EVENING_WINDDOWN,
    timeStr,
    byDay,
    EVENING_FALLBACK,
  );

  if (ops.length === 0) {
    logger.log('[Notifications] Evening wind-down: per-day mode with no enabled days; nothing scheduled');
    return [];
  }

  const scheduled: string[] = [];
  for (const op of ops) {
    try {
      const body = getMessageForToday(EVENING_MESSAGES);
      if (op.kind === 'daily') {
        const id = await Notifications.scheduleNotificationAsync({
          identifier: op.id,
          content: {
            title: 'One last thing',
            body,
            sound: true,
            data: { type: 'evening-winddown' },
          },
          trigger: {
            type: Notifications.SchedulableTriggerInputTypes.DAILY,
            hour: op.hour,
            minute: op.minute,
          },
        });
        scheduled.push(id);
        logger.log(`[Notifications] Evening wind-down scheduled DAILY for ${op.hour}:${op.minute.toString().padStart(2, '0')} (id=${id})`);
      } else {
        const id = await Notifications.scheduleNotificationAsync({
          identifier: op.id,
          content: {
            title: 'One last thing',
            body,
            sound: true,
            data: { type: 'evening-winddown' },
          },
          trigger: {
            type: Notifications.SchedulableTriggerInputTypes.WEEKLY,
            weekday: op.weekday,
            hour: op.hour,
            minute: op.minute,
          },
        });
        scheduled.push(id);
        logger.log(`[Notifications] Evening wind-down scheduled WEEKLY weekday=${op.weekday} ${op.hour}:${op.minute.toString().padStart(2, '0')} (id=${id})`);
      }
    } catch (error) {
      logger.error(`[Notifications] Failed to schedule evening op ${op.id}:`, error);
    }
  }

  return scheduled;
}

// Cancel midday check-in notification.
//
// Clears BOTH the DAILY id (uniform mode) AND all 7 WEEKLY ids (per-day mode)
// on every run. This is what lets mode transitions (uniform ↔ per-day) be
// clean: whatever was scheduled before gets cleared, and the caller then
// writes the new shape from scratch. Cancelling a nonexistent id is a
// no-op in expo-notifications.
export async function cancelMiddayCheckIn(): Promise<void> {
  if (Platform.OS === 'web') return;
  const ids = getAllCheckInIdentifiers(NOTIFICATION_IDS.MIDDAY_CHECKIN);
  await Promise.all(ids.map((id) => cancelNotificationById(id)));
}

// Cancel evening wind-down notification (same rationale as midday above).
export async function cancelEveningWindDown(): Promise<void> {
  if (Platform.OS === 'web') return;
  const ids = getAllCheckInIdentifiers(NOTIFICATION_IDS.EVENING_WINDDOWN);
  await Promise.all(ids.map((id) => cancelNotificationById(id)));
}

// NOTE: cancelAndRescheduleEveningForTomorrow was deleted on 2026-04-12
// for the same reason as its midday sibling — silent DAILY→DATE downgrade
// broke recurrence. Completion is tracked via `markEveningWindDownCompleted()`.

// Refresh daily reminder with new content (call when day advances)
// This re-schedules the notification with the latest teaser content
export async function refreshDailyReminder(): Promise<boolean> {
  if (Platform.OS === 'web') {
    return false;
  }

  // Get the user's reminder time from the store
  const state = useUnfoldStore.getState();
  const reminderTime = state.user?.reminderTime;

  if (!reminderTime) {
    logger.log('[Notifications] No reminder time set, skipping refresh');
    return false;
  }

  // Check if we have permission before refreshing
  const hasPermission = await areNotificationsEnabled();
  if (!hasPermission) {
    logger.log('[Notifications] No permission, skipping refresh');
    return false;
  }

  // Re-schedule with new content
  const result = await scheduleDailyReminder(reminderTime);
  return result !== null;
}
