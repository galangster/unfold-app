import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { useUnfoldStore, type Devotional, type UserProfile } from './store';
import { getEffectivePremiumAccessPolicy } from './premium-state';
import { logger } from '@/lib/logger';
import {
  getEveningWindDownCopy,
  getMiddayCheckInCopy,
  type CopyVariation,
  type DayContext,
} from '@/constants/check-in-messages';
import { buildCheckInSchedule, getAllCheckInIdentifiers } from '@/lib/check-in-schedule';
import { copySeed } from '@/lib/copy-variation';
import { dayIndexFor } from '@/lib/variation-bag';
import {
  getCurrentDevotional,
  getTodayCarryLine,
  getTodayDayContext,
} from '@/lib/home-devotional-state';
import {
  buildDevotionalReadyNotificationData,
  pushNamesAutoTrialIntent,
} from '@/lib/push-notification-helpers';
import { getDailyReminderContent, type DailyReminderTrigger } from '@/lib/daily-reminder-content';
import { deferPastQuietHours } from '@/lib/quiet-hours';
import { logEvent } from '@/lib/analytics';
import type { ActReminderPlan } from '@/lib/act-reminder';
import { captureSyncSession, isSyncSessionCurrent } from '@/lib/sync-session-fence';
import { readTrialCheckInSkipDate } from '@/lib/trial-notification';
import { readAutoTrialIntent } from '@/lib/auto-trial-intent';
import { useUIState } from '@/lib/ui-state';

// Notification identifiers for targeted cancel/reschedule.
//
// A check-in slot's id below is a BASE. Its pre-rolled occurrences are
// `${base}-0` upward (see lib/check-in-schedule.ts); `getAllCheckInIdentifiers`
// owns the full list, including the ids of the retired repeating schedule that
// an upgrading install may still be carrying. `cancelMiddayCheckIn` /
// `cancelEveningWindDown` clear every one of them on every run, so a shrinking
// occurrence count never leaves an orphan trigger. Cancelling a nonexistent
// identifier is a no-op in expo-notifications, so this is safe.
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

// Check-in scheduling decisions live in lib/check-in-schedule.ts: pure,
// expo-free, and directly testable. Re-exported here because this module is
// the public face of notification scheduling for the rest of the app.
export {
  buildCheckInSchedule,
  getAllCheckInIdentifiers,
  PRE_ROLL_DAYS,
  type CheckInOccurrence,
} from '@/lib/check-in-schedule';

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
      && pushNamesAutoTrialIntent(data, intent)
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

/**
 * The outcome of writing one slot's schedule.
 *
 * `complete` is false ONLY when an intended occurrence failed to write. Every
 * intended no-op — web, a policy refusal, no OS permission, every day switched
 * off — is complete, because the queue ends up in the state we wanted. The
 * caller uses this to decide whether it may record the sync as applied: a run
 * that cancelled the whole slot and then failed to rewrite it leaves ZERO
 * pending notifications, and marking that day synced would strand the reader
 * until some unrelated state change moved the fingerprint.
 */
export interface CheckInWriteResult {
  ids: string[];
  complete: boolean;
}

/**
 * One check-in slot: everything that differs between midday and evening.
 *
 * The two used to be ~50 lines each, identical but for these values. The
 * file's own comment called the second "a thin mirror" of the first.
 */
interface CheckInSlot {
  idBase: string;
  defaultTime: string;
  byDay: Record<string, string | null> | null;
  fallback: { hour: number; minute: number };
  dataType: string;
  logNoun: string;
  eventType: 'midday_checkin' | 'evening_winddown';
  /**
   * Copy for one occurrence. `today` is the devotional context when this
   * occurrence lands on today, and null on every later day — those days have
   * no content yet and draw from the seeded pools instead.
   */
  copyFor: (today: DayContext | null, variation: CopyVariation) => { title: string; body: string };
}

/**
 * Install one slot's pre-rolled occurrences.
 *
 * OS boundary gate: this is the last line of defence against scheduling a
 * premium-only notification for a non-premium reader. It re-checks the
 * tri-state premium policy at call time and fails closed unless the policy is
 * `granted`. If anything above this layer regresses — a new call site that
 * bypasses `useCheckInNotifications` — the gate here still holds. That is
 * defence in depth, not redundancy: the hook-level gate stops normal
 * scheduling at the wrong moment, and this one stops any lib caller, present
 * or future, from writing to the OS queue without RevenueCat's blessing.
 *
 * Cancel-then-write: every call clears the slot's whole identifier space
 * first, so a shrinking occurrence count or an upgrade from the retired
 * repeating schedule never leaves an orphan trigger behind.
 *
 * Returns the identifiers actually written. An empty array is a valid,
 * error-free outcome when every day is switched off.
 */
