/* eslint-disable import/first, @typescript-eslint/no-require-imports */
/**
 * Background check-in top-up: refill the 14-day horizon without an open,
 * without inventing a second scheduler, and without touching the trial notice.
 */

const mockState = {
  recovery: false,
  reset: false,
  hydrated: true,
  revenueCatResolved: false,
  configureFailed: false,
  revenueCatEnabled: true,
  customerInfo: {
    ok: true as const,
    data: { entitlements: { active: { 'Unfold Premium': { isActive: true } } } },
  } as
    | { ok: true; data: { entitlements: { active: Record<string, { isActive: boolean }> } } }
    | { ok: false; reason: string },
  user: { hasCompletedOnboarding: true, isPremium: true },
  middayEnabled: true,
  eveningEnabled: true,
  resetDuringCustomerInfo: false,
};

const mockScheduleMidday = jest.fn(async (_clock?: unknown) => ({ ids: ['mid-0'], complete: true }));
const mockScheduleEvening = jest.fn(async (_clock?: unknown) => ({ ids: ['eve-0'], complete: true }));
const mockCancelMidday = jest.fn(async () => undefined);
const mockCancelEvening = jest.fn(async () => undefined);
const mockAreEnabled = jest.fn(async () => true);
const mockUpdateUser = jest.fn((patch: { isPremium?: boolean }) => {
  mockState.user = { ...mockState.user, ...patch };
});
const mockSetRevenueCatResolved = jest.fn();

jest.mock('react-native', () => ({
  Platform: { OS: 'ios', select: (o: Record<string, unknown>) => o.ios },
}));
jest.mock('@/lib/logger', () => ({ logger: { log: jest.fn(), warn: jest.fn(), error: jest.fn() } }));
jest.mock('@/lib/mmkv-storage', () => ({
  isRecoverySession: () => mockState.recovery,
}));
jest.mock('@/lib/sync-session-fence', () => ({
  isLocalResetInProgress: () => mockState.reset,
}));
const mockGetCustomerInfo = jest.fn(async () => {
  if (mockState.resetDuringCustomerInfo) mockState.reset = true;
  return mockState.customerInfo;
});

jest.mock('@/lib/revenuecatClient', () => ({
  isRevenueCatEnabled: () => mockState.revenueCatEnabled,
  hasRevenueCatConfigurationAttemptFailed: () => mockState.configureFailed,
  getCustomerInfo: () => mockGetCustomerInfo(),
}));
jest.mock('@/lib/premium-state', () => ({
  getEffectivePremiumAccessPolicy: () => {
    if (!mockState.hydrated || !mockState.revenueCatResolved) return 'unknown';
    return mockState.user.isPremium ? 'granted' : 'denied';
  },
}));
jest.mock('@/lib/home-devotional-state', () => ({
  getTodayCarryLine: () => '',
}));
jest.mock('@/lib/device-timezone', () => ({
  getDeviceTimezone: () => 'Pacific/Honolulu',
}));
jest.mock('@/lib/trial-notification', () => ({
  readTrialCheckInSkipDate: () => null,
}));
jest.mock('@/lib/notifications', () => ({
  scheduleMiddayCheckIn: (clock?: unknown) => mockScheduleMidday(clock),
  scheduleEveningWindDown: (clock?: unknown) => mockScheduleEvening(clock),
  cancelMiddayCheckIn: () => mockCancelMidday(),
  cancelEveningWindDown: () => mockCancelEvening(),
  areNotificationsEnabled: () => mockAreEnabled(),
}));
jest.mock('@/lib/ui-state', () => ({
  useUIState: {
    getState: () => ({
      revenueCatResolved: mockState.revenueCatResolved,
      notificationPermissionEpoch: 0,
      trialNoticeEpoch: 0,
      setRevenueCatResolved: () => {
        mockState.revenueCatResolved = true;
        mockSetRevenueCatResolved();
      },
    }),
  },
}));
jest.mock('../store', () => ({
  useUnfoldStore: {
    getState: () => ({
      user: mockState.user,
      middayCheckInEnabled: mockState.middayEnabled,
      eveningWindDownEnabled: mockState.eveningEnabled,
      middayCheckInTime: '12:30',
      eveningWindDownTime: '20:30',
      middayCheckInByDay: null,
      eveningWindDownByDay: null,
      devotionals: [],
      currentDevotionalId: null,
      updateUser: mockUpdateUser,
    }),
    persist: {
      hasHydrated: () => mockState.hydrated,
      onFinishHydration: (cb: () => void) => {
        if (mockState.hydrated) cb();
        return () => undefined;
      },
    },
  },
}));

