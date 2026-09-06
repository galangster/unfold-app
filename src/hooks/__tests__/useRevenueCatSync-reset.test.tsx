
const OLD_DEVICE = '11111111-1111-4111-8111-111111111111';
const NEW_DEVICE = '22222222-2222-4222-8222-222222222222';
const NEW_APP_USER = `anon_${NEW_DEVICE}`;
const ANON_SDK_USER = '$RCAnonymousID:synthetic-initial';

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
  for (let i = 0; i < 200; i += 1) {
    if (predicate()) return;
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    await tick();
  }
  throw new Error(`timed out waiting for ${label}`);
}

function makePurchasesMock() {
  let sdkUser = ANON_SDK_USER;
  const logins: string[] = [];
  const loginWaits: {
    id: string;
    resolve: (value: { created: boolean; customerInfo: typeof emptyCustomerInfo }) => void;
  }[] = [];
  let holdLogin = false;
  let customerInfoWait: ReturnType<typeof deferred<typeof emptyCustomerInfo>> | null = null;
  let customerInfoListener: ((info: typeof emptyCustomerInfo) => void) | null = null;

  const purchasesMock = {
    LOG_LEVEL: { INFO: 'INFO', WARN: 'WARN', ERROR: 'ERROR' },
    configure: jest.fn(),
    setLogHandler: jest.fn(),
    setLogLevel: jest.fn(async () => undefined),
    getAppUserID: jest.fn(async () => sdkUser),
    logIn: jest.fn(async (id: string) => {
      logins.push(id);
      if (holdLogin) {
        return new Promise<{ created: boolean; customerInfo: typeof emptyCustomerInfo }>((resolve) => {
          loginWaits.push({
            id,
            resolve: (value) => {
              sdkUser = id;
              resolve(value);
            },
          });
        });
      }
      sdkUser = id;
      return { created: false, customerInfo: emptyCustomerInfo };
    }),
    logOut: jest.fn(async () => {
      sdkUser = '$RCAnonymousID:synthetic-new';
      return emptyCustomerInfo;
    }),
    getCustomerInfo: jest.fn(async () => {
      if (customerInfoWait) return customerInfoWait.promise;
      return sdkUser.startsWith('$RCAnonymousID:') ? emptyCustomerInfo : activeCustomerInfo;
    }),
    purchasePackage: jest.fn(),
    restorePurchases: jest.fn(),
    invalidateCustomerInfoCache: jest.fn(async () => undefined),
    getOfferings: jest.fn(async () => ({ current: null })),
    addCustomerInfoUpdateListener: jest.fn((listener: (info: typeof emptyCustomerInfo) => void) => {
      customerInfoListener = listener;
    }),
    removeCustomerInfoUpdateListener: jest.fn(),
    checkTrialOrIntroductoryPriceEligibility: jest.fn(),
  };

  return {
    purchasesMock,
    logins,
    loginWaits,
    get sdkUser() {
      return sdkUser;
    },
    get customerInfoListener() {
      return customerInfoListener;
    },
    setHoldLogin(value: boolean) {
      holdLogin = value;
    },
    holdCustomerInfo() {
      customerInfoWait = deferred();
      return customerInfoWait;
    },
    releaseCustomerInfo(value: typeof emptyCustomerInfo) {
      customerInfoWait?.resolve(value);
      customerInfoWait = null;
    },
  };
}

