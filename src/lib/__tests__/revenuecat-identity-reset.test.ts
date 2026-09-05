/**
 * MP-1: reset must fence the complete RevenueCat identity transition.
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
const THIRD_DEVICE = '33333333-3333-4333-8333-333333333333';
const OLD_APP_USER = `anon_${OLD_DEVICE}`;
const NEW_APP_USER = `anon_${NEW_DEVICE}`;
const THIRD_APP_USER = `anon_${THIRD_DEVICE}`;
const ANON_SDK_USER = '$RCAnonymousID:synthetic-initial';

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

function makePurchasesMock(initialSdkUser = ANON_SDK_USER) {
  let sdkUser = initialSdkUser;
  const logins: string[] = [];
  const purchases: string[] = [];
  const restores: string[] = [];
  const loginWaits: Array<{
    id: string;
    resolve: (value: { created: boolean; customerInfo: typeof emptyCustomerInfo }) => void;
    reject: (reason?: unknown) => void;
  }> = [];
  let loginFails = false;
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
        return new Promise<{ created: boolean; customerInfo: typeof emptyCustomerInfo }>((resolve, reject) => {
          loginWaits.push({
            id,
            resolve: (value) => {
              sdkUser = id;
              resolve(value);
            },
            reject,
          });
        });
      }
      if (loginFails) {
        throw new Error('synthetic offline');
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
    purchasePackage: jest.fn(async () => {
      purchases.push(sdkUser);
      return { customerInfo: activeCustomerInfo, productIdentifier: 'synthetic_product' };
    }),
    restorePurchases: jest.fn(async () => {
      restores.push(sdkUser);
      return activeCustomerInfo;
    }),
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
    purchases,
    restores,
    loginWaits,
    get sdkUser() {
      return sdkUser;
    },
    get customerInfoListener() {
      return customerInfoListener;
    },
    setLoginFails(value: boolean) {
      loginFails = value;
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

async function setupClient({
  loginFails = false,
  holdLogin = false,
  recovery = false,
  deviceId = OLD_DEVICE,
  cachedIdentity = false,
  withReset = false,
  holdBugLog = false,
}: {
  loginFails?: boolean;
  holdLogin?: boolean;
  recovery?: boolean;
  deviceId?: string;
  cachedIdentity?: boolean;
  withReset?: boolean;
  holdBugLog?: boolean;
} = {}) {
  jest.resetModules();
  process.env.EXPO_PUBLIC_REVENUECAT_TEST_KEY = 'appl_test_key';

  const state = { deviceId, recovery };
  const sdk = makePurchasesMock(cachedIdentity ? `anon_${deviceId}` : ANON_SDK_USER);
  sdk.setLoginFails(loginFails);
  sdk.setHoldLogin(holdLogin);

  const ui = {
    revenueCatResolved: true,
    clearRevenueCatResolved: jest.fn(() => {
      ui.revenueCatResolved = false;
    }),
    setRevenueCatResolved: jest.fn(() => {
      ui.revenueCatResolved = true;
    }),
  };
  let storeWiped = false;
  const bugLog = deferred<void>();
  if (!holdBugLog) {
    bugLog.resolve();
  }

  jest.doMock('react-native', () => ({ Platform: { OS: 'ios' } }));
  jest.doMock('@/lib/logger', () => ({ logger: { log: jest.fn(), warn: jest.fn(), error: jest.fn() } }));
  jest.doMock('@/lib/mmkv-storage', () => ({
    getDeviceId: () => state.deviceId,
    isRecoverySession: () => state.recovery,
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

  if (withReset) {
    jest.doMock('@/lib/store', () => ({
      useUnfoldStore: {
        getState: () => ({
          user: null,
          reset: () => {
            storeWiped = true;
          },
        }),
      },
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
    jest.doMock('@/lib/trial-notification', () => ({ clearTrialNotificationMirror: jest.fn() }));
    jest.doMock('@/lib/bug-logger', () => ({
      clearBugLogEntries: jest.fn(() => bugLog.promise),
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
    jest.doMock('@/lib/ui-state', () => ({
      useUIState: { getState: () => ui },
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
  }

  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const client = require('../revenuecatClient') as typeof import('../revenuecatClient');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const fence = require('../sync-session-fence') as typeof import('../sync-session-fence');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const reset = withReset
    ? require('../full-reset') as typeof import('../full-reset')
    : null;
  await tick();
  if (!holdLogin) {
    await tick();
  }

  return {
    client,
    sdk,
    state,
    fence,
    reset,
    ui,
    bugLog,
    get storeWiped() {
      return storeWiped;
    },
    rotate() {
      state.deviceId = NEW_DEVICE;
    },
    setRecovery(value: boolean) {
      state.recovery = value;
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
  jest.dontMock('@/lib/ui-state');
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
});

describe('MP-1 RevenueCat identity after reset', () => {
  it('logs into the new deterministic identity after a normal reset and purchases under it', async () => {
    const { client, sdk, rotate } = await setupClient();
    expect(sdk.logins).toEqual([OLD_APP_USER]);
    expect(sdk.purchasesMock.configure).toHaveBeenCalledTimes(1);

    client.invalidateRevenueCatIdentityReadiness();
    await client.logoutUser();
    rotate();
    const established = await client.establishRevenueCatIdentityForCurrentDevice();
    const purchase = await client.purchasePackage({ identifier: 'synthetic_package' } as any);
    const restore = await client.restorePurchases();

    expect(established).toBe(true);
    expect(sdk.logins).toEqual([OLD_APP_USER, NEW_APP_USER]);
    expect(sdk.sdkUser).toBe(NEW_APP_USER);
    expect(purchase).toMatchObject({ ok: true });
    expect(restore).toMatchObject({ ok: true });
    expect(sdk.purchases).toEqual([NEW_APP_USER]);
    expect(sdk.restores).toEqual([NEW_APP_USER]);
    expect(sdk.purchasesMock.configure).toHaveBeenCalledTimes(1);
  });

  it('keeps a hung logout in the native sequence and does not grant a later identity', async () => {
    const { client, sdk, rotate } = await setupClient();
    sdk.purchasesMock.logOut.mockImplementationOnce(() => new Promise(() => {}));

    client.invalidateRevenueCatIdentityReadiness();
    void client.logoutUser();
    rotate();
    void client.establishRevenueCatIdentityForCurrentDevice();
    const purchase = await client.purchasePackage({ identifier: 'synthetic_package' } as any);

    expect(purchase.ok).toBe(false);
    expect(sdk.purchasesMock.purchasePackage).not.toHaveBeenCalled();
    expect(sdk.logins).toEqual([OLD_APP_USER]);
    expect(sdk.purchasesMock.configure).toHaveBeenCalledTimes(1);
  }, 15_000);

  it('still establishes the new identity when logout fails', async () => {
    const { client, sdk, rotate } = await setupClient();
    sdk.purchasesMock.logOut.mockRejectedValueOnce(new Error('synthetic logout failure'));

    client.invalidateRevenueCatIdentityReadiness();
    const logout = await client.logoutUser();
    rotate();
    const established = await client.establishRevenueCatIdentityForCurrentDevice();
    const purchase = await client.purchasePackage({ identifier: 'synthetic_package' } as any);

    expect(logout.ok).toBe(false);
    expect(established).toBe(true);
    expect(sdk.logins.at(-1)).toBe(NEW_APP_USER);
    expect(sdk.purchases).toEqual([NEW_APP_USER]);
  });

  it('keeps a delayed initial login in sequence and only grants the final target', async () => {
    const { client, sdk, rotate } = await setupClient({ holdLogin: true });
    await waitUntil(() => sdk.loginWaits.length === 1, 'initial login');

    client.invalidateRevenueCatIdentityReadiness();
    rotate();
    const establishPromise = client.establishRevenueCatIdentityForCurrentDevice();
    await tick();
    expect(sdk.loginWaits).toHaveLength(1);

    sdk.loginWaits[0].resolve({ created: false, customerInfo: activeCustomerInfo });
    await waitUntil(() => sdk.loginWaits.length === 2, 'new identity login');
    expect(sdk.loginWaits[1].id).toBe(NEW_APP_USER);

    sdk.loginWaits[1].resolve({ created: false, customerInfo: emptyCustomerInfo });
    const established = await establishPromise;

    expect(established).toBe(true);
    expect(sdk.sdkUser).toBe(NEW_APP_USER);
    expect(sdk.logins).toEqual([OLD_APP_USER, NEW_APP_USER]);
    const purchase = await client.purchasePackage({ identifier: 'synthetic_package' } as any);
    expect(purchase.ok).toBe(true);
    expect(sdk.purchases).toEqual([NEW_APP_USER]);
  });

  it('discards delayed customer info from the old identity', async () => {
    const { client, sdk, rotate } = await setupClient();
    const held = sdk.holdCustomerInfo();
    const pending = client.getCustomerInfo();
    await waitUntil(() => sdk.purchasesMock.getCustomerInfo.mock.calls.length > 0, 'old customer info');

    client.invalidateRevenueCatIdentityReadiness();
    rotate();
    const establishPromise = client.establishRevenueCatIdentityForCurrentDevice();
    sdk.releaseCustomerInfo(activeCustomerInfo);
    const stale = await pending;
    await establishPromise;

    expect(stale.ok).toBe(false);
    const fresh = await client.getCustomerInfo();
    expect(fresh.ok).toBe(true);
  });

  it('blocks purchase and restore until the new identity is ready', async () => {
    const { client, sdk, rotate } = await setupClient();

    client.invalidateRevenueCatIdentityReadiness();
    const purchasePending = client.purchasePackage({ identifier: 'synthetic_package' } as any);
    const restorePending = client.restorePurchases();
    await tick();
    expect(sdk.purchasesMock.purchasePackage).not.toHaveBeenCalled();
    expect(sdk.purchasesMock.restorePurchases).not.toHaveBeenCalled();

    rotate();
    await client.establishRevenueCatIdentityForCurrentDevice();
    const [purchase, restore] = await Promise.all([purchasePending, restorePending]);

    expect(purchase.ok).toBe(true);
    expect(restore.ok).toBe(true);
    expect(sdk.purchases).toEqual([NEW_APP_USER]);
    expect(sdk.restores).toEqual([NEW_APP_USER]);
  });

  it('recovers the new identity after a failed startup login, not the old target', async () => {
    const { client, sdk, rotate } = await setupClient({ loginFails: true });
    const failedRead = await client.getCustomerInfo();
    const blockedLogout = await client.logoutUser();

    client.invalidateRevenueCatIdentityReadiness();
    rotate();
    sdk.setLoginFails(false);
    const recovered = await client.retryRevenueCatIdentitySync();
    const purchase = await client.purchasePackage({ identifier: 'synthetic_package' } as any);

    expect(failedRead.ok).toBe(false);
    expect(blockedLogout.ok).toBe(true);
    expect(recovered).toBe(true);
    expect(sdk.sdkUser).toBe(NEW_APP_USER);
    expect(sdk.logins.includes(OLD_APP_USER)).toBe(true);
    expect(sdk.logins.at(-1)).toBe(NEW_APP_USER);
    expect(sdk.purchases).toEqual([NEW_APP_USER]);
  });

  it('keeps recovery and ephemeral identities fail-closed and does not call logIn', async () => {
    const { client, sdk, setRecovery } = await setupClient();
    const loginsAfterStart = sdk.logins.length;
    setRecovery(true);

    client.invalidateRevenueCatIdentityReadiness();
    const established = await client.establishRevenueCatIdentityForCurrentDevice();
    const purchase = await client.purchasePackage({ identifier: 'synthetic_package' } as any);

    expect(established).toBe(false);
    expect(purchase.ok).toBe(false);
    expect(sdk.logins).toHaveLength(loginsAfterStart);
    expect(sdk.purchasesMock.configure).toHaveBeenCalledTimes(1);
  });

  it('does not treat a matching cached identity as success after the device id rotates', async () => {
    const { client, sdk, rotate } = await setupClient();
    expect(sdk.sdkUser).toBe(OLD_APP_USER);

    client.invalidateRevenueCatIdentityReadiness();
    rotate();
    const retried = await client.retryRevenueCatIdentitySync();

    expect(retried).toBe(true);
    expect(sdk.logins.at(-1)).toBe(NEW_APP_USER);
    expect(sdk.sdkUser).toBe(NEW_APP_USER);
  });

  it('settles a displaced waiter as non-ok across two invalidations', async () => {
    const { client, sdk, state } = await setupClient();
    client.invalidateRevenueCatIdentityReadiness();
    let oldWaiter: 'pending' | 'ok' | 'non-ok' = 'pending';
    void client.getCustomerInfo().then((result) => {
      oldWaiter = result.ok ? 'ok' : 'non-ok';
    });
    await tick();

    client.invalidateRevenueCatIdentityReadiness();
    state.deviceId = THIRD_DEVICE;
    await client.establishRevenueCatIdentityForCurrentDevice();
    await tick();

    expect(oldWaiter).toBe('non-ok');
    expect(sdk.logins.at(-1)).toBe(THIRD_APP_USER);
    const fresh = await client.getCustomerInfo();
    expect(fresh.ok).toBe(true);
  });

  it('reads a matching cached deterministic id offline without login', async () => {
    const { client, sdk } = await setupClient({ cachedIdentity: true });
    const customer = await client.getCustomerInfo();

    expect(customer.ok).toBe(true);
    expect(sdk.logins).toEqual([]);
    expect(sdk.purchasesMock.logIn).not.toHaveBeenCalled();
  });

  it('treats listener events as current-identity reads and ignores their payloads', async () => {
    const { client, sdk } = await setupClient();
    const delivered: string[] = [];
    const registered = await client.addCustomerInfoUpdateListener((info) => {
      delivered.push((info as { marker?: string }).marker ?? 'missing');
    });
    expect(registered.ok).toBe(true);
    const nativeListener = sdk.purchasesMock.addCustomerInfoUpdateListener.mock.calls[0]?.[0] as
      | ((info: typeof staleEventInfo) => void)
      | undefined;
    expect(nativeListener).toEqual(expect.any(Function));

    nativeListener?.(staleEventInfo);
    await waitUntil(() => delivered.includes('current-read'), 'same-identity listener read');

    expect(delivered).toEqual(['current-read']);
    expect(delivered).not.toContain('stale-event');
    expect(sdk.purchasesMock.getCustomerInfo).toHaveBeenCalled();
  });

  it('blocks stale listener delivery until the new identity is verified', async () => {
    const { client, sdk, rotate } = await setupClient();
    const delivered: string[] = [];
    const registered = await client.addCustomerInfoUpdateListener((info) => {
      delivered.push((info as { marker?: string }).marker ?? 'missing');
    });
    expect(registered.ok).toBe(true);
    const nativeListener = sdk.purchasesMock.addCustomerInfoUpdateListener.mock.calls[0]?.[0] as
      | ((info: typeof staleEventInfo) => void)
      | undefined;
    expect(nativeListener).toEqual(expect.any(Function));

    nativeListener?.(staleEventInfo);
    await waitUntil(() => delivered.includes('current-read'), 'initial current-identity read');
    delivered.length = 0;

    sdk.setHoldLogin(true);
    client.invalidateRevenueCatIdentityReadiness();
    rotate();
    const establishPromise = client.establishRevenueCatIdentityForCurrentDevice();
    await waitUntil(() => sdk.loginWaits.some((wait) => wait.id === NEW_APP_USER), 'held new login');

    nativeListener?.(staleEventInfo);
    await tick();
    await tick();
    expect(delivered).toEqual([]);

    const newLogin = sdk.loginWaits.find((wait) => wait.id === NEW_APP_USER);
    newLogin?.resolve({ created: false, customerInfo: emptyCustomerInfo });
    expect(await establishPromise).toBe(true);
    const ready = await client.getCustomerInfo();
    expect(ready.ok).toBe(true);
    nativeListener?.(staleEventInfo);
    await waitUntil(() => delivered.includes('current-read'), 'current-identity listener read');
    expect(delivered).toEqual(['current-read']);
    expect(delivered).not.toContain('stale-event');
  });

  it('times out hung login readiness and only becomes ready after the final native target settles', async () => {
    const { client, sdk, rotate } = await setupClient({ holdLogin: true });
    await waitUntil(() => sdk.loginWaits.length === 1, 'initial login');

    client.invalidateRevenueCatIdentityReadiness();
    void client.logoutUser();
    rotate();
    const establishPromise = client.establishRevenueCatIdentityForCurrentDevice();
    await tick();
    expect(sdk.loginWaits).toHaveLength(1);

    const timedOut = await client.purchasePackage({ identifier: 'synthetic_package' } as any);
    expect(timedOut).toMatchObject({ ok: false, reason: 'timeout' });
    expect(sdk.purchasesMock.purchasePackage).not.toHaveBeenCalled();

    sdk.loginWaits[0].resolve({ created: false, customerInfo: activeCustomerInfo });
    await waitUntil(() => sdk.loginWaits.length === 2, 'reset login after earlier mutations');
    expect(sdk.loginWaits[1].id).toBe(NEW_APP_USER);
    sdk.loginWaits[1].resolve({ created: false, customerInfo: emptyCustomerInfo });

    expect(await establishPromise).toBe(true);
    expect(sdk.sdkUser).toBe(NEW_APP_USER);
    const purchase = await client.purchasePackage({ identifier: 'synthetic_package' } as any);
    expect(purchase.ok).toBe(true);
    expect(sdk.purchases).toEqual([NEW_APP_USER]);
  }, 15_000);

  it('notifies identity-verified observers after establish, not on invalidation', async () => {
    const { client, rotate } = await setupClient();
    const verified: number[] = [];
    const unsubscribe = client.subscribeRevenueCatIdentityVerified((epoch) => {
      verified.push(epoch);
    });

    client.invalidateRevenueCatIdentityReadiness();
    expect(client.isRevenueCatIdentityVerified()).toBe(false);
    expect(verified).toEqual([]);

    rotate();
    const established = await client.establishRevenueCatIdentityForCurrentDevice();
    expect(established).toBe(true);
    expect(client.isRevenueCatIdentityVerified()).toBe(true);
    expect(verified).toHaveLength(1);

    unsubscribe();
  });

  it('asserts the current SDK app user id on an ordinary customer-info read', async () => {
    const { client, sdk } = await setupClient();
    sdk.purchasesMock.getAppUserID.mockClear();

    const result = await client.getCustomerInfo();

    expect(result.ok).toBe(true);
    expect(sdk.purchasesMock.getAppUserID).toHaveBeenCalled();
  });

  it('grants a same-identity entitlement wait from a guarded read, not the event payload', async () => {
    const { client, sdk } = await setupClient();

    const pending = client.waitForUnfoldPremiumEntitlement(10_000);
    const waitListener = sdk.purchasesMock.addCustomerInfoUpdateListener.mock.calls.at(-1)?.[0] as
      | ((info: typeof staleEventInfo) => void)
      | undefined;
    expect(waitListener).toEqual(expect.any(Function));
    waitListener?.(staleEventInfo);

    await expect(pending).resolves.toMatchObject({ marker: 'current-read' });
    expect(sdk.purchasesMock.getCustomerInfo).toHaveBeenCalled();
    expect(sdk.purchasesMock.getAppUserID).toHaveBeenCalled();
  });
});

describe('MP-1 client/reset boundaries', () => {
  it('invalidates identity and blocks an in-flight customer read before the first reset await', async () => {
    const { client, sdk, reset, fence, ui } = await setupClient({ withReset: true });
    expect(reset).not.toBeNull();
    const held = sdk.holdCustomerInfo();
    let readResult: 'pending' | 'ok' | 'non-ok' = 'pending';
    void client.getCustomerInfo().then((result) => {
      readResult = result.ok ? 'ok' : 'non-ok';
      if (result.ok) ui.setRevenueCatResolved();
    });
    await waitUntil(() => sdk.purchasesMock.getCustomerInfo.mock.calls.length > 0, 'held customer info');

    const pendingReset = reset!.performFullLocalReset({
      serverEraseTimeoutMs: 5,
      revenueCatLogoutTimeoutMs: 20,
    });
    expect(fence.isLocalResetInProgress()).toBe(true);
    expect(ui.revenueCatResolved).toBe(false);
    expect(ui.clearRevenueCatResolved).toHaveBeenCalled();

    held.resolve(activeCustomerInfo);
    await tick();
    expect(readResult).toBe('non-ok');
    expect(ui.revenueCatResolved).toBe(false);

    await pendingReset;
    expect(fence.isLocalResetInProgress()).toBe(false);
    expect(sdk.logins.at(-1)).toBe(NEW_APP_USER);
  });

  it('blocks a foreground retry and purchase before device rotation while the reset fence is active', async () => {
    const ctx = await setupClient({
      withReset: true,
      holdBugLog: true,
    });
    const { client, sdk, reset, fence, state, bugLog } = ctx;
    const loginCountBeforeReset = sdk.logins.length;
    const pendingReset = reset!.performFullLocalReset({
      serverEraseTimeoutMs: 5,
      revenueCatLogoutTimeoutMs: 20,
    });
    await waitUntil(() => ctx.storeWiped && fence.isLocalResetInProgress(), 'reset held after store wipe');
    expect(state.deviceId).toBe(OLD_DEVICE);

    const retried = await client.retryRevenueCatIdentitySync();
    const purchased = await client.purchasePackage({ identifier: 'synthetic_package' } as any);

    expect(retried).toBe(false);
    expect(purchased.ok).toBe(false);
    expect(sdk.logins).toHaveLength(loginCountBeforeReset);
    expect(sdk.purchasesMock.purchasePackage).not.toHaveBeenCalled();

    bugLog.resolve();
    await pendingReset;
    expect(state.deviceId).toBe(NEW_DEVICE);
    expect(sdk.logins.at(-1)).toBe(NEW_APP_USER);
    const afterReset = await client.purchasePackage({ identifier: 'synthetic_package' } as any);
    expect(afterReset.ok).toBe(true);
    expect(sdk.purchases).toEqual([NEW_APP_USER]);
  });

  it('releases reset after a hung new login and keeps later store actions bounded until that login settles', async () => {
    const { client, sdk, reset, fence } = await setupClient({ withReset: true });
    sdk.setHoldLogin(true);
    const pendingReset = reset!.performFullLocalReset({
      serverEraseTimeoutMs: 5,
      revenueCatLogoutTimeoutMs: 20,
    });
    await waitUntil(
      () => sdk.loginWaits.some((wait) => wait.id === NEW_APP_USER),
      'held post-rotation login',
    );
    await pendingReset;
    expect(fence.isLocalResetInProgress()).toBe(false);

    const timedOut = await client.purchasePackage({ identifier: 'synthetic_package' } as any);
    expect(timedOut).toMatchObject({ ok: false, reason: 'timeout' });
    expect(sdk.purchasesMock.purchasePackage).not.toHaveBeenCalled();

    const newLogin = sdk.loginWaits.find((wait) => wait.id === NEW_APP_USER);
    newLogin?.resolve({ created: false, customerInfo: emptyCustomerInfo });
    await tick();
    await tick();

    const purchase = await client.purchasePackage({ identifier: 'synthetic_package' } as any);
    expect(purchase.ok).toBe(true);
    expect(sdk.purchases).toEqual([NEW_APP_USER]);
    expect(sdk.sdkUser).toBe(NEW_APP_USER);
  }, 15_000);

  it('settles an entitlement wait started before reset as null when identity changes', async () => {
    const { client, reset } = await setupClient({ withReset: true });
    expect(reset).not.toBeNull();

    const pending = client.waitForUnfoldPremiumEntitlement(10_000);
    await reset!.performFullLocalReset({
      serverEraseTimeoutMs: 5,
      revenueCatLogoutTimeoutMs: 20,
    });

    await expect(pending).resolves.toBeNull();
  });

  it('does not grant a wait started during reset from cached or listener entitlements', async () => {
    const ctx = await setupClient({ withReset: true, holdBugLog: true });
    const pendingReset = ctx.reset!.performFullLocalReset({
      serverEraseTimeoutMs: 5,
      revenueCatLogoutTimeoutMs: 20,
    });
    await waitUntil(() => ctx.storeWiped && ctx.fence.isLocalResetInProgress(), 'reset held after store wipe');

    const controller = new AbortController();
    const pending = ctx.client.waitForUnfoldPremiumEntitlement(10_000, { signal: controller.signal });
    ctx.sdk.customerInfoListener?.(activeCustomerInfo);
    let settled: 'pending' | 'granted' | 'null' = 'pending';
    void pending.then((value) => {
      settled = value ? 'granted' : 'null';
    });
    await tick();
    await tick();
    expect(settled).toBe('pending');
    expect(ctx.sdk.purchasesMock.invalidateCustomerInfoCache).not.toHaveBeenCalled();

    controller.abort();
    await expect(pending).resolves.toBeNull();

    ctx.bugLog.resolve();
    await pendingReset;
  });
});
