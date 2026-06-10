/**
 * Tests for FIX-11 (NET-4 P1):
 * retryRevenueCatIdentitySync clears the sticky error and restores operation.
 */

const emptyCustomerInfo = {
  entitlements: { active: {}, all: {} },
  activeSubscriptions: [],
  allPurchasedProductIdentifiers: [],
  latestExpirationDate: null,
} as any;

const activeCustomerInfo = {
  entitlements: {
    active: { 'Unfold Premium': { identifier: 'Unfold Premium' } },
    all: { 'Unfold Premium': { identifier: 'Unfold Premium' } },
  },
  activeSubscriptions: ['unfold_premium_yearly'],
  allPurchasedProductIdentifiers: ['unfold_premium_yearly'],
  latestExpirationDate: '2026-06-01T00:00:00Z',
} as any;

function makePurchasesMock({
  logInImpl,
  getCustomerInfoImpl,
}: {
  logInImpl?: jest.Mock;
  getCustomerInfoImpl?: jest.Mock;
} = {}) {
  return {
    LOG_LEVEL: { INFO: 'INFO', WARN: 'WARN', ERROR: 'ERROR' },
    configure: jest.fn(),
    setLogHandler: jest.fn(),
    setLogLevel: jest.fn(async () => undefined),
    // Return an anonymous-style ID so synchronizeRevenueCatAppUserID does NOT
    // early-return (the device-derived ID will differ, forcing logIn to be called)
    getAppUserID: jest.fn(async () => '$RCAnonymousID:aabbccdd'),
    logIn: logInImpl ?? jest.fn(async () => ({ created: false, customerInfo: emptyCustomerInfo })),
    purchasePackage: jest.fn(),
    restorePurchases: jest.fn(),
    invalidateCustomerInfoCache: jest.fn(async () => undefined),
    getCustomerInfo: getCustomerInfoImpl ?? jest.fn(async () => activeCustomerInfo),
    getOfferings: jest.fn(),
    addCustomerInfoUpdateListener: jest.fn(),
    removeCustomerInfoUpdateListener: jest.fn(),
    logOut: jest.fn(),
    checkTrialOrIntroductoryPriceEligibility: jest.fn(),
  };
}

async function setupWithFailingLogin() {
  jest.resetModules();
  process.env.EXPO_PUBLIC_REVENUECAT_TEST_KEY = 'appl_test_key';

  const logIn = jest.fn().mockRejectedValue(new Error('network down'));
  const purchasesMock = makePurchasesMock({ logInImpl: logIn });

  jest.doMock('react-native', () => ({ Platform: { OS: 'ios' } }));
  jest.doMock('@/lib/logger', () => ({ logger: { log: jest.fn(), warn: jest.fn(), error: jest.fn() } }));
  jest.doMock('@/lib/mmkv-storage', () => ({ getDeviceId: () => '11111111-1111-4111-8111-111111111111' }));
  jest.doMock('@/lib/paywall-diagnostics', () => ({
    isPaywallDiagnosticsEnabled: () => false,
    recordPaywallDiagnosticLazy: jest.fn(),
    summarizeCustomerInfo: (v: unknown) => v,
    summarizeDiagnosticIdentifier: () => '[REDACTED]',
    summarizeOfferings: (v: unknown) => v,
    summarizePackage: (v: unknown) => v,
    summarizeRevenueCatError: (v: unknown) => v,
    sanitizeDiagnosticText: (v: string) => v,
  }));
  jest.doMock('react-native-purchases', () => ({ __esModule: true, default: purchasesMock }));

  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const client = require('../revenuecatClient') as typeof import('../revenuecatClient');
  // Wait for the initial identity-sync attempt to fail
  await new Promise<void>((resolve) => setTimeout(resolve, 20));
  return { client, purchasesMock, logIn };
}

afterEach(() => {
  delete process.env.EXPO_PUBLIC_REVENUECAT_TEST_KEY;
  jest.dontMock('react-native');
  jest.dontMock('@/lib/logger');
  jest.dontMock('@/lib/mmkv-storage');
  jest.dontMock('@/lib/paywall-diagnostics');
  jest.dontMock('react-native-purchases');
});

describe('retryRevenueCatIdentitySync', () => {
  it('identity failure is sticky until retried', async () => {
    const { client } = await setupWithFailingLogin();

    // Baseline pin: failed identity → sdk_error
    const result = await client.getCustomerInfo();
    expect(result).toMatchObject({ ok: false, reason: 'sdk_error' });
  });

  it('retryRevenueCatIdentitySync clears the sticky error', async () => {
    const { client, purchasesMock, logIn } = await setupWithFailingLogin();

    // Flip logIn to succeed for the retry
    logIn.mockResolvedValue({ created: false, customerInfo: emptyCustomerInfo });
    // Set getCustomerInfo to return active info
    purchasesMock.getCustomerInfo.mockResolvedValue(activeCustomerInfo);

    // RED: export does not exist yet
    const retried = await client.retryRevenueCatIdentitySync();
    expect(retried).toBe(true);

    // After retry, getCustomerInfo should succeed
    const result = await client.getCustomerInfo();
    expect(result).toMatchObject({ ok: true });
  });

  it('retry is single-flight', async () => {
    const { client, logIn } = await setupWithFailingLogin();

    // Make logIn hang on a deferred promise for the retry
    let resolveRetry!: () => void;
    logIn.mockReturnValue(
      new Promise<{ created: boolean; customerInfo: typeof emptyCustomerInfo }>((res) => {
        resolveRetry = () => res({ created: false, customerInfo: emptyCustomerInfo });
      }),
    );

    // Call retry twice concurrently
    const p1 = client.retryRevenueCatIdentitySync();
    const p2 = client.retryRevenueCatIdentitySync();

    // Resolve the hanging logIn
    resolveRetry();
    await Promise.all([p1, p2]);

    // logIn was called exactly once for the initial sync + once for retry = 2
    // but the retry itself should only fire ONE additional logIn call
    // Initial call at module load = 1; retry should add exactly 1 more
    const retryCalls = logIn.mock.calls.length - 1; // subtract initial sync call
    expect(retryCalls).toBe(1);
  });
});
