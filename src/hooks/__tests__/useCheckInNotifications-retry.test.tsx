import React from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import renderer, { act } from 'react-test-renderer';
import { useCheckInNotifications } from '../useCheckInNotifications';

const mockScheduleMidday = jest.fn<Promise<{ ids: string[]; complete: boolean }>, unknown[]>();
const mockScheduleEvening = jest.fn<Promise<{ ids: string[]; complete: boolean }>, unknown[]>();
const mockCancelMidday = jest.fn(async () => undefined);
const mockCancelEvening = jest.fn(async () => undefined);
const mockAreNotificationsEnabled = jest.fn(async () => true);

const mockStoreState = {
  user: { hasCompletedOnboarding: true },
  middayCheckInEnabled: true,
  eveningWindDownEnabled: true,
  middayCheckInTime: '12:30',
  eveningWindDownTime: '20:30',
  middayCheckInByDay: null as Record<string, string | null> | null,
  eveningWindDownByDay: null as Record<string, string | null> | null,
  devotionals: [] as { id: string }[],
  currentDevotionalId: null as string | null,
};

let emitAppState: ((next: AppStateStatus) => void) | null = null;

jest.mock('@/lib/store', () => ({
  useUnfoldStore: Object.assign(
    (selector: (state: typeof mockStoreState) => unknown) => selector(mockStoreState),
    { getState: () => mockStoreState },
  ),
  useHasHydrated: () => true,
}));

jest.mock('@/hooks/usePremiumAccessPolicy', () => ({
  usePremiumAccessPolicy: () => 'granted',
}));

jest.mock('@/lib/premium-state', () => ({
  getEffectivePremiumAccessPolicy: () => 'granted',
}));

jest.mock('@/lib/home-devotional-state', () => ({
  getTodayCarryLine: () => '',
}));

jest.mock('@/lib/device-timezone', () => ({
  getDeviceTimezone: () => 'Pacific/Honolulu',
}));

jest.mock('@/lib/ui-state', () => ({
  useUIState: (selector: (state: { notificationPermissionEpoch: number; trialNoticeEpoch: number }) => unknown) =>
    selector({ notificationPermissionEpoch: 0, trialNoticeEpoch: 0 }),
}));

jest.mock('@/lib/trial-notification', () => ({
  readTrialCheckInSkipDate: () => null,
}));

jest.mock('@/lib/logger', () => ({
  logger: { log: jest.fn(), error: jest.fn() },
}));

jest.mock('@/lib/notifications', () => ({
  scheduleMiddayCheckIn: (...args: unknown[]) => mockScheduleMidday(...args),
  scheduleEveningWindDown: (...args: unknown[]) => mockScheduleEvening(...args),
  cancelMiddayCheckIn: () => mockCancelMidday(),
  cancelEveningWindDown: () => mockCancelEvening(),
  areNotificationsEnabled: () => mockAreNotificationsEnabled(),
}));

function Harness() {
  useCheckInNotifications();
  return null;
}

function completeWrite(ids: string[]) {
  return { ids, complete: true };
}

function incompleteWrite() {
  return { ids: ['partial'], complete: false };
}

describe('useCheckInNotifications incomplete-write retry', () => {
  let tree: renderer.ReactTestRenderer | null = null;

  beforeEach(() => {
    jest.useFakeTimers();
    emitAppState = null;
    mockStoreState.middayCheckInEnabled = true;
    mockStoreState.eveningWindDownEnabled = true;
    mockScheduleMidday.mockReset();
    mockScheduleEvening.mockReset();
    mockCancelMidday.mockReset();
    mockCancelEvening.mockReset();
    mockAreNotificationsEnabled.mockReset();
    mockAreNotificationsEnabled.mockResolvedValue(true);
    mockScheduleMidday.mockResolvedValue(completeWrite(['midday']));
    mockScheduleEvening.mockResolvedValue(completeWrite(['evening']));
    mockCancelMidday.mockResolvedValue(undefined);
    mockCancelEvening.mockResolvedValue(undefined);
    jest.spyOn(AppState, 'addEventListener').mockImplementation((_event, listener) => {
      emitAppState = listener;
      return { remove: jest.fn() };
    });
  });

  afterEach(async () => {
    await act(async () => {
      tree?.unmount();
    });
    tree = null;
    jest.restoreAllMocks();
    jest.useRealTimers();
  });

  async function flushScheduled() {
    await act(async () => {
      await Promise.all(
        [...mockScheduleMidday.mock.results, ...mockScheduleEvening.mock.results, ...mockCancelMidday.mock.results]
          .map((result) => Promise.resolve(result.value).catch(() => undefined)),
      );
    });
  }

  async function mountHook() {
    await act(async () => {
      tree = renderer.create(<Harness />);
    });
    await flushScheduled();
    await act(async () => {
      jest.advanceTimersByTime(500);
    });
    await flushScheduled();
  }

  async function flushFingerprint() {
    await act(async () => {
      tree?.update(<Harness />);
    });
    await act(async () => {
      await jest.advanceTimersByTimeAsync(500);
    });
    await flushScheduled();
  }

  it('retries after a partial schedule when the same-day fingerprint reverts', async () => {
    await mountHook();

    const middayAfterMount = mockScheduleMidday.mock.calls.length;
    const eveningAfterMount = mockScheduleEvening.mock.calls.length;
    expect(middayAfterMount).toBeGreaterThanOrEqual(1);
    expect(eveningAfterMount).toBeGreaterThanOrEqual(1);

    mockStoreState.middayCheckInEnabled = false;
    mockScheduleEvening.mockResolvedValueOnce(incompleteWrite());
    await flushFingerprint();

    expect(mockCancelMidday).toHaveBeenCalled();
    expect(mockScheduleEvening.mock.calls.length).toBe(eveningAfterMount + 1);

    mockStoreState.middayCheckInEnabled = true;
    await flushFingerprint();

    expect(mockScheduleMidday.mock.calls.length).toBe(middayAfterMount + 1);
    expect(mockScheduleEvening.mock.calls.length).toBe(eveningAfterMount + 2);
  });

  it('skips a successful same-day foreground once the queue is complete', async () => {
    await mountHook();
    expect(mockScheduleMidday).toHaveBeenCalledTimes(1);

    await act(async () => {
      if (!emitAppState) throw new Error('AppState listener was not registered');
      emitAppState('active');
    });

    expect(mockScheduleMidday).toHaveBeenCalledTimes(1);
    expect(mockScheduleEvening).toHaveBeenCalledTimes(1);
  });
});
