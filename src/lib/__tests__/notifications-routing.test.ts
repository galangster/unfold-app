jest.mock('react-native', () => ({
  Platform: { OS: 'ios' },
}));

// notifications.ts now reads the auto-trial intent; keep MMKV out of this suite.
jest.mock('@/lib/auto-trial-intent', () => ({ readAutoTrialIntent: jest.fn(() => null) }));
// The real seed reaches the Keychain through MMKV, which has no native
// module here. The copy bags only need a stable string.
jest.mock('@/lib/copy-variation', () => ({
  copySeed: () => 'test-install',
  copyVariationFor: (date: Date) => ({ seed: 'test-install', dayIndex: 20_000 }),
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

const mockScheduleNotificationAsync = jest.fn(async () => 'notif-id');
const mockCancelScheduledNotificationAsync = jest.fn(async (_identifier: string) => {});
const mockCancelAllScheduledNotificationsAsync = jest.fn(async () => {});
const mockGetPermissionsAsync = jest.fn(async () => ({ status: 'granted' }));
const mockRequestPermissionsAsync = jest.fn(async () => ({ status: 'granted' }));
const mockSetNotificationHandler = jest.fn();

const mockGetAllScheduledNotificationsAsync = jest.fn(async () => []);

jest.mock('expo-notifications', () => ({
  __esModule: true,
  setNotificationHandler: mockSetNotificationHandler,
  getPermissionsAsync: mockGetPermissionsAsync,
  requestPermissionsAsync: mockRequestPermissionsAsync,
  scheduleNotificationAsync: mockScheduleNotificationAsync,
  cancelScheduledNotificationAsync: mockCancelScheduledNotificationAsync,
  cancelAllScheduledNotificationsAsync: mockCancelAllScheduledNotificationsAsync,
  getAllScheduledNotificationsAsync: mockGetAllScheduledNotificationsAsync,
  SchedulableTriggerInputTypes: {
    DAILY: 'daily',
    TIME_INTERVAL: 'time_interval',
  },
}));

const mockLogger = {
  log: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
};

jest.mock('@/lib/logger', () => ({ logger: mockLogger }));

const mockState = {
  currentDevotionalId: 'dev-1',
  devotionals: [
    {
      id: 'dev-1',
      title: 'Psalm Walk',
      totalDays: 7,
      currentDay: 3,
      days: [
        {
          dayNumber: 3,
          title: 'Hope',
          scriptureReference: 'Psalm 23',
          quotableLine: 'The Lord is my shepherd.',
          generatedAt: new Date('2026-04-21T07:00:00.000Z').toISOString(),
          isRead: false,
        },
      ],
    },
  ],
};

jest.mock('../store', () => ({
  useUnfoldStore: {
    getState: () => mockState,
    persist: {
      hasHydrated: () => true,
    },
  },
}));

describe('notifications routing + cancellation', () => {
  beforeEach(() => {
    mockScheduleNotificationAsync.mockClear();
    mockCancelScheduledNotificationAsync.mockClear();
    mockCancelAllScheduledNotificationsAsync.mockClear();
    mockGetAllScheduledNotificationsAsync.mockClear();
    mockGetAllScheduledNotificationsAsync.mockResolvedValue([]);
    mockGetPermissionsAsync.mockClear();
    mockRequestPermissionsAsync.mockClear();
    const { resetSyncSessionFenceForTesting } = jest.requireActual('../sync-session-fence');
    const { resetDailyReminderOwnershipForTesting } = jest.requireActual('../notifications');
    resetSyncSessionFenceForTesting();
    resetDailyReminderOwnershipForTesting();
  });

  it('schedules the daily reminder with devotional routing data for tap-through', async () => {
    const { scheduleDailyReminder } = require('../notifications');

    await scheduleDailyReminder('8:00 AM');

    expect(mockScheduleNotificationAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        identifier: 'unfold-daily-reminder:0:1',
        content: expect.objectContaining({
          sound: true,
          data: expect.objectContaining({
            type: 'devotional_ready',
            devotionalId: 'dev-1',
            dayNumber: 3,
            dayTitle: 'Hope',
            seriesTitle: 'Psalm Walk',
            totalDays: 7,
          }),
        }),
      }),
    );
  });

  it('cancelAllScheduledNotifications uses the OS-wide cancel instead of named families (full reset)', async () => {
    const { cancelAllScheduledNotifications } = require('../notifications');

    await cancelAllScheduledNotifications();

    expect(mockCancelAllScheduledNotificationsAsync).toHaveBeenCalledTimes(1);
    expect(mockCancelScheduledNotificationAsync).not.toHaveBeenCalled();
  });

  it('cancelAllReminders clears the daily reminder and every check-in identifier', async () => {
    const { cancelAllReminders, PRE_ROLL_DAYS } = require('../notifications');

    await cancelAllReminders();

    const cancelled = mockCancelScheduledNotificationAsync.mock.calls.map((call) => call[0]);

    expect(cancelled).toContain('unfold-daily-reminder');
    expect(cancelled).toContain('unfold-daily-reminder:0');
    expect(cancelled).toContain('unfold-daily-reminder:0:1');

    for (const base of ['unfold-midday-checkin', 'unfold-evening-winddown']) {
      // Every pre-rolled slot.
      for (let i = 0; i < PRE_ROLL_DAYS; i += 1) expect(cancelled).toContain(`${base}-${i}`);
      // And the retired repeating schedule, so an upgrading install does not
      // keep firing the old frozen copy alongside the new dated occurrences.
      expect(cancelled).toContain(base);
      expect(cancelled).toContain(`${base}-resume`);
      for (const day of ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']) {
        expect(cancelled).toContain(`${base}-${day}`);
      }
    }

    expect(new Set(cancelled).size).toBe(cancelled.length);
  });
});
