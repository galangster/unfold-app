/* eslint-disable import/first */
/**
 * The morning reading reminder as the OS queue sees it: a dated horizon,
 * never a lone one-shot and never nothing, refilled without an open.
 */

jest.mock('react-native', () => ({
  Platform: { OS: 'ios' },
}));
jest.mock('@/lib/auto-trial-intent', () => ({ readAutoTrialIntent: jest.fn(() => null) }));
jest.mock('@/lib/copy-variation', () => ({
  copySeed: () => 'test-install',
  copyVariationFor: () => ({ seed: 'test-install', dayIndex: 20_000 }),
}));
jest.mock('@/lib/trial-notification', () => ({
  readTrialCheckInSkipDate: jest.fn(() => null),
}));
jest.mock('expo-file-system/legacy', () => ({
  documentDirectory: 'file:///documents/',
  cacheDirectory: 'file:///cache/',
  deleteAsync: jest.fn(async () => undefined),
  readDirectoryAsync: jest.fn(async () => []),
}));
jest.mock('@/lib/analytics', () => ({ logEvent: jest.fn() }));
jest.mock('@/lib/logger', () => ({ logger: { log: jest.fn(), warn: jest.fn(), error: jest.fn() } }));

type NativeRequest = {
  identifier: string;
  content: { title: string; body: string };
  trigger: { type: string; date?: Date };
};

const mockPending = new Map<string, NativeRequest>();
const mockPermission = { status: 'granted' };
const mockScheduleNotificationAsync = jest.fn(async (request: NativeRequest) => {
  mockPending.set(request.identifier, request);
  return request.identifier;
});
const mockCancelScheduledNotificationAsync = jest.fn(async (identifier: string) => {
  mockPending.delete(identifier);
});

jest.mock('expo-notifications', () => ({
  __esModule: true,
  setNotificationHandler: jest.fn(),
  getPermissionsAsync: jest.fn(async () => mockPermission),
  requestPermissionsAsync: jest.fn(async () => mockPermission),
  scheduleNotificationAsync: (request: NativeRequest) => mockScheduleNotificationAsync(request),
  cancelScheduledNotificationAsync: (identifier: string) => mockCancelScheduledNotificationAsync(identifier),
  getAllScheduledNotificationsAsync: jest.fn(async () => [...mockPending.values()]),
  SchedulableTriggerInputTypes: { DAILY: 'daily', DATE: 'date', TIME_INTERVAL: 'timeInterval' },
}));

const mockPolicy = { value: 'granted' as 'granted' | 'denied' | 'unknown' };
jest.mock('@/lib/premium-state', () => ({
  getEffectivePremiumAccessPolicy: () => mockPolicy.value,
}));

type MockDay = {
  dayNumber: number;
  title: string;
  scriptureReference: string;
  quotableLine: string;
  isRead: boolean;
  readAt?: string;
};

const mockState = {
  user: {} as {
    reminderTime?: string;
    dailyReminderEnabled?: boolean;
    pushRegisteredAt?: string;
    localDailyReminderScheduled?: boolean;
  },
  devotionals: [] as {
    id: string;
    title: string;
    totalDays: number;
    currentDay: number;
    seriesStartDate: string;
    days: MockDay[];
  }[],
  currentDevotionalId: 'dev-1',
  updateUser: (patch: Record<string, unknown>) => {
    Object.assign(mockState.user, patch);
  },
};

jest.mock('@/lib/store', () => ({
  useUnfoldStore: {
    getState: () => mockState,
    persist: { hasHydrated: () => true },
  },
}));

import { beginDailyReminderOperation, resetDailyReminderOwnershipForTesting } from '../notifications';
import { captureSyncSession, resetSyncSessionFenceForTesting } from '../sync-session-fence';
import {
  resetDailyReminderBackgroundTopupForTests,
  runDailyReminderBackgroundTopup,
  scheduleDailyReminderHorizon,
} from '../daily-reminder-sync';

