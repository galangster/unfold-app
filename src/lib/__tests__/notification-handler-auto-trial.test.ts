const mockReadIntent = jest.fn();
const mockGetUiState = jest.fn(() => ({ seriesRevealMountedIntentId: null as string | null }));

jest.mock('expo-notifications', () => ({
  setNotificationHandler: (config: { handleNotification: (notification: unknown) => Promise<unknown> }) => {
    (globalThis as { __autoTrialNotificationHandler?: typeof config.handleNotification })
      .__autoTrialNotificationHandler = config.handleNotification;
  },
  AndroidImportance: { MAX: 5 },
  SchedulableTriggerInputTypes: { DAILY: 'daily', WEEKLY: 'weekly', DATE: 'date' },
}));

jest.mock('../auto-trial-intent', () => ({
  readAutoTrialIntent: () => mockReadIntent(),
}));

jest.mock('../ui-state', () => ({
  useUIState: { getState: () => mockGetUiState() },
}));

jest.mock('../logger', () => ({
  logger: { log: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

jest.mock('../store', () => ({
  useUnfoldStore: { getState: () => ({ user: null, devotionals: [] }) },
}));

jest.mock('../premium-state', () => ({
  getEffectivePremiumAccessPolicy: () => 'unknown',
}));

jest.mock('../home-devotional-state', () => ({
  getCurrentDevotional: () => null,
  getDaysReadToday: () => 0,
  getHomeDevotionalDayData: () => null,
  getTodayCarryLine: () => '',
}));

jest.mock('../push-notification-helpers', () => {
  const actual = jest.requireActual('../push-notification-helpers') as typeof import('../push-notification-helpers');
  return {
    buildDevotionalReadyNotificationData: jest.fn(),
    parseHhMm: () => ({ hour: 8, minute: 0 }),
    pushNamesAutoTrialIntent: actual.pushNamesAutoTrialIntent,
  };
});

jest.mock('../daily-reminder-content', () => ({
  getDailyReminderContent: () => ({ title: 't', body: 'b' }),
}));

jest.mock('../quiet-hours', () => ({
  deferPastQuietHours: (date: Date) => date,
}));

jest.mock('../analytics', () => ({
  logEvent: jest.fn(),
}));

jest.mock('../sync-session-fence', () => ({
  captureSyncSession: () => 1,
  isSyncSessionCurrent: () => true,
}));

jest.mock('../trial-notice-plan', () => ({
  localCalendarDays: () => 0,
  parseLocalYmd: () => null,
}));

jest.mock('../trial-notification', () => ({
  readTrialCheckInSkipDate: () => null,
}));

jest.mock('@/constants/check-in-messages', () => ({
  getEveningWindDownBody: () => '',
  getMiddayCheckInBody: () => '',
}));

import '../notifications';

function handler() {
  const fn = (globalThis as { __autoTrialNotificationHandler?: (n: unknown) => Promise<{
    shouldShowBanner: boolean;
    shouldShowAlert: boolean;
    shouldShowList: boolean;
  }> }).__autoTrialNotificationHandler;
  if (!fn) throw new Error('notification handler was not registered');
  return fn;
}

function push(type: string, extras: Record<string, unknown> = {}) {
  return {
    request: {
      content: {
        title: 'Ready',
        data: { type, ...extras },
      },
    },
  };
}

describe('H11 foreground handler', () => {
  beforeEach(() => {
    mockReadIntent.mockReturnValue({
      intentId: 'intent-1',
      status: 'submitted',
      jobId: 'job-auto',
      devotionalId: 'dev-auto',
    });
    mockGetUiState.mockReturnValue({ seriesRevealMountedIntentId: 'intent-1' });
  });

  it('hides a matching auto-trial push while S1 is mounted', async () => {
    const ready = await handler()(push('devotional_ready', { jobId: 'job-auto', devotionalId: 'dev-auto' }));
    expect(ready.shouldShowBanner).toBe(false);
    expect(ready.shouldShowAlert).toBe(false);
    expect(ready.shouldShowList).toBe(false);

    const failed = await handler()(push('generation_failed', { jobId: 'job-auto' }));
    expect(failed.shouldShowBanner).toBe(false);
  });

  it('shows other pushes and shows a matching push when S1 is not mounted', async () => {
    const other = await handler()(push('midday-checkin'));
    expect(other.shouldShowBanner).toBe(true);
    expect(other.shouldShowAlert).toBe(true);
    expect(other.shouldShowList).toBe(true);

    mockGetUiState.mockReturnValue({ seriesRevealMountedIntentId: null });
    const ready = await handler()(push('devotional_ready', { jobId: 'job-auto' }));
    expect(ready.shouldShowBanner).toBe(true);
  });
});
