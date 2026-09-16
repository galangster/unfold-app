/**
 * Encoding of every input that changes the check-in notification queue.
 *
 * Pure: no expo, no store. The owner hook, the background top-up, and the
 * fingerprint tests all import this so they cannot drift.
 */

import type { PremiumAccessPolicy } from './premium-access-policy';

export type CheckInByDay = Record<string, string | null> | null;

export interface CheckInFingerprintInputs {
  policy: PremiumAccessPolicy;
  middayEnabled: boolean;
  eveningEnabled: boolean;
  middayTime: string;
  eveningTime: string;
  middayByDay: CheckInByDay;
  eveningByDay: CheckInByDay;
  hasCompletedOnboarding: boolean;
  todayCarryLine: string;
  notificationPermissionEpoch: number;
  trialNoticeEpoch: number;
  deviceTimezone: string;
}

/**
 * If you add a branch to `runCheckInNotificationSync`, add its inputs here.
 *
 * Deliberately excludes completion dates: finishing today's check-in does
 * not change tomorrow's occurrence. Includes byDay maps and timezone — see
 * `useCheckInNotifications` for the load-bearing reasons.
 */
export function buildCheckInFingerprint(inputs: CheckInFingerprintInputs): string {
  return JSON.stringify([
    inputs.policy,
    inputs.middayEnabled ? '1' : '0',
    inputs.eveningEnabled ? '1' : '0',
    inputs.middayTime,
    inputs.eveningTime,
    inputs.middayByDay,
    inputs.eveningByDay,
    inputs.hasCompletedOnboarding ? '1' : '0',
    inputs.todayCarryLine,
    inputs.notificationPermissionEpoch,
    inputs.trialNoticeEpoch,
    inputs.deviceTimezone,
  ]);
}
