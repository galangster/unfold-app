/**
 * One banner per moment at midday.
 *
 * A tester got two banners at the same instant: the act reminder for a
 * midday act (which opens the act) and the midday check-in (which opens the
 * life update). Both read `middayCheckInTime`, so
 * every midday act on a check-in day collided. The evening already had a
 * guard (#142); midday did not. Today's midday check-in now steps aside for
 * a midday act, the way it steps aside for the trial notice.
 */

import { buildActReminderPlan } from '@/lib/act-reminder';
import type { Devotional, DevotionalDay } from '@/lib/store';

jest.mock('react-native', () => ({ Platform: { OS: 'ios', select: (o: Record<string, unknown>) => o.ios } }));
jest.mock('expo-notifications', () => ({
  __esModule: true,
  setNotificationHandler: jest.fn(),
  getPermissionsAsync: jest.fn(async () => ({ status: 'granted' })),
  scheduleNotificationAsync: jest.fn(async ({ identifier }: { identifier: string }) => identifier),
  cancelScheduledNotificationAsync: jest.fn(async () => undefined),
  getAllScheduledNotificationsAsync: jest.fn(async () => []),
  setNotificationCategoryAsync: jest.fn(async () => undefined),
  SchedulableTriggerInputTypes: { DATE: 'date', DAILY: 'daily', TIME_INTERVAL: 'time_interval' },
}));
jest.mock('@/lib/logger', () => ({ logger: { log: jest.fn(), warn: jest.fn(), error: jest.fn() } }));
jest.mock('@/lib/analytics', () => ({ logEvent: jest.fn() }));
jest.mock('@/lib/auto-trial-intent', () => ({ readAutoTrialIntent: jest.fn(() => null) }));
jest.mock('@/lib/trial-notification', () => ({ readTrialCheckInSkipDate: jest.fn(() => null) }));
jest.mock('@/lib/copy-variation', () => ({
  copySeed: () => 'test-install',
  readCarriedCues: () => ({}),
  cueCarriedBefore: () => undefined,
  rememberCarriedCues: () => undefined,
}));
jest.mock('@/lib/premium-state', () => ({
  getEffectivePremiumAccessPolicy: () => 'granted',
}));
jest.mock('../store', () => ({
  useUnfoldStore: { getState: () => mockState.store, persist: { hasHydrated: () => true } },
}));

// A Tuesday at 09:15 local time; the day was read at 07:40.
const now = new Date(2026, 8, 8, 9, 15, 0);
const middayToday = new Date(2026, 8, 8, 12, 30, 0);

function day(overrides: Partial<DevotionalDay> = {}): DevotionalDay {
  return {
    dayNumber: 3,
    title: 'Steady Ground',
    scriptureReference: 'Psalm 46:1-3',
    scriptureText: '',
    bodyText: '',
    quotableLine: '',
    isRead: true,
    readAt: new Date(2026, 8, 8, 7, 40, 0).toISOString(),
    act: 'At lunch, text the friend you thought of.',
    actSlot: 'midday',
    ...overrides,
  };
}

function devotional(days: DevotionalDay[]): Devotional {
  return {
    id: 'dev-1',
    title: 'A Test Series',
    totalDays: 7,
    currentDay: 4,
    days,
    createdAt: '',
    userContext: { name: '', aboutMe: '', currentSituation: '', emotionalState: '' },
    generationMode: 'progressive',
  } as Devotional;
}

const mockState = {
  store: {
    devotionals: [] as Devotional[],
    currentDevotionalId: 'dev-1' as string | null,
    user: { hasCompletedOnboarding: true, dailyReminderEnabled: true, reminderTime: '8:00 AM' } as Record<string, unknown> | null,
    middayCheckInEnabled: true,
    eveningWindDownEnabled: true,
    middayCheckInTime: '12:30',
    middayCheckInByDay: null as Record<string, string | null> | null,
    eveningWindDownTime: '20:30',
    eveningWindDownByDay: null as Record<string, string | null> | null,
  },
};

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { scheduleMiddayCheckIn } = require('../notifications');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { readCheckInFingerprint } = require('../check-in-notification-sync');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const mockScheduleNotificationAsync = require('expo-notifications').scheduleNotificationAsync as jest.Mock;

