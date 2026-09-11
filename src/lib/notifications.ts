import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { useUnfoldStore, type Devotional, type UserProfile } from './store';
import { getEffectivePremiumAccessPolicy } from './premium-state';
import { logger } from '@/lib/logger';
import {
  getEveningWindDownBody,
  getMiddayCheckInBody,
  type DayContext,
} from '@/constants/check-in-messages';
import {
  getCurrentDevotional,
  getDaysReadToday,
  getHomeDevotionalDayData,
  getTodayCarryLine,
} from '@/lib/home-devotional-state';
import { buildDevotionalReadyNotificationData, parseHhMm } from '@/lib/push-notification-helpers';
import { getDailyReminderContent, type DailyReminderTrigger } from '@/lib/daily-reminder-content';
import { deferPastQuietHours } from '@/lib/quiet-hours';
import { logEvent } from '@/lib/analytics';
import type { ActReminderPlan } from '@/lib/act-reminder';
import { captureSyncSession, isSyncSessionCurrent } from '@/lib/sync-session-fence';
import { localCalendarDays, parseLocalYmd } from '@/lib/trial-notice-plan';
import { readTrialCheckInSkipDate } from '@/lib/trial-notification';
import { readAutoTrialIntent } from '@/lib/auto-trial-intent';
import { useUIState } from '@/lib/ui-state';

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

const DAILY_REMINDER_ID_SEPARATOR = ':';

// Last identifier this process successfully committed for the current owner.
// Cross-launch leftovers also use the legacy fixed id or a session-scoped id.
let lastDailyReminderIdentifier: string | null = null;

// Distinguishes newer daily work from older work in the same reset session.
// Session epoch alone cannot: two in-flight 8:00 / 9:00 schedules share a session.
let dailyOperationEpoch = 0;

export function dailyReminderIdentifierForSession(session: number): string {
  return `${NOTIFICATION_IDS.DAILY_REMINDER}${DAILY_REMINDER_ID_SEPARATOR}${session}`;
}

function dailyReminderIdentifierForOperation(session: number, operation: number): string {
  return `${dailyReminderIdentifierForSession(session)}${DAILY_REMINDER_ID_SEPARATOR}${operation}`;
}

function isDailyReminderFamilyIdentifier(identifier: string): boolean {
  return (
    identifier === NOTIFICATION_IDS.DAILY_REMINDER ||
    identifier.startsWith(`${NOTIFICATION_IDS.DAILY_REMINDER}${DAILY_REMINDER_ID_SEPARATOR}`)
  );
}

export function beginDailyReminderOperation(): number {
  dailyOperationEpoch += 1;
  return dailyOperationEpoch;
}

export function isDailyReminderOriginCurrent(session: number, operation: number): boolean {
  return isSyncSessionCurrent(session) && operation === dailyOperationEpoch;
}

function claimDailyReminderOperation(
  originatingSession: number,
  originatingOperation?: number,
): number | null {
  if (originatingOperation !== undefined) {
    return isDailyReminderOriginCurrent(originatingSession, originatingOperation)
      ? originatingOperation
      : null;
  }
  if (!isSyncSessionCurrent(originatingSession)) {
    return null;
  }
  return beginDailyReminderOperation();
}

async function cancelOwnedDailyReminderIdentifiers(
  session: number,
  operation: number,
): Promise<void> {
  const extras = new Set<string>();
  extras.add(dailyReminderIdentifierForSession(session));
  extras.add(dailyReminderIdentifierForOperation(session, operation));
  const ownedAtStart = lastDailyReminderIdentifier;
  if (ownedAtStart) {
    extras.add(ownedAtStart);
  }
  try {
    const pending = await Notifications.getAllScheduledNotificationsAsync();
    if (!isDailyReminderOriginCurrent(session, operation)) {
      return;
    }
    for (const request of pending) {
      if (isDailyReminderFamilyIdentifier(request.identifier)) {
        extras.add(request.identifier);
      }
    }
  } catch {
    if (!isDailyReminderOriginCurrent(session, operation)) {
      return;
    }
    // Listing is best-effort. Literal + session-scoped cancels still run.
  }
  if (!isDailyReminderOriginCurrent(session, operation)) {
    return;
  }
  extras.delete(NOTIFICATION_IDS.DAILY_REMINDER);
  await Promise.all(
    [...extras].map((identifier) => Notifications.cancelScheduledNotificationAsync(identifier)),
  );
  if (!isDailyReminderOriginCurrent(session, operation)) {
    return;
  }
  if (lastDailyReminderIdentifier === ownedAtStart) {
    lastDailyReminderIdentifier = null;
  }
}