async function setupMountedHook() {
  jest.resetModules();
  process.env.EXPO_PUBLIC_REVENUECAT_TEST_KEY = 'appl_test_key';

  const state = { deviceId: OLD_DEVICE };
  const sdk = makePurchasesMock();
  const updateUser = jest.fn();
  let storeWiped = false;
  const bugLog = deferred<void>();
  const clearBugLogEntries = jest.fn(() => bugLog.promise);
  const appStateListener = jest.fn();

  const storeState = {
    user: null,
    updateUser,
    reset: () => {
      storeWiped = true;
    },
  };

  jest.doMock('react-native', () => ({
    Platform: { OS: 'ios' },
    AppState: {
      addEventListener: jest.fn((event: string, listener: (next: string) => void) => {
        appStateListener.mockImplementation(listener);
        return { remove: jest.fn() };
      }),
    },
  }));
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
  jest.doMock('react-native-purchases', () => ({ __esModule: true, default: sdk.purchasesMock }));
  jest.doMock('@/lib/store', () => ({
    useUnfoldStore: Object.assign(
      (selector: (current: typeof storeState) => unknown) => selector(storeState),
      { getState: () => storeState },
    ),
  }));
  jest.doMock('@/lib/companion-chat-store', () => ({
    useCompanionChatStore: { getState: () => ({ clearAllConversations() {} }) },
  }));
  jest.doMock('@/lib/notifications', () => ({
    cancelAllScheduledNotifications: jest.fn(async () => undefined),
  }));
  jest.doMock('@/lib/bridge-service', () => ({ clearBridgeCache: jest.fn() }));
  jest.doMock('@/lib/examen-service', () => ({ clearExamenCache: jest.fn() }));
  jest.doMock('@/lib/scripture-explain-api', () => ({ clearScriptureExplainCache: jest.fn() }));
  jest.doMock('@/lib/bible-api', () => ({ clearVerseCache: jest.fn() }));
  jest.doMock('@/lib/trial-notification', () => ({
    syncTrialEndingNotification: jest.fn(async () => undefined),
    clearTrialNotificationMirror: jest.fn(),
  }));
  jest.doMock('@/lib/bug-logger', () => ({
    clearBugLogEntries,
  }));
  jest.doMock('@/lib/review-prompt', () => ({
    clearReviewPromptState: jest.fn(async () => undefined),
  }));
  jest.doMock('@/lib/tts-service', () => ({ clearAudioCache: jest.fn(async () => undefined) }));
  jest.doMock('@/lib/widget-bridge', () => ({ clearWidgets: jest.fn() }));
  jest.doMock('@/lib/account-erase', () => ({
    SERVER_ERASE_TIMEOUT_MS: 5,
    requestServerAccountErase: jest.fn(async () => ({ ok: true })),
  }));
  jest.doMock('expo-file-system/legacy', () => ({
    documentDirectory: null,
    cacheDirectory: null,
    deleteAsync: jest.fn(async () => undefined),
    readDirectoryAsync: jest.fn(async () => []),
  }));
  jest.doMock('@/lib/full-sync-pull', () => ({ LAST_PULLED_AT_KEY: 'unfold-last-pulled-at' }));
  jest.doMock('@/lib/sync-outbox', () => ({ OUTBOX_KEY: 'unfold-sync-outbox-v1' }));
  jest.doMock('@/lib/devotional-pull-cursor', () => ({ DEVOTIONAL_PULL_CURSOR_KEY: 'unfold-devotional-pull-cursor' }));
  jest.doMock('@/lib/generation-migration', () => ({ MIGRATION_KEY: 'generation-migration-v1-complete' }));
  jest.doMock('@/lib/onboarding-sample-job-store', () => ({ STORE_KEY: 'onboarding-sample-job-v1' }));
  jest.doMock('@/lib/onboarding-draft-store', () => ({ STORE_KEY: 'onboarding-draft-v1' }));
  jest.doMock('@/lib/onboarding-telemetry', () => ({ ABANDONED_MARKER_KEY: 'onboarding-abandon' }));
  jest.doMock('@/lib/generation-api', () => ({ DYNAMIC_EXAMPLE_KEY: 'active-dynamic-example' }));
  jest.doMock('@/lib/rate-limit', () => ({ RATE_LIMIT_STORAGE_KEY: '@unfold_rate_limits' }));
  jest.doMock('@tanstack/react-query', () => ({
    useQueryClient: () => ({
      prefetchQuery: jest.fn(async () => undefined),
      getQueryData: jest.fn(() => undefined),
    }),
  }));

  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const client = require('../../lib/revenuecatClient') as typeof import('../../lib/revenuecatClient');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const fence = require('../../lib/sync-session-fence') as typeof import('../../lib/sync-session-fence');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const reset = require('../../lib/full-reset') as typeof import('../../lib/full-reset');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { useUIState } = require('../../lib/ui-state') as typeof import('../../lib/ui-state');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const React = require('react') as typeof import('react');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const renderer = require('react-test-renderer');
  const { act } = renderer;
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { useRevenueCatSync } = require('../useRevenueCatSync') as typeof import('../useRevenueCatSync');

  await tick();
  await tick();

  function Harness() {
    useRevenueCatSync();
    return null;
  }

  let tree: { unmount: () => void } | null = null;
  await act(async () => {
    tree = renderer.create(React.createElement(Harness));
    await tick();
    await tick();
  });
  await waitUntil(() => useUIState.getState().revenueCatResolved, 'initial RevenueCat resolution');

  return {
    act,
    client,
    sdk,
    fence,
    reset,
    useUIState,
    updateUser,
    bugLog,
    clearBugLogEntries,
    appStateListener,
    get storeWiped() {
      return storeWiped;
    },
    unmount: async () => {
      await act(async () => {
        tree?.unmount();
      });
    },
  };
}

