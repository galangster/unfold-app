import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { useUnfoldStore } from './store';
import { logger } from '@/lib/logger';

// Teaser content for daily notifications
export interface NotificationTeaser {
  dayTitle: string;
  quotableLine: string;
  seriesTitle: string;
  dayNumber: number;
}

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

// Get today's teaser content from the current devotional
export function getTodayTeaser(): NotificationTeaser | null {
  const state = useUnfoldStore.getState();
  const currentDevotional = state.devotionals.find((d) => d.id === state.currentDevotionalId);

  if (!currentDevotional) {
    return null;
  }

  const todayDay = currentDevotional.days.find((d) => d.dayNumber === currentDevotional.currentDay);

  if (!todayDay) {
    return null;
  }

  return {
    dayTitle: todayDay.title,
    quotableLine: todayDay.quotableLine,
    seriesTitle: currentDevotional.title,
    dayNumber: currentDevotional.currentDay,
  };
}

// Generate notification body with teaser content
function generateNotificationBody(teaser: NotificationTeaser | null): string {
  if (!teaser) {
    return 'Take a moment to pause and reflect with today\'s devotional.';
  }

  // Use the quotable line as the teaser - it's designed to be engaging
  // Truncate if too long for notification
  const maxLength = 100;
  let body = teaser.quotableLine;

  if (body.length > maxLength) {
    body = body.substring(0, maxLength - 3) + '...';
  }

  return body;
}

// Generate notification title with day info
function generateNotificationTitle(teaser: NotificationTeaser | null): string {
  if (!teaser) {
    return 'Time to Unfold';
  }

  // Show the day's title as the notification title
  return teaser.dayTitle;
}

// Schedule a daily reminder notification
export async function scheduleDailyReminder(timeString: string): Promise<string | null> {
  if (Platform.OS === 'web') {
    logger.log('[Notifications] Not available on web');
    return null;
  }

  // First cancel any existing reminders
  await cancelAllReminders();

  const hasPermission = await requestNotificationPermissions();
  if (!hasPermission) {
    logger.log('[Notifications] Permission not granted');
    return null;
  }

  const { hours, minutes } = parseTimeString(timeString);

  // Get teaser content for today
  const teaser = getTodayTeaser();

  try {
    const identifier = await Notifications.scheduleNotificationAsync({
      content: {
        title: generateNotificationTitle(teaser),
        body: generateNotificationBody(teaser),
        sound: true,
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DAILY,
        hour: hours,
        minute: minutes,
      },
    });

    logger.log(`[Notifications] Daily reminder scheduled for ${timeString} (${hours}:${minutes})`);
    if (teaser) {
      logger.log(`[Notifications] Teaser: "${teaser.quotableLine.substring(0, 50)}..."`);
    }
    return identifier;
  } catch (error) {
    logger.error('[Notifications] Failed to schedule:', error);
    return null;
  }
}

// Cancel all scheduled reminders
export async function cancelAllReminders(): Promise<void> {
  if (Platform.OS === 'web') {
    return;
  }

  await Notifications.cancelAllScheduledNotificationsAsync();
  logger.log('[Notifications] All reminders cancelled');
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

  // Get teaser content for today
  const teaser = getTodayTeaser();

  try {
    await Notifications.scheduleNotificationAsync({
      content: {
        title: generateNotificationTitle(teaser),
        body: generateNotificationBody(teaser),
        sound: true,
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
        seconds: 3,
      },
    });

    logger.log('[Notifications] Test notification scheduled for 3 seconds');
    if (teaser) {
      logger.log(`[Notifications] Teaser: "${teaser.quotableLine.substring(0, 50)}..."`);
    }
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
        body: `"${title}" has been created. Open Unfold to begin your journey.`,
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

// Schedule midday check-in notification (Phase 2)
// Fires at 12:30pm local time, daily
export async function scheduleMiddayCheckIn(): Promise<string | null> {
  if (Platform.OS === 'web') return null;

  const hasPermission = await areNotificationsEnabled();
  if (!hasPermission) return null;

  try {
    const identifier = await Notifications.scheduleNotificationAsync({
      content: {
        title: 'Quick check-in',
        body: "How's that landing — the thing you read this morning?",
        sound: true,
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DAILY,
        hour: 12,
        minute: 30,
      },
    });

    logger.log('[Notifications] Midday check-in scheduled for 12:30 PM');
    return identifier;
  } catch (error) {
    logger.error('[Notifications] Failed to schedule midday check-in:', error);
    return null;
  }
}

// Schedule evening wind-down notification (Phase 5)
// Fires at 8:30pm local time, daily
export async function scheduleEveningWindDown(): Promise<string | null> {
  if (Platform.OS === 'web') return null;

  const hasPermission = await areNotificationsEnabled();
  if (!hasPermission) return null;

  try {
    const identifier = await Notifications.scheduleNotificationAsync({
      content: {
        title: 'One last thing',
        body: 'One last thing before you close your eyes tonight.',
        sound: true,
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DAILY,
        hour: 20,
        minute: 30,
      },
    });

    logger.log('[Notifications] Evening wind-down scheduled for 8:30 PM');
    return identifier;
  } catch (error) {
    logger.error('[Notifications] Failed to schedule evening wind-down:', error);
    return null;
  }
}

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
