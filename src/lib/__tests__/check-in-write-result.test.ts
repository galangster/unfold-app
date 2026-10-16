/**
 * The write-completeness contract.
 *
 * Pre-rolling raised the stakes on a failed write. Each sync cancels the
 * slot's entire identifier space and then rewrites it, so a run that cancels
 * and then fails leaves ZERO pending notifications where the old repeating
 * trigger would have left one stale-but-live one. `complete` is what stops
 * useCheckInNotifications recording such a run as synced.
 */

import { CHECK_IN_TAP_CUES, getMiddayCheckInCopy } from '@/constants/check-in-messages';
import { dayIndexFor } from '@/lib/variation-bag';

jest.mock('react-native', () => ({ Platform: { OS: 'ios', select: (o: Record<string, unknown>) => o.ios } }));
jest.mock('expo-notifications', () => ({
  __esModule: true,
  setNotificationHandler: jest.fn(),
  getPermissionsAsync: jest.fn(async () => ({ status: 'granted' })),
  requestPermissionsAsync: jest.fn(async () => ({ status: 'granted' })),
  scheduleNotificationAsync: jest.fn(async ({ identifier }: { identifier: string }) => identifier),
  cancelScheduledNotificationAsync: jest.fn(async () => undefined),
  cancelAllScheduledNotificationsAsync: jest.fn(async () => undefined),
  getAllScheduledNotificationsAsync: jest.fn(async () => []),
  setNotificationCategoryAsync: jest.fn(async () => undefined),
  SchedulableTriggerInputTypes: { DATE: 'date', DAILY: 'daily', TIME_INTERVAL: 'time_interval' },
}));
jest.mock('@/lib/logger', () => ({ logger: { log: jest.fn(), warn: jest.fn(), error: jest.fn() } }));
jest.mock('@/lib/analytics', () => ({ logEvent: jest.fn() }));
jest.mock('@/lib/auto-trial-intent', () => ({ readAutoTrialIntent: jest.fn(() => null) }));
jest.mock('@/lib/trial-notification', () => ({ readTrialCheckInSkipDate: jest.fn(() => null) }));
// The copy memory, held in this suite instead of MMKV: the cues each slot's
// fire dates carried, as the real module keeps them.
const mockCarriedCues: Record<string, Record<string, string>> = {};
jest.mock('@/lib/copy-variation', () => ({
  copySeed: () => 'test-install',
  readCarriedCues: (slotId: string) => ({ ...(mockCarriedCues[slotId] ?? {}) }),
  cueCarriedBefore: (cues: Record<string, string>, dayIndex: number) => {
    const before = Object.keys(cues).map(Number).filter((day) => day < dayIndex);
    return before.length > 0 ? cues[String(Math.max(...before))] : undefined;
  },
  rememberCarriedCues: (slotId: string, _previous: unknown, written: { dayIndex: number; cue?: string }[]) => {
    mockCarriedCues[slotId] = Object.fromEntries(written.map(({ dayIndex, cue }) => [String(dayIndex), cue ?? '']));
  },
}));
jest.mock('@/lib/premium-state', () => ({
  getEffectivePremiumAccessPolicy: () => mockState.policy,
}));
jest.mock('../store', () => ({
  useUnfoldStore: { getState: () => mockState.store, persist: { hasHydrated: () => true } },
}));

// One mutable holder the hoisted factories close over. Read inside the getters
// above, so nothing is touched before jest finishes hoisting.
const mockState = {
  policy: 'granted',
  store: {
    devotionals: [],
    currentDevotionalId: null,
    middayCheckInTime: '12:30',
    middayCheckInByDay: null as Record<string, string | null> | null,
    eveningWindDownTime: '20:30',
    eveningWindDownByDay: null as Record<string, string | null> | null,
  },
};

// Required inside the suite rather than imported at the top: an ES import is
// hoisted above `mockState`, so the module under test would pull the store
// mock while that const is still in the temporal dead zone. The neighbouring
// notifications-routing.test.ts does the same for the same reason.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { scheduleMiddayCheckIn, PRE_ROLL_DAYS, NOTIFICATION_IDS } = require('../notifications');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const mockScheduleNotificationAsync = require('expo-notifications')
  .scheduleNotificationAsync as jest.Mock;

