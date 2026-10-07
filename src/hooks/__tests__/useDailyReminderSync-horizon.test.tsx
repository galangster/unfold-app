import React from 'react';
import { AppState } from 'react-native';
import renderer, { act } from 'react-test-renderer';
import { logEvent } from '../../lib/analytics';
import { isSyncSessionCurrent, resetSyncSessionFenceForTesting } from '../../lib/sync-session-fence';
import { useDailyReminderSync } from '../useDailyReminderSync';

type MorningsWrite = { complete: boolean; holdsFirstMorning: boolean };
const mockScheduleDailyReminderMornings = jest.fn<Promise<MorningsWrite>, unknown[]>(
  async () => ({ complete: true, holdsFirstMorning: true }),
);
const mockCancelNotificationById = jest.fn<Promise<void>, unknown[]>(async () => undefined);
let mockOperation = 0;
const mockIsOriginCurrent = (session: number, origin: number) =>
  isSyncSessionCurrent(session) && origin === mockOperation;

type MockUser = {
  reminderTime: string;
  dailyReminderEnabled: boolean;
  pushRegisteredAt?: string;
  localDailyReminderScheduled?: boolean;
};

const mockStoreState = {
  user: {} as MockUser,
  devotionals: [] as unknown[],
  currentDevotionalId: 'dev-1' as string | null,
  updateUser: (updates: Record<string, unknown>) => {
    Object.assign(mockStoreState.user, updates);
  },
};

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

jest.mock('@/lib/analytics', () => ({ logEvent: jest.fn() }));

jest.mock('@/lib/logger', () => ({
  logger: { log: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

jest.mock('@/lib/notifications', () => ({
  NOTIFICATION_IDS: { DAILY_REMINDER: 'unfold-daily-reminder' },
  scheduleDailyReminderMornings: (...args: unknown[]) => mockScheduleDailyReminderMornings(...args),
  areNotificationsEnabled: async () => true,
  cancelNotificationById: (...args: unknown[]) => mockCancelNotificationById(...args),
  beginDailyReminderOperation: () => {
    mockOperation += 1;
    return mockOperation;
  },
  isDailyReminderOriginCurrent: (session: number, origin: number) => mockIsOriginCurrent(session, origin),
}));

function at(day: number, hour: number, minute = 0): Date {
  return new Date(2026, 9, day, hour, minute);
}

function mornings(from: number, to: number): Date[] {
  return Array.from({ length: to - from + 1 }, (_, index) => at(from + index, 8));
}

/** Days 1-5 read on consecutive days ending `lastRead`; currentDay is 6. */
function seed({ lastRead, daySixOnDevice, pushRegistered }: {
  lastRead: Date;
  daySixOnDevice: boolean;
  pushRegistered: boolean;
}) {
  const days: Record<string, unknown>[] = [1, 2, 3, 4, 5].map((dayNumber) => {
    const readAt = new Date(lastRead);
    readAt.setDate(readAt.getDate() - (5 - dayNumber));
    return { dayNumber, title: `Title ${dayNumber}`, isRead: true, readAt: readAt.toISOString() };
  });
  if (daySixOnDevice) days.push({ dayNumber: 6, title: 'Title 6', isRead: false });
  mockStoreState.user = {
    reminderTime: '8:00 AM',
    dailyReminderEnabled: true,
    ...(pushRegistered ? { pushRegisteredAt: '2026-09-01T00:00:00.000Z' } : {}),
  };
  mockStoreState.devotionals = [{
    id: 'dev-1',
    title: 'Psalm Walk',
    totalDays: 7,
    currentDay: 6,
    seriesStartDate: at(1, 7).toISOString(),
    days,
  }];
}

function Harness() {
  useDailyReminderSync();
  return null;
}

describe('useDailyReminderSync horizon', () => {
  let tree: renderer.ReactTestRenderer | null = null;

  beforeEach(() => {
    jest.useFakeTimers();
    resetSyncSessionFenceForTesting();
    mockOperation = 0;
    mockScheduleDailyReminderMornings.mockReset();
    mockScheduleDailyReminderMornings.mockResolvedValue({ complete: true, holdsFirstMorning: true });
    mockCancelNotificationById.mockClear();
    (logEvent as jest.Mock).mockClear();
    jest.spyOn(AppState, 'addEventListener').mockImplementation(() => ({ remove: jest.fn() }));
  });

  afterEach(async () => {
    await act(async () => {
      tree?.unmount();
    });
    tree = null;
    jest.restoreAllMocks();
    jest.useRealTimers();
  });

  async function mountAt(now: Date) {
    jest.setSystemTime(now);
    await act(async () => {
      tree = renderer.create(<Harness />);
    });
  }

  it('keeps local mornings from day+2 when the server owns the next morning', async () => {
    seed({ lastRead: at(7, 8, 30), daySixOnDevice: false, pushRegistered: true });

    await mountAt(at(7, 8, 35));

    expect(mockCancelNotificationById).not.toHaveBeenCalled();
    expect(mockScheduleDailyReminderMornings).toHaveBeenCalledTimes(1);
    const [dates, owner] = mockScheduleDailyReminderMornings.mock.calls[0];
    expect(owner).toBe('server');
    expect(dates).toEqual(mornings(9, 20));
    // The local queue does not hold tomorrow, so the server still sends
    // Day 6's ready push.
    expect(mockStoreState.user.localDailyReminderScheduled).toBe(false);
    // The write logs its own event under the owner it decided; the hook
    // adds none, so a dashboard split by owner counts this write once.
    expect(logEvent).not.toHaveBeenCalled();
  });

  it('starts the horizon tomorrow after a read before the reminder time', async () => {
    seed({ lastRead: at(7, 6, 15), daySixOnDevice: true, pushRegistered: false });

    await mountAt(at(7, 6, 30));

    expect(mockScheduleDailyReminderMornings).toHaveBeenCalledTimes(1);
    const [dates, owner] = mockScheduleDailyReminderMornings.mock.calls[0];
    expect(owner).toBe('local');
    expect(dates).toEqual(mornings(8, 20));
    expect(mockStoreState.user.localDailyReminderScheduled).toBe(true);
  });

  it('mirrors the next morning as held after a partial write that kept it, and retries', async () => {
    seed({ lastRead: at(7, 6, 15), daySixOnDevice: true, pushRegistered: false });
    mockScheduleDailyReminderMornings.mockResolvedValueOnce({ complete: false, holdsFirstMorning: true });

    await mountAt(at(7, 6, 30));

    // Tomorrow is in the queue, so the server must not push on it as well.
    expect(mockStoreState.user.localDailyReminderScheduled).toBe(true);

    // Not recorded as applied: the next foreground writes again.
    // The hook registers its foreground listener last (styling libraries
    // register their own first).
    const { calls } = (AppState.addEventListener as jest.Mock).mock;
    const listener = calls[calls.length - 1][1] as (next: string) => void;
    await act(async () => {
      listener('active');
    });
    expect(mockScheduleDailyReminderMornings).toHaveBeenCalledTimes(2);
  });

  it('mirrors the next morning as not held when it failed to land', async () => {
    seed({ lastRead: at(7, 6, 15), daySixOnDevice: true, pushRegistered: false });
    mockStoreState.user.localDailyReminderScheduled = true;
    mockScheduleDailyReminderMornings.mockResolvedValueOnce({ complete: false, holdsFirstMorning: false });

    await mountAt(at(7, 6, 30));

    expect(mockStoreState.user.localDailyReminderScheduled).toBe(false);
  });
});
