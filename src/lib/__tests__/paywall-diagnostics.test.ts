/* eslint-disable import/first */

jest.mock('expo-file-system/legacy', () => ({
  documentDirectory: 'file:///documents/',
  cacheDirectory: 'file:///cache/',
  EncodingType: { UTF8: 'utf8' },
  getInfoAsync: jest.fn(async () => ({ exists: false })),
  readAsStringAsync: jest.fn(async () => ''),
  writeAsStringAsync: jest.fn(async () => undefined),
  deleteAsync: jest.fn(async () => undefined),
}));

jest.mock('react-native', () => ({
  Platform: { OS: 'ios' },
}));

// P3-4 item 1: the gate consults the stamped EAS build profile via expo-constants.
const mockConstants: { expoConfig: { extra?: unknown } | null } = { expoConfig: { extra: {} } };
jest.mock('expo-constants', () => ({ __esModule: true, default: mockConstants }));

jest.mock('@/lib/logger', () => ({
  logger: { log: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

import {
  clearPaywallDiagnosticsFile,
  isPaywallDiagnosticsEnabled,
  recordPaywallDiagnostic,
  recordPaywallDiagnosticLazy,
  sanitizeDiagnosticText,
  sanitizeDiagnosticValue,
  summarizeCustomerInfo,
  summarizeDiagnosticIdentifier,
  summarizePackage,
} from '../paywall-diagnostics';

describe('paywall diagnostics', () => {
  const devGlobal = globalThis as typeof globalThis & { __DEV__: boolean };
  const originalDev = devGlobal.__DEV__;

  beforeEach(() => {
    delete process.env.EXPO_PUBLIC_ENABLE_QA_TOOLS;
    mockConstants.expoConfig = { extra: {} };
    devGlobal.__DEV__ = originalDev;
    jest.clearAllMocks();
  });

  afterAll(() => {
    devGlobal.__DEV__ = originalDev;
  });

  it('is hard-blocked in a production build even when the QA flag was inlined', async () => {
    process.env.EXPO_PUBLIC_ENABLE_QA_TOOLS = '1';
    mockConstants.expoConfig = { extra: { buildProfile: 'production' } };
    const fileSystem = jest.requireMock('expo-file-system/legacy');
    const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => undefined);
    const getData = jest.fn(() => ({ secret: 'never' }));

    expect(isPaywallDiagnosticsEnabled()).toBe(false);
    await recordPaywallDiagnostic('test.production', { token: 'do-not-keep' });
    await recordPaywallDiagnosticLazy('test.production_lazy', getData);

    expect(fileSystem.writeAsStringAsync).not.toHaveBeenCalled();
    expect(consoleSpy).not.toHaveBeenCalled();
    expect(getData).not.toHaveBeenCalled();
    consoleSpy.mockRestore();
  });

  it.each<[string | null, boolean, string | undefined, boolean]>([
    ['production', false, '1', false],
    ['production', true, '1', false],
    ['production-hotfix', false, '1', false],
    [null, true, undefined, false],
    [null, true, '1', true],
    [null, false, '1', false],
    ['qa-testflight', false, undefined, false],
    ['qa-testflight', false, 'true', false],
    ['qa-testflight', false, '1', true],
    ['preview', false, '1', true],
  ])('gate: profile=%s __DEV__=%s flag=%s → %s', (buildProfile, isDev, flag, expected) => {
    mockConstants.expoConfig = { extra: buildProfile === null ? {} : { buildProfile } };
    devGlobal.__DEV__ = isDev;
    if (flag === undefined) {
      delete process.env.EXPO_PUBLIC_ENABLE_QA_TOOLS;
    } else {
      process.env.EXPO_PUBLIC_ENABLE_QA_TOOLS = flag;
    }
    expect(isPaywallDiagnosticsEnabled()).toBe(expected);
  });

  it('is a no-op when QA diagnostics are disabled', async () => {
    const fileSystem = jest.requireMock('expo-file-system/legacy');
    const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => undefined);

    await recordPaywallDiagnostic('test.disabled', { token: 'do-not-keep' });

    expect(fileSystem.writeAsStringAsync).not.toHaveBeenCalled();
    expect(consoleSpy).not.toHaveBeenCalled();
    consoleSpy.mockRestore();
  });

  it('does not evaluate lazy diagnostic payloads when QA diagnostics are disabled', async () => {
    const getData = jest.fn(() => ({ package: 'would-be-expensive' }));

    await recordPaywallDiagnosticLazy('test.lazy_disabled', getData);

    expect(getData).not.toHaveBeenCalled();
  });

  it('writes sanitized JSONL entries when QA diagnostics are enabled', async () => {
    process.env.EXPO_PUBLIC_ENABLE_QA_TOOLS = '1';
    const fileSystem = jest.requireMock('expo-file-system/legacy');
    const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => undefined);

    await recordPaywallDiagnostic('test.enabled', {
      productIdentifier: 'unfold_premium_monthly_v2',
      apiKey: 'appl_secret123',
      appUserID: 'anon_8489bcfc-a86a-44e1-bbb1-6a6fa13d4e97',
    });

    expect(fileSystem.writeAsStringAsync).toHaveBeenCalledTimes(1);
    const [path, content] = fileSystem.writeAsStringAsync.mock.calls[0];
    expect(path).toBe('file:///documents/unfold-paywall-diagnostics.jsonl');
    expect(content).toContain('"event":"test.enabled"');
    expect(content).toContain('unfold_premium_monthly_v2');
    expect(content).not.toContain('appl_secret123');
    expect(content).not.toContain('anon_8489bcfc-a86a-44e1-bbb1-6a6fa13d4e97');
    expect(consoleSpy).toHaveBeenCalledTimes(1);
    consoleSpy.mockRestore();
  });

  it('deletes the diagnostics file on request even when the gate is off (full reset)', async () => {
    const fileSystem = jest.requireMock('expo-file-system/legacy');

    await clearPaywallDiagnosticsFile();

    expect(fileSystem.deleteAsync).toHaveBeenCalledWith('file:///documents/unfold-paywall-diagnostics.jsonl', {
      idempotent: true,
    });
  });

  it('queues the delete behind an in-flight append and swallows delete failures', async () => {
    process.env.EXPO_PUBLIC_ENABLE_QA_TOOLS = '1';
    const fileSystem = jest.requireMock('expo-file-system/legacy');
    const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => undefined);
    const order: string[] = [];
    fileSystem.writeAsStringAsync.mockImplementationOnce(async () => {
      order.push('write');
    });
    fileSystem.deleteAsync.mockImplementationOnce(async () => {
      order.push('delete');
      throw new Error('locked');
    });

    const append = recordPaywallDiagnostic('test.before_delete', { ok: true });
    await expect(clearPaywallDiagnosticsFile()).resolves.toBeUndefined();
    await append;

    expect(order).toEqual(['write', 'delete']);
    consoleSpy.mockRestore();
  });

  it('redacts RevenueCat keys, auth headers, JWTs, and long receipt-like payloads from text', () => {
    const longToken = 'a'.repeat(120);
    const text = `key appl_abc123 and goog_def456 auth Bearer ${'b'.repeat(24)} jwt eyJabc.def.ghi receipt ${longToken}`;

    expect(sanitizeDiagnosticText(text)).toBe(
      'key [REDACTED_REVENUECAT_KEY] and [REDACTED_REVENUECAT_KEY] auth [REDACTED_AUTH_HEADER] jwt [REDACTED_JWT] receipt [REDACTED_LONG_TOKEN]',
    );
  });

  it('masks customer and transaction identifiers in free-form SDK logs', () => {
    const text = 'customer anon_8489bcfc-a86a-44e1-bbb1-6a6fa13d4e97 $RCAnonymousID:abc123 transaction_id=200000012345 appUserID=anon_8489bcfc-a86a-44e1-bbb1-6a6fa13d4e97 {"transactionIdentifier":"200000012345","customer_id":"cust_123456789","appUserID":"anon_8489bcfc-a86a-44e1-bbb1-6a6fa13d4e97"}';

    expect(sanitizeDiagnosticText(text)).toBe(
      'customer [REDACTED_APP_USER_ID] [REDACTED_APP_USER_ID] transaction_id=[REDACTED_IDENTIFIER] appUserID=[REDACTED_IDENTIFIER] {"transactionIdentifier":"[REDACTED_IDENTIFIER]","customer_id":"[REDACTED_IDENTIFIER]","appUserID":"[REDACTED_IDENTIFIER]"}',
    );
  });

  it('masks customer and transaction identifiers', () => {
    expect(summarizeDiagnosticIdentifier('anon_8489bcfc-a86a-44e1-bbb1-6a6fa13d4e97')).toBe(
      '[REDACTED_APP_USER_ID]',
    );
  });

  it('redacts sensitive object keys recursively', () => {
    expect(
      sanitizeDiagnosticValue({
        productIdentifier: 'unfold_premium_monthly_v2',
        receiptData: 'do-not-keep',
        targetAppUserID: 'anon_8489bcfc-a86a-44e1-bbb1-6a6fa13d4e97',
        transactionIdentifier: '200000012345',
        nested: { apiKey: 'do-not-keep', token: 'do-not-keep' },
      }),
    ).toEqual({
      productIdentifier: 'unfold_premium_monthly_v2',
      receiptData: '[REDACTED]',
      targetAppUserID: '[REDACTED]',
      transactionIdentifier: '[REDACTED]',
      nested: { apiKey: '[REDACTED]', token: '[REDACTED]' },
    });
  });

  it('summarizes customer info without management URLs or raw receipt fields', () => {
    const summary = summarizeCustomerInfo({
      originalAppUserId: 'anon_test',
      firstSeen: '2026-05-01T00:00:00Z',
      requestDate: '2026-05-01T00:01:00Z',
      latestExpirationDate: null,
      managementURL: 'https://apps.apple.com/account/subscriptions',
      activeSubscriptions: [],
      allPurchasedProductIdentifiers: ['unfold_premium_monthly_v2'],
      allExpirationDates: { unfold_premium_monthly_v2: '2026-05-01T00:05:00Z' },
      allPurchaseDates: { unfold_premium_monthly_v2: '2026-05-01T00:00:00Z' },
      entitlements: {
        active: {},
        all: { 'Unfold Premium': { identifier: 'Unfold Premium' } },
      },
      subscriptionsByProductIdentifier: {
        unfold_premium_monthly_v2: {
          isActive: false,
          willRenew: false,
          isSandbox: true,
          store: 'APP_STORE',
          purchaseDate: '2026-05-01T00:00:00Z',
          expiresDate: '2026-05-01T00:05:00Z',
          periodType: 'NORMAL',
          ownershipType: 'PURCHASED',
        },
      },
    } as any) as any;

    expect(summary.managementURLPresent).toBe(true);
    expect(JSON.stringify(summary)).not.toContain('apps.apple.com/account/subscriptions');
    expect(summary.activeEntitlements).toEqual([]);
    expect(summary.allEntitlements).toEqual(['Unfold Premium']);
    expect(summary.subscriptionSummaries.unfold_premium_monthly_v2).toMatchObject({
      isActive: false,
      isSandbox: true,
      store: 'APP_STORE',
    });
  });

  it('summarizes purchase packages with only safe product and offering fields', () => {
    const summary = summarizePackage({
      identifier: '$rc_monthly',
      packageType: 'MONTHLY',
      offeringIdentifier: 'default',
      presentedOfferingContext: {
        offeringIdentifier: 'default',
        placementIdentifier: null,
        targetingContext: null,
      },
      product: {
        identifier: 'unfold_premium_monthly_v2',
        title: 'Monthly',
        description: 'Premium monthly',
        price: 9.99,
        priceString: '$9.99',
        currencyCode: 'USD',
        productCategory: 'SUBSCRIPTION',
        productType: 'AUTO_RENEWABLE_SUBSCRIPTION',
        subscriptionPeriod: 'P1M',
        introPrice: null,
        discounts: null,
      },
    } as any) as any;

    expect(summary.packageIdentifier).toBe('$rc_monthly');
    expect(summary.product.identifier).toBe('unfold_premium_monthly_v2');
    expect(summary.product.productType).toBe('AUTO_RENEWABLE_SUBSCRIPTION');
  });
});