function at(day: number, hour: number, minute = 0): Date {
  return new Date(2026, 9, day, hour, minute);
}

function day(dayNumber: number, readAt?: Date): MockDay {
  return {
    dayNumber,
    title: `Title ${dayNumber}`,
    scriptureReference: `Psalm ${dayNumber}`,
    quotableLine: `Line ${dayNumber}`,
    isRead: Boolean(readAt),
    ...(readAt ? { readAt: readAt.toISOString() } : {}),
  };
}

/** Days 1-5 read on consecutive mornings ending `lastRead`, Day 6 next. */
function seed({
  lastRead,
  daySixOnDevice = false,
  seriesStart = at(3, 7),
  pushRegistered = true,
}: {
  lastRead: Date;
  daySixOnDevice?: boolean;
  seriesStart?: Date;
  pushRegistered?: boolean;
}) {
  const days = [1, 2, 3, 4, 5].map((n) => {
    const readAt = new Date(lastRead);
    readAt.setDate(readAt.getDate() - (5 - n));
    return day(n, readAt);
  });
  if (daySixOnDevice) days.push(day(6));
  mockState.user = {
    reminderTime: '8:00 AM',
    dailyReminderEnabled: true,
    ...(pushRegistered ? { pushRegisteredAt: '2026-09-01T00:00:00.000Z' } : {}),
  };
  mockState.devotionals = [{
    id: 'dev-1',
    title: 'Psalm Walk',
    totalDays: 7,
    currentDay: 6,
    seriesStartDate: seriesStart.toISOString(),
    days,
  }];
}

function pendingDates(): Date[] {
  return [...mockPending.values()]
    .map((request) => request.trigger.date as Date)
    .sort((a, b) => a.getTime() - b.getTime());
}

function mornings(from: number, to: number): Date[] {
  return Array.from({ length: to - from + 1 }, (_, index) => at(from + index, 8));
}

beforeEach(() => {
  mockPending.clear();
  mockPermission.status = 'granted';
  mockPolicy.value = 'granted';
  mockScheduleNotificationAsync.mockClear();
  mockCancelScheduledNotificationAsync.mockClear();
  resetSyncSessionFenceForTesting();
  resetDailyReminderOwnershipForTesting();
  resetDailyReminderBackgroundTopupForTests();
});

describe('scheduleDailyReminderHorizon', () => {
  it('keeps local mornings from day+2 when the server owns the morning the next day opens', async () => {
    // Read Day 5 at 08:30. Day 6 is generated overnight, so it is not here.
    seed({ lastRead: at(7, 8, 30) });
    const now = at(7, 8, 35);

    const result = await scheduleDailyReminderHorizon(
      '8:00 AM',
      'granted',
      captureSyncSession(),
      beginDailyReminderOperation(),
      now,
    );

    expect(result.owner).toBe('server');
    expect(result.scheduledId).not.toBeNull();
    expect(pendingDates()).toEqual(mornings(9, 20));
    for (const request of mockPending.values()) {
      expect(request.trigger.type).toBe('date');
      // Day 6 is open on every one of these mornings; the copy names it
      // without claiming content the device does not have.
      expect(request.content).toEqual(expect.objectContaining({
        title: 'Day 6 of Psalm Walk',
        body: 'Your next reading is waiting for you.',
      }));
    }
  });

  it('writes a horizon from tomorrow after a read before the reminder time, not a lone one-shot', async () => {
    // A behind reader: Day 6 landed right after the 06:15 read of Day 5.
    seed({ lastRead: at(7, 6, 15), daySixOnDevice: true, pushRegistered: false });

    const result = await scheduleDailyReminderHorizon(
      '8:00 AM',
      'granted',
      captureSyncSession(),
      beginDailyReminderOperation(),
      at(7, 6, 30),
    );

    expect(result.owner).toBe('local');
    expect(pendingDates()).toEqual(mornings(8, 20));
    expect([...mockPending.values()].some((request) => request.trigger.type === 'daily')).toBe(false);
  });

  it('gives each morning the copy for the moment it fires', async () => {
    // On schedule: Day 6 is today's reading and is already on the device.
    seed({ lastRead: at(6, 7), daySixOnDevice: true, seriesStart: at(2, 7), pushRegistered: false });

    await scheduleDailyReminderHorizon(
      '8:00 AM',
      'granted',
      captureSyncSession(),
      beginDailyReminderOperation(),
      at(7, 6),
    );

    const byDate = [...mockPending.values()].sort(
      (a, b) => (a.trigger.date as Date).getTime() - (b.trigger.date as Date).getTime(),
    );
    expect(byDate[0].trigger.date).toEqual(at(7, 8));
    expect(byDate[0].content).toEqual(expect.objectContaining({ title: 'Title 6', body: 'Line 6' }));
    // A day left unread does not keep announcing itself as today's line.
    expect(byDate[1].content).toEqual(expect.objectContaining({
      title: 'Pick up where you left off',
      body: 'Day 6 of Psalm Walk is waiting for you.',
    }));
  });
});

