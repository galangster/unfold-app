/**
 * NT-5: trial scheduling keeps a local operation owner inside one reset
 * session. Older native, permission, customer-info, enumeration, and cancel
 * work cannot restore or clear a newer trial or normal result.
 * Loads the actual trial module and sync wrapper. RevenueCat is mocked only
 * at its client boundary. Native effects stay in a synthetic map.
 */

import type { CustomerInfo } from 'react-native-purchases';

import {
  cancelTrialEndingNotification,
  resetTrialNotificationOwnershipForTesting,
  scheduleTrialEndingNotification,
  syncTrialEndingNotification,
} from '../trial-notification';
import {
  beginLocalResetSession,
  endLocalResetSession,
  resetSyncSessionFenceForTesting,
} from '../sync-session-fence';

type NativeRequest = {
  identifier: string;
  content?: { title?: string };
  trigger?: { type?: string; date?: Date };
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

type CustomerInfoResult =
  | { ok: true; data: CustomerInfo }
  | { ok: false; reason: string };

type RevenueCatHarness = {
  enabled: boolean;
  getCustomerInfoImpl: () => Promise<CustomerInfoResult>;
  resolveCustomerInfo?: (value: CustomerInfoResult) => void;
};

type PlatformHarness = { OS: string };

function nativeAdapter(): NativeAdapter {
  return (globalThis as typeof globalThis & { __nt5Native: NativeAdapter }).__nt5Native;
}

function revenueCatHarness(): RevenueCatHarness {
  return (globalThis as typeof globalThis & { __nt5Rc: RevenueCatHarness }).__nt5Rc;
}

function platformHarness(): PlatformHarness {
  return (globalThis as typeof globalThis & { __nt5Platform: PlatformHarness }).__nt5Platform;
}

function trialMirrors(): Map<string, string> {
  const mirrors = (globalThis as typeof globalThis & {
    __nt5Mirrors: Map<string, Map<string, string>>;
  }).__nt5Mirrors;
  return mirrors.get('unfold-trial-notification') ?? new Map();
}

jest.mock('react-native', () => {
  const platform: PlatformHarness = { OS: 'ios' };
  (globalThis as typeof globalThis & { __nt5Platform: PlatformHarness }).__nt5Platform = platform;
  return { Platform: platform };
});

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
  (globalThis as typeof globalThis & { __nt5Native: NativeAdapter }).__nt5Native = adapter;
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
  (globalThis as typeof globalThis & { __nt5Mirrors: typeof mirrors }).__nt5Mirrors = mirrors;
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

jest.mock('../mmkv-storage', () => ({
  getSharedEncryptionKey: jest.fn(() => undefined),
}));

jest.mock('../logger', () => ({
  logger: { log: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

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
  (globalThis as typeof globalThis & { __nt5Rc: RevenueCatHarness }).__nt5Rc = harness;
  return {
    isRevenueCatEnabled: jest.fn(() => harness.enabled),
    getCustomerInfo: jest.fn(() => harness.getCustomerInfoImpl()),
  };
});

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

function normalInfo(): CustomerInfo {
  return {
    entitlements: {
      active: {
        'Unfold Premium': {
          periodType: 'NORMAL',
          expirationDate: new Date(Date.now() + 30 * 86_400_000).toISOString(),
        },
      },
    },
  } as unknown as CustomerInfo;
}

function expiredTrialInfo(): CustomerInfo {
  return trialInfo(new Date(Date.now() + 12 * 3_600_000));
}

function scheduledIds(): string[] {
  return [...nativeAdapter().schedules.keys()];
}

const ARMED_KEY = 'trial-ending-notice-armed-v1';

function mirrorEntries(): [string, string][] {
  return [...trialMirrors().entries()];
}

function scheduleMirrorEntries(): [string, string][] {
  return mirrorEntries().filter(
    ([key]) => key === 'trial-ending-scheduled-id' || key === 'trial-ending-scheduled-for',
  );
}

function expectArmedRecord(present: boolean): void {
  const raw = trialMirrors().get(ARMED_KEY);
  if (!present) {
    expect(raw).toBeUndefined();
    return;
  }
  expect(JSON.parse(raw ?? 'null')).toEqual({
    expiresAtMs: expect.any(Number),
    fireAtMs: expect.any(Number),
  });
}

async function tick(): Promise<void> {
  await new Promise<void>((resolve) => {
    setImmediate(resolve);
  });
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

beforeEach(() => {
  resetSyncSessionFenceForTesting();
  resetTrialNotificationOwnershipForTesting();
  nativeAdapter().schedules.clear();
  nativeAdapter().permissionMode = 'granted';
  nativeAdapter().resolvePermission = undefined;
  nativeAdapter().scheduleImpl = null;
  nativeAdapter().listImpl = null;
  nativeAdapter().cancelImpl = null;
  trialMirrors().clear();
  platformHarness().OS = 'ios';
  revenueCatHarness().enabled = true;
  revenueCatHarness().getCustomerInfoImpl = async () => ({ ok: true, data: trialInfo() });
  revenueCatHarness().resolveCustomerInfo = undefined;
});

describe('NT-5 same-session reversed completion', () => {
  it('does not restore a reminder or mirror when an old TRIAL completes after newer NORMAL cancel', async () => {
    const gate = deferred<void>();
    let entered = false;
    nativeAdapter().scheduleImpl = async (request) => {
      if (!entered) {
        entered = true;
        await gate.promise;
      }
      return nativeAdapter().defaultSchedule(request);
    };

    const older = scheduleTrialEndingNotification(trialInfo());
    await waitFor(() => entered, 'old trial native schedule');
    await expect(scheduleTrialEndingNotification(normalInfo())).resolves.toBeNull();
    expect(scheduledIds()).toEqual([]);
    expect(mirrorEntries()).toEqual([]);

    gate.resolve();
    await expect(older).resolves.toBeNull();
    expect(scheduledIds()).toEqual([]);
    expect(mirrorEntries()).toEqual([]);
  });

  it('keeps only the newer TRIAL request and mirror when two schedules finish in reverse', async () => {
    const later = new Date(Date.now() + 10 * 86_400_000);
    const sooner = new Date(Date.now() + 8 * 86_400_000);
    const gate = deferred<void>();
    let entered = false;
    nativeAdapter().scheduleImpl = async (request) => {
      if (!entered) {
        entered = true;
        await gate.promise;
      }
      return nativeAdapter().defaultSchedule(request);
    };

    const older = scheduleTrialEndingNotification(trialInfo(later));
    await waitFor(() => entered, 'older trial native schedule');
    const newer = await scheduleTrialEndingNotification(trialInfo(sooner));
    const mirrorBefore = mirrorEntries();
    expect(newer).toBeTruthy();
    expect(scheduledIds()).toEqual([newer]);
    expect(scheduleMirrorEntries()).toHaveLength(2);
    expectArmedRecord(true);
    expect(newer).not.toBe('unfold-trial-ending');
    expect(newer).not.toMatch(/^unfold-trial-ending:\d+$/);

    gate.resolve();
    await expect(older).resolves.toBeNull();
    expect(scheduledIds()).toEqual([newer]);
    expect(mirrorEntries()).toEqual(mirrorBefore);
  });

  it('does not let an old native TRIAL failure clear a newer TRIAL mirror', async () => {
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

    const older = scheduleTrialEndingNotification(trialInfo());
    await waitFor(() => entered, 'old trial native failure');
    const newer = await scheduleTrialEndingNotification(trialInfo());
    const mirrorBefore = mirrorEntries();
    expect(newer).toBeTruthy();
    expect(scheduleMirrorEntries()).toHaveLength(2);
    expectArmedRecord(true);

    gate.reject(new Error('synthetic native failure'));
    await expect(older).resolves.toBeNull();
    expect(scheduledIds()).toEqual([newer]);
    expect(mirrorEntries()).toEqual(mirrorBefore);
  });
});

describe('NT-5 stale customer-info', () => {
  it('ignores an older TRIAL customer-info result after newer NORMAL work', async () => {
    const gate = deferred<CustomerInfoResult>();
    revenueCatHarness().getCustomerInfoImpl = () => {
      revenueCatHarness().resolveCustomerInfo = gate.resolve;
      return gate.promise;
    };

    const older = syncTrialEndingNotification();
    await waitFor(
      () => typeof revenueCatHarness().resolveCustomerInfo === 'function',
      'old customer-info',
    );
    await expect(scheduleTrialEndingNotification(normalInfo())).resolves.toBeNull();
    expect(scheduledIds()).toEqual([]);
    expect(mirrorEntries()).toEqual([]);

    gate.resolve({ ok: true, data: trialInfo() });
    await older;
    expect(scheduledIds()).toEqual([]);
    expect(mirrorEntries()).toEqual([]);
  });

  it('ignores an older NORMAL customer-info result after newer TRIAL work', async () => {
    const gate = deferred<CustomerInfoResult>();
    revenueCatHarness().getCustomerInfoImpl = () => {
      revenueCatHarness().resolveCustomerInfo = gate.resolve;
      return gate.promise;
    };

    const older = syncTrialEndingNotification();
    await waitFor(
      () => typeof revenueCatHarness().resolveCustomerInfo === 'function',
      'old normal customer-info',
    );
    const newer = await scheduleTrialEndingNotification(trialInfo());
    const mirrorBefore = mirrorEntries();
    expect(newer).toBeTruthy();

    gate.resolve({ ok: true, data: normalInfo() });
    await older;
    expect(scheduledIds()).toEqual([newer]);
    expect(mirrorEntries()).toEqual(mirrorBefore);
  });

  it('ignores an older TRIAL customer-info result after newer TRIAL work', async () => {
    const firstExpiration = new Date(Date.now() + 9 * 86_400_000);
    const secondExpiration = new Date(Date.now() + 6 * 86_400_000);
    const gate = deferred<CustomerInfoResult>();
    revenueCatHarness().getCustomerInfoImpl = () => {
      revenueCatHarness().resolveCustomerInfo = gate.resolve;
      return gate.promise;
    };

    const older = syncTrialEndingNotification();
    await waitFor(
      () => typeof revenueCatHarness().resolveCustomerInfo === 'function',
      'old trial customer-info',
    );
    const newer = await scheduleTrialEndingNotification(trialInfo(secondExpiration));
    const mirrorBefore = mirrorEntries();
    expect(newer).toBeTruthy();

    gate.resolve({ ok: true, data: trialInfo(firstExpiration) });
    await older;
    expect(scheduledIds()).toEqual([newer]);
    expect(mirrorEntries()).toEqual(mirrorBefore);
  });
});

describe('NT-5 late permission, enumeration, and cancel', () => {
  it('does not let older permission completion restore work after a newer NORMAL cancel', async () => {
    nativeAdapter().permissionMode = 'deferred';
    const older = scheduleTrialEndingNotification(trialInfo());
    await waitFor(() => typeof nativeAdapter().resolvePermission === 'function', 'old permission');
    await expect(scheduleTrialEndingNotification(normalInfo())).resolves.toBeNull();
    nativeAdapter().permissionMode = 'granted';
    nativeAdapter().resolvePermission?.({ status: 'granted' });
    await expect(older).resolves.toBeNull();
    expect(scheduledIds()).toEqual([]);
    expect(mirrorEntries()).toEqual([]);
  });

  it('does not let older permission completion replace a newer TRIAL request', async () => {
    nativeAdapter().permissionMode = 'deferred';
    const older = scheduleTrialEndingNotification(trialInfo());
    await waitFor(() => typeof nativeAdapter().resolvePermission === 'function', 'old trial permission');
    nativeAdapter().permissionMode = 'granted';
    const newer = await scheduleTrialEndingNotification(trialInfo());
    const mirrorBefore = mirrorEntries();
    nativeAdapter().resolvePermission?.({ status: 'granted' });
    await expect(older).resolves.toBeNull();
    expect(scheduledIds()).toEqual([newer]);
    expect(mirrorEntries()).toEqual(mirrorBefore);
  });

  it('does not let a late cancellation listing delete a newer owned request', async () => {
    const gate = deferred<NativeRequest[]>();
    let entered = false;
    nativeAdapter().listImpl = async () => {
      if (!entered) {
        entered = true;
        return gate.promise;
      }
      return nativeAdapter().defaultList();
    };

    const older = cancelTrialEndingNotification();
    await waitFor(() => entered, 'old trial enumeration');
    const newer = await scheduleTrialEndingNotification(trialInfo());
    expect(newer).toBeTruthy();

    gate.resolve(nativeAdapter().defaultList());
    await older;
    expect(scheduledIds()).toEqual([newer]);
    expect(scheduleMirrorEntries()).toHaveLength(2);
    expectArmedRecord(true);
  });

  it('does not let a rejected cancellation listing delete or unown a newer request', async () => {
    const gate = deferred<NativeRequest[]>();
    let entered = false;
    nativeAdapter().listImpl = async () => {
      if (!entered) {
        entered = true;
        return gate.promise;
      }
      return nativeAdapter().defaultList();
    };

    const older = cancelTrialEndingNotification();
    await waitFor(() => entered, 'old trial enumeration reject');
    const newer = await scheduleTrialEndingNotification(trialInfo());
    const mirrorBefore = mirrorEntries();

    gate.reject(new Error('synthetic enumeration failure'));
    await older;
    expect(scheduledIds()).toEqual([newer]);
    expect(mirrorEntries()).toEqual(mirrorBefore);
  });

  it('does not let an old cancellation completion remove a newer request or mirror', async () => {
    const first = await scheduleTrialEndingNotification(trialInfo());
    expect(first).toBeTruthy();

    const gate = deferred<void>();
    let entered = false;
    nativeAdapter().cancelImpl = async (identifier) => {
      if (!entered) {
        entered = true;
        await gate.promise;
      }
      nativeAdapter().defaultCancel(identifier);
    };

    const older = cancelTrialEndingNotification();
    await waitFor(() => entered, 'old trial cancel');
    nativeAdapter().cancelImpl = null;
    const newer = await scheduleTrialEndingNotification(trialInfo());
    expect(newer).toBeTruthy();
    const mirrorBefore = mirrorEntries();

    gate.resolve();
    await older;
    expect(scheduledIds()).toEqual([newer]);
    expect(mirrorEntries()).toEqual(mirrorBefore);
  });

  it('does not let an old cancellation failure clear a newer mirror', async () => {
    const first = await scheduleTrialEndingNotification(trialInfo());
    expect(first).toBeTruthy();

    const gate = deferred<void>();
    let entered = false;
    nativeAdapter().cancelImpl = async () => {
      if (!entered) {
        entered = true;
        await gate.promise;
        throw new Error('synthetic cancel failure');
      }
    };

    const older = cancelTrialEndingNotification();
    await waitFor(() => entered, 'old trial cancel failure');
    nativeAdapter().cancelImpl = null;
    const newer = await scheduleTrialEndingNotification(trialInfo());
    const mirrorBefore = mirrorEntries();

    gate.resolve();
    await older;
    expect(scheduledIds()).toEqual([newer]);
    expect(mirrorEntries()).toEqual(mirrorBefore);
  });
});

describe('NT-5 current controls', () => {
  it('replaces a current TRIAL schedule with a newer TRIAL identifier and mirror', async () => {
    const first = await scheduleTrialEndingNotification(trialInfo());
    const second = await scheduleTrialEndingNotification(trialInfo());
    expect(first).toBeTruthy();
    expect(second).toBeTruthy();
    expect(second).not.toBe(first);
    expect(scheduledIds()).toEqual([second]);
    expect(trialMirrors().get('trial-ending-scheduled-id')).toBe(second);
  });

  it('cancels a current reminder when the entitlement is NORMAL', async () => {
    const scheduled = await scheduleTrialEndingNotification(trialInfo());
    expect(scheduled).toBeTruthy();
    await expect(scheduleTrialEndingNotification(normalInfo())).resolves.toBeNull();
    expect(scheduledIds()).toEqual([]);
    expect(mirrorEntries()).toEqual([]);
  });

  it('cancels invalid and expired trial controls', async () => {
    const scheduled = await scheduleTrialEndingNotification(trialInfo());
    expect(scheduled).toBeTruthy();
    await expect(
      scheduleTrialEndingNotification({
        entitlements: { active: { 'Unfold Premium': { periodType: 'TRIAL' } } },
      } as unknown as CustomerInfo),
    ).resolves.toBeNull();
    expect(scheduledIds()).toEqual([]);

    const again = await scheduleTrialEndingNotification(trialInfo());
    expect(again).toBeTruthy();
    await expect(scheduleTrialEndingNotification(expiredTrialInfo())).resolves.toBeNull();
    expect(scheduledIds()).toEqual([]);
    expect(scheduleMirrorEntries()).toEqual([]);
    expectArmedRecord(false);
  });

  it('skips scheduling when permission is denied', async () => {
    nativeAdapter().permissionMode = 'denied';
    await expect(scheduleTrialEndingNotification(trialInfo())).resolves.toBeNull();
    expect(scheduledIds()).toEqual([]);
    expect(scheduleMirrorEntries()).toEqual([]);
    expectArmedRecord(false);
  });

  it('does nothing on an unsupported platform', async () => {
    platformHarness().OS = 'web';
    await expect(scheduleTrialEndingNotification(trialInfo())).resolves.toBeNull();
    await cancelTrialEndingNotification();
    expect(scheduledIds()).toEqual([]);
    expect(mirrorEntries()).toEqual([]);
  });

  it('cancels the legacy fixed identifier and a session-scoped leftover', async () => {
    const current = await scheduleTrialEndingNotification(trialInfo());
    expect(current).toBeTruthy();
    nativeAdapter().defaultSchedule({
      identifier: 'unfold-trial-ending',
      trigger: { type: 'date', date: new Date() },
    });
    nativeAdapter().defaultSchedule({
      identifier: 'unfold-trial-ending:0',
      trigger: { type: 'date', date: new Date() },
    });
    await cancelTrialEndingNotification();
    expect(scheduledIds()).toEqual([]);
    expect(scheduleMirrorEntries()).toEqual([]);
    expectArmedRecord(true);
  });

  it('lets a later direct cancel remove the current reminder', async () => {
    const scheduled = await scheduleTrialEndingNotification(trialInfo());
    expect(scheduled).toBeTruthy();
    await cancelTrialEndingNotification();
    expect(scheduledIds()).toEqual([]);
    expect(scheduleMirrorEntries()).toEqual([]);
    expectArmedRecord(true);
  });

  it('syncs a current TRIAL from RevenueCat and cancels when disabled', async () => {
    await syncTrialEndingNotification();
    expect(scheduledIds()).toHaveLength(1);
    expect(scheduleMirrorEntries()).toHaveLength(2);
    expectArmedRecord(true);

    revenueCatHarness().enabled = false;
    await syncTrialEndingNotification();
    expect(scheduledIds()).toEqual([]);
    expect(scheduleMirrorEntries()).toEqual([]);
    expectArmedRecord(true);
  });

  it('still refuses trial work while a reset is in progress', async () => {
    const token = beginLocalResetSession();
    await expect(scheduleTrialEndingNotification(trialInfo())).resolves.toBeNull();
    await cancelTrialEndingNotification();
    expect(scheduledIds()).toEqual([]);
    endLocalResetSession(token);
  });
});
