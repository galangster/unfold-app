/**
 * Trial Ending Local Notification
 *
 * Schedules a local notification to fire 2 days before the user's RevenueCat
 * free trial expires. Fully client-side — no backend webhook required.
 *
 * Usage:
 * - Call `syncTrialEndingNotification()` on app launch, after purchase, and
 *   after a successful restore. It will read the current RevenueCat customer
 *   info and schedule/cancel as appropriate.
 *
 * Behavior:
 * - If the entitlement is a TRIAL with a future expiration date, schedules a
 *   one-shot local notification for (expirationDate - 2 days).
 * - If the entitlement is anything else (missing, NORMAL, INTRO, PREPAID) or
 *   the trial is already within its final 2 days, any pending notification is
 *   cancelled.
 * - Uses a fixed notification identifier so cancellation is reliable across
 *   app launches without needing to persist anything.
 * - Also mirrors the scheduled state in a dedicated MMKV instance for debug /
 *   observability.
 */

import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import { MMKV } from 'react-native-mmkv';
import type { CustomerInfo } from 'react-native-purchases';

import { logger } from '@/lib/logger';
import {
  getCustomerInfo,
  isRevenueCatEnabled,
} from '@/lib/revenuecatClient';
import { getSharedEncryptionKey } from '@/lib/mmkv-storage';
import { captureSyncSession, isSyncSessionCurrent } from '@/lib/sync-session-fence';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const LOG_PREFIX = '[TrialNotification]';

/** Stable identifier so we can cancel/replace reliably. */
const TRIAL_NOTIFICATION_ID = 'unfold-trial-ending';
const TRIAL_NOTIFICATION_ID_SEPARATOR = ':';

function trialEndingIdentifierForSession(session: number): string {
  return `${TRIAL_NOTIFICATION_ID}${TRIAL_NOTIFICATION_ID_SEPARATOR}${session}`;
}

function isTrialEndingFamilyIdentifier(identifier: string): boolean {
  return (
    identifier === TRIAL_NOTIFICATION_ID ||
    identifier.startsWith(`${TRIAL_NOTIFICATION_ID}${TRIAL_NOTIFICATION_ID_SEPARATOR}`)
  );
}

/** RevenueCat entitlement identifier for the premium tier. */
const PREMIUM_ENTITLEMENT = 'Unfold Premium';

/** How far before trial end we notify the user. */
const REMINDER_LEAD_MS = 2 * 24 * 60 * 60 * 1000; // 2 days

// MMKV key — stores the scheduled notification id (or empty string) so we can
// observe state and short-circuit no-op reschedules.
const MMKV_SCHEDULED_ID_KEY = 'trial-ending-scheduled-id';
const MMKV_SCHEDULED_FOR_KEY = 'trial-ending-scheduled-for';

// ---------------------------------------------------------------------------
// Dedicated MMKV instance (small — just the scheduled notification state)
// ---------------------------------------------------------------------------

const encKey = getSharedEncryptionKey();
const trialNotificationStore = encKey
  ? new MMKV({ id: 'unfold-trial-notification', encryptionKey: encKey })
  : new MMKV({ id: 'unfold-trial-notification' });

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function isUnsupportedPlatform(): boolean {
  return Platform.OS === 'web';
}

async function hasNotificationPermission(): Promise<boolean> {
  if (isUnsupportedPlatform()) return false;
  try {
    const { status } = await Notifications.getPermissionsAsync();
    return status === 'granted';
  } catch (error) {
    logger.log(`${LOG_PREFIX} Failed to read notification permission:`, error);
    return false;
  }
}

function clearStoredId(): void {
  trialNotificationStore.delete(MMKV_SCHEDULED_ID_KEY);
  trialNotificationStore.delete(MMKV_SCHEDULED_FOR_KEY);
}

