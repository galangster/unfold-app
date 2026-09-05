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

let initialNotificationHydrationSettled = false;

// Session-dedupe: avoid re-POSTing the push token on every foreground transition
// once the backend POST has already succeeded this session.
let registeredThisSession = false;

/** Reset for tests that need to exercise the full registration path. */
export function resetPushRegistrationSession(): void {
  registeredThisSession = false;
}

function getNotificationResponseKey(
  response: Notifications.NotificationResponse | null | undefined,
): string | undefined {
  return response?.notification?.request?.identifier;
}

async function hydrateLastNotificationResponse(): Promise<void> {
  try {
    const response = await Notifications.getLastNotificationResponseAsync();
    if (!response) return;

    let shouldClearLastResponse = true;

    try {
      const notificationDate = response.notification.date;
      const now = Date.now();
      if (!shouldHydrateNotificationResponse({ notificationDateMs: notificationDate, nowMs: now })) {
        logger.warn('[push] Ignoring notification response with impossible future notification date', {
          notificationDate,
          now,
        });
        return;
      }

      const data = response.notification.request.content.data;
      if (!data) return;

      logger.log('[push] Notification tapped (cold start), data:', data);
      notificationNavigationCoordinator.queueFromData(
        data,
        getNotificationResponseKey(response),
      );
    } finally {
      if (shouldClearLastResponse) {
        await Notifications.clearLastNotificationResponseAsync();
      }
    }
  } finally {
    initialNotificationHydrationSettled = true;
  }
}

/**
 * Obtain an Expo push token and register it with the backend.
 *
 * Safe to call multiple times — deduped per session after a successful POST.
 * Skips on simulator and when permission is not yet granted. Does NOT request
 * permission — the in-context ask (generating.tsx / settings) owns that.
 * Re-register after permission is granted and on foreground to recover from
 * any failed POST earlier in the session.
 *
 * Resolves 'registered' once the backend holds the token (this call or an
 * earlier one this session), 'skipped' when registration does not apply
 * (simulator, no permission, no project id), and 'failed' when the token
 * fetch or the POST failed — the caller decides whether the reader hears
 * about it.
 */
export type PushRegistrationResult = 'registered' | 'skipped' | 'failed';

export async function registerPushToken(): Promise<PushRegistrationResult> {
  // Push tokens are only available on physical devices
  if (!Device.isDevice) {
    logger.log('[push] Skipping push registration on simulator');
    return 'skipped';
  }

  if (registeredThisSession) {
    return 'registered';
  }

  try {
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    // NEVER request permission here — the in-context ask (generating.tsx /
    // settings) owns requestPermissionsAsync. Background registration only
    // proceeds when permission already exists.
    if (existingStatus !== 'granted') {
      logger.log('[push] Permission not granted; skipping background registration');
      return 'skipped';
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
      return 'skipped';
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
      return 'failed';
    }

    registeredThisSession = true;
    logger.log('[push] Push token registered with backend');
    return 'registered';
  } catch (err) {
    logger.warn('[push] Failed to register push token:', err);
    return 'failed';
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

export function hasPendingNotificationNavigation(): boolean {
  return notificationNavigationCoordinator.hasPendingRoute();
}

export function hasSettledInitialNotificationHydration(): boolean {
  return initialNotificationHydrationSettled;
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