async function scheduleCheckInSlot(
  slot: CheckInSlot,
  today: DayContext | null,
  todayDayIndex: number,
  cancel: () => Promise<void>,
  clock?: CheckInClock,
): Promise<CheckInWriteResult> {
  const nothingToDo: CheckInWriteResult = { ids: [], complete: true };
  if (Platform.OS === 'web') return nothingToDo;

  const policy = getEffectivePremiumAccessPolicy();
  if (policy !== 'granted') {
    logger.log(`[Notifications] ${slot.logNoun} refused — policy=${policy}`);
    return nothingToDo;
  }

  await cancel();

  const hasPermission = await areNotificationsEnabled();
  if (!hasPermission) return nothingToDo;

  const now = clock?.now ?? new Date();
  const occurrences = buildCheckInSchedule({
    idBase: slot.idBase,
    defaultTime: slot.defaultTime,
    byDay: slot.byDay,
    fallback: slot.fallback,
    skipLocalDate: clock ? clock.localDate : readTrialCheckInSkipDate(),
    now,
  });

  if (occurrences.length === 0) {
    logger.log(`[Notifications] ${slot.logNoun}: no enabled days in the horizon; nothing scheduled`);
    return nothingToDo;
  }

  const seed = copySeed();
  // Written concurrently: identifiers are unique per occurrence and no write
  // reads another's result, so 14 serial bridge round trips buy nothing. The
  // per-occurrence catch stays inside the map — one failed write must not
  // discard the other thirteen, which is what Promise.all's fail-fast would do.
  const written = await Promise.all(
    occurrences.map(async (occurrence) => {
      const isToday = occurrence.dayIndex === todayDayIndex;
      const { title, body } = slot.copyFor(isToday ? today : null, {
        seed,
        dayIndex: occurrence.dayIndex,
      });
      try {
        const id = await Notifications.scheduleNotificationAsync({
          identifier: occurrence.id,
          content: { title, body, sound: true, data: { type: slot.dataType } },
          trigger: {
            type: Notifications.SchedulableTriggerInputTypes.DATE,
            date: occurrence.date,
            ...channel(NOTIFICATION_CHANNELS.CHECK_INS),
          },
        });
        return id;
      } catch (error) {
        logger.error(`[Notifications] Failed to schedule ${slot.logNoun} ${occurrence.id}:`, error);
        return null;
      }
    }),
  );

  const scheduled = written.filter((id): id is string => id !== null);
  const complete = scheduled.length === occurrences.length;
  if (!complete) {
    logger.error(
      `[Notifications] ${slot.logNoun}: wrote ${scheduled.length} of ${occurrences.length}; not marking synced`,
    );
  }
  if (scheduled.length > 0) {
    logger.log(
      `[Notifications] ${slot.logNoun}: wrote ${scheduled.length} occurrences to ${occurrences[occurrences.length - 1].date.toISOString()}`,
    );
    logEvent('notification_scheduled', {
      type: slot.eventType,
      owner: 'local',
      count: scheduled.length,
    });
  }
  return { ids: scheduled, complete };
}

export async function scheduleMiddayCheckIn(clock?: CheckInClock): Promise<CheckInWriteResult> {
  const store = useUnfoldStore.getState();
  const currentDevotional = getCurrentDevotional(store.devotionals, store.currentDevotionalId);
  // The carry line of the day finished today — the devotional following the
  // reader into their afternoon. Only today's occurrence can carry it.
  const carryLine = getTodayCarryLine(store.devotionals, store.currentDevotionalId);
  return scheduleCheckInSlot(
    {
      idBase: NOTIFICATION_IDS.MIDDAY_CHECKIN,
      defaultTime: store.middayCheckInTime || '12:30',
      byDay: store.middayCheckInByDay ?? null,
      fallback: MIDDAY_FALLBACK,
      dataType: 'midday-checkin',
      logNoun: 'Midday check-in',
      eventType: 'midday_checkin',
      copyFor: (today, variation) =>
        getMiddayCheckInCopy(today, today ? carryLine : null, variation),
    },
    getTodayDayContext(currentDevotional),
    dayIndexFor(clock?.now ?? new Date()),
    cancelMiddayCheckIn,
    clock,
  );
}

export async function scheduleEveningWindDown(clock?: CheckInClock): Promise<CheckInWriteResult> {
  const store = useUnfoldStore.getState();
  const currentDevotional = getCurrentDevotional(store.devotionals, store.currentDevotionalId);
  return scheduleCheckInSlot(
    {
      idBase: NOTIFICATION_IDS.EVENING_WINDDOWN,
      defaultTime: store.eveningWindDownTime || '20:30',
      byDay: store.eveningWindDownByDay ?? null,
      fallback: EVENING_FALLBACK,
      dataType: 'evening-winddown',
      logNoun: 'Evening wind-down',
      eventType: 'evening_winddown',
      copyFor: getEveningWindDownCopy,
    },
    getTodayDayContext(currentDevotional),
    dayIndexFor(clock?.now ?? new Date()),
    cancelEveningWindDown,
    clock,
  );
}


// Cancel midday check-in notification.
//
// Clears the slot's entire identifier space on every run — every pre-rolled
// occurrence plus the retired repeating ids. That is what lets the schedule
// shrink safely: a horizon that now holds 13 occurrences instead of 14, or an
// install upgrading off the old DAILY trigger, leaves nothing behind.
// Cancelling a nonexistent id is a no-op in expo-notifications.
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
