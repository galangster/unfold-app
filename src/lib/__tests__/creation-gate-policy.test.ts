import { getChurnedCreationGateAction } from '../creation-gate-policy';

describe('creation gate winback policy', () => {
  const originalFlag = process.env.EXPO_PUBLIC_ENABLE_CHURNED_WINBACK_OFFER;

  afterEach(() => {
    if (originalFlag === undefined) {
      delete process.env.EXPO_PUBLIC_ENABLE_CHURNED_WINBACK_OFFER;
    } else {
      process.env.EXPO_PUBLIC_ENABLE_CHURNED_WINBACK_OFFER = originalFlag;
    }
    jest.resetModules();
  });

  it('disables the churned winback SKU path by default for v1 launch', () => {
    delete process.env.EXPO_PUBLIC_ENABLE_CHURNED_WINBACK_OFFER;

    jest.isolateModules(() => {
      const { CHURNED_WINBACK_OFFER_ENABLED } = jest.requireActual<
        typeof import('../creation-gate-policy')
      >('../creation-gate-policy');
      expect(CHURNED_WINBACK_OFFER_ENABLED).toBe(false);
    });
  });

  it('enables the churned winback SKU path only with an explicit 1 flag', () => {
    process.env.EXPO_PUBLIC_ENABLE_CHURNED_WINBACK_OFFER = '1';

    jest.isolateModules(() => {
      const { CHURNED_WINBACK_OFFER_ENABLED } = jest.requireActual<
        typeof import('../creation-gate-policy')
      >('../creation-gate-policy');
      expect(CHURNED_WINBACK_OFFER_ENABLED).toBe(true);
    });
  });

  it('routes granted users through without upsell', () => {
    expect(
      getChurnedCreationGateAction({
        policy: 'granted',
        hasSeenExclusiveOffer: false,
        winbackOfferEnabled: true,
      }),
    ).toBe('allow');
  });

  it('routes denied users to the normal paywall when the churned winback offer is disabled', () => {
    expect(
      getChurnedCreationGateAction({
        policy: 'denied',
        hasSeenExclusiveOffer: false,
        winbackOfferEnabled: false,
      }),
    ).toBe('paywall');
  });

  it('still allows an explicit opt-in flag to show the one-time churned offer later', () => {
    expect(
      getChurnedCreationGateAction({
        policy: 'denied',
        hasSeenExclusiveOffer: false,
        winbackOfferEnabled: true,
      }),
    ).toBe('exclusive-offer');
  });

  it('routes users who already saw the churned offer back to the normal paywall', () => {
    expect(
      getChurnedCreationGateAction({
        policy: 'denied',
        hasSeenExclusiveOffer: true,
        winbackOfferEnabled: true,
      }),
    ).toBe('paywall');
  });

  it('blocks without upsell while premium policy is still unknown', () => {
    expect(
      getChurnedCreationGateAction({
        policy: 'unknown',
        hasSeenExclusiveOffer: false,
        winbackOfferEnabled: true,
      }),
    ).toBe('blocked');
  });
});
