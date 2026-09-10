import React from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import renderer, { act } from 'react-test-renderer';
import {
  beginLocalResetSession,
  endLocalResetSession,
  isSyncSessionCurrent,
  resetSyncSessionFenceForTesting,
} from '../../lib/sync-session-fence';
import { useDailyReminderSync } from '../useDailyReminderSync';

const mockScheduleDailyReminder = jest.fn<Promise<string | null>, unknown[]>(
  async () => null,
);
const mockAreNotificationsEnabled = jest.fn(async () => true);
const mockCancelNotificationById = jest.fn<Promise<void>, unknown[]>(
  async () => undefined,
);
const mockBeginDailyReminderOperation = jest.fn(() => {
  mockOperation += 1;
  return mockOperation;
});
const mockIsDailyReminderOriginCurrent = jest.fn(
  (session: number, origin: number) =>
    isSyncSessionCurrent(session) && origin === mockOperation,
);

const mockStoreState = {
  user: { reminderTime: '8:00 AM', dailyReminderEnabled: true } as {
    reminderTime: string;
    dailyReminderEnabled: boolean;
    localDailyReminderScheduled?: boolean;
  },
  devotionals: [] as { id: string }[],
  currentDevotionalId: null as string | null,
  updateUser: (updates: Record<string, unknown>) => {
    Object.assign(mockStoreState.user, updates);
  },
};

let mockOperation = 0;
let emitAppState: ((next: AppStateStatus) => void) | null = null;

jest.mock('@/lib/store', () => ({
  useUnfoldStore: Object.assign(
    (selector: (state: typeof mockStoreState) => unknown) => selector(mockStoreState),
    { getState: () => mockStoreState },
  ),
  useHasHydrated: () => true,
}));

jest.mock('@/hooks/usePremiumAccessPolicy', () => ({
  usePremiumAccessPolicy: () => 'denied',
}));

jest.mock('@/lib/daily-reminder-content', () => ({
  buildDailyReminderFingerprint: () => 'unchanged-fingerprint',
  getDailyReminderOwner: () => 'local',
  getDailyReminderTrigger: () => ({ kind: 'daily' }),
}));

jest.mock('@/lib/analytics', () => ({ logEvent: jest.fn() }));

jest.mock('@/lib/logger', () => ({
  logger: { log: jest.fn(), error: jest.fn() },
}));

jest.mock('@/lib/notifications', () => ({
  NOTIFICATION_IDS: { DAILY_REMINDER: 'unfold-daily-reminder' },
  scheduleDailyReminder: (...args: unknown[]) => mockScheduleDailyReminder(...args),
  areNotificationsEnabled: () => mockAreNotificationsEnabled(),
  cancelNotificationById: (...args: unknown[]) => mockCancelNotificationById(...args),
  beginDailyReminderOperation: () => mockBeginDailyReminderOperation(),
  isDailyReminderOriginCurrent: (session: number, origin: number) =>
    mockIsDailyReminderOriginCurrent(session, origin),
}));

function hold<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((next) => {
    resolve = next;
  });
  return { promise, resolve };
}

function installSchedule() {
  const started: ReturnType<typeof hold<void>>[] = [];
  const gates: ReturnType<typeof hold<string | null>>[] = [];

  function ensure(index: number) {
    started[index] ??= hold<void>();
    gates[index] ??= hold<string | null>();
  }

  mockScheduleDailyReminder.mockImplementation(async () => {
    const index = mockScheduleDailyReminder.mock.calls.length - 1;
    ensure(index);
    started[index].resolve();
    return gates[index].promise;
  });

  return {
    started(index: number) {
      ensure(index);
      return started[index].promise;
    },
    release(index: number, value: string | null) {
      ensure(index);
      gates[index].resolve(value);
    },
  };
}

function Harness() {
  useDailyReminderSync();
  return null;
}

describe('useDailyReminderSync schedule failure', () => {
  let tree: renderer.ReactTestRenderer | null = null;

  beforeEach(() => {
    jest.useFakeTimers();
    resetSyncSessionFenceForTesting();
    mockOperation = 0;
    emitAppState = null;
    mockStoreState.user.dailyReminderEnabled = true;
    mockStoreState.user.reminderTime = '8:00 AM';
    mockScheduleDailyReminder.mockReset();
    mockAreNotificationsEnabled.mockReset();
    mockCancelNotificationById.mockReset();
    mockBeginDailyReminderOperation.mockClear();
    mockIsDailyReminderOriginCurrent.mockClear();
    mockAreNotificationsEnabled.mockResolvedValue(true);
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

  async function mountHook() {
    await act(async () => {
      tree = renderer.create(<Harness />);
    });
  }

  async function settleSchedule(index: number, value: string | null, schedule: ReturnType<typeof installSchedule>) {
    await schedule.started(index);
    await act(async () => {
      schedule.release(index, value);
      await mockScheduleDailyReminder.mock.results[index].value;
    });
  }

  async function becomeActive() {
    await act(async () => {
      if (!emitAppState) throw new Error('AppState listener was not registered');
      emitAppState('active');
    });
  }

  it('retries on the next foreground after a failed schedule', async () => {
    const schedule = installSchedule();
    await mountHook();
    await settleSchedule(0, null, schedule);

    expect(mockScheduleDailyReminder).toHaveBeenCalledTimes(1);
    expect(mockAreNotificationsEnabled).toHaveBeenCalledTimes(1);

    await becomeActive();
    await settleSchedule(1, 'retry-request', schedule);

    expect(mockScheduleDailyReminder).toHaveBeenCalledTimes(2);
    expect(mockAreNotificationsEnabled).toHaveBeenCalledTimes(2);
  });

  it('skips a successful same-day foreground reconciliation', async () => {
    const schedule = installSchedule();
    await mountHook();
    await settleSchedule(0, 'first-request', schedule);

    expect(mockScheduleDailyReminder).toHaveBeenCalledTimes(1);

    await becomeActive();

    expect(mockScheduleDailyReminder).toHaveBeenCalledTimes(1);
    expect(mockAreNotificationsEnabled).toHaveBeenCalledTimes(1);
  });

  it.each([
    {
      kind: 'operation',
      invalidate: () => {
        mockBeginDailyReminderOperation();
      },
    },
    {
      kind: 'reset session',
      invalidate: () => {
        const token = beginLocalResetSession();
        endLocalResetSession(token);
      },
    },
  ])('does not record a pending schedule after $kind invalidation', async ({ invalidate }) => {
    const schedule = installSchedule();
    await mountHook();
    await schedule.started(0);

    invalidate();

    await act(async () => {
      schedule.release(0, 'stale-request');
      await mockScheduleDailyReminder.mock.results[0].value;
    });

    expect(mockScheduleDailyReminder).toHaveBeenCalledTimes(1);
    expect(mockAreNotificationsEnabled).toHaveBeenCalledTimes(1);

    await becomeActive();
    await settleSchedule(1, 'fresh-request', schedule);

    expect(mockScheduleDailyReminder).toHaveBeenCalledTimes(2);
    expect(mockAreNotificationsEnabled).toHaveBeenCalledTimes(2);
  });
});
