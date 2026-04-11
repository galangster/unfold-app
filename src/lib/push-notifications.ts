/**
 * Push notification registration and remote notification tap handling.
 *
 * Responsibilities:
 * 1. Obtain an Expo push token on real devices
 * 2. Send the token + timezone to the backend for server-side notifications
 * 3. Listen for notification taps and deep-link into the app
 *
 * NOTE: Foreground notification display behavior is configured in
 * src/lib/notifications.ts (Notifications.setNotificationHandler).
 * Do NOT duplicate that handler here.
 */

import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { router } from 'expo-router';
import { PRIMARY_BACKEND_URL, getAuthHeaders } from './api-config';
import { logger } from '@/lib/logger';

/**
 * Request push notification permissions, obtain an Expo push token,
 * and register it with the backend.
 *
 * Safe to call multiple times — skips gracefully on simulator,
 * when permissions are denied, or when the user is not authenticated.
 */
export async function registerPushToken(): Promise<void> {
  // Push tokens are only available on physical devices
  if (!Device.isDevice) {
    logger.log('[push] Skipping push registration on simulator');
    return;
  }

  try {
    const { status: existingStatus } =
      await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;

    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }

    if (finalStatus !== 'granted') {
      logger.log('[push] Push notification permission not granted');
      return;
    }

    // Android requires a notification channel
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'default',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#FF8C42',
      });
    }

    // Resolve the EAS project ID from app config (set in app.json → extra / eas)
    const projectId =
      Constants.expoConfig?.extra?.eas?.projectId ??
      process.env.EXPO_PUBLIC_EAS_PROJECT_ID;

    if (!projectId) {
      logger.warn(
        '[push] No EAS project ID found — cannot obtain push token',
      );
      return;
    }

    const tokenData = await Notifications.getExpoPushTokenAsync({
      projectId,
    });

    const token = tokenData.data;
    logger.log(`[push] Push token obtained: ${token.slice(0, 30)}...`);

    const headers = await getAuthHeaders();
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;

    const response = await fetch(
      `${PRIMARY_BACKEND_URL}/api/users/push-token`,
      {
        method: 'POST',
        headers,
        body: JSON.stringify({
          expoPushToken: token,
          timezone: tz,
        }),
      },
    );

    if (!response.ok) {
      logger.warn(
        `[push] Backend rejected push token: ${response.status} ${response.statusText}`,
      );
      return;
    }

    logger.log('[push] Push token registered with backend');
  } catch (err) {
    logger.warn('[push] Failed to register push token:', err);
  }
}

/**
 * Navigate to the reveal screen from a notification's data payload.
 */
function handleNotificationNavigation(data: Record<string, unknown>): void {
  if (data?.type !== 'devotional_ready') return;

  const { devotionalId, dayNumber, dayTitle, seriesTitle, totalDays } = data as {
    type: string;
    devotionalId?: string;
    dayNumber?: number;
    dayTitle?: string;
    seriesTitle?: string;
    totalDays?: number;
  };

  if (devotionalId && dayNumber != null) {
    // replace prevents the home screen from showing underneath
    router.replace({
      pathname: '/reveal',
      params: {
        devotionalId: String(devotionalId),
        dayNumber: String(dayNumber),
        seriesTitle: seriesTitle ?? '',
        dayTitle: dayTitle ?? '',
        totalDays: String(totalDays ?? 0),
      },
    });
  }
}

/**
 * Set up a listener for notification taps (user opens a notification).
 * Handles both warm start (listener fires immediately) and cold start
 * (notification arrived before listener was registered).
 *
 * Returns a cleanup function to remove the listener.
 */
export function setupNotificationListeners(): () => void {
  // Warm start: listen for future taps
  const subscription =
    Notifications.addNotificationResponseReceivedListener((response) => {
      const data = response.notification.request.content.data;
      if (!data) return;
      logger.log('[push] Notification tapped (warm), data:', data);
      handleNotificationNavigation(data);
    });

  // Cold start: check if a notification launched the app
  Notifications.getLastNotificationResponseAsync().then((response) => {
    if (!response) return;

    // Only handle if the notification was tapped recently (within 5s of app start)
    const tappedAt = response.notification.date;
    const now = Date.now();
    if (now - tappedAt > 5000) return;

    const data = response.notification.request.content.data;
    if (!data) return;
    logger.log('[push] Notification tapped (cold start), data:', data);
    handleNotificationNavigation(data);
  });

  return () => subscription.remove();
}
