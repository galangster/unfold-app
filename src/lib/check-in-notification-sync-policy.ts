import type { PremiumAccessPolicy } from './premium-access-policy';

export type CheckInNotificationGatePlan =
  | { kind: 'cancel-both'; reason: 'onboarding-incomplete' | 'premium-denied' }
  | { kind: 'defer'; reason: 'premium-unknown' }
  | { kind: 'continue' };

export interface CheckInNotificationGateInputs {
  hasCompletedOnboarding: boolean;
  policy: PremiumAccessPolicy;
}

/**
 * Decide whether the check-in notification owner may touch the OS queue.
 *
 * Unknown premium policy is intentionally a no-op, not a cancellation. We do
 * not schedule new premium reminders until RevenueCat resolves, but we also do
 * not delete an existing DAILY/WEEKLY OS schedule that was previously created
 * for a premium user. Deleting on every cold start/foreground can make paid
 * users miss the same day's midday/evening reminder if RevenueCat is slow,
 * offline, or still migrating identity.
 *
 * Once RevenueCat definitively resolves to denied, the owner cancels both
 * schedules. Onboarding incomplete also remains a hard cancel because the user
 * is not ready for check-in reminders at all.
 */
export function getCheckInNotificationGatePlan(
  inputs: CheckInNotificationGateInputs,
): CheckInNotificationGatePlan {
  if (!inputs.hasCompletedOnboarding) {
    return { kind: 'cancel-both', reason: 'onboarding-incomplete' };
  }

  if (inputs.policy === 'unknown') {
    return { kind: 'defer', reason: 'premium-unknown' };
  }

  if (inputs.policy === 'denied') {
    return { kind: 'cancel-both', reason: 'premium-denied' };
  }

  return { kind: 'continue' };
}
