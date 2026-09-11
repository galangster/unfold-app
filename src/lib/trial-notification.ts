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
 * - Each native schedule uses an identifier unique to its trial operation.
 *   Late cleanup cancels only that identifier. Cancellation still removes the
 *   legacy fixed id, session-scoped leftovers, and other pending family
 *   members found by enumeration so cleanup works across launches.
 * - Also mirrors the scheduled state in a dedicated MMKV instance for debug /
 *   observability.
 */

import { AppState, Platform } from 'react-native';
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
import { parseHhMm } from '@/lib/push-notification-helpers';
import { readTrialEntitlement } from '@/lib/trial-facts';
import {
  getTrialCheckInSkipLocalDate,
  planTrialEndingNotice,
} from '@/lib/trial-notice-plan';
import { getTrialNoticeTitle } from '@/lib/trial-reminder-copy';
import { useUIState } from '@/lib/ui-state';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const LOG_PREFIX = '[TrialNotification]';

/** Legacy fixed id plus session/operation descendants. */
const TRIAL_NOTIFICATION_ID = 'unfold-trial-ending';
const TRIAL_NOTIFICATION_ID_SEPARATOR = ':';

function trialEndingIdentifierForSession(session: number): string {
  return `${TRIAL_NOTIFICATION_ID}${TRIAL_NOTIFICATION_ID_SEPARATOR}${session}`;
}

function trialEndingIdentifierForOperation(session: number, operation: number): string {
  return `${trialEndingIdentifierForSession(session)}${TRIAL_NOTIFICATION_ID_SEPARATOR}${operation}`;
}

function isTrialEndingFamilyIdentifier(identifier: string): boolean {
  return (
    identifier === TRIAL_NOTIFICATION_ID ||
    identifier.startsWith(`${TRIAL_NOTIFICATION_ID}${TRIAL_NOTIFICATION_ID_SEPARATOR}`)
  );
}

// Last identifier this process successfully committed for the current owner.
// Cross-launch leftovers also use the legacy fixed id or a session-scoped id.
let lastTrialEndingIdentifier: string | null = null;

// Distinguishes newer trial work from older work in the same reset session.
let trialOperationEpoch = 0;

function beginTrialEndingOperation(): number {
  trialOperationEpoch += 1;
  return trialOperationEpoch;
}

function isTrialEndingOriginCurrent(session: number, operation: number): boolean {
  return isSyncSessionCurrent(session) && operation === trialOperationEpoch;
}

function claimTrialEndingOperation(
  originatingSession: number,
  originatingOperation?: number,
): number | null {
  if (originatingOperation !== undefined) {
    return isTrialEndingOriginCurrent(originatingSession, originatingOperation)
      ? originatingOperation
      : null;
  }
  if (!isSyncSessionCurrent(originatingSession)) {
    return null;
  }
  return beginTrialEndingOperation();
}

export function resetTrialNotificationOwnershipForTesting(): void {
  lastTrialEndingIdentifier = null;
  trialOperationEpoch = 0;
}

const DEFAULT_MIDDAY_SLOT = { hour: 12, minute: 30 };

// MMKV key — stores the scheduled notification id (or empty string) so we can
// observe state and short-circuit no-op reschedules.
const MMKV_SCHEDULED_ID_KEY = 'trial-ending-scheduled-id';
const MMKV_SCHEDULED_FOR_KEY = 'trial-ending-scheduled-for';
const MMKV_SKIP_DATE_KEY = 'trial-ending-checkin-skip-date';
const MMKV_ARMED_KEY = 'trial-ending-notice-armed-v1';
const MMKV_SKIP_REPORTED_KEY = 'trial-notice-skip-reported-v1';

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

function isAppActive(): boolean {
  return AppState != null && AppState.currentState === 'active';
}

function readMiddaySlot(): { hour: number; minute: number } {
  try {
    const { useUnfoldStore } = require('./store') as typeof import('./store');
    const timeStr = useUnfoldStore.getState().middayCheckInTime;
    if (typeof timeStr === 'string') {
      return parseHhMm(timeStr, DEFAULT_MIDDAY_SLOT);
    }
  } catch {
    // Ownership tests mock react-native too thinly for the real store.
  }
  return { ...DEFAULT_MIDDAY_SLOT };
}

export function readTrialCheckInSkipDate(): string | null {
  return trialNotificationStore.getString(MMKV_SKIP_DATE_KEY) ?? null;
}

function syncSkipDate(next: string | null): void {
  const prev = readTrialCheckInSkipDate();
  if (prev === next) return;
  if (next === null) trialNotificationStore.delete(MMKV_SKIP_DATE_KEY);
  else trialNotificationStore.set(MMKV_SKIP_DATE_KEY, next);
  try {
    useUIState.getState().bumpTrialNoticeEpoch();
  } catch {
    // Isolated from scheduling.
  }
}

function clearArmedRecord(): void {
  trialNotificationStore.delete(MMKV_ARMED_KEY);
}

