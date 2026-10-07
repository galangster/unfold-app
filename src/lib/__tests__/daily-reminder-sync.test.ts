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
const mockDeviceTimezone = { value: 'America/New_York' as string | null };
jest.mock('@/lib/device-timezone', () => ({ getDeviceTimezone: () => mockDeviceTimezone.value }));

type NativeRequest = {
  identifier: string;
  content: { title: string; body: string };
  trigger: { type: string; date?: Date };
};

const mockPending = new Map<string, NativeRequest>();
const mockPermission = { status: 'granted' };
// Holds the permission read open while a test acts in between.
const mockPermissionGate = { wait: null as Promise<void> | null };
// Mornings the native layer refuses, by fire time.
const mockRejectedMornings = new Set<number>();
const mockScheduleNotificationAsync = jest.fn(async (request: NativeRequest) => {
  if (request.trigger.date && mockRejectedMornings.has(request.trigger.date.getTime())) {
    throw new Error('native schedule failed');
  }
  mockPending.set(request.identifier, request);
  return request.identifier;
});
const mockCancelScheduledNotificationAsync = jest.fn(async (identifier: string) => {
  mockPending.delete(identifier);
});

jest.mock('expo-notifications', () => ({
  __esModule: true,
  setNotificationHandler: jest.fn(),
  getPermissionsAsync: jest.fn(async () => {
    if (mockPermissionGate.wait) await mockPermissionGate.wait;
    return mockPermission;
  }),
  requestPermissionsAsync: jest.fn(async () => mockPermission),
  scheduleNotificationAsync: (request: NativeRequest) => mockScheduleNotificationAsync(request),
  cancelScheduledNotificationAsync: (identifier: string) => mockCancelScheduledNotificationAsync(identifier),
  getAllScheduledNotificationsAsync: jest.fn(async () => [...mockPending.values()]),
  SchedulableTriggerInputTypes: { DAILY: 'daily', DATE: 'date', TIME_INTERVAL: 'timeInterval' },
}));