import * as BackgroundFetch from 'expo-background-fetch';
import { PRE_ROLL_DAYS, getAllCheckInIdentifiers } from '../check-in-schedule';
import { resetCheckInNotificationSyncForTests } from '../check-in-notification-sync';
import {
  prepareCheckInBackgroundPremium,
  resetCheckInBackgroundHydrationWaitForTests,
  runCheckInBackgroundTopup,
  setCheckInBackgroundHydrationWaitForTests,
} from '../check-in-background-topup';

function resetMocks() {
  resetCheckInNotificationSyncForTests();
  mockState.recovery = false;
  mockState.reset = false;
  mockState.hydrated = true;
  mockState.revenueCatResolved = false;
  mockState.configureFailed = false;
  mockState.revenueCatEnabled = true;
  mockState.customerInfo = {
    ok: true,
    data: { entitlements: { active: { 'Unfold Premium': { isActive: true } } } },
  };
  mockState.user = { hasCompletedOnboarding: true, isPremium: true };
  mockState.middayEnabled = true;
  mockState.eveningEnabled = true;
  mockState.resetDuringCustomerInfo = false;
  mockGetCustomerInfo.mockClear();
  mockScheduleMidday.mockClear();
  mockScheduleEvening.mockClear();
  mockCancelMidday.mockClear();
  mockCancelEvening.mockClear();
  mockAreEnabled.mockClear();
  mockAreEnabled.mockResolvedValue(true);
  mockUpdateUser.mockClear();
  mockUpdateUser.mockImplementation((patch: { isPremium?: boolean }) => {
    mockState.user = { ...mockState.user, ...patch };
  });
  mockSetRevenueCatResolved.mockClear();
  mockScheduleMidday.mockResolvedValue({ ids: ['mid-0'], complete: true });
  mockScheduleEvening.mockResolvedValue({ ids: ['eve-0'], complete: true });
}

