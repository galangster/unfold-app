import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { useUnfoldStore } from '@/lib/store';
import { isSameDay, isYesterday } from 'date-fns';

// Notification identifiers
const STREAK_NOTIFICATIONS = {
  MORNING_REMINDER: 'streak-morning-reminder',
  EVENING_WARNING: 'streak-evening-warning',
  STREAK_MILESTONE: 'streak-milestone',
  FREEZE_EARNED: 'streak-freeze-earned',
} as const;

/**
 * Schedule daily morning reminder notification
 * Fires at user's preferred reminder time (default 8:00 AM)
 */
export async function scheduleMorningReminder(hour: number = 8, minute: number = 0): Promise<void> {
  // Cancel existing morning reminders
  await cancelNotificationByIdentifier(STREAK_NOTIFICATIONS.MORNING_REMINDER);

  const streak = useUnfoldStore.getState().streakCurrent;
  const streakText = streak > 0 ? `🔥 ${streak}-day streak` : 'Start your streak today';

  await Notifications.scheduleNotificationAsync({
    identifier: STREAK_NOTIFICATIONS.MORNING_REMINDER,
    content: {
      title: 'Your daily devotional awaits',
      body: `${streakText}. Take 5 minutes to connect with God.`,
      data: { type: 'morning-reminder', screen: 'home' },
      sound: true,
    },
    trigger: {
      type: 'daily',
      hour,
      minute,
    } as Notifications.DailyTriggerInput,
  });
}

/**
 * Schedule evening warning notification
 * Fires at 8:00 PM if user hasn't read today
 */
export async function scheduleEveningWarning(): Promise<void> {
  // Cancel existing evening warnings
  await cancelNotificationByIdentifier(STREAK_NOTIFICATIONS.EVENING_WARNING);

  const lastReadDate = useUnfoldStore.getState().streakLastReadDate;
  const today = new Date();
  
  // Only schedule if user hasn't read today
  if (lastReadDate && isSameDay(new Date(lastReadDate), today)) {
    return; // Already read today, no warning needed
  }

  const streak = useUnfoldStore.getState().streakCurrent;
  const freezes = useUnfoldStore.getState().streakFreezes;
  
  let body = streak > 0 
    ? `🔥 ${streak}-day streak at risk!` 
    : 'Don\'t break the chain—start your streak today';
  
  if (freezes > 0) {
    body += ' (Streak freeze available)';
  }

  await Notifications.scheduleNotificationAsync({
    identifier: STREAK_NOTIFICATIONS.EVENING_WARNING,
    content: {
      title: 'Evening reminder',
      body,
      data: { type: 'evening-warning', screen: 'home' },
      sound: true,
    },
    trigger: {
      hour: 20,
      minute: 0,
    } as Notifications.DailyTriggerInput,
  });
}

/**
 * Send immediate streak milestone notification
 */
export async function sendStreakMilestoneNotification(streak: number): Promise<void> {
  const milestones = [7, 14, 30, 60, 100, 200, 365];
  
  if (!milestones.includes(streak)) return;

  let title = '🎉 Streak milestone!';
  let body = '';

  switch (streak) {
    case 7:
      body = 'One week of daily devotionals! Amazing consistency.';
      break;
    case 14:
      body = 'Two weeks strong! Your faith is growing.';
      break;
    case 30:
      body = 'A full month! You\'re building a powerful habit.';
      break;
    case 60:
      body = '60 days! Your dedication is inspiring.';
      break;
    case 100:
      body = '💯 days! Century club member!';
      break;
    case 200:
      body = '200 days! Unwavering faith.';
      break;
    case 365:
      body = '🏆 One year! You\'ve transformed your spiritual life.';
      break;
  }

  await Notifications.scheduleNotificationAsync({
    identifier: `${STREAK_NOTIFICATIONS.STREAK_MILESTONE}-${streak}`,
    content: {
      title,
      body,
      data: { type: 'milestone', screen: 'stats', streak },
      sound: true,
    },
    trigger: null, // Immediate
  });
}

/**
 * Send freeze earned notification
 */
export async function sendFreezeEarnedNotification(): Promise<void> {
  await Notifications.scheduleNotificationAsync({
    identifier: STREAK_NOTIFICATIONS.FREEZE_EARNED,
    content: {
      title: '🧊 Streak freeze earned!',
      body: 'Perfect week completed. Your streak is protected for one missed day.',
      data: { type: 'freeze-earned', screen: 'settings' },
      sound: true,
    },
    trigger: null, // Immediate
  });
}

/**
 * Cancel all streak notifications
 */
export async function cancelAllStreakNotifications(): Promise<void> {
  await Promise.all([
    cancelNotificationByIdentifier(STREAK_NOTIFICATIONS.MORNING_REMINDER),
    cancelNotificationByIdentifier(STREAK_NOTIFICATIONS.EVENING_WARNING),
  ]);
}

/**
 * Cancel notification by identifier
 */
async function cancelNotificationByIdentifier(identifier: string): Promise<void> {
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  const toCancel = scheduled.find(n => n.identifier === identifier);
  if (toCancel) {
    await Notifications.cancelScheduledNotificationAsync(identifier);
  }
}

/**
 * Check if user read today and update notifications accordingly
 * Call this when app comes to foreground
 */
export async function updateStreakNotifications(): Promise<void> {
  const lastReadDate = useUnfoldStore.getState().streakLastReadDate;
  const today = new Date();
  
  // If read today, cancel evening warning
  if (lastReadDate && isSameDay(new Date(lastReadDate), today)) {
    await cancelNotificationByIdentifier(STREAK_NOTIFICATIONS.EVENING_WARNING);
  } else {
    // Schedule evening warning if streak is active
    const streak = useUnfoldStore.getState().streakCurrent;
    if (streak > 0) {
      await scheduleEveningWarning();
    }
  }
}

/**
 * Request notification permissions
 */
export async function requestNotificationPermissions(): Promise<boolean> {
  const { status } = await Notifications.requestPermissionsAsync({
    ios: {
      allowAlert: true,
      allowBadge: true,
      allowSound: true,
    },
  });
  return status === 'granted';
}

/**
 * Check notification permissions
 */
export async function checkNotificationPermissions(): Promise<boolean> {
  const { status } = await Notifications.getPermissionsAsync();
  return status === 'granted';
}

// Configure notification handler
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});