afterEach(() => {
  delete process.env.EXPO_PUBLIC_REVENUECAT_TEST_KEY;
  jest.dontMock('react-native');
  jest.dontMock('@/lib/logger');
  jest.dontMock('@/lib/mmkv-storage');
  jest.dontMock('@/lib/paywall-diagnostics');
  jest.dontMock('react-native-purchases');
  jest.dontMock('@/lib/store');
  jest.dontMock('@/lib/companion-chat-store');
  jest.dontMock('@/lib/notifications');
  jest.dontMock('@/lib/bridge-service');
  jest.dontMock('@/lib/examen-service');
  jest.dontMock('@/lib/scripture-explain-api');
  jest.dontMock('@/lib/bible-api');
  jest.dontMock('@/lib/trial-notification');
  jest.dontMock('@/lib/bug-logger');
  jest.dontMock('@/lib/review-prompt');
  jest.dontMock('@/lib/tts-service');
  jest.dontMock('@/lib/widget-bridge');
  jest.dontMock('@/lib/account-erase');
  jest.dontMock('expo-file-system/legacy');
  jest.dontMock('@/lib/full-sync-pull');
  jest.dontMock('@/lib/sync-outbox');
  jest.dontMock('@/lib/devotional-pull-cursor');
  jest.dontMock('@/lib/generation-migration');
  jest.dontMock('@/lib/onboarding-sample-job-store');
  jest.dontMock('@/lib/onboarding-draft-store');
  jest.dontMock('@/lib/onboarding-telemetry');
  jest.dontMock('@/lib/generation-api');
  jest.dontMock('@/lib/rate-limit');
  jest.dontMock('@tanstack/react-query');
});

