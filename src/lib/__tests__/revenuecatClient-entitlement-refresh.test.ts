const activeCustomerInfo = {
  entitlements: {
    active: {
      'Unfold Premium': { identifier: 'Unfold Premium' },
    },
    all: {
      'Unfold Premium': { identifier: 'Unfold Premium' },
    },
  },
  activeSubscriptions: ['unfold_premium_yearly'],
  allPurchasedProductIdentifiers: ['unfold_premium_yearly'],
  latestExpirationDate: '2026-06-01T00:00:00Z',
} as any;

const emptyCustomerInfo = {
  entitlements: {
    active: {},
    all: { 'Unfold Premium': { identifier: 'Unfold Premium' } },
  },
  activeSubscriptions: [],
  allPurchasedProductIdentifiers: [],
  latestExpirationDate: null,
} as any;

describe('RevenueCat entitlement refresh after store actions', () => {
  const setup = async ({
    purchaseCustomerInfo = emptyCustomerInfo,
    restoreCustomerInfo = emptyCustomerInfo,
    refreshedCustomerInfo = activeCustomerInfo,
    purchaseNeverResolves = false,
  }: {
    purchaseCustomerInfo?: any;
    restoreCustomerInfo?: any;
    refreshedCustomerInfo?: any;
    purchaseNeverResolves?: boolean;
  } = {}) => {
    jest.resetModules();
    process.env.EXPO_PUBLIC_REVENUECAT_TEST_KEY = 'appl_test_key';

    const purchasesMock = {
      LOG_LEVEL: { INFO: 'INFO', WARN: 'WARN', ERROR: 'ERROR' },
      configure: jest.fn(),
      setLogHandler: jest.fn(),
      setLogLevel: jest.fn(async () => undefined),
      getAppUserID: jest.fn(async () => 'anon_11111111-1111-4111-8111-111111111111'),
      logIn: jest.fn(async () => ({ created: false, customerInfo: emptyCustomerInfo })),
      purchasePackage: jest.fn(() => {
        if (purchaseNeverResolves) {
          return new Promise(() => {});
        }
        return Promise.resolve({
          productIdentifier: 'unfold_premium_yearly',
          transaction: {
            transactionIdentifier: '2000000123456789',
            productIdentifier: 'unfold_premium_yearly',
            purchaseDate: '2026-05-31T00:00:00Z',
          },
          customerInfo: purchaseCustomerInfo,
        });
      }),
      restorePurchases: jest.fn(async () => restoreCustomerInfo),
      invalidateCustomerInfoCache: jest.fn(async () => undefined),
      getCustomerInfo: jest.fn(async () => refreshedCustomerInfo),
      getOfferings: jest.fn(),
      addCustomerInfoUpdateListener: jest.fn(),
      removeCustomerInfoUpdateListener: jest.fn(),
      logOut: jest.fn(),
      checkTrialOrIntroductoryPriceEligibility: jest.fn(),
    };

    jest.doMock('react-native', () => ({ Platform: { OS: 'ios' } }));
    jest.doMock('@/lib/logger', () => ({ logger: { log: jest.fn(), warn: jest.fn(), error: jest.fn() } }));
    jest.doMock('@/lib/mmkv-storage', () => ({
    getDeviceId: () => '11111111-1111-4111-8111-111111111111',
    // The module-scope RevenueCat init refuses to configure in a
    // storage-locked session; these suites exercise a normal one.
    isRecoverySession: () => false,
  }));
    jest.doMock('@/lib/paywall-diagnostics', () => ({
      isPaywallDiagnosticsEnabled: () => false,
      recordPaywallDiagnosticLazy: jest.fn(),
      summarizeCustomerInfo: (value: unknown) => value,
      summarizeDiagnosticIdentifier: () => '[REDACTED_APP_USER_ID]',
      summarizeOfferings: (value: unknown) => value,
      summarizePackage: (value: unknown) => value,
      summarizeRevenueCatError: (value: unknown) => value,
      sanitizeDiagnosticText: (value: string) => value,
    }));
    jest.doMock('react-native-purchases', () => ({ __esModule: true, default: purchasesMock }));

    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const client = require('../revenuecatClient') as typeof import('../revenuecatClient');
    return { client, purchasesMock };
  };

  afterEach(() => {
    delete process.env.EXPO_PUBLIC_REVENUECAT_TEST_KEY;
    jest.dontMock('react-native');
    jest.dontMock('@/lib/logger');
    jest.dontMock('@/lib/mmkv-storage');
    jest.dontMock('@/lib/paywall-diagnostics');
    jest.dontMock('react-native-purchases');
  });

  it('refetches customer info when purchase resolves before the Premium entitlement is active', async () => {
    const { client, purchasesMock } = await setup();

    const result = await client.purchasePackage({ identifier: '$rc_annual' } as any);

    expect(result).toEqual({ ok: true, data: activeCustomerInfo });
    expect(purchasesMock.invalidateCustomerInfoCache).toHaveBeenCalledTimes(1);
    expect(purchasesMock.getCustomerInfo).toHaveBeenCalledTimes(1);
  });

  it('refetches customer info when restore resolves before the Premium entitlement is active', async () => {
    const { client, purchasesMock } = await setup();

    const result = await client.restorePurchases();

    expect(result).toEqual({ ok: true, data: activeCustomerInfo });
    expect(purchasesMock.invalidateCustomerInfoCache).toHaveBeenCalledTimes(1);
    expect(purchasesMock.getCustomerInfo).toHaveBeenCalledTimes(1);
  });

  it('does not refetch when the store action already returns the Premium entitlement', async () => {
    const { client, purchasesMock } = await setup({ purchaseCustomerInfo: activeCustomerInfo });

    const result = await client.purchasePackage({ identifier: '$rc_annual' } as any);

    expect(result).toEqual({ ok: true, data: activeCustomerInfo });
    expect(purchasesMock.invalidateCustomerInfoCache).not.toHaveBeenCalled();
    expect(purchasesMock.getCustomerInfo).not.toHaveBeenCalled();
  });

  // The quick refresh above covers ~2.25 s. A new trial's grant can land later
  // than that, and the onboarding paywall used to report those purchases as
  // failed with Restore as the only exit. These pin the extended wait.
  describe('late entitlement grant after a completed purchase', () => {
    const QUICK_REFRESH_WINDOW_MS = 2_250;

    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    const capturedListener = (purchasesMock: { addCustomerInfoUpdateListener: jest.Mock }) => {
      expect(purchasesMock.addCustomerInfoUpdateListener).toHaveBeenCalledTimes(1);
      return purchasesMock.addCustomerInfoUpdateListener.mock.calls[0][0] as (info: unknown) => void;
    };

    it('returns the entitled customer info delivered by the update listener after the quick refresh gave up', async () => {
      const { client, purchasesMock } = await setup({ refreshedCustomerInfo: emptyCustomerInfo });

      const pending = client.purchasePackage({ identifier: '$rc_annual' } as any);
      await jest.advanceTimersByTimeAsync(QUICK_REFRESH_WINDOW_MS);
      expect(purchasesMock.getCustomerInfo).toHaveBeenCalledTimes(3);

      const listener = capturedListener(purchasesMock);
      // 4.25 s after the purchase resolved: one 2 s poll has run and found nothing.
      await jest.advanceTimersByTimeAsync(2_000);
      expect(purchasesMock.getCustomerInfo).toHaveBeenCalledTimes(4);
      listener(activeCustomerInfo);

      await expect(pending).resolves.toEqual({ ok: true, data: activeCustomerInfo });
      expect(purchasesMock.removeCustomerInfoUpdateListener).toHaveBeenCalledWith(listener);
    });

    it('returns the entitled customer info found by the 2 s poll', async () => {
      const { client, purchasesMock } = await setup({ refreshedCustomerInfo: emptyCustomerInfo });
      purchasesMock.getCustomerInfo
        .mockResolvedValueOnce(emptyCustomerInfo)
        .mockResolvedValueOnce(emptyCustomerInfo)
        .mockResolvedValueOnce(emptyCustomerInfo)
        .mockResolvedValue(activeCustomerInfo);

      const pending = client.purchasePackage({ identifier: '$rc_annual' } as any);
      await jest.advanceTimersByTimeAsync(QUICK_REFRESH_WINDOW_MS + 2_000);

      await expect(pending).resolves.toEqual({ ok: true, data: activeCustomerInfo });
      expect(purchasesMock.removeCustomerInfoUpdateListener).toHaveBeenCalledTimes(1);
    });

    it('recovers a purchase that outlived the client timeout when the listener delivers the entitlement', async () => {
      const { client, purchasesMock } = await setup({
        purchaseNeverResolves: true,
        refreshedCustomerInfo: emptyCustomerInfo,
      });

      const pending = client.purchasePackage({ identifier: '$rc_annual' } as any);
      await jest.advanceTimersByTimeAsync(60_000);

      const listener = capturedListener(purchasesMock);
      await jest.advanceTimersByTimeAsync(3_000);
      listener(activeCustomerInfo);

      await expect(pending).resolves.toEqual({ ok: true, data: activeCustomerInfo });
      expect(purchasesMock.removeCustomerInfoUpdateListener).toHaveBeenCalledWith(listener);
    });

    it('still reports a timeout when no entitlement arrives inside the wait window', async () => {
      const { client, purchasesMock } = await setup({
        purchaseNeverResolves: true,
        refreshedCustomerInfo: emptyCustomerInfo,
      });

      const pending = client.purchasePackage({ identifier: '$rc_annual' } as any);
      await jest.advanceTimersByTimeAsync(60_000 + client.POST_PURCHASE_ENTITLEMENT_WAIT_MS);

      await expect(pending).resolves.toEqual(
        expect.objectContaining({ ok: false, reason: 'timeout' }),
      );
      const listener = capturedListener(purchasesMock);
      expect(purchasesMock.removeCustomerInfoUpdateListener).toHaveBeenCalledWith(listener);
    });

    it('does not extend the wait for a restore that finds no subscription', async () => {
      const { client, purchasesMock } = await setup({ refreshedCustomerInfo: emptyCustomerInfo });

      const pending = client.restorePurchases();
      await jest.advanceTimersByTimeAsync(QUICK_REFRESH_WINDOW_MS);

      await expect(pending).resolves.toEqual({ ok: true, data: emptyCustomerInfo });
      expect(purchasesMock.addCustomerInfoUpdateListener).not.toHaveBeenCalled();
    });
  });
});