function middayFireTimes(): number[] {
  return mockScheduleNotificationAsync.mock.calls.map(([request]) => (request.trigger.date as Date).getTime());
}

function actPlanFor(today: DevotionalDay) {
  return buildActReminderPlan({
    devotional: devotional([today]),
    day: today,
    now,
    middayTime: mockState.store.middayCheckInTime,
    eveningTime: mockState.store.eveningWindDownTime,
    eveningWindDownEnabled: true,
    notificationsEnabled: true,
    premiumPolicy: 'granted',
    morningTime: '8:00 AM',
  });
}

describe('midday check-in and a midday act reminder', () => {
  beforeEach(() => {
    mockScheduleNotificationAsync.mockClear();
    mockState.store.middayCheckInTime = '12:30';
    mockState.store.middayCheckInByDay = null;
    mockState.store.user = { hasCompletedOnboarding: true, dailyReminderEnabled: true, reminderTime: '8:00 AM' };
  });

  it('leaves out only today\'s check-in at the instant the act reminder fires', async () => {
    const today = day();
    mockState.store.devotionals = [devotional([today])];

    expect(actPlanFor(today)?.fireAt.getTime()).toBe(middayToday.getTime());

    const result = await scheduleMiddayCheckIn({ localDate: null, now });

    expect(result.complete).toBe(true);
    expect(middayFireTimes()).not.toContain(middayToday.getTime());
    // Tomorrow's check-in stays.
    expect(middayFireTimes()).toContain(new Date(2026, 8, 9, 12, 30, 0).getTime());
  });

  it('keeps today\'s check-in when the act names the evening', async () => {
    mockState.store.devotionals = [devotional([day({ act: 'Tonight, write one line of thanks.', actSlot: 'evening' })])];

    await scheduleMiddayCheckIn({ localDate: null, now });

    expect(middayFireTimes()).toContain(middayToday.getTime());
  });

  it('keeps today\'s check-in once the act is done', async () => {
    mockState.store.devotionals = [devotional([day({ actOutcome: 'done' })])];

    await scheduleMiddayCheckIn({ localDate: null, now });

    expect(middayFireTimes()).toContain(middayToday.getTime());
  });

  it('keeps today\'s check-in when reminders are off, because no act reminder is written', async () => {
    mockState.store.devotionals = [devotional([day()])];
    mockState.store.user = { hasCompletedOnboarding: true, dailyReminderEnabled: false, reminderTime: '8:00 AM' };

    await scheduleMiddayCheckIn({ localDate: null, now });

    expect(middayFireTimes()).toContain(middayToday.getTime());
  });

  it('keeps today\'s check-in when its weekday time differs from the act\'s clock', async () => {
    mockState.store.devotionals = [devotional([day()])];
    mockState.store.middayCheckInByDay = { Mon: '12:30', Tue: '14:00', Wed: '12:30', Thu: '12:30', Fri: '12:30', Sat: '12:30', Sun: '12:30' };

    await scheduleMiddayCheckIn({ localDate: null, now });

    expect(middayFireTimes()).toContain(new Date(2026, 8, 8, 14, 0, 0).getTime());
  });

  it('rewrites the check-in queue when the claim appears and when the act is done', () => {
    jest.useFakeTimers({ now });
    try {
      mockState.store.devotionals = [devotional([day({ isRead: false, readAt: undefined })])];
      const unread = readCheckInFingerprint();
      mockState.store.devotionals = [devotional([day()])];
      const read = readCheckInFingerprint();
      mockState.store.devotionals = [devotional([day({ actOutcome: 'done' })])];
      const done = readCheckInFingerprint();

      expect(read).not.toBe(unread);
      expect(done).not.toBe(read);
    } finally {
      jest.useRealTimers();
    }
  });
});