describe('useRevenueCatSync after reset', () => {
  it('refreshes current identity after the reset fence clears without a foreground event', async () => {
    const ctx = await setupMountedHook();
    ctx.updateUser.mockClear();
    expect(ctx.useUIState.getState().revenueCatResolved).toBe(true);

    const pendingReset = ctx.reset.performFullLocalReset({
      serverEraseTimeoutMs: 5,
      revenueCatLogoutTimeoutMs: 20,
    });
    await waitUntil(
      () => ctx.storeWiped && ctx.fence.isLocalResetInProgress(),
      'reset held after store wipe',
    );
    expect(ctx.useUIState.getState().revenueCatResolved).toBe(false);

    ctx.sdk.customerInfoListener?.(staleEventInfo);
    await ctx.act(async () => {
      await tick();
      await tick();
    });
    expect(ctx.useUIState.getState().revenueCatResolved).toBe(false);
    expect(ctx.updateUser).not.toHaveBeenCalled();

    ctx.bugLog.resolve();
    await pendingReset;
    expect(ctx.fence.isLocalResetInProgress()).toBe(false);
    expect(ctx.sdk.logins.at(-1)).toBe(NEW_APP_USER);

    await waitUntil(
      () => ctx.useUIState.getState().revenueCatResolved,
      'RevenueCat resolution after reset fence',
    );
    expect(ctx.appStateListener).not.toHaveBeenCalled();
    expect(ctx.updateUser).toHaveBeenCalledWith({ isPremium: true });

    await ctx.unmount();
  });

  it('resolves current entitlements when a late login verifies after the reset fence is released', async () => {
    const ctx = await setupMountedHook();
    ctx.updateUser.mockClear();
    ctx.sdk.setHoldLogin(true);

    const pendingReset = ctx.reset.performFullLocalReset({
      serverEraseTimeoutMs: 5,
      revenueCatLogoutTimeoutMs: 20,
    });
    ctx.bugLog.resolve();
    await waitUntil(
      () => ctx.sdk.loginWaits.some((wait) => wait.id === NEW_APP_USER),
      'held post-rotation login',
    );
    await pendingReset;
    expect(ctx.fence.isLocalResetInProgress()).toBe(false);
    expect(ctx.client.isRevenueCatIdentityVerified()).toBe(false);
    expect(ctx.useUIState.getState().revenueCatResolved).toBe(false);

    ctx.sdk.customerInfoListener?.(staleEventInfo);
    await ctx.act(async () => {
      await tick();
      await tick();
    });
    expect(ctx.useUIState.getState().revenueCatResolved).toBe(false);
    expect(ctx.updateUser).not.toHaveBeenCalled();

    const newLogin = ctx.sdk.loginWaits.find((wait) => wait.id === NEW_APP_USER);
    newLogin?.resolve({ created: false, customerInfo: emptyCustomerInfo });
    await waitUntil(
      () => ctx.useUIState.getState().revenueCatResolved,
      'RevenueCat resolution after late verified login',
    );
    expect(ctx.appStateListener).not.toHaveBeenCalled();
    expect(ctx.updateUser).toHaveBeenCalledWith({ isPremium: true });
    expect(ctx.client.isRevenueCatIdentityVerified()).toBe(true);

    await ctx.unmount();
  }, 15_000);

  it('does not apply an old customer-info read after a subsequent reset begins', async () => {
    const ctx = await setupMountedHook();
    ctx.updateUser.mockClear();
    ctx.sdk.holdCustomerInfo();

    const firstReset = ctx.reset.performFullLocalReset({
      serverEraseTimeoutMs: 5,
      revenueCatLogoutTimeoutMs: 20,
    });
    ctx.bugLog.resolve();
    await firstReset;
    await ctx.act(async () => {
      await tick();
      await tick();
    });
    expect(ctx.fence.isLocalResetInProgress()).toBe(false);
    expect(ctx.useUIState.getState().revenueCatResolved).toBe(false);

    const secondBugLog = deferred<void>();
    ctx.clearBugLogEntries.mockImplementation(() => secondBugLog.promise);

    const secondReset = ctx.reset.performFullLocalReset({
      serverEraseTimeoutMs: 5,
      revenueCatLogoutTimeoutMs: 20,
    });
    await waitUntil(
      () => ctx.storeWiped && ctx.fence.isLocalResetInProgress(),
      'second reset held after store wipe',
    );
    expect(ctx.useUIState.getState().revenueCatResolved).toBe(false);

    ctx.sdk.releaseCustomerInfo(activeCustomerInfo);
    await ctx.act(async () => {
      await tick();
      await tick();
    });
    expect(ctx.useUIState.getState().revenueCatResolved).toBe(false);
    expect(ctx.updateUser).not.toHaveBeenCalled();

    secondBugLog.resolve();
    await secondReset;
    await waitUntil(
      () => ctx.useUIState.getState().revenueCatResolved,
      'RevenueCat resolution after second reset',
    );
    expect(ctx.appStateListener).not.toHaveBeenCalled();
    expect(ctx.updateUser).toHaveBeenCalledWith({ isPremium: true });

    await ctx.unmount();
  });

  it('stops waiting on unmount so a later reset completion does not apply', async () => {
    const ctx = await setupMountedHook();
    ctx.updateUser.mockClear();

    const pendingReset = ctx.reset.performFullLocalReset({
      serverEraseTimeoutMs: 5,
      revenueCatLogoutTimeoutMs: 20,
    });
    await waitUntil(
      () => ctx.storeWiped && ctx.fence.isLocalResetInProgress(),
      'reset held after store wipe',
    );
    expect(ctx.useUIState.getState().revenueCatResolved).toBe(false);

    await ctx.unmount();
    ctx.bugLog.resolve();
    await pendingReset;
    await ctx.act(async () => {
      await tick();
      await tick();
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    });
    expect(ctx.useUIState.getState().revenueCatResolved).toBe(false);
    expect(ctx.updateUser).not.toHaveBeenCalled();
    expect(ctx.appStateListener).not.toHaveBeenCalled();
  });

  it('stops waiting on unmount while a late login is still unverified', async () => {
    const ctx = await setupMountedHook();
    ctx.updateUser.mockClear();
    ctx.sdk.setHoldLogin(true);

    const pendingReset = ctx.reset.performFullLocalReset({
      serverEraseTimeoutMs: 5,
      revenueCatLogoutTimeoutMs: 20,
    });
    ctx.bugLog.resolve();
    await waitUntil(
      () => ctx.sdk.loginWaits.some((wait) => wait.id === NEW_APP_USER),
      'held post-rotation login',
    );
    await pendingReset;
    expect(ctx.useUIState.getState().revenueCatResolved).toBe(false);

    await ctx.unmount();
    const newLogin = ctx.sdk.loginWaits.find((wait) => wait.id === NEW_APP_USER);
    newLogin?.resolve({ created: false, customerInfo: emptyCustomerInfo });
    await ctx.act(async () => {
      await tick();
      await tick();
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    });
    expect(ctx.useUIState.getState().revenueCatResolved).toBe(false);
    expect(ctx.updateUser).not.toHaveBeenCalled();
    expect(ctx.appStateListener).not.toHaveBeenCalled();
  }, 15_000);
});
