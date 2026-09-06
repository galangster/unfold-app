/**
 * MP-5: rejected listener registration must not retain an SDK listener.
 * Native SDK and network are test doubles only.
 */

const emptyCustomerInfo = {
  entitlements: { active: {}, all: {} },
  activeSubscriptions: [],
  allPurchasedProductIdentifiers: [],
  marker: 'empty',
} as any;

const activeCustomerInfo = {
  entitlements: {
    active: { 'Unfold Premium': { identifier: 'Unfold Premium' } },
    all: { 'Unfold Premium': { identifier: 'Unfold Premium' } },
  },
  activeSubscriptions: ['synthetic_product'],
  allPurchasedProductIdentifiers: ['synthetic_product'],
  marker: 'current-read',
} as any;

const staleEventInfo = {
  entitlements: {
    active: { 'Unfold Premium': { identifier: 'Unfold Premium' } },
    all: { 'Unfold Premium': { identifier: 'Unfold Premium' } },
  },
  marker: 'stale-event',
} as any;

const OLD_DEVICE = '11111111-1111-4111-8111-111111111111';
const NEW_DEVICE = '22222222-2222-4222-8222-222222222222';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((next, fail) => {
    resolve = next;
    reject = fail;
  });
  return { promise, resolve, reject };
}

async function tick(): Promise<void> {
  await new Promise<void>((resolve) => setImmediate(resolve));
}

async function waitUntil(predicate: () => boolean, label: string): Promise<void> {
  for (let i = 0; i < 80; i += 1) {
    if (predicate()) return;
    await tick();
  }
  throw new Error(`timed out waiting for ${label}`);
}

function makePurchasesMock() {
  let sdkUser = `anon_${OLD_DEVICE}`;
  const listeners = new Set<(info: typeof emptyCustomerInfo) => void>();
  let customerInfoWait: ReturnType<typeof deferred<typeof emptyCustomerInfo>> | null = null;

  const purchasesMock = {
    LOG_LEVEL: { INFO: 'INFO', WARN: 'WARN', ERROR: 'ERROR' },
    configure: jest.fn(),
    setLogHandler: jest.fn(),
    setLogLevel: jest.fn(async () => undefined),
    getAppUserID: jest.fn(async () => sdkUser),
    logIn: jest.fn(async (id: string) => {
      sdkUser = id;
      return { created: false, customerInfo: emptyCustomerInfo };
    }),
    logOut: jest.fn(async () => {
      sdkUser = '$RCAnonymousID:synthetic-new';
      return emptyCustomerInfo;
    }),
    getCustomerInfo: jest.fn(async () => {
      if (customerInfoWait) return customerInfoWait.promise;
      return activeCustomerInfo;
    }),
    purchasePackage: jest.fn(async () => ({
      customerInfo: activeCustomerInfo,
      productIdentifier: 'synthetic_product',
    })),
    restorePurchases: jest.fn(async () => activeCustomerInfo),
    invalidateCustomerInfoCache: jest.fn(async () => undefined),
    getOfferings: jest.fn(async () => ({ current: null })),
    addCustomerInfoUpdateListener: jest.fn((listener: (info: typeof emptyCustomerInfo) => void) => {
      listeners.add(listener);
    }),
    removeCustomerInfoUpdateListener: jest.fn((listener: (info: typeof emptyCustomerInfo) => void) => {
      return listeners.delete(listener);
    }),
    checkTrialOrIntroductoryPriceEligibility: jest.fn(),
  };

  return {
    purchasesMock,
    listeners,
    get sdkUser() {
      return sdkUser;
    },
    holdCustomerInfo() {
      customerInfoWait = deferred();
      return customerInfoWait;
    },
    releaseCustomerInfo(value: typeof emptyCustomerInfo) {
      customerInfoWait?.resolve(value);
      customerInfoWait = null;
    },
    emit(info: typeof emptyCustomerInfo) {
      for (const listener of [...listeners]) {
        listener(info);
      }
    },
  };
}

async function setupClient() {
  jest.resetModules();
  process.env.EXPO_PUBLIC_REVENUECAT_TEST_KEY = 'appl_test_key';

  const state = { deviceId: OLD_DEVICE, resetFence: false };
  const sdk = makePurchasesMock();

  jest.doMock('react-native', () => ({ Platform: { OS: 'ios' } }));
  jest.doMock('@/lib/logger', () => ({ logger: { log: jest.fn(), warn: jest.fn(), error: jest.fn() } }));
  jest.doMock('@/lib/mmkv-storage', () => ({
    getDeviceId: () => state.deviceId,
    isRecoverySession: () => false,
    mmkvStorage: { removeItem() {}, getItem() { return null; }, setItem() {} },
    getMmkvKeys: () => [],
    purgeRealStoreForRecoveryReset() {},
    rotateDeviceId() {
      state.deviceId = NEW_DEVICE;
      return NEW_DEVICE;
    },
  }));
  jest.doMock('@/lib/paywall-diagnostics', () => ({
    isPaywallDiagnosticsEnabled: () => false,
    recordPaywallDiagnosticLazy: jest.fn(),
    summarizeCustomerInfo: (v: unknown) => v,
    summarizeDiagnosticIdentifier: () => '[REDACTED]',
    summarizeOfferings: (v: unknown) => v,
    summarizePackage: (v: unknown) => v,
    summarizeRevenueCatError: (v: unknown) => v,
    sanitizeDiagnosticText: (v: string) => v,
    clearPaywallDiagnosticsFile: jest.fn(async () => undefined),
  }));
  jest.doMock('@/lib/sync-session-fence', () => ({
    isLocalResetInProgress: () => state.resetFence,
    beginLocalResetSession() {
      state.resetFence = true;
      return 1;
    },
    endLocalResetSession() {
      state.resetFence = false;
    },
  }));
  jest.doMock('react-native-purchases', () => ({ __esModule: true, default: sdk.purchasesMock }));

  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const client = require('../revenuecatClient') as typeof import('../revenuecatClient');
  await tick();
  await tick();

  return { client, sdk, state };
}