export function resetDailyReminderOwnershipForTesting(): void {
  lastDailyReminderIdentifier = null;
  dailyOperationEpoch = 0;
}

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
export type ScheduleOp =
  | { kind: 'daily'; id: string; hour: number; minute: number }
  | { kind: 'weekly'; id: string; weekday: number; hour: number; minute: number }
  | { kind: 'date'; id: string; date: Date };

const JS_DAY_TO_KEY: CheckInDayKey[] = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function skipIsInWindow(skipDay: Date, now: Date): boolean {
  const d = localCalendarDays(now, skipDay);
  return d >= 0 && d <= 6;
}

function resumeDateOp(idBase: string, skipDay: Date, hour: number, minute: number): ScheduleOp {
  const resume = new Date(skipDay.getTime());
  resume.setDate(resume.getDate() + 7);
  resume.setHours(hour, minute, 0, 0);
  return { kind: 'date', id: `${idBase}-resume`, date: resume };
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
 *   - `skip` in today..+6 days drops that weekday and adds a `-resume` date op
 */
export function buildCheckInSchedule(
  idBase: string,
  defaultTime: string,
  byDay: Record<string, string | null> | null,
  fallback: { hour: number; minute: number },
  skip?: { localDate: string; now: Date },
): ScheduleOp[] {
  const skipDay = skip ? parseLocalYmd(skip.localDate) : null;
  const skipKey =
    skipDay && skip && skipIsInWindow(skipDay, skip.now)
      ? JS_DAY_TO_KEY[skipDay.getDay()]
      : null;

  if (byDay === null && !skipKey) {
    const { hour, minute } = parseHhMm(defaultTime, fallback);
    return [{ kind: 'daily', id: idBase, hour, minute }];
  }

  const dayTimes: Record<string, string | null> =
    byDay === null
      ? Object.fromEntries(CHECKIN_DAY_KEYS.map((day) => [day, defaultTime]))
      : byDay;

  const ops: ScheduleOp[] = [];
  for (const day of CHECKIN_DAY_KEYS) {
    const value = dayTimes[day];
    if (value === undefined || value === null) continue;
    if (day === skipKey) continue;
    const { hour, minute } = parseHhMm(value, fallback);
    ops.push({
      kind: 'weekly',
      id: `${idBase}-${day.toLowerCase()}`,
      weekday: WEEKDAY_NUMBER[day],
      hour,
      minute,
    });
  }
  if (skipKey && skipDay && dayTimes[skipKey] != null) {
    const { hour, minute } = parseHhMm(defaultTime, fallback);
    ops.push(resumeDateOp(idBase, skipDay, hour, minute));
  }
  return ops;
}

/**
 * All identifiers that belong to a given check-in (1 DAILY + 7 WEEKLY + resume).
 * Cancel functions call this and clear every id on every run so that mode
 * transitions (uniform ↔ per-day, enable ↔ disable) never leave orphan
 * triggers in the OS queue. Cancelling a nonexistent id is a no-op.
 */
export function getAllCheckInIdentifiers(idBase: string): string[] {
  return [
    idBase,
    ...CHECKIN_DAY_KEYS.map((d) => `${idBase}-${d.toLowerCase()}`),
    `${idBase}-resume`,
  ];
}

export const MIDDAY_FALLBACK = { hour: 12, minute: 30 };
const EVENING_FALLBACK = { hour: 20, minute: 30 };

// Android channels. Readers can mute check-ins without losing the reading
// reminder. The server sends `channelId: 'reading'` on its pushes too.
export const NOTIFICATION_CHANNELS = {
  READING: 'reading',
  CHECK_INS: 'check-ins',
} as const;

// Categories give the banner action buttons. The identifier matches the
// server's `categoryId` on day-ready pushes so both paths get the buttons.
export const NOTIFICATION_CATEGORIES = {
  DEVOTIONAL_READY: 'devotional_ready',
  ACT_REMINDER: 'act_reminder',
} as const;

export const NOTIFICATION_ACTIONS = {
  READ_NOW: 'read_now',
  REMIND_LATER: 'remind_later',
  ACT_DONE: 'act_done',
  ACT_LATER: 'act_later',
} as const;

/** One act reminder is ever pending; the day it belongs to rides in `data`. */
export const ACT_REMINDER_NOTIFICATION_ID = 'unfold-act-reminder';
export const ACT_LATER_DELAY_SECONDS = 60 * 60;
export const ACT_LATER_NOTIFICATION_ID = 'unfold-act-later';

export const REMIND_LATER_NOTIFICATION_ID = 'unfold-remind-later';
export const REMIND_LATER_DELAY_SECONDS = 3 * 60 * 60;

/** Trigger fields that route an Android notification to a channel. */
function channel(channelId: string): { channelId?: string } {
  return Platform.OS === 'android' ? { channelId } : {};
}

/**
 * Registers the Android channels and the action-button categories. Safe to
 * call on every launch; both calls are idempotent upserts in the OS.
 */
export async function configureNotificationPresentation(): Promise<void> {
  if (Platform.OS === 'web') return;
  try {
    const work: Promise<unknown>[] = [
      Notifications.setNotificationCategoryAsync(NOTIFICATION_CATEGORIES.DEVOTIONAL_READY, [
        { identifier: NOTIFICATION_ACTIONS.READ_NOW, buttonTitle: 'Read now' },
        { identifier: NOTIFICATION_ACTIONS.REMIND_LATER, buttonTitle: 'Remind me in 3 hours' },
      ]),
      Notifications.setNotificationCategoryAsync(NOTIFICATION_CATEGORIES.ACT_REMINDER, [
        { identifier: NOTIFICATION_ACTIONS.ACT_DONE, buttonTitle: 'I did it' },
        { identifier: NOTIFICATION_ACTIONS.ACT_LATER, buttonTitle: 'Remind me in an hour' },
      ]),
    ];
    if (Platform.OS === 'android') {
      work.push(
        Notifications.setNotificationChannelAsync(NOTIFICATION_CHANNELS.READING, {
          name: 'Daily reading',
          importance: Notifications.AndroidImportance.HIGH,
          vibrationPattern: [0, 250, 250, 250],
        }),
        Notifications.setNotificationChannelAsync(NOTIFICATION_CHANNELS.CHECK_INS, {
          name: 'Check-ins',
          importance: Notifications.AndroidImportance.DEFAULT,
        }),
      );
    }
    await Promise.all(work);
  } catch (error) {
    logger.warn('[Notifications] Failed to configure channels/categories:', error);
  }
}

/**
 * Re-queues a tapped notification's content as a one-shot a while out. The
 * "Remind me later" actions. One pending per identifier.
 */
export async function scheduleRemindLater(
  content: Pick<Notifications.NotificationContent, 'title' | 'body' | 'data' | 'categoryIdentifier'>,
  {
    seconds = REMIND_LATER_DELAY_SECONDS,
    identifier = REMIND_LATER_NOTIFICATION_ID,
  }: { seconds?: number; identifier?: string } = {},
): Promise<boolean> {
  if (Platform.OS === 'web') return false;
  try {
    // A snooze that would land in quiet hours waits for the morning.
    const fireAt = deferPastQuietHours(new Date(Date.now() + seconds * 1000));
    const delaySeconds = Math.max(60, Math.round((fireAt.getTime() - Date.now()) / 1000));
    await Notifications.cancelScheduledNotificationAsync(identifier);
    await Notifications.scheduleNotificationAsync({
      identifier,
      content: {
        title: content.title ?? 'Your reading is waiting',
        body: content.body ?? '',
        sound: true,
        ...(content.data ? { data: content.data } : {}),
        ...(content.categoryIdentifier ? { categoryIdentifier: content.categoryIdentifier } : {}),
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
        seconds: delaySeconds,
        ...channel(NOTIFICATION_CHANNELS.READING),
      },
    });
    logEvent('notification_scheduled', { type: 'remind_later', owner: 'local', seconds: delaySeconds });
    return true;
  } catch (error) {
    logger.error('[Notifications] Failed to schedule remind-later:', error);
    return false;
  }
}

/**
 * Schedules the one-shot act reminder from a plan. The owner hook cancels
 * before every write, so this only schedules.
 */
export async function scheduleActReminder(plan: ActReminderPlan): Promise<string | null> {
  if (Platform.OS === 'web') return null;
  try {
    const id = await Notifications.scheduleNotificationAsync({
      identifier: ACT_REMINDER_NOTIFICATION_ID,
      content: {
        title: plan.title,
        body: plan.body,
        sound: true,
        data: plan.data,
        categoryIdentifier: NOTIFICATION_CATEGORIES.ACT_REMINDER,
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: plan.fireAt,
        ...channel(NOTIFICATION_CHANNELS.READING),
      },
    });
    logEvent('notification_scheduled', { type: 'act_reminder', owner: 'local', slot: plan.slot });
    logger.log(`[Notifications] Act reminder scheduled (${plan.slot}) for ${plan.fireAt.toISOString()} (id=${id})`);
    return id;
  } catch (error) {
    logger.error('[Notifications] Failed to schedule act reminder:', error);
    return null;
  }
}

/** Cancels the pending act reminder. Only one is ever scheduled. */
export async function cancelActReminder(): Promise<void> {
  if (Platform.OS === 'web') return;
  await Notifications.cancelScheduledNotificationAsync(ACT_REMINDER_NOTIFICATION_ID);
}

/**
 * The day whose content should follow the reader into this afternoon and
 * evening: the day they finished today, else the day Home is showing.
 */
function getTodayDayContext(devotional: Devotional | null | undefined, now = new Date()): DayContext | null {
  const day = getDaysReadToday(devotional, now)[0] ?? getHomeDevotionalDayData(devotional, now);
  if (!day) return null;
  return {
    title: day.title,
    scriptureReference: day.scriptureReference,
    quotableLine: day.quotableLine,
    checkInQuestion: day.checkInQuestion,
    act: day.act,
    eveningScriptureRef: day.eveningScriptureRef,
    companionNudge: day.companionNudge,
  };
}

/**
 * Today's content only rides on today's trigger; a line baked onto another
 * weekday would be stale by the time it fired. (expo WEEKLY weekday:
 * 1=Sunday … 7=Saturday.)
 */
export function firesToday(op: ScheduleOp, now = new Date()): boolean {
  if (op.kind === 'daily') return true;
  if (op.kind === 'date') return localCalendarDays(op.date, now) === 0;
  return op.weekday === now.getDay() + 1;
}

// Configure how notifications appear when the app is in the foreground
// This is critical for showing notifications when the user is in the app
Notifications.setNotificationHandler({
  handleNotification: async (notification) => {
    logger.log('[Notifications] Received notification in foreground:', notification.request.content.title);
    const data = notification.request.content.data as Record<string, unknown> | undefined;
    const type = data?.type;
    const intent = readAutoTrialIntent();
    const mountedId = useUIState.getState().seriesRevealMountedIntentId;
    const namesIntentJob = Boolean(
      intent
      && mountedId === intent.intentId
      && (type === 'devotional_ready' || type === 'generation_failed')
      && (
        (typeof data?.devotionalId === 'string' && data.devotionalId === intent.devotionalId)
        || (typeof data?.jobId === 'string' && data.jobId === intent.jobId)
      ),
    );
    return {
      shouldShowAlert: !namesIntentJob,
      shouldPlaySound: true,
      shouldSetBadge: false,
      shouldShowBanner: !namesIntentJob,
      shouldShowList: !namesIntentJob,
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

// Cancel a specific scheduled notification by its identifier.
// Callers that await and then cancel must pass the originating reset session.
// Daily wrappers that already own an operation must pass it so a stale call
// cannot expand into a newer same-session request or begin a fresh operation.
// Public daily cancel claims ownership before the first native await so a
// delayed literal cancel cannot later steal ownership from a newer request.
export async function cancelNotificationById(
  identifier: string,
  originatingSession: number = captureSyncSession(),
  originatingOperation?: number,
): Promise<void> {
  if (Platform.OS === 'web') return;
  const dailyOperation =
    identifier === NOTIFICATION_IDS.DAILY_REMINDER
      ? claimDailyReminderOperation(originatingSession, originatingOperation)
      : null;
  await Notifications.cancelScheduledNotificationAsync(identifier);
  if (
    dailyOperation !== null &&
    isDailyReminderOriginCurrent(originatingSession, dailyOperation)
  ) {
    await cancelOwnedDailyReminderIdentifiers(originatingSession, dailyOperation);
  }
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

// Schedule a daily reminder notification.
// Wrappers that already awaited must pass the originating reset session and
// daily operation so a stale call cannot capture a fresh session/operation
// and write after reset or a newer same-session request.
export async function scheduleDailyReminder(
  timeString: string,
  originatingSession: number = captureSyncSession(),
  originatingOperation?: number,
  triggerOverride: DailyReminderTrigger = { kind: 'daily' },
): Promise<string | null> {
  if (Platform.OS === 'web') {
    logger.log('[Notifications] Not available on web');
    return null;
  }

  const operation = claimDailyReminderOperation(originatingSession, originatingOperation);
  if (operation === null) {
    logger.log('[Notifications] Daily reminder skipped — originating owner is not current');
    return null;
  }

  // Cancel only the daily reminder family (not midday/evening)
  await cancelNotificationById(NOTIFICATION_IDS.DAILY_REMINDER, originatingSession, operation);
  if (!isDailyReminderOriginCurrent(originatingSession, operation)) {
    logger.log('[Notifications] Daily reminder abandoned after cancel — originating owner is not current');
    return null;
  }

  const hasPermission = await requestNotificationPermissions();
  if (!isDailyReminderOriginCurrent(originatingSession, operation)) {
    logger.log('[Notifications] Daily reminder abandoned after permission — originating owner is not current');
    return null;
  }
  if (!hasPermission) {
    logger.log('[Notifications] Permission not granted');
    return null;
  }

  const { hours, minutes } = parseTimeString(timeString);
  const { title, body } = getNotificationContent();
  const data = getCurrentDevotionalNotificationData();
  const identifier = dailyReminderIdentifierForOperation(originatingSession, operation);

  try {
    const scheduled = await Notifications.scheduleNotificationAsync({
      identifier,
      content: {
        title,
        body,
        sound: true,
        ...(data ? { data, categoryIdentifier: NOTIFICATION_CATEGORIES.DEVOTIONAL_READY } : {}),
      },
      trigger:
        triggerOverride.kind === 'date'
          ? {
              type: Notifications.SchedulableTriggerInputTypes.DATE,
              date: triggerOverride.date,
              ...channel(NOTIFICATION_CHANNELS.READING),
            }
          : {
              type: Notifications.SchedulableTriggerInputTypes.DAILY,
              hour: hours,
              minute: minutes,
              ...channel(NOTIFICATION_CHANNELS.READING),
            },
    });

    if (!isDailyReminderOriginCurrent(originatingSession, operation)) {
      // Apple replaces a pending request that reuses the same identifier.
      // This attempt uses its own operation id so a newer request survives.
      await Notifications.cancelScheduledNotificationAsync(identifier);
      logger.log('[Notifications] Late daily schedule discarded — originating owner is not current');
      return null;
    }

    lastDailyReminderIdentifier = scheduled;
    logger.log(`[Notifications] Daily reminder scheduled for ${timeString} (${hours}:${minutes})`);
    logger.log(`[Notifications] Content: "${title}" — "${body.substring(0, 50)}..."`);
    logEvent('notification_scheduled', {
      type: 'daily_reminder',
      owner: 'local',
      specific: Boolean(data),
      trigger: triggerOverride.kind,
    });
    return scheduled;
  } catch (error) {
    logger.error('[Notifications] Failed to schedule:', error);
    return null;
  }
}

/**
 * Settings toggle follow-up. Captures the originating reset session and daily
 * operation before permission / native work so a stale settings call cannot
 * restore erased preferences after reset or overwrite a newer same-session
 * time selection written before the owner debounce starts.
 */
export async function commitDailyReminderSetting(
  enabled: boolean,
  timeString: string,
  persistPreference: (updates: Partial<UserProfile>) => void,
): Promise<boolean> {
  const originatingSession = captureSyncSession();
  if (!isSyncSessionCurrent(originatingSession)) {
    return false;
  }
  const originatingOperation = beginDailyReminderOperation();
  if (enabled) {
    const result = await scheduleDailyReminder(
      timeString,
      originatingSession,
      originatingOperation,
    );
    if (!result || !isDailyReminderOriginCurrent(originatingSession, originatingOperation)) {
      return false;
    }
    persistPreference({ reminderTime: timeString, dailyReminderEnabled: true });
    return true;
  }

  await cancelNotificationById(
    NOTIFICATION_IDS.DAILY_REMINDER,
    originatingSession,
    originatingOperation,
  );
  if (!isDailyReminderOriginCurrent(originatingSession, originatingOperation)) {
    return false;
  }
  persistPreference({ dailyReminderEnabled: false });
  return true;
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

/**
 * Cancel EVERY pending local notification for this app — daily reminder,
 * uniform + per-day check-ins, the trial-ending notification, test / tap-test
 * notifications, and any family added later. Used by the full reset so a
 * frozen payload can never outlive the data it points at.
 */
export async function cancelAllScheduledNotifications(): Promise<void> {
  if (Platform.OS === 'web') {
    return;
  }

  await Notifications.cancelAllScheduledNotificationsAsync();
  logger.log('[Notifications] All scheduled notifications cancelled');
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

type CheckInClock = { localDate: string | null; now: Date };

async function scheduleCheckInOp(
  op: ScheduleOp,
  content: { title: string; body: string; dataType: string },
  logNoun: string,
): Promise<string> {
  const extras = channel(NOTIFICATION_CHANNELS.CHECK_INS);
  const trigger: Notifications.NotificationTriggerInput =
    op.kind === 'daily'
      ? {
          type: Notifications.SchedulableTriggerInputTypes.DAILY,
          hour: op.hour,
          minute: op.minute,
          ...extras,
        }
      : op.kind === 'weekly'
        ? {
            type: Notifications.SchedulableTriggerInputTypes.WEEKLY,
            weekday: op.weekday,
            hour: op.hour,
            minute: op.minute,
            ...extras,
          }
        : {
            type: Notifications.SchedulableTriggerInputTypes.DATE,
            date: op.date,
            ...extras,
          };
  const id = await Notifications.scheduleNotificationAsync({
    identifier: op.id,
    content: {
      title: content.title,
      body: content.body,
      sound: true,
      data: { type: content.dataType },
    },
    trigger,
  });
  if (op.kind === 'daily') {
    logger.log(
      `[Notifications] ${logNoun} scheduled DAILY for ${op.hour}:${op.minute.toString().padStart(2, '0')} (id=${id})`,
    );
  } else if (op.kind === 'weekly') {
    logger.log(
      `[Notifications] ${logNoun} scheduled WEEKLY weekday=${op.weekday} ${op.hour}:${op.minute.toString().padStart(2, '0')} (id=${id})`,
    );
  } else {
    logger.log(`[Notifications] ${logNoun} scheduled DATE ${op.date.toISOString()} (id=${id})`);
  }
  return id;
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
export async function scheduleMiddayCheckIn(clock?: CheckInClock): Promise<string[]> {
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
  const now = clock?.now ?? new Date();
  const skipDate = clock ? clock.localDate : readTrialCheckInSkipDate();
  const ops = buildCheckInSchedule(
    NOTIFICATION_IDS.MIDDAY_CHECKIN,
    timeStr,
    byDay,
    MIDDAY_FALLBACK,
    skipDate ? { localDate: skipDate, now } : undefined,
  );

  // Per-day with every day skipped is a valid no-op — don't treat it as
  // an error, just log and return.
  if (ops.length === 0) {
    logger.log('[Notifications] Midday check-in: per-day mode with no enabled days; nothing scheduled');
    return [];
  }

  // Prefer the carry line from the day the reader completed today — the
  // devotional following them into their afternoon — then the day's own
  // check-in question, then generic copy.
  const currentDevotional = getCurrentDevotional(store.devotionals, store.currentDevotionalId);
  const todayBody = getMiddayCheckInBody(
    getTodayDayContext(currentDevotional),
    getTodayCarryLine(store.devotionals, store.currentDevotionalId),
  );
  const genericBody = getMiddayCheckInBody(null, null);

  const scheduled: string[] = [];
  for (const op of ops) {
    try {
      const body = firesToday(op, now) ? todayBody : genericBody;
      scheduled.push(
        await scheduleCheckInOp(
          op,
          { title: 'Quick check-in', body, dataType: 'midday-checkin' },
          'Midday check-in',
        ),
      );
    } catch (error) {
      logger.error(`[Notifications] Failed to schedule midday op ${op.id}:`, error);
    }
  }

  if (scheduled.length > 0) {
    logEvent('notification_scheduled', { type: 'midday_checkin', owner: 'local', count: scheduled.length });
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
export async function scheduleEveningWindDown(clock?: CheckInClock): Promise<string[]> {
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
  const now = clock?.now ?? new Date();
  const skipDate = clock ? clock.localDate : readTrialCheckInSkipDate();
  const ops = buildCheckInSchedule(
    NOTIFICATION_IDS.EVENING_WINDDOWN,
    timeStr,
    byDay,
    EVENING_FALLBACK,
    skipDate ? { localDate: skipDate, now } : undefined,
  );

  if (ops.length === 0) {
    logger.log('[Notifications] Evening wind-down: per-day mode with no enabled days; nothing scheduled');
    return [];
  }

  // The day's "act" leads: it is the one thing the devotional asked the
  // reader to do later. Then the evening scripture, then generic copy.
  const todayBody = getEveningWindDownBody(
    getTodayDayContext(getCurrentDevotional(store.devotionals, store.currentDevotionalId)),
  );
  const genericBody = getEveningWindDownBody(null);

  const scheduled: string[] = [];
  for (const op of ops) {
    try {
      const body = firesToday(op, now) ? todayBody : genericBody;
      scheduled.push(
        await scheduleCheckInOp(
          op,
          { title: 'One last thing', body, dataType: 'evening-winddown' },
          'Evening wind-down',
        ),
      );
    } catch (error) {
      logger.error(`[Notifications] Failed to schedule evening op ${op.id}:`, error);
    }
  }

  if (scheduled.length > 0) {
    logEvent('notification_scheduled', { type: 'evening_winddown', owner: 'local', count: scheduled.length });
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
  const originatingSession = captureSyncSession();
  if (Platform.OS === 'web') {
    return false;
  }
  if (!isSyncSessionCurrent(originatingSession)) {
    return false;
  }
  const originatingOperation = beginDailyReminderOperation();

  // Get the user's reminder time from the store
  const state = useUnfoldStore.getState();
  const reminderTime = state.user?.reminderTime;

  if (!reminderTime) {
    logger.log('[Notifications] No reminder time set, skipping refresh');
    return false;
  }

  // Check if we have permission before refreshing
  const hasPermission = await areNotificationsEnabled();
  if (!isDailyReminderOriginCurrent(originatingSession, originatingOperation)) {
    return false;
  }
  if (!hasPermission) {
    logger.log('[Notifications] No permission, skipping refresh');
    return false;
  }

  // Re-schedule with the originating session and operation — do not begin a
  // new daily operation after the permission wait.
  const result = await scheduleDailyReminder(
    reminderTime,
    originatingSession,
    originatingOperation,
  );
  return result !== null;
}