function storeScheduledId(id: string, scheduledFor: Date): void {
  trialNotificationStore.set(MMKV_SCHEDULED_ID_KEY, id);
  trialNotificationStore.set(MMKV_SCHEDULED_FOR_KEY, scheduledFor.toISOString());
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Cancel any pending trial-ending notification.
 *
 * Safe to call repeatedly — no-op if nothing is scheduled. Uses the stable
 * identifier so cancellation works across app launches.
 */
export async function cancelTrialEndingNotification(
  originatingSession: number = captureSyncSession(),
): Promise<void> {
  if (!isSyncSessionCurrent(originatingSession)) {
    logger.log(`${LOG_PREFIX} Cancel skipped — reset session is not current`);
    return;
  }

  if (isUnsupportedPlatform()) {
    clearStoredId();
    return;
  }

  const identifiers = new Set<string>([
    TRIAL_NOTIFICATION_ID,
    trialEndingIdentifierForSession(originatingSession),
  ]);
  const storedId = trialNotificationStore.getString(MMKV_SCHEDULED_ID_KEY);
  if (storedId) {
    identifiers.add(storedId);
  }
  try {
    const pending = await Notifications.getAllScheduledNotificationsAsync();
    if (!isSyncSessionCurrent(originatingSession)) {
      return;
    }
    for (const request of pending) {
      if (isTrialEndingFamilyIdentifier(request.identifier)) {
        identifiers.add(request.identifier);
      }
    }
  } catch {
    // Listing is best-effort. Known identifiers still cancel.
  }

  if (!isSyncSessionCurrent(originatingSession)) {
    return;
  }

  try {
    await Promise.all(
      [...identifiers].map((identifier) =>
        Notifications.cancelScheduledNotificationAsync(identifier),
      ),
    );
    logger.log(`${LOG_PREFIX} Cancelled pending trial-ending notification`);
  } catch (error) {
    // expo-notifications does not throw for unknown identifiers on iOS, but
    // guard anyway so callers never need to catch.
    logger.log(`${LOG_PREFIX} Cancel attempt ignored:`, error);
  }

  if (!isSyncSessionCurrent(originatingSession)) {
    return;
  }
  clearStoredId();
}

/**
 * Schedule a notification 2 days before the trial's expiration date.
 *
 * Returns the notification identifier if scheduled, or `null` if skipped
 * (permission denied, not a trial, or reminder time is already in the past).
 */
export async function scheduleTrialEndingNotification(
  customerInfo: CustomerInfo,
  originatingSession: number = captureSyncSession(),
): Promise<string | null> {
  if (isUnsupportedPlatform()) {
    return null;
  }

  if (!isSyncSessionCurrent(originatingSession)) {
    logger.log(`${LOG_PREFIX} Skipped: reset session is not current`);
    return null;
  }

  const entitlement = customerInfo.entitlements.active?.[PREMIUM_ENTITLEMENT];

  // Not in a trial — make sure nothing is queued and bail out.
  if (!entitlement || entitlement.periodType !== 'TRIAL') {
    logger.log(`${LOG_PREFIX} Skipped: entitlement is not a trial`);
    await cancelTrialEndingNotification(originatingSession);
    return null;
  }

  if (!entitlement.expirationDate) {
    logger.log(`${LOG_PREFIX} Skipped: trial has no expirationDate`);
    await cancelTrialEndingNotification(originatingSession);
    return null;
  }

  const expirationMs = Date.parse(entitlement.expirationDate);
  if (!Number.isFinite(expirationMs)) {
    logger.log(
      `${LOG_PREFIX} Skipped: could not parse expirationDate`,
      entitlement.expirationDate,
    );
    await cancelTrialEndingNotification(originatingSession);
    return null;
  }

  const reminderMs = expirationMs - REMINDER_LEAD_MS;
  const now = Date.now();

  if (reminderMs <= now) {
    logger.log(
      `${LOG_PREFIX} Skipped: reminder time already in the past ` +
        `(trial ends ${entitlement.expirationDate})`,
    );
    // No point leaving a stale schedule around.
    await cancelTrialEndingNotification(originatingSession);
    return null;
  }

  const hasPermission = await hasNotificationPermission();
  if (!isSyncSessionCurrent(originatingSession)) {
    logger.log(`${LOG_PREFIX} Abandoned after permission — reset session is not current`);
    return null;
  }
  if (!hasPermission) {
    logger.log(`${LOG_PREFIX} Skipped: notification permission not granted`);
    // Can't schedule — also clean up any stored state so we don't lie about it.
    clearStoredId();
    return null;
  }

  // Always cancel the previous schedule before creating a new one. Scheduling
  // with the same identifier replaces the existing request on iOS, but we
  // cancel explicitly to keep Android behavior deterministic too.
  await cancelTrialEndingNotification(originatingSession);
  if (!isSyncSessionCurrent(originatingSession)) {
    logger.log(`${LOG_PREFIX} Abandoned after cancel — reset session is not current`);
    return null;
  }

  const reminderDate = new Date(reminderMs);
  const identifier = trialEndingIdentifierForSession(originatingSession);

  try {
    const scheduled = await Notifications.scheduleNotificationAsync({
      identifier,
      content: {
        title: 'Your Unfold trial ends in 2 days',
        body: "Your devotionals, journal, and everything you've built is waiting. Don't lose your progress.",
        sound: true,
        data: { type: 'trial-ending' },
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: reminderDate,
      },
    });

    if (!isSyncSessionCurrent(originatingSession)) {
      await Notifications.cancelScheduledNotificationAsync(identifier);
      logger.log(`${LOG_PREFIX} Late schedule discarded — reset session is not current`);
      return null;
    }

    storeScheduledId(scheduled, reminderDate);
    logger.log(
      `${LOG_PREFIX} Scheduled for ${reminderDate.toISOString()} ` +
        `(trial ends ${entitlement.expirationDate})`,
    );
    return scheduled;
  } catch (error) {
    logger.error(`${LOG_PREFIX} Failed to schedule trial-ending notification:`, error);
    if (isSyncSessionCurrent(originatingSession)) {
      clearStoredId();
    }
    return null;
  }
}

/**
 * DEBUG-ONLY: schedule the real trial-ending notification to fire in a few
 * seconds so we can preview it without waiting for an actual trial to expire.
 * Uses a distinct identifier so it doesn't clobber any real schedule.
 *
 * Returns the identifier if scheduled, or `null` if unsupported / no permission.
 */
export async function debugFireTrialEndingNotification(
  delaySeconds = 5,
): Promise<string | null> {
  if (isUnsupportedPlatform()) {
    logger.log(`${LOG_PREFIX} Debug fire skipped: unsupported platform`);
    return null;
  }

  const hasPermission = await hasNotificationPermission();
  if (!hasPermission) {
    try {
      const { status } = await Notifications.requestPermissionsAsync();
      if (status !== 'granted') {
        logger.log(`${LOG_PREFIX} Debug fire skipped: permission denied`);
        return null;
      }
    } catch (error) {
      logger.log(`${LOG_PREFIX} Debug fire permission request failed:`, error);
      return null;
    }
  }

  try {
    const identifier = await Notifications.scheduleNotificationAsync({
      identifier: `${TRIAL_NOTIFICATION_ID}-debug`,
      content: {
        title: 'Your Unfold trial ends in 2 days',
        body: "Your devotionals, journal, and everything you've built is waiting. Don't lose your progress.",
        sound: true,
        data: { type: 'trial-ending', debug: true },
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
        seconds: Math.max(1, delaySeconds),
      },
    });
    logger.log(
      `${LOG_PREFIX} Debug notification scheduled to fire in ${delaySeconds}s`,
    );
    return identifier;
  } catch (error) {
    logger.error(`${LOG_PREFIX} Debug fire failed:`, error);
    return null;
  }
}

/**
 * Re-sync the trial-ending notification with the latest RevenueCat state.
 *
 * Call this on app launch, after a successful purchase, and after a
 * successful restore. Fetches fresh customer info from RevenueCat and
 * schedules/cancels as appropriate. Safe to call when RevenueCat is disabled
 * (e.g., web, missing API keys) — it no-ops.
 */
export async function syncTrialEndingNotification(): Promise<void> {
  const originatingSession = captureSyncSession();
  if (isUnsupportedPlatform()) return;
  if (!isSyncSessionCurrent(originatingSession)) return;

  if (!isRevenueCatEnabled()) {
    // Without RevenueCat we cannot know the trial state — make sure there's
    // nothing stale left over and bail.
    await cancelTrialEndingNotification(originatingSession);
    return;
  }

  const customerInfoResult = await getCustomerInfo();
  if (!isSyncSessionCurrent(originatingSession)) {
    logger.log(`${LOG_PREFIX} Sync abandoned after customer info — reset session is not current`);
    return;
  }
  if (!customerInfoResult.ok) {
    logger.log(
      `${LOG_PREFIX} Sync skipped: getCustomerInfo failed (${customerInfoResult.reason})`,
    );
    return;
  }

  await scheduleTrialEndingNotification(customerInfoResult.data, originatingSession);
}

/**
 * Clear the MMKV mirror of scheduled trial-notification state. Mirror ONLY —
 * cancelling the pending OS notification is the caller's job
 * (performFullLocalReset cancels every scheduled notification first via
 * cancelAllScheduledNotifications()).
 */
export function clearTrialNotificationMirror(): void {
  trialNotificationStore.clearAll();
}
