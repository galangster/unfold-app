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
  // failed with Restore as the only exit. The paywall owns the longer wait
  // (waitForUnfoldPremiumEntitlement, bounded by POST_PURCHASE_ENTITLEMENT_WAIT_MS)
  // so purchasePackage returns promptly and one listener serves the screen.
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

    /**
     * Model the SDK cache every re-read has to defeat. Native getCustomerInfo
     * uses the cachedOrFetched policy and treats the foreground cache as fresh
     * for five minutes, so it vends the last fetched info until
     * invalidateCustomerInfoCache clears it. A read that skips the clear can
     * never observe a grant that landed after the last fetch.
     */
    const modelSdkCache = (
      purchasesMock: { invalidateCustomerInfoCache: jest.Mock; getCustomerInfo: jest.Mock },
      initialServerInfo: unknown,
    ) => {
      let serverInfo = initialServerInfo;
      let cache: unknown = null;
      purchasesMock.invalidateCustomerInfoCache.mockImplementation(async () => {
        cache = null;
      });
      purchasesMock.getCustomerInfo.mockImplementation(async () => {
        if (cache === null) cache = serverInfo;
        return cache;
      });
      return {
        grant: (info: unknown) => {
          serverInfo = info;
        },
      };
    };

    it('returns the unentitled info promptly after the quick refresh, with no listener of its own', async () => {
      const { client, purchasesMock } = await setup({ refreshedCustomerInfo: emptyCustomerInfo });

      const pending = client.purchasePackage({ identifier: '$rc_annual' } as any);
      await jest.advanceTimersByTimeAsync(QUICK_REFRESH_WINDOW_MS);

      await expect(pending).resolves.toEqual({ ok: true, data: emptyCustomerInfo });
      // Three reads, each behind its own cache clear.
      expect(purchasesMock.getCustomerInfo).toHaveBeenCalledTimes(3);
      expect(purchasesMock.invalidateCustomerInfoCache).toHaveBeenCalledTimes(3);
      expect(purchasesMock.addCustomerInfoUpdateListener).not.toHaveBeenCalled();
    });

    it('sees a grant that lands between quick-refresh reads because every read clears the SDK cache', async () => {
      const { client, purchasesMock } = await setup();
      const sdk = modelSdkCache(purchasesMock, emptyCustomerInfo);

      const pending = client.purchasePackage({ identifier: '$rc_annual' } as any);
      // The first read cached an unentitled answer; the grant lands before the next.
      await jest.advanceTimersByTimeAsync(100);
      sdk.grant(activeCustomerInfo);
      await jest.advanceTimersByTimeAsync(750);

      await expect(pending).resolves.toEqual({ ok: true, data: activeCustomerInfo });
      expect(purchasesMock.invalidateCustomerInfoCache).toHaveBeenCalledTimes(2);
      expect(purchasesMock.getCustomerInfo).toHaveBeenCalledTimes(2);
    });

    it('reports the client timeout promptly and leaves the grant wait to the paywall', async () => {
      const { client, purchasesMock } = await setup({
        purchaseNeverResolves: true,
        refreshedCustomerInfo: emptyCustomerInfo,
      });

      const pending = client.purchasePackage({ identifier: '$rc_annual' } as any);
      await jest.advanceTimersByTimeAsync(60_000);

      await expect(pending).resolves.toEqual(
        expect.objectContaining({ ok: false, reason: 'timeout' }),
      );
      expect(purchasesMock.addCustomerInfoUpdateListener).not.toHaveBeenCalled();
      expect(purchasesMock.getCustomerInfo).not.toHaveBeenCalled();
    });

    it('resolves with the entitled customer info the update listener delivers', async () => {
      const { client, purchasesMock } = await setup({ refreshedCustomerInfo: emptyCustomerInfo });

      const pending = client.waitForUnfoldPremiumEntitlement(client.POST_PURCHASE_ENTITLEMENT_WAIT_MS);
      const listener = capturedListener(purchasesMock);
      // One 2 s poll has run and found nothing.
      await jest.advanceTimersByTimeAsync(2_000);
      expect(purchasesMock.getCustomerInfo).toHaveBeenCalledTimes(1);
      expect(purchasesMock.invalidateCustomerInfoCache).toHaveBeenCalledTimes(1);
      listener(emptyCustomerInfo);
      listener(activeCustomerInfo);

      await expect(pending).resolves.toEqual(activeCustomerInfo);
      expect(purchasesMock.removeCustomerInfoUpdateListener).toHaveBeenCalledWith(listener);
    });

    it('resolves with the entitled customer info found by the 2 s poll, which clears the SDK cache before it reads', async () => {
      const { client, purchasesMock } = await setup();
      const sdk = modelSdkCache(purchasesMock, emptyCustomerInfo);
      // The quick refresh before the wait cached an unentitled read.
      await purchasesMock.getCustomerInfo();
      purchasesMock.getCustomerInfo.mockClear();

      const pending = client.waitForUnfoldPremiumEntitlement(client.POST_PURCHASE_ENTITLEMENT_WAIT_MS);
      sdk.grant(activeCustomerInfo);
      await jest.advanceTimersByTimeAsync(2_000);

      await expect(pending).resolves.toEqual(activeCustomerInfo);
      expect(purchasesMock.invalidateCustomerInfoCache).toHaveBeenCalledTimes(1);
      expect(purchasesMock.getCustomerInfo).toHaveBeenCalledTimes(1);
      expect(purchasesMock.removeCustomerInfoUpdateListener).toHaveBeenCalledTimes(1);
    });

    it('clears the SDK cache on every poll, not only on the first one', async () => {
      const { client, purchasesMock } = await setup();
      const sdk = modelSdkCache(purchasesMock, emptyCustomerInfo);

      const pending = client.waitForUnfoldPremiumEntitlement(client.POST_PURCHASE_ENTITLEMENT_WAIT_MS);
      // The first poll fetched and found nothing.
      await jest.advanceTimersByTimeAsync(2_000);
      expect(purchasesMock.invalidateCustomerInfoCache).toHaveBeenCalledTimes(1);
      sdk.grant(activeCustomerInfo);
      await jest.advanceTimersByTimeAsync(2_000);

      await expect(pending).resolves.toEqual(activeCustomerInfo);
      expect(purchasesMock.invalidateCustomerInfoCache).toHaveBeenCalledTimes(2);
      expect(purchasesMock.getCustomerInfo).toHaveBeenCalledTimes(2);
    });

    it('resolves null once the bound passes, with the listener removed', async () => {
      const { client, purchasesMock } = await setup({ refreshedCustomerInfo: emptyCustomerInfo });

      const pending = client.waitForUnfoldPremiumEntitlement(client.POST_PURCHASE_ENTITLEMENT_WAIT_MS);
      const listener = capturedListener(purchasesMock);
      await jest.advanceTimersByTimeAsync(client.POST_PURCHASE_ENTITLEMENT_WAIT_MS);

      await expect(pending).resolves.toBeNull();
      expect(purchasesMock.removeCustomerInfoUpdateListener).toHaveBeenCalledWith(listener);
      // Nothing keeps polling once the wait is over.
      const polls = purchasesMock.getCustomerInfo.mock.calls.length;
      await jest.advanceTimersByTimeAsync(10_000);
      expect(purchasesMock.getCustomerInfo).toHaveBeenCalledTimes(polls);
    });

    it('removes the listener and resolves null as soon as the caller aborts the wait', async () => {
      const { client, purchasesMock } = await setup({ refreshedCustomerInfo: emptyCustomerInfo });
      const controller = new AbortController();

      const pending = client.waitForUnfoldPremiumEntitlement(
        client.POST_PURCHASE_ENTITLEMENT_WAIT_MS,
        { signal: controller.signal },
      );
      const listener = capturedListener(purchasesMock);
      await jest.advanceTimersByTimeAsync(2_000);
      expect(purchasesMock.invalidateCustomerInfoCache).toHaveBeenCalledTimes(1);
      expect(purchasesMock.getCustomerInfo).toHaveBeenCalledTimes(1);

      controller.abort();

      await expect(pending).resolves.toBeNull();
      expect(purchasesMock.removeCustomerInfoUpdateListener).toHaveBeenCalledWith(listener);
      // Nothing keeps polling for a screen that is gone.
      await jest.advanceTimersByTimeAsync(client.POST_PURCHASE_ENTITLEMENT_WAIT_MS);
      expect(purchasesMock.getCustomerInfo).toHaveBeenCalledTimes(1);
    });

    it('resolves null without registering a listener when the signal is already aborted', async () => {
      const { client, purchasesMock } = await setup({ refreshedCustomerInfo: emptyCustomerInfo });
      const controller = new AbortController();
      controller.abort();

      await expect(
        client.waitForUnfoldPremiumEntitlement(client.POST_PURCHASE_ENTITLEMENT_WAIT_MS, {
          signal: controller.signal,
        }),
      ).resolves.toBeNull();
      expect(purchasesMock.addCustomerInfoUpdateListener).not.toHaveBeenCalled();
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