describe('runDailyReminderBackgroundTopup', () => {
  it('refills the horizon without an open and keeps the morning after the server push', async () => {
    // Day 5 read Wednesday. Thursday's ready push went unanswered. Friday
    // 05:00 the BGAppRefresh wake refills: Friday stays local.
    seed({ lastRead: at(7, 8, 30) });

    await expect(runDailyReminderBackgroundTopup(at(9, 5))).resolves.toBe('written');

    expect(pendingDates()).toEqual(mornings(9, 22));
    // The server's morning (Thursday) is behind us; the flag says the local
    // queue does not hold the morning the next day opens.
    expect(mockState.user.localDailyReminderScheduled).toBe(false);
  });

  it('mirrors the slot as held when the local queue owns the morning', async () => {
    seed({ lastRead: at(7, 8, 30), pushRegistered: false });

    await expect(runDailyReminderBackgroundTopup(at(8, 5))).resolves.toBe('written');

    expect(pendingDates()[0]).toEqual(at(8, 8));
    expect(mockState.user.localDailyReminderScheduled).toBe(true);
  });

  it('skips a second same-day wake after a successful refill', async () => {
    seed({ lastRead: at(7, 8, 30) });
    await runDailyReminderBackgroundTopup(at(9, 5));
    mockScheduleNotificationAsync.mockClear();
    mockCancelScheduledNotificationAsync.mockClear();

    await expect(runDailyReminderBackgroundTopup(at(9, 11))).resolves.toBe('skipped');

    expect(mockScheduleNotificationAsync).not.toHaveBeenCalled();
    expect(mockCancelScheduledNotificationAsync).not.toHaveBeenCalled();
  });

  it('leaves the queue alone while premium is unresolved', async () => {
    seed({ lastRead: at(7, 8, 30) });
    mockPolicy.value = 'unknown';

    await expect(runDailyReminderBackgroundTopup(at(9, 5))).resolves.toBe('deferred');

    expect(mockScheduleNotificationAsync).not.toHaveBeenCalled();
    expect(mockCancelScheduledNotificationAsync).not.toHaveBeenCalled();
  });

  it('leaves the queue alone when the reminder is off or permission is gone', async () => {
    seed({ lastRead: at(7, 8, 30) });
    mockState.user.dailyReminderEnabled = false;
    await expect(runDailyReminderBackgroundTopup(at(9, 5))).resolves.toBe('skipped');

    mockState.user.dailyReminderEnabled = true;
    mockPermission.status = 'denied';
    await expect(runDailyReminderBackgroundTopup(at(9, 5))).resolves.toBe('deferred');

    expect(mockScheduleNotificationAsync).not.toHaveBeenCalled();
    expect(mockCancelScheduledNotificationAsync).not.toHaveBeenCalled();
  });
});