describe('check-in background top-up', () => {
  beforeEach(() => {
    resetMocks();
  });

  it('keeps the confirmed 14-day horizon', () => {
    expect(PRE_ROLL_DAYS).toBe(14);
  });

  it('never lists the trial-ending notice among check-in identifiers', () => {
    const midday = getAllCheckInIdentifiers('unfold-midday-checkin');
    const evening = getAllCheckInIdentifiers('unfold-evening-winddown');
    expect(midday.some((id) => id.includes('trial-ending'))).toBe(false);
    expect(evening.some((id) => id.includes('trial-ending'))).toBe(false);
    expect(midday).toHaveLength(PRE_ROLL_DAYS + 1 + 7 + 1);
  });

  it('does not touch the OS queue in a recovery session', async () => {
    mockState.recovery = true;
    await expect(runCheckInBackgroundTopup()).resolves.toBe(
      BackgroundFetch.BackgroundFetchResult.NoData,
    );
    expect(mockScheduleMidday).not.toHaveBeenCalled();
    expect(mockCancelMidday).not.toHaveBeenCalled();
    expect(mockCancelEvening).not.toHaveBeenCalled();
  });

  it('does not touch the OS queue while a local reset is in flight', async () => {
    mockState.reset = true;
    await expect(runCheckInBackgroundTopup()).resolves.toBe(
      BackgroundFetch.BackgroundFetchResult.NoData,
    );
    expect(mockScheduleMidday).not.toHaveBeenCalled();
    expect(mockCancelMidday).not.toHaveBeenCalled();
  });

  it('does not recreate check-ins when a reset starts during the RevenueCat read', async () => {
    mockState.resetDuringCustomerInfo = true;
    await expect(runCheckInBackgroundTopup()).resolves.toBe(
      BackgroundFetch.BackgroundFetchResult.NoData,
    );
    expect(mockGetCustomerInfo).toHaveBeenCalled();
    expect(mockUpdateUser).not.toHaveBeenCalled();
    expect(mockScheduleMidday).not.toHaveBeenCalled();
    expect(mockCancelMidday).not.toHaveBeenCalled();
    expect(mockCancelEvening).not.toHaveBeenCalled();
  });

  it('defers when the store has not hydrated', async () => {
    mockState.hydrated = false;
    setCheckInBackgroundHydrationWaitForTests(0);
    try {
      await expect(runCheckInBackgroundTopup()).resolves.toBe(
        BackgroundFetch.BackgroundFetchResult.NoData,
      );
      expect(mockScheduleMidday).not.toHaveBeenCalled();
      expect(mockCancelMidday).not.toHaveBeenCalled();
    } finally {
      resetCheckInBackgroundHydrationWaitForTests();
    }
  });

  it('defers without cancelling when RevenueCat has not answered', async () => {
    mockState.customerInfo = { ok: false, reason: 'sdk_error' };
    await expect(runCheckInBackgroundTopup()).resolves.toBe(
      BackgroundFetch.BackgroundFetchResult.NoData,
    );
    expect(mockScheduleMidday).not.toHaveBeenCalled();
    expect(mockCancelMidday).not.toHaveBeenCalled();
    expect(mockCancelEvening).not.toHaveBeenCalled();
    expect(mockSetRevenueCatResolved).not.toHaveBeenCalled();
  });

  it('resolves premium from RevenueCat and refills through the shared scheduler', async () => {
    const result = await runCheckInBackgroundTopup();
    expect(mockUpdateUser).toHaveBeenCalledWith({ isPremium: true });
    expect(mockSetRevenueCatResolved).toHaveBeenCalled();
    expect(mockScheduleMidday).toHaveBeenCalledTimes(1);
    expect(mockScheduleEvening).toHaveBeenCalledTimes(1);
    expect(mockCancelMidday).not.toHaveBeenCalled();
    expect(result).toBe(BackgroundFetch.BackgroundFetchResult.NewData);
  });

  it('cancels check-ins only when RevenueCat denies premium', async () => {
    mockState.customerInfo = {
      ok: true,
      data: { entitlements: { active: {} } },
    };
    const result = await runCheckInBackgroundTopup();
    expect(mockUpdateUser).toHaveBeenCalledWith({ isPremium: false });
    expect(result).toBe(BackgroundFetch.BackgroundFetchResult.NewData);
    expect(mockCancelMidday).toHaveBeenCalled();
    expect(mockCancelEvening).toHaveBeenCalled();
    expect(mockScheduleMidday).not.toHaveBeenCalled();
  });

  it('skips a same-day refill after a successful write', async () => {
    await runCheckInBackgroundTopup();
    mockScheduleMidday.mockClear();
    mockScheduleEvening.mockClear();
    const second = await runCheckInBackgroundTopup();
    expect(second).toBe(BackgroundFetch.BackgroundFetchResult.NoData);
    expect(mockScheduleMidday).not.toHaveBeenCalled();
  });

  it('marks RevenueCat resolved without a network read when the SDK is unused', async () => {
    mockState.revenueCatEnabled = false;
    await expect(prepareCheckInBackgroundPremium()).resolves.toBe(true);
    expect(mockSetRevenueCatResolved).toHaveBeenCalled();
  });
});

describe('check-in background task registration', () => {
  it('registers the BGAppRefresh task on the existing fetch path', async () => {
    const BackgroundFetch = require('expo-background-fetch') as {
      registerTaskAsync: jest.Mock;
    };
    const { CHECK_IN_BACKGROUND_TASK, registerCheckInBackgroundTopup } = require('../check-in-background-task') as {
      CHECK_IN_BACKGROUND_TASK: string;
      registerCheckInBackgroundTopup: () => Promise<void>;
    };
    await registerCheckInBackgroundTopup();
    expect(CHECK_IN_BACKGROUND_TASK).toBe('unfold-check-in-topup');
    expect(BackgroundFetch.registerTaskAsync).toHaveBeenCalledWith(
      'unfold-check-in-topup',
      expect.objectContaining({
        minimumInterval: 60 * 60,
        stopOnTerminate: false,
        startOnBoot: true,
      }),
    );
  });
});
