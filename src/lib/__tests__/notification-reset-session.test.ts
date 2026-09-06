/**
 * NT-1: daily and trial scheduling must keep the originating reset session
 * across permission, customer-info, native schedule, and settings follow-up.
 * Daily same-session ownership also keeps a newer operation from being
 * overwritten by older native, cancel, refresh, or settings work.
 * These cases load the actual service/caller modules with a synthetic native
 * adapter and intercepted fetch.
 */
/* eslint-disable import/first */

jest.mock('expo-file-system/legacy', () => ({
  documentDirectory: 'file:///documents/',
  cacheDirectory: 'file:///cache/',
  deleteAsync: jest.fn(async () => undefined),
  readDirectoryAsync: jest.fn(async () => []),
}));

jest.mock('../mmkv-storage', () => {
  const store = new Map<string, string>();
  let deviceId = 'synthetic-old';
  return {
    mmkvStorage: {
      getItem: jest.fn((key: string) => store.get(key) ?? null),
      setItem: jest.fn((key: string, value: string) => store.set(key, value)),
      removeItem: jest.fn((key: string) => store.delete(key)),
    },
    getMmkvKeys: jest.fn(() => Array.from(store.keys())),
    getDeviceId: jest.fn(() => deviceId),
    rotateDeviceId: jest.fn(() => {
      deviceId = 'synthetic-new';
      return deviceId;
    }),
    getSharedEncryptionKey: jest.fn(() => undefined),
    purgeRealStoreForRecoveryReset: jest.fn(),
    __clearMockStorage: () => store.clear(),
    __resetDeviceId: () => {
      deviceId = 'synthetic-old';
    },
  };
});

jest.mock('../companion-chat-store', () => ({
  useCompanionChatStore: {
    getState: jest.fn(() => ({
      clearAllConversations: jest.fn(),
    })),
  },
}));

jest.mock('../bridge-service', () => ({ clearBridgeCache: jest.fn() }));
jest.mock('../examen-service', () => ({ clearExamenCache: jest.fn() }));
jest.mock('../scripture-explain-api', () => ({ clearScriptureExplainCache: jest.fn() }));
jest.mock('../bible-api', () => ({ clearVerseCache: jest.fn() }));
jest.mock('../bug-logger', () => ({
  logBugError: jest.fn(),
  logBugEvent: jest.fn(() => Promise.resolve()),
  clearBugLogEntries: jest.fn(() => Promise.resolve()),
}));
jest.mock('../review-prompt', () => ({ clearReviewPromptState: jest.fn(() => Promise.resolve()) }));
jest.mock('../paywall-diagnostics', () => ({ clearPaywallDiagnosticsFile: jest.fn(() => Promise.resolve()) }));
jest.mock('../tts-service', () => ({ clearAudioCache: jest.fn(() => Promise.resolve()) }));
jest.mock('../widget-bridge', () => ({ clearWidgets: jest.fn() }));

jest.mock('../full-sync-pull', () => ({
  LAST_PULLED_AT_KEY: 'unfold-last-pulled-at',
}));

