jest.mock('react-native', () => ({
  Platform: { OS: 'ios' },
}));

const mockScheduleNotificationAsync = jest.fn(async () => 'notif-id');
const mockCancelScheduledNotificationAsync = jest.fn(async (_identifier: string) => {});
const mockGetPermissionsAsync = jest.fn(async () => ({ status: 'granted' }));
const mockRequestPermissionsAsync = jest.fn(async () => ({ status: 'granted' }));
const mockSetNotificationHandler = jest.fn();

jest.mock('expo-notifications', () => ({
  __esModule: true,
  setNotificationHandler: mockSetNotificationHandler,
  getPermissionsAsync: mockGetPermissionsAsync,
  requestPermissionsAsync: mockRequestPermissionsAsync,
  scheduleNotificationAsync: mockScheduleNotificationAsync,
  cancelScheduledNotificationAsync: mockCancelScheduledNotificationAsync,
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
    mockGetPermissionsAsync.mockClear();
    mockRequestPermissionsAsync.mockClear();
  });

  it('schedules the daily reminder with devotional routing data for tap-through', async () => {
    const { scheduleDailyReminder } = require('../notifications');

    await scheduleDailyReminder('8:00 AM');

    expect(mockScheduleNotificationAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        identifier: 'unfold-daily-reminder',
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

  it('cancelAllReminders clears daily plus all weekday check-in identifiers', async () => {
    const { cancelAllReminders } = require('../notifications');

    await cancelAllReminders();

    expect(mockCancelScheduledNotificationAsync.mock.calls.map((call) => call[0])).toEqual([
      'unfold-daily-reminder',
      'unfold-midday-checkin',
      'unfold-midday-checkin-mon',
      'unfold-midday-checkin-tue',
      'unfold-midday-checkin-wed',
      'unfold-midday-checkin-thu',
      'unfold-midday-checkin-fri',
      'unfold-midday-checkin-sat',
      'unfold-midday-checkin-sun',
      'unfold-evening-winddown',
      'unfold-evening-winddown-mon',
      'unfold-evening-winddown-tue',
      'unfold-evening-winddown-wed',
      'unfold-evening-winddown-thu',
      'unfold-evening-winddown-fri',
      'unfold-evening-winddown-sat',
      'unfold-evening-winddown-sun',
    ]);
  });
});