afterEach(() => {
  delete process.env.EXPO_PUBLIC_REVENUECAT_TEST_KEY;
  jest.dontMock('react-native');
  jest.dontMock('@/lib/logger');
  jest.dontMock('@/lib/mmkv-storage');
  jest.dontMock('@/lib/paywall-diagnostics');
  jest.dontMock('@/lib/sync-session-fence');
  jest.dontMock('react-native-purchases');
});

describe('MP-5 listener registration ownership', () => {
  it('does not retain an SDK listener when reset rejects admission after add', async () => {
    const rows: Array<{
      delay: number;
      registeredAtReset: number;
      ok: boolean;
      returnedDisposer: boolean;
      listenersLeft: number;
    }> = [];

    for (let delay = 0; delay < 10; delay += 1) {
      const { client, sdk, state } = await setupClient();
      const registration = client.addCustomerInfoUpdateListener(() => undefined);
      for (let i = 0; i < delay; i += 1) {
        await Promise.resolve();
      }
      const registeredAtReset = sdk.listeners.size;
      state.resetFence = true;
      client.invalidateRevenueCatIdentityReadiness();
      const result = await registration;
      const returnedDisposer = result.ok && typeof result.data === 'function';
      if (result.ok) {
        result.data();
      }
      rows.push({
        delay,
        registeredAtReset,
        ok: result.ok,
        returnedDisposer,
        listenersLeft: sdk.listeners.size,
      });
      state.deviceId = NEW_DEVICE;
      await client.establishRevenueCatIdentityForCurrentDevice();
      state.resetFence = false;
    }

    const leaks = rows.filter((row) => !row.ok && row.listenersLeft > 0);
    expect(leaks).toEqual([]);
    expect(rows.some((row) => row.returnedDisposer)).toBe(true);
    expect(rows.filter((row) => row.returnedDisposer).every((row) => row.listenersLeft === 0)).toBe(true);
  });

  it('returns a disposer that unsubscribes and ignores a later native event', async () => {
    const { client, sdk } = await setupClient();
    const delivered: string[] = [];
    const registered = await client.addCustomerInfoUpdateListener((info) => {
      delivered.push((info as { marker?: string }).marker ?? 'missing');
    });
    expect(registered.ok).toBe(true);
    if (!registered.ok) {
      throw new Error('expected successful listener registration');
    }
    expect(sdk.listeners.size).toBe(1);

    sdk.emit(staleEventInfo);
    await waitUntil(() => delivered.includes('current-read'), 'current-identity notification');
    expect(delivered).toEqual(['current-read']);

    const first = registered.data();
    const second = registered.data();
    expect(first).toBe(true);
    expect(second).toBe(false);
    expect(sdk.listeners.size).toBe(0);

    sdk.emit(staleEventInfo);
    await tick();
    await tick();
    expect(delivered).toEqual(['current-read']);
  });

  it('does not deliver a pending current-identity read after disposal', async () => {
    const { client, sdk } = await setupClient();
    const delivered: string[] = [];
    const registered = await client.addCustomerInfoUpdateListener((info) => {
      delivered.push((info as { marker?: string }).marker ?? 'missing');
    });
    expect(registered.ok).toBe(true);
    if (!registered.ok) {
      throw new Error('expected successful listener registration');
    }

    const held = sdk.holdCustomerInfo();
    sdk.emit(staleEventInfo);
    await waitUntil(
      () => sdk.purchasesMock.getCustomerInfo.mock.calls.length > 0,
      'pending current-identity read',
    );
    expect(delivered).toEqual([]);

    registered.data();
    expect(sdk.listeners.size).toBe(0);
    held.resolve(activeCustomerInfo);
    await tick();
    await tick();
    expect(delivered).toEqual([]);
  });

  it('keeps a successful listener across a later reset until the disposer runs', async () => {
    const { client, sdk, state } = await setupClient();
    const delivered: string[] = [];
    const registered = await client.addCustomerInfoUpdateListener((info) => {
      delivered.push((info as { marker?: string }).marker ?? 'missing');
    });
    expect(registered.ok).toBe(true);
    if (!registered.ok) {
      throw new Error('expected successful listener registration');
    }
    expect(sdk.listeners.size).toBe(1);

    state.resetFence = true;
    client.invalidateRevenueCatIdentityReadiness();
    expect(sdk.listeners.size).toBe(1);

    state.deviceId = NEW_DEVICE;
    await client.establishRevenueCatIdentityForCurrentDevice();
    state.resetFence = false;

    sdk.emit(staleEventInfo);
    await waitUntil(() => delivered.includes('current-read'), 'post-reset current-identity read');
    expect(delivered).toEqual(['current-read']);

    registered.data();
    expect(sdk.listeners.size).toBe(0);
  });
});