const mockSyncUserProfileToBackend = jest.fn(async (_user: unknown, _clientUpdatedAt?: string) => undefined);
jest.mock('@/lib/user-profile-sync', () => ({
  syncUserProfileToBackend: (user: unknown, clientUpdatedAt?: string) =>
    mockSyncUserProfileToBackend(user, clientUpdatedAt),
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
  userUpdatedAt: undefined as string | undefined,
  updateUser: (patch: Record<string, unknown>) => {
    Object.assign(mockState.user, patch);
    mockState.userUpdatedAt = new Date().toISOString();
  },
};

jest.mock('@/lib/store', () => ({
  useUnfoldStore: {
    getState: () => mockState,
    persist: { hasHydrated: () => true },
  },
}));

import { logEvent } from '../analytics';
import {
  beginDailyReminderOperation,
  commitDailyReminderSetting,
  resetDailyReminderOwnershipForTesting,
} from '../notifications';
import * as reminderContent from '../daily-reminder-content';
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

let buildSpy: jest.SpyInstance | null = null;

/** The device zone at each horizon build, in order. */
function recordZonesHorizonsWereBuiltIn(): (string | null)[] {
  const zones: (string | null)[] = [];
  const build = reminderContent.buildDailyReminderSchedule;
  buildSpy = jest.spyOn(reminderContent, 'buildDailyReminderSchedule').mockImplementation((args) => {
    zones.push(mockDeviceTimezone.value);
    return build(args);
  });
  return zones;
}

/** The device lands in Los Angeles while the first native write is pending. */
function landInLosAngelesDuringFirstWrite(): void {
  const write = mockScheduleNotificationAsync.getMockImplementation();
  mockScheduleNotificationAsync.mockImplementationOnce(async (request: NativeRequest) => {
    mockDeviceTimezone.value = 'America/Los_Angeles';
    return write!(request);
  });
}

beforeEach(() => {
  mockPending.clear();
  mockRejectedMornings.clear();
  mockDeviceTimezone.value = 'America/New_York';
  (logEvent as jest.Mock).mockClear();
  mockPermission.status = 'granted';
  mockPermissionGate.wait = null;
  mockPolicy.value = 'granted';
  mockState.userUpdatedAt = undefined;
  mockSyncUserProfileToBackend.mockReset();
  mockSyncUserProfileToBackend.mockResolvedValue(undefined);
  mockScheduleNotificationAsync.mockClear();
  mockCancelScheduledNotificationAsync.mockClear();
  resetSyncSessionFenceForTesting();
  resetDailyReminderOwnershipForTesting();
  resetDailyReminderBackgroundTopupForTests();
});

afterEach(() => {
  buildSpy?.mockRestore();
  buildSpy = null;
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

    // Every morning landed, and none of them is the one the server pushes on.
    expect(result).toEqual({ owner: 'server', complete: true, holdsNextMorning: false });
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

  it('logs one scheduling event under the owner it decided', async () => {
    seed({ lastRead: at(7, 8, 30) });

    await scheduleDailyReminderHorizon(
      '8:00 AM',
      'granted',
      captureSyncSession(),
      beginDailyReminderOperation(),
      at(7, 8, 35),
    );

    const scheduled = (logEvent as jest.Mock).mock.calls.filter(([name]) => name === 'notification_scheduled');
    expect(scheduled).toEqual([[
      'notification_scheduled',
      expect.objectContaining({ type: 'daily_reminder', owner: 'server', trigger: 'dates', count: 12 }),
    ]]);
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

  it('rebuilds the horizon in the new zone when the zone changes during a partial write', async () => {
    // The foreground hook returns on a partial write before its own zone
    // check, so the shared write must not leave the old zone's mornings.
    seed({ lastRead: at(7, 8, 30), pushRegistered: false });
    mockRejectedMornings.add(at(12, 8).getTime());
    const zones = recordZonesHorizonsWereBuiltIn();
    landInLosAngelesDuringFirstWrite();

    const result = await scheduleDailyReminderHorizon(
      '8:00 AM',
      'granted',
      captureSyncSession(),
      beginDailyReminderOperation(),
      at(8, 5),
    );

    expect(zones).toEqual(['America/New_York', 'America/Los_Angeles']);
    expect(result.complete).toBe(false);
    // One request per morning: the rebuild replaced the first write.
    expect(pendingDates()).toEqual(mornings(8, 21).filter((date) => date.getTime() !== at(12, 8).getTime()));
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

  it('refills again on a same-day wake after the device timezone changes', async () => {
    // Dated mornings are absolute instants: 08:00 in New York is 05:00 in
    // Los Angeles. A flight must not leave the old zone's mornings queued.
    seed({ lastRead: at(7, 8, 30) });
    await runDailyReminderBackgroundTopup(at(9, 5));
    mockScheduleNotificationAsync.mockClear();

    mockDeviceTimezone.value = 'America/Los_Angeles';
    await expect(runDailyReminderBackgroundTopup(at(9, 11))).resolves.toBe('written');

    expect(mockScheduleNotificationAsync).toHaveBeenCalled();
  });

  it('mirrors the next morning as held when it landed, even if a later morning failed', async () => {
    seed({ lastRead: at(7, 8, 30), pushRegistered: false });
    mockRejectedMornings.add(at(12, 8).getTime());

    // Reported as failed so the next wake retries; the queue still holds
    // tomorrow, so the server must not send its ready push as well.
    await expect(runDailyReminderBackgroundTopup(at(8, 5))).resolves.toBe('failed');
    expect(pendingDates()[0]).toEqual(at(8, 8));
    expect(mockState.user.localDailyReminderScheduled).toBe(true);

    mockRejectedMornings.clear();
    await expect(runDailyReminderBackgroundTopup(at(8, 6))).resolves.toBe('written');
    expect(pendingDates()).toEqual(mornings(8, 21));
  });

  it('mirrors the next morning as not held when it failed to land', async () => {
    seed({ lastRead: at(7, 8, 30), pushRegistered: false });
    mockState.user.localDailyReminderScheduled = true;
    mockRejectedMornings.add(at(8, 8).getTime());

    await expect(runDailyReminderBackgroundTopup(at(8, 5))).resolves.toBe('failed');

    expect(pendingDates()[0]).toEqual(at(9, 8));
    expect(mockState.user.localDailyReminderScheduled).toBe(false);
  });

  it('rebuilds the horizon in the new zone when the zone changes while the mornings are written', async () => {
    seed({ lastRead: at(7, 8, 30), pushRegistered: false });
    const zones = recordZonesHorizonsWereBuiltIn();
    landInLosAngelesDuringFirstWrite();

    await expect(runDailyReminderBackgroundTopup(at(8, 5))).resolves.toBe('written');

    expect(zones).toEqual(['America/New_York', 'America/Los_Angeles']);
    expect(pendingDates()).toEqual(mornings(8, 21));
  });

  it('writes nothing when the reader turns the reminder off during the permission read', async () => {
    seed({ lastRead: at(7, 8, 30), pushRegistered: false });
    let grantPermission!: () => void;
    mockPermissionGate.wait = new Promise<void>((resolve) => {
      grantPermission = resolve;
    });

    const refill = runDailyReminderBackgroundTopup(at(8, 5));
    await expect(
      commitDailyReminderSetting(false, '8:00 AM', mockState.updateUser),
    ).resolves.toBe(true);
    mockPermissionGate.wait = null;
    grantPermission();

    await expect(refill).resolves.toBe('skipped');
    expect(mockState.user.dailyReminderEnabled).toBe(false);
    expect(mockScheduleNotificationAsync).not.toHaveBeenCalled();
    expect(pendingDates()).toEqual([]);
  });

  it('pushes the profile when a wake changes the mirrored flag', async () => {
    // No React in a background wake, so the profile sync hook is not there
    // to ship the flag. The server reads it at send time.
    seed({ lastRead: at(7, 8, 30), pushRegistered: false });
    mockState.user.localDailyReminderScheduled = true;
    mockRejectedMornings.add(at(8, 8).getTime());

    await expect(runDailyReminderBackgroundTopup(at(8, 5))).resolves.toBe('failed');

    expect(mockSyncUserProfileToBackend).toHaveBeenCalledTimes(1);
    expect(mockSyncUserProfileToBackend).toHaveBeenCalledWith(
      expect.objectContaining({ localDailyReminderScheduled: false }),
      mockState.userUpdatedAt,
    );
  });

  it('does not push the profile when the mirrored flag is unchanged', async () => {
    seed({ lastRead: at(7, 8, 30), pushRegistered: false });
    mockState.user.localDailyReminderScheduled = true;

    await expect(runDailyReminderBackgroundTopup(at(8, 5))).resolves.toBe('written');

    expect(mockSyncUserProfileToBackend).not.toHaveBeenCalled();
  });

  it('keeps the refill outcome when the profile push fails offline', async () => {
    seed({ lastRead: at(7, 8, 30), pushRegistered: false });
    mockSyncUserProfileToBackend.mockRejectedValue(new Error('offline'));

    await expect(runDailyReminderBackgroundTopup(at(8, 5))).resolves.toBe('written');

    expect(mockSyncUserProfileToBackend).toHaveBeenCalledTimes(1);
    expect(mockState.user.localDailyReminderScheduled).toBe(true);
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
