import { buildRevenueCatAppUserId } from '../revenuecat-user-id';

describe('RevenueCat user id contract', () => {
  it('uses the exact backend anonymous owner id convention', () => {
    expect(buildRevenueCatAppUserId('11111111-1111-4111-8111-111111111111')).toBe(
      'anon_11111111-1111-4111-8111-111111111111',
    );
  });

  it('trims the stored device id before building the RevenueCat id', () => {
    expect(buildRevenueCatAppUserId('  11111111-1111-4111-8111-111111111111\n')).toBe(
      'anon_11111111-1111-4111-8111-111111111111',
    );
  });

  it('rejects blank or non-UUID device ids instead of creating a drifting RevenueCat id', () => {
    expect(() => buildRevenueCatAppUserId('')).toThrow('RevenueCat app user id requires a UUID device id');
    expect(() => buildRevenueCatAppUserId('not-a-device-id')).toThrow(
      'RevenueCat app user id requires a UUID device id',
    );
  });
});
