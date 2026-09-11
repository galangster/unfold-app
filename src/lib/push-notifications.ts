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
import { getDeviceId } from '@/lib/mmkv-storage';
import { useUnfoldStore } from '@/lib/store';
import { logEvent } from '@/lib/analytics';
import {
  ACT_LATER_DELAY_SECONDS,
  ACT_LATER_NOTIFICATION_ID,
  NOTIFICATION_ACTIONS,
  configureNotificationPresentation,
  scheduleRemindLater,
} from '@/lib/notifications';
import { readAutoTrialIntent } from '@/lib/auto-trial-intent';
import {
  buildNotificationPreferenceRequestBody,
  buildPushRegistrationRequestBody,
  createNotificationNavigationCoordinator,
  shouldHydrateNotificationResponse,
} from '@/lib/push-notification-helpers';
import {
  captureSyncSession,
  isSyncSessionCurrent,
  registerSyncTransport,
} from '@/lib/sync-session-fence';

const notificationNavigationCoordinator = createNotificationNavigationCoordinator({
  replace: (route) => router.replace(route),
  readAutoTrialIntent,
  onEvent: (event) => {
    logger.log('[push] coordinator event', event);
  },
});

let initialNotificationHydrationSettled = false;

export type PushRegistrationResult = 'registered' | 'skipped' | 'failed';

type PushRegistrationOwner = {
  session: number;
  deviceId: string;
};

type InFlightPushRegistration = {
  owner: PushRegistrationOwner;
  promise: Promise<PushRegistrationResult>;
};

// Deduplicate registrations within their originating reset session and device identity.
let registeredOwner: PushRegistrationOwner | null = null;
let inFlightRegistration: InFlightPushRegistration | null = null;

function capturePushRegistrationOwner(): PushRegistrationOwner {
  return {
    session: captureSyncSession(),
    deviceId: getDeviceId(),
  };
}

function isPushRegistrationOwnerCurrent(owner: PushRegistrationOwner): boolean {
  return isSyncSessionCurrent(owner.session) && owner.deviceId === getDeviceId();
}

function isSamePushRegistrationOwner(
  left: PushRegistrationOwner,
  right: PushRegistrationOwner,
): boolean {
  return left.session === right.session && left.deviceId === right.deviceId;
}