jest.mock('../logger', () => ({
  logger: { log: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

jest.mock('../premium-state', () => ({
  getEffectivePremiumAccessPolicy: () => 'granted',
}));

jest.mock('../daily-reminder-content', () => ({
  getDailyReminderContent: () => ({ title: 'Synthetic reminder', body: 'Synthetic body' }),
}));

jest.mock('../ui-state', () => {
  const clearRevenueCatResolved = jest.fn();
  return {
    useUIState: {
      getState: jest.fn(() => ({ clearRevenueCatResolved })),
    },
  };
});

type NativeRequest = {
  identifier: string;
  content?: { title?: string };
  trigger?: { type?: string; hour?: number; minute?: number; date?: Date };
};

type NativeAdapter = {
  schedules: Map<string, NativeRequest>;
  permissionMode: 'granted' | 'denied' | 'deferred';
  resolvePermission?: (value: { status: string }) => void;
  scheduleImpl: ((request: NativeRequest) => Promise<string>) | null;
  listImpl: (() => Promise<NativeRequest[]>) | null;
  cancelImpl: ((identifier: string) => Promise<void>) | null;
  defaultSchedule: (request: NativeRequest) => string;
  defaultList: () => NativeRequest[];
  defaultCancel: (identifier: string) => void;
};

function nativeAdapter(): NativeAdapter {
  return (globalThis as typeof globalThis & { __nt1Native: NativeAdapter }).__nt1Native;
}

jest.mock('expo-notifications', () => {
  const schedules = new Map<string, NativeRequest>();
  const adapter: NativeAdapter = {
    schedules,
    permissionMode: 'granted',
    scheduleImpl: null,
    listImpl: null,
    cancelImpl: null,
    defaultSchedule(request) {
      const identifier = request.identifier || 'synthetic-generated';
      const stored = { ...request, identifier };
      schedules.set(identifier, stored);
      return identifier;
    },
    defaultList() {
      return [...schedules.values()];
    },
    defaultCancel(identifier) {
      schedules.delete(identifier);
    },
  };
  (globalThis as typeof globalThis & { __nt1Native: NativeAdapter }).__nt1Native = adapter;
  return {
    setNotificationHandler: jest.fn(),
    getPermissionsAsync: jest.fn(async () => {
      if (adapter.permissionMode === 'deferred') {
        return new Promise<{ status: string }>((resolve) => {
          adapter.resolvePermission = resolve;
        });
      }
      return { status: adapter.permissionMode };
    }),
    requestPermissionsAsync: jest.fn(async () => ({ status: 'denied' })),
    scheduleNotificationAsync: jest.fn(async (request: NativeRequest) => {
      if (adapter.scheduleImpl) {
        return adapter.scheduleImpl(request);
      }
      return adapter.defaultSchedule(request);
    }),
    cancelScheduledNotificationAsync: jest.fn(async (identifier: string) => {
      if (adapter.cancelImpl) {
        return adapter.cancelImpl(identifier);
      }
      adapter.defaultCancel(identifier);
    }),
    cancelAllScheduledNotificationsAsync: jest.fn(async () => {
      schedules.clear();
    }),
    getAllScheduledNotificationsAsync: jest.fn(async () => {
      if (adapter.listImpl) {
        return adapter.listImpl();
      }
      return adapter.defaultList();
    }),
    SchedulableTriggerInputTypes: {
      DAILY: 'daily',
      WEEKLY: 'weekly',
      DATE: 'date',
      TIME_INTERVAL: 'timeInterval',
    },
  };
});

jest.mock('react-native-mmkv', () => {
  const mirrors = new Map<string, Map<string, string>>();
  (globalThis as typeof globalThis & { __nt1Mirrors: typeof mirrors }).__nt1Mirrors = mirrors;
  return {
    MMKV: class {
      values: Map<string, string>;
      constructor({ id }: { id: string }) {
        if (!mirrors.has(id)) {
          mirrors.set(id, new Map());
        }
        this.values = mirrors.get(id)!;
      }
      getString(key: string) {
        return this.values.get(key);
      }
      set(key: string, value: string) {
        this.values.set(key, value);
      }
      delete(key: string) {
        this.values.delete(key);
      }
      clearAll() {
        this.values.clear();
      }
    },
  };
});

type StoreUser = {
  reminderTime: string;
  dailyReminderEnabled: boolean;
  isPremium: boolean;
  hasCompletedOnboarding: boolean;
  profilePicture?: string | null;
};

type StoreHarness = {
  user: StoreUser | null;
  devotionals: unknown[];
  currentDevotionalId: string | null;
};

function storeHarness(): StoreHarness {
  return (globalThis as typeof globalThis & { __nt1Store: StoreHarness }).__nt1Store;
}

jest.mock('../store', () => {
  const harness: StoreHarness = {
    user: null,
    devotionals: [],
    currentDevotionalId: null,
  };
  (globalThis as typeof globalThis & { __nt1Store: StoreHarness }).__nt1Store = harness;
  return {
    useUnfoldStore: {
      getState: () => ({
        get user() {
          return harness.user;
        },
        get devotionals() {
          return harness.devotionals;
        },
        get currentDevotionalId() {
          return harness.currentDevotionalId;
        },
        reset() {
          harness.user = null;
          harness.devotionals = [];
          harness.currentDevotionalId = null;
        },
        updateUser(updates: Partial<StoreUser>) {
          if (!harness.user) return;
          harness.user = { ...harness.user, ...updates };
        },
      }),
    },
  };
});

type CustomerInfoResult =
  | { ok: true; data: ReturnType<typeof trialInfo> }
  | { ok: false; reason: string };

type RevenueCatHarness = {
  enabled: boolean;
  getCustomerInfoImpl: () => Promise<CustomerInfoResult>;
  resolveCustomerInfo?: (value: CustomerInfoResult) => void;
};

function revenueCatHarness(): RevenueCatHarness {
  return (globalThis as typeof globalThis & { __nt1Rc: RevenueCatHarness }).__nt1Rc;
}

jest.mock('../revenuecatClient', () => {
  const harness: RevenueCatHarness = {
    enabled: true,
    getCustomerInfoImpl: async () =>
      ({
        ok: true,
        data: {
          entitlements: {
            active: {
              'Unfold Premium': {
                periodType: 'TRIAL',
                expirationDate: new Date(Date.now() + 7 * 86_400_000).toISOString(),
              },
            },
          },
        },
      }) as unknown as CustomerInfoResult,
  };
  (globalThis as typeof globalThis & { __nt1Rc: RevenueCatHarness }).__nt1Rc = harness;
  return {
    logoutUser: jest.fn(async () => ({ ok: true })),
    invalidateRevenueCatIdentityReadiness: jest.fn(),
    establishRevenueCatIdentityForCurrentDevice: jest.fn(async () => true),
    isRevenueCatEnabled: jest.fn(() => harness.enabled),
    getCustomerInfo: jest.fn(() => harness.getCustomerInfoImpl()),
  };
});

import {
  beginDailyReminderOperation,
  cancelNotificationById,
  commitDailyReminderSetting,
  NOTIFICATION_IDS,
  refreshDailyReminder,
  resetDailyReminderOwnershipForTesting,
  scheduleDailyReminder,
} from '../notifications';
import {
  cancelTrialEndingNotification,
  clearTrialNotificationMirror,
  scheduleTrialEndingNotification,
  syncTrialEndingNotification,
} from '../trial-notification';
import { performFullLocalReset } from '../full-reset';
import {
  beginLocalResetSession,
  captureSyncSession,
  endLocalResetSession,
  resetSyncSessionFenceForTesting,
} from '../sync-session-fence';
import { useUnfoldStore } from '../store';
import type { CustomerInfo } from 'react-native-purchases';

const mmkvStorageMock = jest.requireMock('../mmkv-storage') as {
  __clearMockStorage: () => void;
  __resetDeviceId: () => void;
};

function trialInfo(expiration = new Date(Date.now() + 7 * 86_400_000)): CustomerInfo {
  return {
    entitlements: {
      active: {
        'Unfold Premium': {
          periodType: 'TRIAL',
          expirationDate: expiration.toISOString(),
        },
      },
    },
  } as unknown as CustomerInfo;
}

function noTrialInfo(): CustomerInfo {
  return {
    entitlements: {
      active: {
        'Unfold Premium': {
          periodType: 'NORMAL',
          expirationDate: new Date(Date.now() + 7 * 86_400_000).toISOString(),
        },
      },
    },
  } as unknown as CustomerInfo;
}

function expiredTrialInfo() {
  return trialInfo(new Date(Date.now() + 12 * 3_600_000));
}

function scheduledIds(): string[] {
  return [...nativeAdapter().schedules.keys()];
}

function scheduledHours(): number[] {
  return [...nativeAdapter().schedules.values()]
    .map((request) => request.trigger?.hour)
    .filter((hour): hour is number => typeof hour === 'number');
}

function writeSelectedReminderTime(time: string): void {
  beginDailyReminderOperation();
  useUnfoldStore.getState().updateUser({ reminderTime: time, dailyReminderEnabled: true });
}

function trialMirrorKeys(): string[] {
  const mirrors = (globalThis as typeof globalThis & {
    __nt1Mirrors: Map<string, Map<string, string>>;
  }).__nt1Mirrors;
  return [...(mirrors.get('unfold-trial-notification')?.keys() ?? [])];
}

function seedUser(overrides: Partial<StoreUser> = {}): StoreUser {
  const user: StoreUser = {
    reminderTime: '8:00 AM',
    dailyReminderEnabled: true,
    isPremium: true,
    hasCompletedOnboarding: true,
    ...overrides,
  };
  storeHarness().user = user;
  return user;
}

async function tick(): Promise<void> {
  await new Promise<void>((resolve) => setImmediate(resolve));
}

async function waitFor(predicate: () => boolean, label: string): Promise<void> {
  for (let i = 0; i < 40; i += 1) {
    if (predicate()) return;
    await tick();
  }
  throw new Error(`timed out waiting for ${label}`);
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((next, fail) => {
    resolve = next;
    reject = fail;
  });
  return { promise, resolve, reject };
}

async function resetNow(): Promise<void> {
  await performFullLocalReset({
    serverEraseTimeoutMs: 50,
    revenueCatLogoutTimeoutMs: 50,
  });
}

beforeEach(() => {
  resetSyncSessionFenceForTesting();
  resetDailyReminderOwnershipForTesting();
  nativeAdapter().schedules.clear();
  nativeAdapter().permissionMode = 'granted';
  nativeAdapter().resolvePermission = undefined;
  nativeAdapter().scheduleImpl = null;
  nativeAdapter().listImpl = null;
  nativeAdapter().cancelImpl = null;
  const mirrors = (globalThis as typeof globalThis & {
    __nt1Mirrors: Map<string, Map<string, string>>;
  }).__nt1Mirrors;
  for (const values of mirrors.values()) {
    values.clear();
  }
  storeHarness().user = null;
  storeHarness().devotionals = [];
  storeHarness().currentDevotionalId = null;
  mmkvStorageMock.__clearMockStorage();
  mmkvStorageMock.__resetDeviceId();
  revenueCatHarness().enabled = true;
  revenueCatHarness().getCustomerInfoImpl = async () => ({ ok: true, data: trialInfo() });
  revenueCatHarness().resolveCustomerInfo = undefined;
  global.fetch = jest.fn(async () => ({
    ok: true,
    status: 200,
    json: async () => ({ deleted: true, success: true }),
  })) as unknown as typeof fetch;
  seedUser();
});

describe('NT-1 daily reminder reset session', () => {
  it('does not schedule when an old permission result arrives after full reset', async () => {
    nativeAdapter().permissionMode = 'deferred';
    const pending = scheduleDailyReminder('8:00 AM');
    await waitFor(() => typeof nativeAdapter().resolvePermission === 'function', 'permission waiter');
    await resetNow();
    expect(scheduledIds()).toEqual([]);
    nativeAdapter().permissionMode = 'granted';
    nativeAdapter().resolvePermission?.({ status: 'granted' });
    await expect(pending).resolves.toBeNull();
    expect(scheduledIds()).toEqual([]);
  });

  it('discards a late native daily schedule after reset without removing a fresh request', async () => {
    const gate = deferred<void>();
    let entered = false;
    nativeAdapter().scheduleImpl = async (request) => {
      if (!entered) {
        entered = true;
        await gate.promise;
      }
      return nativeAdapter().defaultSchedule(request);
    };

    const old = scheduleDailyReminder('8:00 AM');
    await waitFor(() => entered, 'old native schedule');
    await resetNow();
    seedUser({ reminderTime: '9:00 AM', dailyReminderEnabled: true });
    const newer = await scheduleDailyReminder('9:00 AM');
    expect(newer).toBeTruthy();
    expect(scheduledIds()).toEqual([newer]);
    expect(nativeAdapter().schedules.get(newer!)?.trigger?.hour).toBe(9);

    gate.resolve();
    await expect(old).resolves.toBeNull();
    expect(scheduledIds()).toEqual([newer]);
    expect(nativeAdapter().schedules.get(newer!)?.trigger?.hour).toBe(9);
  });

  it('blocks new daily work while a reset is in progress', async () => {
    const token = beginLocalResetSession();
    await expect(scheduleDailyReminder('8:00 AM')).resolves.toBeNull();
    expect(scheduledIds()).toEqual([]);
    endLocalResetSession(token);
  });

  it('does not let a delayed daily enumeration cancel a fresh reminder after reset', async () => {
    const gate = deferred<NativeRequest[]>();
    let entered = false;
    nativeAdapter().listImpl = async () => {
      if (!entered) {
        entered = true;
        return gate.promise;
      }
      return nativeAdapter().defaultList();
    };

    const old = cancelNotificationById(NOTIFICATION_IDS.DAILY_REMINDER);
    await waitFor(() => entered, 'old daily enumeration');
    await resetNow();
    seedUser({ reminderTime: '9:00 AM', dailyReminderEnabled: true });
    const freshId = await scheduleDailyReminder('9:00 AM');
    expect(freshId).toBeTruthy();
    expect(scheduledIds()).toEqual([freshId]);

    gate.resolve(nativeAdapter().defaultList());
    await old;
    expect(scheduledIds()).toEqual([freshId]);
    expect(nativeAdapter().schedules.has(freshId!)).toBe(true);
  });

  it('does not let a rejected daily enumeration cancel or unown a fresh reminder', async () => {
    const gate = deferred<NativeRequest[]>();
    let entered = false;
    nativeAdapter().listImpl = async () => {
      if (!entered) {
        entered = true;
        return gate.promise;
      }
      return nativeAdapter().defaultList();
    };

    const old = cancelNotificationById(NOTIFICATION_IDS.DAILY_REMINDER);
    await waitFor(() => entered, 'old daily enumeration reject');
    await resetNow();
    seedUser({ reminderTime: '9:00 AM', dailyReminderEnabled: true });
    const freshId = await scheduleDailyReminder('9:00 AM');
    expect(freshId).toBeTruthy();

    gate.reject(new Error('synthetic enumeration failure'));
    await old;
    expect(scheduledIds()).toEqual([freshId]);

    await cancelNotificationById(NOTIFICATION_IDS.DAILY_REMINDER);
    expect(scheduledIds()).toEqual([]);
  });

  it('does not let an old cancellation finalizer clear a fresh daily owner', async () => {
    const first = await scheduleDailyReminder('8:00 AM');
    expect(first).toBeTruthy();

    const gate = deferred<void>();
    let extraEntered = false;
    let seenLiteral = false;
    let delayOldExtras = true;
    nativeAdapter().cancelImpl = async (identifier) => {
      if (!seenLiteral) {
        seenLiteral = true;
        nativeAdapter().defaultCancel(identifier);
        return;
      }
      if (delayOldExtras) {
        extraEntered = true;
        await gate.promise;
      }
      nativeAdapter().defaultCancel(identifier);
    };

    const old = cancelNotificationById(NOTIFICATION_IDS.DAILY_REMINDER);
    await waitFor(() => extraEntered, 'old extra daily cancel');
    delayOldExtras = false;
    await resetNow();
    seedUser({ reminderTime: '9:00 AM', dailyReminderEnabled: true });
    const freshId = await scheduleDailyReminder('9:00 AM');
    expect(freshId).toBeTruthy();
    expect(scheduledIds()).toEqual([freshId]);

    gate.resolve();
    await old;
    expect(scheduledIds()).toEqual([freshId]);

    await cancelNotificationById(NOTIFICATION_IDS.DAILY_REMINDER);
    expect(scheduledIds()).toEqual([]);
  });
});

describe('NT-1 trial reminder reset session', () => {
  it('does not reschedule or restore the mirror when old permission resolves after reset', async () => {
    nativeAdapter().permissionMode = 'deferred';
    const pending = scheduleTrialEndingNotification(trialInfo());
    await waitFor(() => typeof nativeAdapter().resolvePermission === 'function', 'trial permission');
    await resetNow();
    expect(scheduledIds()).toEqual([]);
    expect(trialMirrorKeys()).toEqual([]);
    nativeAdapter().permissionMode = 'granted';
    nativeAdapter().resolvePermission?.({ status: 'granted' });
    await expect(pending).resolves.toBeNull();
    expect(scheduledIds()).toEqual([]);
    expect(trialMirrorKeys()).toEqual([]);
  });

  it('lets a fresh trial schedule finish while old native work waits, then keeps it', async () => {
    const gate = deferred<void>();
    let entered = false;
    nativeAdapter().scheduleImpl = async (request) => {
      if (!entered) {
        entered = true;
        await gate.promise;
      }
      return nativeAdapter().defaultSchedule(request);
    };

    const old = scheduleTrialEndingNotification(trialInfo());
    await waitFor(() => entered, 'old trial native schedule');
    await resetNow();
    const newer = await scheduleTrialEndingNotification(trialInfo());
    const mirrorBefore = trialMirrorKeys();
    expect(newer).toBeTruthy();
    expect(scheduledIds()).toEqual([newer]);
    expect(mirrorBefore.length).toBe(2);

    gate.resolve();
    await expect(old).resolves.toBeNull();
    expect(scheduledIds()).toEqual([newer]);
    expect(trialMirrorKeys()).toEqual(mirrorBefore);
  });

  it('does not let an old native failure erase a fresh trial mirror', async () => {
    const gate = deferred<void>();
    let entered = false;
    nativeAdapter().scheduleImpl = async (request) => {
      if (!entered) {
        entered = true;
        await gate.promise;
        throw new Error('synthetic native failure');
      }
      return nativeAdapter().defaultSchedule(request);
    };

    const old = scheduleTrialEndingNotification(trialInfo());
    await waitFor(() => entered, 'old trial native failure');
    await resetNow();
    nativeAdapter().scheduleImpl = null;
    const newer = await scheduleTrialEndingNotification(trialInfo());
    const mirrorBefore = trialMirrorKeys();
    expect(newer).toBeTruthy();
    expect(mirrorBefore.length).toBe(2);

    gate.reject(new Error('synthetic native failure'));
    await expect(old).resolves.toBeNull();
    expect(scheduledIds()).toEqual([newer]);
    expect(trialMirrorKeys()).toEqual(mirrorBefore);
  });

  it('ignores a stale customer-info callback so it cannot cancel or schedule for the new session', async () => {
    const gate = deferred<CustomerInfoResult>();
    revenueCatHarness().getCustomerInfoImpl = () => {
      revenueCatHarness().resolveCustomerInfo = gate.resolve;
      return gate.promise;
    };
    const oldSync = syncTrialEndingNotification();
    await waitFor(
      () => typeof revenueCatHarness().resolveCustomerInfo === 'function',
      'customer-info start',
    );
    await resetNow();

    const fresh = await scheduleTrialEndingNotification(trialInfo());
    expect(fresh).toBeTruthy();
    const idsBefore = scheduledIds();
    const mirrorBefore = trialMirrorKeys();

    gate.resolve({ ok: true, data: noTrialInfo() });
    await oldSync;
    expect(scheduledIds()).toEqual(idsBefore);
    expect(trialMirrorKeys()).toEqual(mirrorBefore);

    revenueCatHarness().getCustomerInfoImpl = () =>
      new Promise((resolve) => {
        revenueCatHarness().resolveCustomerInfo = resolve;
      });
    const staleScheduleSync = syncTrialEndingNotification();
    await waitFor(
      () => typeof revenueCatHarness().resolveCustomerInfo === 'function',
      'second customer-info',
    );
    await resetNow();
    const afterReset = scheduledIds();
    revenueCatHarness().resolveCustomerInfo?.({ ok: true, data: trialInfo() });
    await staleScheduleSync;
    expect(scheduledIds()).toEqual(afterReset);
  });

  it('blocks new trial work while a reset is in progress', async () => {
    const token = beginLocalResetSession();
    await expect(scheduleTrialEndingNotification(trialInfo())).resolves.toBeNull();
    expect(scheduledIds()).toEqual([]);
    endLocalResetSession(token);
  });
});

describe('NT-1 settings follow-up', () => {
  it('does not restore erased reminder preferences after reset even when a new user exists', async () => {
    seedUser({ dailyReminderEnabled: false, reminderTime: '8:00 AM' });
    nativeAdapter().permissionMode = 'deferred';
    const persist = jest.fn((updates) => {
      useUnfoldStore.getState().updateUser(updates);
    });
    const pending = commitDailyReminderSetting(true, '8:00 AM', persist);
    await waitFor(() => typeof nativeAdapter().resolvePermission === 'function', 'settings permission');
    await resetNow();
    seedUser({ dailyReminderEnabled: false, reminderTime: '7:00 AM' });
    nativeAdapter().permissionMode = 'granted';
    nativeAdapter().resolvePermission?.({ status: 'granted' });
    await expect(pending).resolves.toBe(false);
    expect(persist).not.toHaveBeenCalled();
    expect(storeHarness().user?.dailyReminderEnabled).toBe(false);
    expect(storeHarness().user?.reminderTime).toBe('7:00 AM');
    expect(scheduledIds()).toEqual([]);
  });
});

describe('NT-1 stale wrappers', () => {
  it('does not let refreshDailyReminder recapture a fresh session after reset', async () => {
    nativeAdapter().permissionMode = 'deferred';
    const pending = refreshDailyReminder();
    await waitFor(() => typeof nativeAdapter().resolvePermission === 'function', 'refresh permission');
    await resetNow();
    seedUser({ reminderTime: '9:00 AM', dailyReminderEnabled: true });
    nativeAdapter().permissionMode = 'granted';
    nativeAdapter().resolvePermission?.({ status: 'granted' });
    await expect(pending).resolves.toBe(false);
    expect(scheduledIds()).toEqual([]);
  });
});

describe('NT-1 same-session daily ownership', () => {
  it('does not let a completed older 8:00 native schedule replace a newer 9:00 request', async () => {
    const gate = deferred<void>();
    let entered = false;
    nativeAdapter().scheduleImpl = async (request) => {
      if (!entered) {
        entered = true;
        await gate.promise;
      }
      return nativeAdapter().defaultSchedule(request);
    };

    const older = scheduleDailyReminder('8:00 AM');
    await waitFor(() => entered, 'old same-session native schedule');
    const newer = await scheduleDailyReminder('9:00 AM');
    expect(newer).toBeTruthy();
    expect(scheduledHours()).toEqual([9]);

    gate.resolve();
    await expect(older).resolves.toBeNull();
    expect(scheduledIds()).toEqual([newer]);
    expect(scheduledHours()).toEqual([9]);

    await cancelNotificationById(NOTIFICATION_IDS.DAILY_REMINDER);
    expect(scheduledIds()).toEqual([]);
    const after = await scheduleDailyReminder('9:00 AM');
    expect(after).toBeTruthy();
    expect(scheduledHours()).toEqual([9]);
  });

  it('does not let a rejected older native schedule unown a newer 9:00 request', async () => {
    const gate = deferred<void>();
    let entered = false;
    nativeAdapter().scheduleImpl = async (request) => {
      if (!entered) {
        entered = true;
        await gate.promise;
        throw new Error('synthetic native failure');
      }
      return nativeAdapter().defaultSchedule(request);
    };

    const older = scheduleDailyReminder('8:00 AM');
    await waitFor(() => entered, 'old same-session native reject');
    const newer = await scheduleDailyReminder('9:00 AM');
    expect(newer).toBeTruthy();
    expect(scheduledHours()).toEqual([9]);

    gate.reject(new Error('synthetic native failure'));
    await expect(older).resolves.toBeNull();
    expect(scheduledIds()).toEqual([newer]);
    expect(scheduledHours()).toEqual([9]);

    await cancelNotificationById(NOTIFICATION_IDS.DAILY_REMINDER);
    expect(scheduledIds()).toEqual([]);
    const after = await scheduleDailyReminder('8:00 AM');
    expect(after).toBeTruthy();
    expect(scheduledHours()).toEqual([8]);
  });

  it('does not let an old cancellation enumeration delete a newer same-session request', async () => {
    const gate = deferred<NativeRequest[]>();
    let entered = false;
    nativeAdapter().listImpl = async () => {
      if (!entered) {
        entered = true;
        return gate.promise;
      }
      return nativeAdapter().defaultList();
    };

    const old = cancelNotificationById(NOTIFICATION_IDS.DAILY_REMINDER);
    await waitFor(() => entered, 'old same-session enumeration');
    const newer = await scheduleDailyReminder('9:00 AM');
    expect(newer).toBeTruthy();

    gate.resolve(nativeAdapter().defaultList());
    await old;
    expect(scheduledIds()).toEqual([newer]);
    expect(scheduledHours()).toEqual([9]);

    await cancelNotificationById(NOTIFICATION_IDS.DAILY_REMINDER);
    expect(scheduledIds()).toEqual([]);
  });

  it('does not let a rejected old enumeration delete or unown a newer same-session request', async () => {
    const gate = deferred<NativeRequest[]>();
    let entered = false;
    nativeAdapter().listImpl = async () => {
      if (!entered) {
        entered = true;
        return gate.promise;
      }
      return nativeAdapter().defaultList();
    };

    const old = cancelNotificationById(NOTIFICATION_IDS.DAILY_REMINDER);
    await waitFor(() => entered, 'old same-session enumeration reject');
    const newer = await scheduleDailyReminder('9:00 AM');
    expect(newer).toBeTruthy();

    gate.reject(new Error('synthetic enumeration failure'));
    await old;
    expect(scheduledIds()).toEqual([newer]);

    await cancelNotificationById(NOTIFICATION_IDS.DAILY_REMINDER);
    expect(scheduledIds()).toEqual([]);
    const after = await scheduleDailyReminder('9:00 AM');
    expect(after).toBeTruthy();
    expect(scheduledHours()).toEqual([9]);
  });

  it('does not let an old cancellation finalizer delete a newer same-session request', async () => {
    const first = await scheduleDailyReminder('8:00 AM');
    expect(first).toBeTruthy();

    const gate = deferred<void>();
    let extraEntered = false;
    let seenLiteral = false;
    let delayOldExtras = true;
    nativeAdapter().cancelImpl = async (identifier) => {
      if (!seenLiteral) {
        seenLiteral = true;
        nativeAdapter().defaultCancel(identifier);
        return;
      }
      if (delayOldExtras) {
        extraEntered = true;
        await gate.promise;
      }
      nativeAdapter().defaultCancel(identifier);
    };

    const old = cancelNotificationById(NOTIFICATION_IDS.DAILY_REMINDER);
    await waitFor(() => extraEntered, 'old same-session extra cancel');
    delayOldExtras = false;
    const newer = await scheduleDailyReminder('9:00 AM');
    expect(newer).toBeTruthy();
    expect(scheduledIds()).toEqual([newer]);

    gate.resolve();
    await old;
    expect(scheduledIds()).toEqual([newer]);
    expect(scheduledHours()).toEqual([9]);

    await cancelNotificationById(NOTIFICATION_IDS.DAILY_REMINDER);
    expect(scheduledIds()).toEqual([]);
  });

  it('does not let an old refreshDailyReminder continue into a newer 9:00 schedule', async () => {
    nativeAdapter().permissionMode = 'deferred';
    const oldRefresh = refreshDailyReminder();
    await waitFor(() => typeof nativeAdapter().resolvePermission === 'function', 'old refresh permission');
    const releaseRefresh = nativeAdapter().resolvePermission;
    nativeAdapter().permissionMode = 'granted';
    storeHarness().user = {
      ...storeHarness().user!,
      reminderTime: '9:00 AM',
      dailyReminderEnabled: true,
    };
    const newer = await scheduleDailyReminder('9:00 AM');
    expect(newer).toBeTruthy();
    releaseRefresh?.({ status: 'granted' });
    await expect(oldRefresh).resolves.toBe(false);
    expect(scheduledIds()).toEqual([newer]);
    expect(scheduledHours()).toEqual([9]);

    await cancelNotificationById(NOTIFICATION_IDS.DAILY_REMINDER);
    expect(scheduledIds()).toEqual([]);
    const after = await scheduleDailyReminder('9:00 AM');
    expect(after).toBeTruthy();
    expect(scheduledHours()).toEqual([9]);
  });

  it('does not let an old settings ON persist overwrite a newer time selection before debounce', async () => {
    nativeAdapter().permissionMode = 'deferred';
    const persist = jest.fn((updates) => {
      useUnfoldStore.getState().updateUser(updates);
    });
    const pending = commitDailyReminderSetting(true, '8:00 AM', persist);
    await waitFor(() => typeof nativeAdapter().resolvePermission === 'function', 'settings ON permission');
    writeSelectedReminderTime('9:00 AM');
    nativeAdapter().permissionMode = 'granted';
    nativeAdapter().resolvePermission?.({ status: 'granted' });
    await expect(pending).resolves.toBe(false);
    expect(persist).not.toHaveBeenCalled();
    expect(storeHarness().user?.reminderTime).toBe('9:00 AM');
    expect(storeHarness().user?.dailyReminderEnabled).toBe(true);

    const after = await scheduleDailyReminder('9:00 AM');
    expect(after).toBeTruthy();
    expect(scheduledHours()).toEqual([9]);
    await cancelNotificationById(NOTIFICATION_IDS.DAILY_REMINDER);
    expect(scheduledIds()).toEqual([]);
  });

  it('does not let an old settings OFF persist overwrite a newer time selection before debounce', async () => {
    const first = await scheduleDailyReminder('8:00 AM');
    expect(first).toBeTruthy();

    const gate = deferred<NativeRequest[]>();
    let entered = false;
    nativeAdapter().listImpl = async () => {
      if (!entered) {
        entered = true;
        return gate.promise;
      }
      return nativeAdapter().defaultList();
    };

    const persist = jest.fn((updates) => {
      useUnfoldStore.getState().updateUser(updates);
    });
    const pending = commitDailyReminderSetting(false, '8:00 AM', persist);
    await waitFor(() => entered, 'settings OFF enumeration');
    writeSelectedReminderTime('9:00 AM');
    gate.resolve(nativeAdapter().defaultList());
    await expect(pending).resolves.toBe(false);
    expect(persist).not.toHaveBeenCalled();
    expect(storeHarness().user?.reminderTime).toBe('9:00 AM');
    expect(storeHarness().user?.dailyReminderEnabled).toBe(true);

    const after = await scheduleDailyReminder('9:00 AM');
    expect(after).toBeTruthy();
    expect(scheduledHours()).toEqual([9]);
    await cancelNotificationById(NOTIFICATION_IDS.DAILY_REMINDER);
    expect(scheduledIds()).toEqual([]);
  });

  it('protects a handleSelectTime write from an in-flight 8:00 schedule before the owner debounce', async () => {
    const gate = deferred<void>();
    let entered = false;
    nativeAdapter().scheduleImpl = async (request) => {
      if (!entered) {
        entered = true;
        await gate.promise;
      }
      return nativeAdapter().defaultSchedule(request);
    };

    const older = scheduleDailyReminder('8:00 AM');
    await waitFor(() => entered, 'in-flight 8:00 before time write');
    writeSelectedReminderTime('9:00 AM');
    gate.resolve();
    await expect(older).resolves.toBeNull();
    expect(storeHarness().user?.reminderTime).toBe('9:00 AM');
    expect(scheduledHours()).not.toContain(8);

    const after = await scheduleDailyReminder('9:00 AM');
    expect(after).toBeTruthy();
    expect(scheduledHours()).toEqual([9]);
    await cancelNotificationById(NOTIFICATION_IDS.DAILY_REMINDER);
    expect(scheduledIds()).toEqual([]);
  });

  it('does not let a delayed public literal cancel delete a newer same-session schedule', async () => {
    const gate = deferred<void>();
    let entered = false;
    nativeAdapter().cancelImpl = async (identifier) => {
      if (!entered && identifier === NOTIFICATION_IDS.DAILY_REMINDER) {
        entered = true;
        await gate.promise;
      }
      nativeAdapter().defaultCancel(identifier);
    };

    const old = cancelNotificationById(NOTIFICATION_IDS.DAILY_REMINDER);
    await waitFor(() => entered, 'old literal daily cancel');
    const newer = await scheduleDailyReminder('9:00 AM');
    expect(newer).toBeTruthy();

    gate.resolve();
    await old;
    expect(scheduledIds()).toEqual([newer]);
    expect(scheduledHours()).toEqual([9]);

    await cancelNotificationById(NOTIFICATION_IDS.DAILY_REMINDER);
    expect(scheduledIds()).toEqual([]);
  });
});

describe('NT-1 ordinary daily setting transitions', () => {
  it('persists ON from disabled and returns true', async () => {
    seedUser({ dailyReminderEnabled: false, reminderTime: '8:00 AM' });
    const persist = jest.fn((updates) => {
      useUnfoldStore.getState().updateUser(updates);
    });
    await expect(commitDailyReminderSetting(true, '8:00 AM', persist)).resolves.toBe(true);
    expect(persist).toHaveBeenCalledTimes(1);
    expect(persist).toHaveBeenCalledWith({ reminderTime: '8:00 AM', dailyReminderEnabled: true });
    expect(storeHarness().user?.dailyReminderEnabled).toBe(true);
    expect(scheduledHours()).toEqual([8]);
  });

  it('persists OFF from enabled and returns true', async () => {
    const first = await scheduleDailyReminder('8:00 AM');
    expect(first).toBeTruthy();
    const persist = jest.fn((updates) => {
      useUnfoldStore.getState().updateUser(updates);
    });
    await expect(commitDailyReminderSetting(false, '8:00 AM', persist)).resolves.toBe(true);
    expect(persist).toHaveBeenCalledTimes(1);
    expect(persist).toHaveBeenCalledWith({ dailyReminderEnabled: false });
    expect(storeHarness().user?.dailyReminderEnabled).toBe(false);
    expect(scheduledIds()).toEqual([]);
  });

  it('persists ON with default 8:00 when reminderTime is absent', async () => {
    seedUser({ dailyReminderEnabled: false });
    delete (storeHarness().user as { reminderTime?: string }).reminderTime;
    const persist = jest.fn((updates) => {
      useUnfoldStore.getState().updateUser(updates);
    });
    await expect(commitDailyReminderSetting(true, '8:00 AM', persist)).resolves.toBe(true);
    expect(persist).toHaveBeenCalledTimes(1);
    expect(persist).toHaveBeenCalledWith({ reminderTime: '8:00 AM', dailyReminderEnabled: true });
    expect(storeHarness().user?.reminderTime).toBe('8:00 AM');
    expect(storeHarness().user?.dailyReminderEnabled).toBe(true);
    expect(scheduledHours()).toEqual([8]);
  });

  it('does not persist ON when permission is denied', async () => {
    seedUser({ dailyReminderEnabled: false, reminderTime: '8:00 AM' });
    nativeAdapter().permissionMode = 'denied';
    const persist = jest.fn((updates) => {
      useUnfoldStore.getState().updateUser(updates);
    });
    await expect(commitDailyReminderSetting(true, '8:00 AM', persist)).resolves.toBe(false);
    expect(persist).not.toHaveBeenCalled();
    expect(storeHarness().user?.dailyReminderEnabled).toBe(false);
    expect(scheduledIds()).toEqual([]);
  });
});

describe('NT-1 normal daily and trial controls', () => {
  it('schedules, replaces, and cancels the daily reminder including the legacy identifier', async () => {
    const first = await scheduleDailyReminder('8:00 AM');
    const second = await scheduleDailyReminder('9:00 AM');
    expect(first).toBeTruthy();
    expect(second).toBeTruthy();
    expect(scheduledIds()).toEqual([second]);
    expect(nativeAdapter().schedules.get(second!)?.trigger?.hour).toBe(9);
    expect(nativeAdapter().schedules.get(second!)?.trigger?.type).toBe('daily');

    nativeAdapter().defaultSchedule({
      identifier: NOTIFICATION_IDS.DAILY_REMINDER,
      trigger: { type: 'daily', hour: 6, minute: 0 },
    });
    expect(scheduledIds()).toEqual(expect.arrayContaining([second, NOTIFICATION_IDS.DAILY_REMINDER]));
    await cancelNotificationById(NOTIFICATION_IDS.DAILY_REMINDER, captureSyncSession());
    expect(scheduledIds()).toEqual([]);
  });

  it('returns null and writes nothing when daily permission is denied', async () => {
    nativeAdapter().permissionMode = 'denied';
    await expect(scheduleDailyReminder('8:00 AM')).resolves.toBeNull();
    expect(scheduledIds()).toEqual([]);
  });

  it('returns null when the native daily schedule fails', async () => {
    nativeAdapter().scheduleImpl = async () => {
      throw new Error('synthetic native failure');
    };
    await expect(scheduleDailyReminder('8:00 AM')).resolves.toBeNull();
    expect(scheduledIds()).toEqual([]);
  });

  it('schedules, replaces, and cancels the trial reminder including the legacy identifier', async () => {
    const first = await scheduleTrialEndingNotification(trialInfo());
    const second = await scheduleTrialEndingNotification(trialInfo());
    expect(first).toBeTruthy();
    expect(second).toBeTruthy();
    expect(scheduledIds()).toEqual([second]);
    expect(trialMirrorKeys()).toHaveLength(2);

    nativeAdapter().defaultSchedule({
      identifier: 'unfold-trial-ending',
      trigger: { type: 'date', date: new Date() },
    });
    await cancelTrialEndingNotification();
    expect(scheduledIds()).toEqual([]);
    expect(trialMirrorKeys()).toEqual([]);
  });

  it('skips trial scheduling when permission is denied and clears only the current mirror', async () => {
    nativeAdapter().permissionMode = 'denied';
    await expect(scheduleTrialEndingNotification(trialInfo())).resolves.toBeNull();
    expect(scheduledIds()).toEqual([]);
    expect(trialMirrorKeys()).toEqual([]);
  });

  it('returns null when the native trial schedule fails and clears the current mirror', async () => {
    nativeAdapter().scheduleImpl = async () => {
      throw new Error('synthetic native failure');
    };
    await expect(scheduleTrialEndingNotification(trialInfo())).resolves.toBeNull();
    expect(scheduledIds()).toEqual([]);
    expect(trialMirrorKeys()).toEqual([]);
  });

  it('cancels a trial reminder when the entitlement is not a trial', async () => {
    const scheduled = await scheduleTrialEndingNotification(trialInfo());
    expect(scheduled).toBeTruthy();
    await expect(scheduleTrialEndingNotification(noTrialInfo())).resolves.toBeNull();
    expect(scheduledIds()).toEqual([]);
    expect(trialMirrorKeys()).toEqual([]);
  });

  it('cancels a trial reminder when the reminder time is already in the past', async () => {
    const scheduled = await scheduleTrialEndingNotification(trialInfo());
    expect(scheduled).toBeTruthy();
    await expect(scheduleTrialEndingNotification(expiredTrialInfo())).resolves.toBeNull();
    expect(scheduledIds()).toEqual([]);
    expect(trialMirrorKeys()).toEqual([]);
  });

  it('clears the trial mirror without depending on later reset work', () => {
    nativeAdapter().defaultSchedule({
      identifier: 'unfold-trial-ending:0',
    });
    const mirrors = (globalThis as typeof globalThis & {
      __nt1Mirrors: Map<string, Map<string, string>>;
    }).__nt1Mirrors;
    mirrors.get('unfold-trial-notification')?.set('trial-ending-scheduled-id', 'unfold-trial-ending:0');
    clearTrialNotificationMirror();
    expect(trialMirrorKeys()).toEqual([]);
    expect(scheduledIds()).toEqual(['unfold-trial-ending:0']);
  });
});