function readPriorFireAtMs(expiresAtMs: number): number | null {
  const raw = trialNotificationStore.getString(MMKV_ARMED_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as { expiresAtMs?: number; fireAtMs?: number };
    if (parsed.expiresAtMs === expiresAtMs && typeof parsed.fireAtMs === 'number') {
      return parsed.fireAtMs;
    }
  } catch {
    // Replace a corrupt record.
  }
  clearArmedRecord();
  return null;
}

function storeArmedRecord(expiresAtMs: number, fireAtMs: number): void {
  trialNotificationStore.set(MMKV_ARMED_KEY, JSON.stringify({ expiresAtMs, fireAtMs }));
}

function emitScheduled(data: { trial_days: number; copy: 'tomorrow' | 'two_days' | 'weekday'; lead_h: number }): void {
  try {
    require('./auto-trial-telemetry').trackTrialNoticeScheduled(data);
  } catch {
    // Telemetry never blocks the schedule.
  }
}

function emitSkipped(expirationDate: string, reason: 'past_deadline' | 'invalid_dates' | 'no_permission' | 'already_delivered' | 'quiet_hours'): void {
  const token = `${expirationDate}|${reason}`;
  if (trialNotificationStore.getString(MMKV_SKIP_REPORTED_KEY) === token) return;
  trialNotificationStore.set(MMKV_SKIP_REPORTED_KEY, token);
  try {
    require('./auto-trial-telemetry').trackTrialNoticeSkipped({ reason });
  } catch {
    // Telemetry never blocks the skip.
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Cancel any pending trial-ending notification.
 *
 * Safe to call repeatedly — no-op if nothing is scheduled. Direct calls start
 * a trial operation. Internal callers must pass the originating operation so
 * they cannot mint a new owner after an await. Cleanup still targets the
 * legacy identifier and other pending family members across launches.
 */
export async function cancelTrialEndingNotification(
  originatingSession: number = captureSyncSession(),
  originatingOperation?: number,
): Promise<void> {
  const operation = claimTrialEndingOperation(originatingSession, originatingOperation);
  if (operation === null) {
    logger.log(`${LOG_PREFIX} Cancel skipped — originating owner is not current`);
    return;
  }

  if (isUnsupportedPlatform()) {
    clearStoredId();
    lastTrialEndingIdentifier = null;
    return;
  }

  const identifiers = new Set<string>([
    TRIAL_NOTIFICATION_ID,
    trialEndingIdentifierForSession(originatingSession),
    trialEndingIdentifierForOperation(originatingSession, operation),
  ]);
  const storedIdAtStart = trialNotificationStore.getString(MMKV_SCHEDULED_ID_KEY);
  if (storedIdAtStart) {
    identifiers.add(storedIdAtStart);
  }
  const ownedAtStart = lastTrialEndingIdentifier;
  if (ownedAtStart) {
    identifiers.add(ownedAtStart);
  }
  try {
    const pending = await Notifications.getAllScheduledNotificationsAsync();
    if (!isTrialEndingOriginCurrent(originatingSession, operation)) {
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

  if (!isTrialEndingOriginCurrent(originatingSession, operation)) {
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

  if (!isTrialEndingOriginCurrent(originatingSession, operation)) {
    return;
  }
  if (trialNotificationStore.getString(MMKV_SCHEDULED_ID_KEY) === storedIdAtStart) {
    clearStoredId();
  }
  if (lastTrialEndingIdentifier === ownedAtStart) {
    lastTrialEndingIdentifier = null;
  }
}

/**
 * Schedule a trial-ending notice from `planTrialEndingNotice`.
 *
 * Returns the notification identifier if scheduled, or `null` if skipped.
 */
export async function scheduleTrialEndingNotification(
  customerInfo: CustomerInfo,
  originatingSession: number = captureSyncSession(),
  originatingOperation?: number,
): Promise<string | null> {
  if (isUnsupportedPlatform()) {
    return null;
  }

  const operation = claimTrialEndingOperation(originatingSession, originatingOperation);
  if (operation === null) {
    logger.log(`${LOG_PREFIX} Skipped: originating owner is not current`);
    return null;
  }

  const entitlement = readTrialEntitlement(customerInfo);

  if (!entitlement || entitlement.periodType !== 'TRIAL') {
    logger.log(`${LOG_PREFIX} Skipped: entitlement is not a trial`);
    syncSkipDate(null);
    clearArmedRecord();
    await cancelTrialEndingNotification(originatingSession, operation);
    return null;
  }

  const expiresAtMs = entitlement.expiresAtMs;
  if (expiresAtMs === null || !Number.isFinite(expiresAtMs)) {
    logger.log(`${LOG_PREFIX} Skipped: trial has no valid expirationDate`);
    syncSkipDate(null);
    clearArmedRecord();
    emitSkipped('invalid', 'invalid_dates');
    await cancelTrialEndingNotification(originatingSession, operation);
    return null;
  }
  const expirationDate = new Date(expiresAtMs).toISOString();

  syncSkipDate(
    getTrialCheckInSkipLocalDate({
      purchasedAtMs: entitlement.purchasedAtMs,
      trialDays: entitlement.trialDays,
    }),
  );

  const priorFireAtMs = readPriorFireAtMs(expiresAtMs);
  const plan = planTrialEndingNotice({
    purchasedAtMs: entitlement.purchasedAtMs,
    expiresAtMs,
    nowMs: Date.now(),
    trialDays: entitlement.trialDays,
    middaySlot: readMiddaySlot(),
    priorFireAtMs,
    appActive: isAppActive(),
  });

  if (plan.kind === 'skip') {
    if (plan.reason === 'already_delivered') {
      logger.log(`${LOG_PREFIX} Skipped: already_delivered`);
      emitSkipped(expirationDate, 'already_delivered');
      return null;
    }
    logger.log(`${LOG_PREFIX} Skipped: ${plan.reason}`);
    emitSkipped(expirationDate, plan.reason);
    await cancelTrialEndingNotification(originatingSession, operation);
    return null;
  }

  const hasPermission = await hasNotificationPermission();
  if (!isTrialEndingOriginCurrent(originatingSession, operation)) {
    logger.log(`${LOG_PREFIX} Abandoned after permission — originating owner is not current`);
    return null;
  }
  if (!hasPermission) {
    logger.log(`${LOG_PREFIX} Skipped: notification permission not granted`);
    clearStoredId();
    emitSkipped(expirationDate, 'no_permission');
    return null;
  }

  const previousScheduledFor = trialNotificationStore.getString(MMKV_SCHEDULED_FOR_KEY) ?? null;

  // Cancel previous family members before creating this operation's request.
  // The new request uses its own identifier, so a late older completion can
  // cancel only that older identifier and cannot replace this one.
  await cancelTrialEndingNotification(originatingSession, operation);
  if (!isTrialEndingOriginCurrent(originatingSession, operation)) {
    logger.log(`${LOG_PREFIX} Abandoned after cancel — originating owner is not current`);
    return null;
  }

  const reminderDate = plan.fireAt;
  const identifier = trialEndingIdentifierForOperation(originatingSession, operation);
  const title = getTrialNoticeTitle(plan.copy, plan.expiresWeekday);

  try {
    const scheduled = await Notifications.scheduleNotificationAsync({
      identifier,
      content: {
        title,
        body: "Your devotionals, journal, and everything you've built is waiting. Don't lose your progress.",
        sound: true,
        data: { type: 'trial-ending' },
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: reminderDate,
      },
    });

    if (!isTrialEndingOriginCurrent(originatingSession, operation)) {
      await Notifications.cancelScheduledNotificationAsync(identifier);
      logger.log(`${LOG_PREFIX} Late schedule discarded — originating owner is not current`);
      return null;
    }

    storeScheduledId(scheduled, reminderDate);
    storeArmedRecord(expiresAtMs, reminderDate.getTime());
    lastTrialEndingIdentifier = scheduled;
    if (previousScheduledFor !== reminderDate.toISOString()) {
      emitScheduled({
        trial_days: entitlement.trialDays ?? 0,
        copy: plan.copy,
        lead_h: Math.round((expiresAtMs - reminderDate.getTime()) / 3_600_000),
      });
    }
    logger.log(
      `${LOG_PREFIX} Scheduled for ${reminderDate.toISOString()} ` +
        `(trial ends ${expirationDate})`,
    );
    return scheduled;
  } catch (error) {
    logger.error(`${LOG_PREFIX} Failed to schedule trial-ending notification:`, error);
    if (isTrialEndingOriginCurrent(originatingSession, operation)) {
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
  trialDays?: number,
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
        title: getTrialNoticeTitle(trialDays === 3 ? 'tomorrow' : 'two_days', new Date().getDay()),
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
export async function syncTrialEndingNotification(
  customerInfo?: CustomerInfo,
): Promise<void> {
  const originatingSession = captureSyncSession();
  if (isUnsupportedPlatform()) return;
  if (!isSyncSessionCurrent(originatingSession)) return;

  const originatingOperation = beginTrialEndingOperation();

  if (customerInfo) {
    await scheduleTrialEndingNotification(
      customerInfo,
      originatingSession,
      originatingOperation,
    );
    return;
  }

  if (!isRevenueCatEnabled()) {
    // Without RevenueCat we cannot know the trial state — make sure there's
    // nothing stale left over and bail.
    await cancelTrialEndingNotification(originatingSession, originatingOperation);
    return;
  }

  const customerInfoResult = await getCustomerInfo();
  if (!isTrialEndingOriginCurrent(originatingSession, originatingOperation)) {
    logger.log(`${LOG_PREFIX} Sync abandoned after customer info — originating owner is not current`);
    return;
  }
  if (!customerInfoResult.ok) {
    logger.log(
      `${LOG_PREFIX} Sync skipped: getCustomerInfo failed (${customerInfoResult.reason})`,
    );
    return;
  }

  await scheduleTrialEndingNotification(
    customerInfoResult.data,
    originatingSession,
    originatingOperation,
  );
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