/** Reset for tests that need to exercise the full registration path. */
export function resetPushRegistrationSession(): void {
  registeredOwner = null;
  inFlightRegistration = null;
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

      handleNotificationResponse(response, 'cold');
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
 * Safe to call multiple times — deduped for the current reset session and
 * device identity after a successful POST. Skips on simulator and when
 * permission is not yet granted. Does NOT request permission — the
 * in-context ask (generating.tsx / settings) owns that. Re-register after
 * permission is granted and on foreground to recover from any failed POST
 * earlier in the session.
 *
 * Resolves 'registered' once the backend holds the token (this call or an
 * earlier one for this identity), 'skipped' when registration does not apply
 * (simulator, no permission, no project id, stale or resetting identity),
 * and 'failed' when the token fetch or the POST failed — the caller decides
 * whether the reader hears about it.
 */
/**
 * Persists "the backend holds this device's token" so the daily-reminder
 * owner decision survives a cold start. A failure here never changes the
 * registration result: the server has the token either way.
 */
function markPushRegistered(): void {
  try {
    const state = useUnfoldStore.getState();
    if (state.user && !state.user.pushRegisteredAt) {
      state.updateUser({ pushRegisteredAt: new Date().toISOString() });
    }
  } catch (error) {
    logger.warn('[push] Could not persist push registration flag:', error);
  }
}

export async function registerPushToken(): Promise<PushRegistrationResult> {
  // Push tokens are only available on physical devices
  if (!Device.isDevice) {
    logger.log('[push] Skipping push registration on simulator');
    return 'skipped';
  }

  const owner = capturePushRegistrationOwner();
  if (!isPushRegistrationOwnerCurrent(owner)) {
    return 'skipped';
  }

  if (registeredOwner && isPushRegistrationOwnerCurrent(registeredOwner)) {
    return 'registered';
  }

  if (
    inFlightRegistration &&
    isSamePushRegistrationOwner(inFlightRegistration.owner, owner)
  ) {
    return inFlightRegistration.promise;
  }

  const promise = registerPushTokenForOwner(owner);
  inFlightRegistration = { owner, promise };
  try {
    return await promise;
  } finally {
    if (inFlightRegistration?.promise === promise) {
      inFlightRegistration = null;
    }
  }
}

async function registerPushTokenForOwner(
  owner: PushRegistrationOwner,
): Promise<PushRegistrationResult> {
  try {
    if (!isPushRegistrationOwnerCurrent(owner)) {
      return 'skipped';
    }

    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    if (!isPushRegistrationOwnerCurrent(owner)) {
      return 'skipped';
    }
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
      if (!isPushRegistrationOwnerCurrent(owner)) {
        return 'skipped';
      }
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
    // Auth headers read the live device id. A stale permission/token
    // continuation must not authenticate or POST under a later identity.
    if (!isPushRegistrationOwnerCurrent(owner)) {
      return 'skipped';
    }

    const token = tokenData.data;
    logger.log(`[push] Push token obtained: ${token.slice(0, 30)}...`);

    const headers = await getAuthHeaders();
    if (!isPushRegistrationOwnerCurrent(owner)) {
      return 'skipped';
    }

    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const preferredNotificationTime = useUnfoldStore.getState().user?.reminderTime;

    const controller = new AbortController();
    const unregister = registerSyncTransport(controller);
    let response: Response;
    try {
      response = await fetch(
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
          signal: controller.signal,
        },
      );
    } finally {
      unregister();
    }

    if (!isPushRegistrationOwnerCurrent(owner)) {
      return 'skipped';
    }

    if (!response.ok) {
      logger.warn(
        `[push] Backend rejected push token: ${response.status} ${response.statusText}`,
      );
      return 'failed';
    }

    registeredOwner = owner;
    logger.log('[push] Push token registered with backend');
    markPushRegistered();
    return 'registered';
  } catch (err) {
    if (!isPushRegistrationOwnerCurrent(owner)) {
      return 'skipped';
    }
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

/**
 * One path for every tap, cold or warm: action buttons first, then the
 * open event, then the route. Returns true when a route was queued.
 */
function handleNotificationResponse(
  response: Notifications.NotificationResponse,
  start: 'cold' | 'warm',
): boolean {
  const data = response.notification.request.content.data;
  if (!data) return false;
  if (handleNotificationAction(response)) return false;
  logger.log(`[push] Notification tapped (${start}), data:`, data);
  logNotificationOpened(response, start);
  return notificationNavigationCoordinator.queueFromData(data, getNotificationResponseKey(response));
}

function notificationTypeOf(response: Notifications.NotificationResponse): string {
  const type = response.notification.request.content.data?.type;
  return typeof type === 'string' ? type : 'unknown';
}

function logNotificationOpened(response: Notifications.NotificationResponse, start: 'cold' | 'warm'): void {
  const sentAt = response.notification.date;
  const minutesToOpen = Number.isFinite(sentAt) && sentAt > 0
    ? Math.max(0, Math.round((Date.now() - sentAt) / 60_000))
    : undefined;
  logEvent('notification_opened', {
    type: notificationTypeOf(response),
    action: response.actionIdentifier,
    start,
    ...(minutesToOpen !== undefined ? { minutesToOpen } : {}),
  });
}

/**
 * Handles an action-button tap. Returns true when the action consumed the
 * response, so the caller must not navigate. "Read now" falls through to the
 * normal tap route.
 */
function handleNotificationAction(response: Notifications.NotificationResponse): boolean {
  const { actionIdentifier } = response;
  const content = response.notification.request.content;
  const type = notificationTypeOf(response);
  switch (actionIdentifier) {
    case NOTIFICATION_ACTIONS.REMIND_LATER:
      logEvent('notification_action', { type, action: 'remind_later' });
      void scheduleRemindLater(content);
      return true;
    case NOTIFICATION_ACTIONS.ACT_LATER:
      logEvent('notification_action', { type, action: 'act_later' });
      void scheduleRemindLater(content, { seconds: ACT_LATER_DELAY_SECONDS, identifier: ACT_LATER_NOTIFICATION_ID });
      return true;
    case NOTIFICATION_ACTIONS.ACT_DONE: {
      const data = content.data as { devotionalId?: unknown; dayNumber?: unknown } | null;
      const devotionalId = typeof data?.devotionalId === 'string' ? data.devotionalId : null;
      const dayNumber = Number(data?.dayNumber);
      if (devotionalId && Number.isInteger(dayNumber)) {
        useUnfoldStore.getState().setActOutcome(devotionalId, dayNumber, 'done');
      }
      logEvent('act_outcome', { outcome: 'done', source: 'notification_action' });
      return true;
    }
    default:
      return false;
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
  // Channels and action-button categories must exist before anything fires.
  void configureNotificationPresentation();

  // Warm start: listen for future taps
  const subscription =
    Notifications.addNotificationResponseReceivedListener((response) => {
      const queued = handleNotificationResponse(response, 'warm');
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
