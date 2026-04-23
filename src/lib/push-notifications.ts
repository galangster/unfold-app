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
import { AppState, type AppStateStatus, Platform } from 'react-native';
import { router } from 'expo-router';
import { PRIMARY_BACKEND_URL, getAuthHeaders } from './api-config';
import { logger } from '@/lib/logger';
import { useUnfoldStore } from '@/lib/store';
import {
  buildNotificationPreferenceRequestBody,
  buildPushRegistrationRequestBody,
  createNotificationNavigationCoordinator,
  shouldHydrateNotificationResponse,
} from '@/lib/push-notification-helpers';

const notificationNavigationCoordinator = createNotificationNavigationCoordinator({
  replace: (route) => router.replace(route),
  onEvent: (event) => {
    logger.log('[push] coordinator event', event);
  },
});

function getNotificationResponseKey(
  response: Notifications.NotificationResponse | null | undefined,
): string | undefined {
  return response?.notification?.request?.identifier;
}

async function hydrateLastNotificationResponse(): Promise<void> {
  const response = await Notifications.getLastNotificationResponseAsync();
  if (!response) return;

  const tappedAt = response.notification.date;
  const now = Date.now();
  if (!shouldHydrateNotificationResponse({ tappedAtMs: tappedAt, nowMs: now })) {
    return;
  }

  const data = response.notification.request.content.data;
  if (!data) return;

  logger.log('[push] Notification tapped (cold start), data:', data);
  const queued = notificationNavigationCoordinator.queueFromData(
    data,
    getNotificationResponseKey(response),
  );
  if (queued) {
    await Notifications.clearLastNotificationResponseAsync();
  }
}

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
    const preferredNotificationTime = useUnfoldStore.getState().user?.reminderTime;

    const response = await fetch(
      `${PRIMARY_BACKEND_URL}/api/users/push-token`,
      {
        method: 'POST',
        headers,
        body: JSON.stringify(
          buildPushRegistrationRequestBody({
            expoPushToken: token,
            timezone: tz,
            preferredNotificationTime,
          }),
        ),
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

export async function syncNotificationPreferences(): Promise<void> {
  try {
    const preferredNotificationTime = useUnfoldStore.getState().user?.reminderTime;
    if (!preferredNotificationTime) return;

    const headers = await getAuthHeaders();
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;

    const response = await fetch(
      `${PRIMARY_BACKEND_URL}/api/users/notification-preferences`,
      {
        method: 'POST',
        headers,
        body: JSON.stringify(
          buildNotificationPreferenceRequestBody({
            preferredNotificationTime,
            timezone,
          }),
        ),
      },
    );

    if (!response.ok) {
      logger.warn(
        `[push] Backend rejected notification preferences: ${response.status} ${response.statusText}`,
      );
      return;
    }

    logger.log('[push] Notification preferences synced with backend');
  } catch (err) {
    logger.warn('[push] Failed to sync notification preferences:', err);
  }
}

export function setNotificationNavigationReady(ready: boolean): void {
  notificationNavigationCoordinator.setNavigationReady(ready);
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
      const queued = notificationNavigationCoordinator.queueFromData(
        data,
        getNotificationResponseKey(response),
      );
      if (queued) {
        Notifications.clearLastNotificationResponseAsync().catch((error) => {
          logger.warn('[push] Failed to clear handled warm notification response:', error);
        });
      }
    });

  // Background resume fallback: some iOS resume paths are racey and can miss the
  // warm listener callback, so re-hydrate the last response whenever the app
  // becomes active. The coordinator deduplicates by notification identifier.
  const appStateSubscription = AppState.addEventListener('change', (nextState: AppStateStatus) => {
    if (nextState !== 'active') return;
    hydrateLastNotificationResponse().catch((error) => {
      logger.warn('[push] Failed to hydrate foreground notification response:', error);
    });
  });

  // Cold start: check if a notification launched the app
  hydrateLastNotificationResponse().catch((error) => {
    logger.warn('[push] Failed to hydrate cold-start notification response:', error);
  });

  return () => {
    subscription.remove();
    appStateSubscription.remove();
  };
}