describe('scheduleMiddayCheckIn — write completeness', () => {
  beforeEach(() => {
    mockScheduleNotificationAsync.mockClear();
    mockScheduleNotificationAsync.mockImplementation(
      async ({ identifier }: { identifier: string }) => identifier,
    );
    mockState.policy = 'granted';
    mockState.store.middayCheckInByDay = null;
  });

  it('reports complete when every occurrence is written', async () => {
    const result = await scheduleMiddayCheckIn();
    expect(result.complete).toBe(true);
    expect(result.ids.length).toBeGreaterThan(0);
    expect(result.ids.length).toBeLessThanOrEqual(PRE_ROLL_DAYS);
  });

  it('reports INCOMPLETE when one occurrence fails, and keeps the rest', async () => {
    let call = 0;
    mockScheduleNotificationAsync.mockImplementation(async ({ identifier }) => {
      call += 1;
      if (call === 3) throw new Error('OS queue full');
      return identifier;
    });

    const result = await scheduleMiddayCheckIn();

    // One failure must not discard the other thirteen.
    expect(result.complete).toBe(false);
    expect(result.ids.length).toBeGreaterThan(1);
    expect(result.ids).not.toContain(null);
  });

  it('reports complete for an intended no-op, so a refusal is not retried forever', async () => {
    mockState.policy = 'denied';
    const denied = await scheduleMiddayCheckIn();
    expect(denied).toEqual({ ids: [], complete: true });
    expect(mockScheduleNotificationAsync).not.toHaveBeenCalled();

    mockState.policy = 'granted';
    mockState.store.middayCheckInByDay = { Mon: null, Tue: null, Wed: null, Thu: null, Fri: null, Sat: null, Sun: null };
    const allOff = await scheduleMiddayCheckIn();
    expect(allOff).toEqual({ ids: [], complete: true });
  });

  it('writes every occurrence as a one-shot DATE trigger in the future', async () => {
    await scheduleMiddayCheckIn();
    const calls = mockScheduleNotificationAsync.mock.calls.map((c) => c[0] as any);
    expect(calls.length).toBeGreaterThan(0);
    for (const call of calls) {
      expect(call.trigger.type).toBe('date');
      expect(call.trigger.date.getTime()).toBeGreaterThan(Date.now());
      expect(call.content.data).toEqual({ type: 'midday-checkin' });
    }
  });

  it('gives consecutive occurrences different copy — the point of the change', async () => {
    await scheduleMiddayCheckIn();
    const banners = mockScheduleNotificationAsync.mock.calls.map(
      (c) => `${(c[0] as any).content.title}\n${(c[0] as any).content.body}`,
    );
    expect(new Set(banners).size).toBe(banners.length);
  });
});

describe('scheduleMiddayCheckIn — tap cues across fire dates', () => {
  const cueOf = (body: string) => CHECK_IN_TAP_CUES.find((cue) => body.endsWith(cue));

  beforeEach(() => {
    mockScheduleNotificationAsync.mockClear();
    mockScheduleNotificationAsync.mockImplementation(async ({ identifier }: { identifier: string }) => identifier);
    mockState.policy = 'granted';
    mockState.store.middayCheckInByDay = null;
    for (const key of Object.keys(mockCarriedCues)) delete mockCarriedCues[key];
  });

  it('steps the first banner past the cue the last batch wrote for the fire date before it', async () => {
    const now = new Date(2026, 9, 16, 8);
    const firstDay = dayIndexFor(now);
    // The cue this first banner would carry, stored as the one the day before carried.
    const natural = getMiddayCheckInCopy(null, null, { seed: 'test-install', dayIndex: firstDay }).cue ?? '';
    expect(natural).not.toBe('');
    mockCarriedCues[NOTIFICATION_IDS.MIDDAY_CHECKIN] = { [String(firstDay - 1)]: natural };

    await scheduleMiddayCheckIn({ localDate: null, now });

    const cues = mockScheduleNotificationAsync.mock.calls.map((c) => cueOf((c[0] as any).content.body));
    expect(cues[0]).toBeDefined();
    expect(cues[0]).not.toBe(natural);
    // Each fire date carries its cue to the next.
    for (let i = 1; i < cues.length; i += 1) expect(cues[i]).not.toBe(cues[i - 1]);
    // And the batch leaves its cues, in fire-date order, for the next batch.
    const stored = mockCarriedCues[NOTIFICATION_IDS.MIDDAY_CHECKIN];
    expect(Object.keys(stored).map(Number)).toEqual(
      mockScheduleNotificationAsync.mock.calls.map((c) => dayIndexFor((c[0] as any).trigger.date)),
    );
    expect(Object.values(stored)).toEqual(cues);
  });
});
