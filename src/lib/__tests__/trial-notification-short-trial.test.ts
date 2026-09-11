/**
 * I3 short-trial scheduler + I4 CustomerInfo passthrough + D13 mirror keys.
 */

import type { CustomerInfo } from 'react-native-purchases';
import * as Notifications from 'expo-notifications';

import {
  clearTrialNotificationMirror,
  readTrialCheckInSkipDate,
  resetTrialNotificationOwnershipForTesting,
  scheduleTrialEndingNotification,
  syncTrialEndingNotification,
} from '../trial-notification';
import { resetSyncSessionFenceForTesting } from '../sync-session-fence';
import { useUIState } from '../ui-state';
import { trackTrialNoticeScheduled, trackTrialNoticeSkipped } from '../auto-trial-telemetry';
import { getCustomerInfo } from '../revenuecatClient';
import { buildCheckInSchedule, firesToday, MIDDAY_FALLBACK } from '../notifications';

type NativeRequest = {
  identifier: string;
  content?: { title?: string };
  trigger?: { type?: string; date?: Date };
};

type NativeAdapter = {
  schedules: Map<string, NativeRequest>;
  permissionMode: 'granted' | 'denied';
  defaultSchedule: (request: NativeRequest) => string;
};

type PlatformHarness = { OS: string; currentState: string };

function nativeAdapter(): NativeAdapter {
  return (globalThis as typeof globalThis & { __i3Native: NativeAdapter }).__i3Native;
}

function platformHarness(): PlatformHarness {
  return (globalThis as typeof globalThis & { __i3Platform: PlatformHarness }).__i3Platform;
}

function trialMirrors(): Map<string, string> {
  const mirrors = (globalThis as typeof globalThis & {
    __i3Mirrors: Map<string, Map<string, string>>;
  }).__i3Mirrors;
  return mirrors.get('unfold-trial-notification') ?? new Map();
}

jest.mock('react-native', () => {
  const harness: PlatformHarness = { OS: 'ios', currentState: 'active' };
  (globalThis as typeof globalThis & { __i3Platform: PlatformHarness }).__i3Platform = harness;
  return {
    Platform: harness,
    AppState: harness,
  };
});

