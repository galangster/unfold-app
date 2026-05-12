import { getCheckInNotificationGatePlan } from '../check-in-notification-sync-policy';

describe('check-in notification sync gate', () => {
  it('defers without cancelling when premium policy is unknown', () => {
    expect(
      getCheckInNotificationGatePlan({
        hasCompletedOnboarding: true,
        policy: 'unknown',
      }),
    ).toEqual({ kind: 'defer', reason: 'premium-unknown' });
  });

  it('cancels both schedules when RevenueCat definitively denies premium', () => {
    expect(
      getCheckInNotificationGatePlan({
        hasCompletedOnboarding: true,
        policy: 'denied',
      }),
    ).toEqual({ kind: 'cancel-both', reason: 'premium-denied' });
  });

  it('cancels both schedules when onboarding is incomplete, even before premium resolves', () => {
    expect(
      getCheckInNotificationGatePlan({
        hasCompletedOnboarding: false,
        policy: 'unknown',
      }),
    ).toEqual({ kind: 'cancel-both', reason: 'onboarding-incomplete' });
  });

  it('continues to scheduling when onboarding is complete and premium is granted', () => {
    expect(
      getCheckInNotificationGatePlan({
        hasCompletedOnboarding: true,
        policy: 'granted',
      }),
    ).toEqual({ kind: 'continue' });
  });
});