jest.mock('expo-notifications', () => {
  const schedules = new Map<string, NativeRequest>();
  const adapter: NativeAdapter = {
    schedules,
    permissionMode: 'granted',
    defaultSchedule(request) {
      const identifier = request.identifier || 'synthetic-generated';
      schedules.set(identifier, { ...request, identifier });
      return identifier;
    },
  };
  (globalThis as typeof globalThis & { __i3Native: NativeAdapter }).__i3Native = adapter;
  return {
    setNotificationHandler: jest.fn(),
    getPermissionsAsync: jest.fn(async () => ({ status: adapter.permissionMode })),
    requestPermissionsAsync: jest.fn(async () => ({ status: 'denied' })),
    scheduleNotificationAsync: jest.fn(async (request: NativeRequest) => adapter.defaultSchedule(request)),
    cancelScheduledNotificationAsync: jest.fn(async (identifier: string) => {
      schedules.delete(identifier);
    }),
    cancelAllScheduledNotificationsAsync: jest.fn(async () => {
      schedules.clear();
    }),
    getAllScheduledNotificationsAsync: jest.fn(async () => [...schedules.values()]),
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
  (globalThis as typeof globalThis & { __i3Mirrors: typeof mirrors }).__i3Mirrors = mirrors;
  return {
    MMKV: class {
      values: Map<string, string>;
      constructor({ id }: { id: string }) {
        if (!mirrors.has(id)) mirrors.set(id, new Map());
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

jest.mock('../store', () => ({
  useUnfoldStore: {
    getState: () => ({ middayCheckInTime: '12:30' }),
  },
}));

jest.mock('../auto-trial-telemetry', () => ({
  trackTrialNoticeScheduled: jest.fn(),
  trackTrialNoticeSkipped: jest.fn(),
}));

jest.mock('../revenuecatClient', () => ({
  isRevenueCatEnabled: jest.fn(() => true),
  getCustomerInfo: jest.fn(),
}));

jest.mock('../analytics', () => ({ logEvent: jest.fn() }));
jest.mock('../premium-state', () => ({
  getEffectivePremiumAccessPolicy: () => 'granted',
}));
jest.mock('../home-devotional-state', () => ({
  getCurrentDevotional: () => null,
  getTodayCarryLine: () => '',
  getTodayDayContext: () => null,
  getDaysReadToday: () => 0,
  getHomeDevotionalDayData: () => null,
  hasReadAnyDayToday: () => false,
}));

function at(day: number, hour: number, minute: number): Date {
  return new Date(2026, 0, day, hour, minute, 0, 0);
}

function trialInfo(purchased: Date, expires: Date, periodType: 'TRIAL' | 'NORMAL' = 'TRIAL'): CustomerInfo {
  return {
    entitlements: {
      active: {
        'Unfold Premium': {
          periodType,
          latestPurchaseDate: purchased.toISOString(),
          latestPurchaseDateMillis: purchased.getTime(),
          expirationDate: expires.toISOString(),
          expirationDateMillis: expires.getTime(),
        },
      },
    },
  } as unknown as CustomerInfo;
}

function threeDay(purchased: Date): CustomerInfo {
  return trialInfo(purchased, new Date(purchased.getTime() + 3 * 86_400_000));
}

beforeEach(() => {
  resetSyncSessionFenceForTesting();
  resetTrialNotificationOwnershipForTesting();
  nativeAdapter().schedules.clear();
  nativeAdapter().permissionMode = 'granted';
  trialMirrors().clear();
  platformHarness().OS = 'ios';
  platformHarness().currentState = 'active';
  useUIState.setState({ trialNoticeEpoch: 0 });
  (trackTrialNoticeScheduled as jest.Mock).mockClear();
  (trackTrialNoticeSkipped as jest.Mock).mockClear();
  (getCustomerInfo as jest.Mock).mockClear();
  jest.spyOn(Date, 'now').mockRestore();
});

afterEach(() => {
  jest.spyOn(Date, 'now').mockRestore();
});

describe('I3 short trial', () => {
  it('schedules Wed 12:30, writes skip date, bumps epoch, emits scheduled', async () => {
    jest.spyOn(Date, 'now').mockReturnValue(at(5, 14, 5).getTime());
    const id = await scheduleTrialEndingNotification(threeDay(at(5, 14, 0)));
    expect(id).toBeTruthy();
    const request = nativeAdapter().schedules.get(id!);
    expect(request?.content?.title).toBe('Your Unfold trial ends tomorrow');
    expect(request?.trigger?.date).toEqual(at(7, 12, 30));
    expect(readTrialCheckInSkipDate()).toBe('2026-01-07');
    expect(useUIState.getState().trialNoticeEpoch).toBe(1);
    expect(trackTrialNoticeScheduled).toHaveBeenCalledTimes(1);
    expect(JSON.parse(trialMirrors().get('trial-ending-notice-armed-v1') ?? '{}')).toMatchObject({
      fireAtMs: at(7, 12, 30).getTime(),
    });
  });

  it('no permission keeps the skip date and emits no_permission', async () => {
    nativeAdapter().permissionMode = 'denied';
    jest.spyOn(Date, 'now').mockReturnValue(at(5, 14, 5).getTime());
    await expect(scheduleTrialEndingNotification(threeDay(at(5, 14, 0)))).resolves.toBeNull();
    expect(readTrialCheckInSkipDate()).toBe('2026-01-07');
    expect(useUIState.getState().trialNoticeEpoch).toBe(1);
    expect(trackTrialNoticeSkipped).toHaveBeenCalledWith({ reason: 'no_permission' });
  });

  it('past_deadline on Wed 10:00 cancels and keeps skip date Wed', async () => {
    jest.spyOn(Date, 'now').mockReturnValue(at(7, 10, 0).getTime());
    await expect(scheduleTrialEndingNotification(threeDay(at(5, 10, 0)))).resolves.toBeNull();
    expect(nativeAdapter().schedules.size).toBe(0);
    expect(readTrialCheckInSkipDate()).toBe('2026-01-07');
    expect(trackTrialNoticeSkipped).toHaveBeenCalledWith({ reason: 'past_deadline' });
  });

  it('Mon 06:30 sync Wed 06:00 skips and keeps skip date Wed', async () => {
    jest.spyOn(Date, 'now').mockReturnValue(at(7, 6, 0).getTime());
    await expect(scheduleTrialEndingNotification(threeDay(at(5, 6, 30)))).resolves.toBeNull();
    expect(readTrialCheckInSkipDate()).toBe('2026-01-07');
  });

  it('second sync after fire time does not schedule or cancel, emits already_delivered once', async () => {
    jest.spyOn(Date, 'now').mockReturnValue(at(5, 14, 5).getTime());
    const id = await scheduleTrialEndingNotification(threeDay(at(5, 14, 0)));
    expect(id).toBeTruthy();
    const scheduleCalls = (Notifications.scheduleNotificationAsync as jest.Mock).mock.calls.length;
    const cancelCalls = (Notifications.cancelScheduledNotificationAsync as jest.Mock).mock.calls.length;

    (Date.now as jest.Mock).mockReturnValue(at(7, 12, 31).getTime());
    await expect(scheduleTrialEndingNotification(threeDay(at(5, 14, 0)))).resolves.toBeNull();
    await expect(scheduleTrialEndingNotification(threeDay(at(5, 14, 0)))).resolves.toBeNull();

    expect(Notifications.scheduleNotificationAsync).toHaveBeenCalledTimes(scheduleCalls);
    expect(Notifications.cancelScheduledNotificationAsync).toHaveBeenCalledTimes(cancelCalls);
    expect(trackTrialNoticeSkipped).toHaveBeenCalledTimes(1);
    expect(trackTrialNoticeSkipped).toHaveBeenCalledWith({ reason: 'already_delivered' });
    expect(trialMirrors().get('trial-ending-notice-armed-v1')).toBeTruthy();
    expect(readTrialCheckInSkipDate()).toBe('2026-01-07');
  });

  it('armed record survives the no-permission branch', async () => {
    jest.spyOn(Date, 'now').mockReturnValue(at(5, 14, 5).getTime());
    await scheduleTrialEndingNotification(threeDay(at(5, 14, 0)));
    const armed = trialMirrors().get('trial-ending-notice-armed-v1');
    expect(armed).toBeTruthy();
    nativeAdapter().permissionMode = 'denied';
    await scheduleTrialEndingNotification(threeDay(at(5, 14, 0)));
    expect(trialMirrors().get('trial-ending-notice-armed-v1')).toBe(armed);
  });

  it('second same-plan sync does not emit scheduled again; grant after no-permission emits once', async () => {
    jest.spyOn(Date, 'now').mockReturnValue(at(5, 14, 5).getTime());
    nativeAdapter().permissionMode = 'denied';
    await scheduleTrialEndingNotification(threeDay(at(5, 14, 0)));
    await scheduleTrialEndingNotification(threeDay(at(5, 14, 0)));
    expect(trackTrialNoticeSkipped).toHaveBeenCalledTimes(1);
    expect(trackTrialNoticeScheduled).not.toHaveBeenCalled();

    nativeAdapter().permissionMode = 'granted';
    await scheduleTrialEndingNotification(threeDay(at(5, 14, 0)));
    expect(trackTrialNoticeScheduled).toHaveBeenCalledTimes(1);
    await scheduleTrialEndingNotification(threeDay(at(5, 14, 0)));
    expect(trackTrialNoticeScheduled).toHaveBeenCalledTimes(1);
  });

  it('NORMAL removes skip date and armed without clearStoredId, bumps epoch once', async () => {
    jest.spyOn(Date, 'now').mockReturnValue(at(5, 14, 5).getTime());
    await scheduleTrialEndingNotification(threeDay(at(5, 14, 0)));
    expect(useUIState.getState().trialNoticeEpoch).toBe(1);
    const normal = trialInfo(at(5, 14, 0), at(8, 14, 0), 'NORMAL');
    await scheduleTrialEndingNotification(normal);
    expect(readTrialCheckInSkipDate()).toBeNull();
    expect(trialMirrors().get('trial-ending-notice-armed-v1')).toBeUndefined();
    expect(useUIState.getState().trialNoticeEpoch).toBe(2);
    await scheduleTrialEndingNotification(normal);
    expect(useUIState.getState().trialNoticeEpoch).toBe(2);
  });

  it('clearTrialNotificationMirror clears the three new §5.2 keys', () => {
    trialMirrors().set('trial-ending-checkin-skip-date', '2026-01-07');
    trialMirrors().set('trial-ending-notice-armed-v1', '{"expiresAtMs":1,"fireAtMs":2}');
    trialMirrors().set('trial-notice-skip-reported-v1', 'exp|past_deadline');
    clearTrialNotificationMirror();
    expect(trialMirrors().get('trial-ending-checkin-skip-date')).toBeUndefined();
    expect(trialMirrors().get('trial-ending-notice-armed-v1')).toBeUndefined();
    expect(trialMirrors().get('trial-notice-skip-reported-v1')).toBeUndefined();
  });

  it('after past_deadline on Day 3, check-in ops do not fire on Day 3', async () => {
    jest.spyOn(Date, 'now').mockReturnValue(at(7, 10, 0).getTime());
    await scheduleTrialEndingNotification(threeDay(at(5, 10, 0)));
    const skip = readTrialCheckInSkipDate();
    expect(skip).toBe('2026-01-07');
    const now = at(7, 10, 0);
    const midday = buildCheckInSchedule(
      'unfold-midday-checkin',
      '12:30',
      null,
      MIDDAY_FALLBACK,
      { localDate: skip!, now },
    );
    const evening = buildCheckInSchedule(
      'unfold-evening-winddown',
      '20:30',
      null,
      { hour: 20, minute: 30 },
      { localDate: skip!, now },
    );
    expect(midday.every((op) => !firesToday(op, now))).toBe(true);
    expect(evening.every((op) => !firesToday(op, now))).toBe(true);
  });
});

describe('I4 CustomerInfo passthrough', () => {
  it('syncTrialEndingNotification(info) does not call getCustomerInfo', async () => {
    jest.spyOn(Date, 'now').mockReturnValue(at(5, 14, 5).getTime());
    await syncTrialEndingNotification(threeDay(at(5, 14, 0)));
    expect(getCustomerInfo).not.toHaveBeenCalled();
    expect(nativeAdapter().schedules.size).toBe(1);
  });
});
