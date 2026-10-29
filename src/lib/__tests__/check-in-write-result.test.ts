/**
 * The write-completeness contract.
 *
 * Pre-rolling raised the stakes on a failed write. Each sync cancels the
 * slot's entire identifier space and then rewrites it, so a run that cancels
 * and then fails leaves ZERO pending notifications where the old repeating
 * trigger would have left one stale-but-live one. `complete` is what stops
 * useCheckInNotifications recording such a run as synced.
 */

import { CHECK_IN_TAP_CUES, getEveningWindDownCopy, getMiddayCheckInCopy } from '@/constants/check-in-messages';
import { dayIndexFor, type CopyVariation } from '@/lib/variation-bag';

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
jest.mock('@/lib/act-reminder-write', () => ({ readActReminderWriteFailed: jest.fn(() => false), readActReminderLastWrite: jest.fn(() => null) }));
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
    devotionals: [] as unknown[],
    currentDevotionalId: null as string | null,
    user: { hasCompletedOnboarding: true },
    middayCheckInEnabled: true,
    eveningWindDownEnabled: true,
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
const { scheduleMiddayCheckIn, scheduleEveningWindDown, PRE_ROLL_DAYS, NOTIFICATION_IDS } = require('../notifications');
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

/** What one scheduled banner was written with. */
type ScheduledRequest = { content: { body: string }; trigger: { date: Date } };

// Both slots carry their tap cues the same way, so both run the same tests.
const SLOTS = [
  {
    name: 'midday',
    id: NOTIFICATION_IDS.MIDDAY_CHECKIN,
    schedule: scheduleMiddayCheckIn,
    copy: (variation: CopyVariation, previousCue?: string) => getMiddayCheckInCopy(null, null, variation, previousCue),
  },
  {
    name: 'evening',
    id: NOTIFICATION_IDS.EVENING_WINDDOWN,
    schedule: scheduleEveningWindDown,
    copy: (variation: CopyVariation, previousCue?: string) => getEveningWindDownCopy(null, variation, previousCue),
  },
];

describe.each(SLOTS)('$name check-in: tap cues across fire dates', ({ id, schedule, copy }) => {
  const now = new Date(2026, 9, 16, 8);
  const cueOf = (body: string) => CHECK_IN_TAP_CUES.find((cue) => body.endsWith(cue));
  const scheduled = () => mockScheduleNotificationAsync.mock.calls.map((call) => call[0] as ScheduledRequest);
  const cuesShown = () => scheduled().map(({ content }) => cueOf(content.body));
  const fireDays = () => scheduled().map(({ trigger }) => dayIndexFor(trigger.date));
  /** The cue the slot's copy gives a day, stepping past `previousCue`. */
  const cueFor = (dayIndex: number, previousCue?: string) => copy({ seed: 'test-install', dayIndex }, previousCue).cue;

  beforeEach(() => {
    mockScheduleNotificationAsync.mockClear();
    mockScheduleNotificationAsync.mockImplementation(async ({ identifier }: { identifier: string }) => identifier);
    mockState.policy = 'granted';
    mockState.store.middayCheckInByDay = null;
    mockState.store.eveningWindDownByDay = null;
    for (const key of Object.keys(mockCarriedCues)) delete mockCarriedCues[key];
  });

  it('steps the first banner past the cue the last batch wrote for the fire date before it', async () => {
    const firstDay = dayIndexFor(now);
    // The cue this first banner would carry, stored as the one the day before carried.
    const natural = cueFor(firstDay) ?? '';
    expect(natural).not.toBe('');
    mockCarriedCues[id] = { [String(firstDay - 1)]: natural };

    await schedule({ localDate: null, now });

    const cues = cuesShown();
    expect(fireDays()[0]).toBe(firstDay);
    expect(cues[0]).toBeDefined();
    expect(cues[0]).not.toBe(natural);
    // Each fire date carries its cue to the next.
    for (let i = 1; i < cues.length; i += 1) expect(cues[i]).not.toBe(cues[i - 1]);
    // And the batch leaves its cues, in fire-date order, for the next batch.
    const stored = mockCarriedCues[id];
    expect(Object.keys(stored).map(Number)).toEqual(fireDays());
    expect(Object.values(stored)).toEqual(cues);
  });

  it('carries each fire date’s cue to the next inside one batch', async () => {
    // A first fire date that, stepping past the cue stored for the day before
    // it, lands on the cue the next fire date would show on its own. Only the
    // cue the batch carries from one fire date to the next keeps them apart.
    const base = dayIndexFor(now);
    const offset = Array.from({ length: 60 }, (_, i) => i)
      .find((i) => cueFor(base + i, cueFor(base + i)) === cueFor(base + i + 1));
    expect(offset).toBeDefined();
    const start = new Date(now);
    start.setDate(now.getDate() + (offset ?? 0));
    const firstDay = dayIndexFor(start);
    mockCarriedCues[id] = { [String(firstDay - 1)]: cueFor(firstDay) ?? '' };

    await schedule({ localDate: null, now: start });

    const cues = cuesShown();
    expect(fireDays().slice(0, 2)).toEqual([firstDay, firstDay + 1]);
    expect(cues[0]).toBe(cueFor(firstDay + 1));
    expect(cues.every((cue) => cue !== undefined)).toBe(true);
    for (let i = 1; i < cues.length; i += 1) expect(cues[i]).not.toBe(cues[i - 1]);
  });
});

describe('a read on a day with no carry line rewrites today’s midday banner (V-03)', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { runCheckInNotificationSync, resetCheckInNotificationSyncForTests } = require('../check-in-notification-sync');
  const NUDGE = 'Before Thursday’s interview, remember whose name you carry.';
  const opened = new Date(2026, 9, 16, 7, 0);
  const finished = new Date(2026, 9, 16, 7, 10);
  /** One series on Day 1, which has a nudge and no carry line. Finishing it moves currentDay on. */
  const series = (readAt?: Date) => ({
    id: 'dev-1',
    title: 'Series',
    totalDays: 7,
    currentDay: readAt ? 2 : 1,
    days: [{
      id: 'day-1',
      devotionalId: 'dev-1',
      dayNumber: 1,
      title: 'The Unfinished House',
      scriptureReference: 'Psalm 132:1-5',
      scriptureText: 'Lord, remember David.',
      bodyText: '',
      isRead: readAt !== undefined,
      readAt: readAt?.toISOString(),
      companionNudge: NUDGE,
    }],
  });
  /** The body written for today's midday occurrence. */
  const todaysBanner = () => mockScheduleNotificationAsync.mock.calls
    .map((call) => call[0] as ScheduledRequest & { content: { data?: { type?: string } } })
    .find(({ content, trigger }) => content.data?.type === 'midday-checkin' && dayIndexFor(trigger.date) === dayIndexFor(opened))
    ?.content.body;

  beforeEach(() => {
    // Only Date is faked: the writes resolve as they do in the app.
    jest.useFakeTimers({
      now: opened,
      doNotFake: [
        'hrtime', 'nextTick', 'performance', 'queueMicrotask', 'requestAnimationFrame', 'cancelAnimationFrame',
        'requestIdleCallback', 'cancelIdleCallback', 'setImmediate', 'clearImmediate', 'setInterval',
        'clearInterval', 'setTimeout', 'clearTimeout',
      ],
    });
    resetCheckInNotificationSyncForTests();
    mockScheduleNotificationAsync.mockClear();
    mockScheduleNotificationAsync.mockImplementation(async ({ identifier }: { identifier: string }) => identifier);
    mockState.policy = 'granted';
    mockState.store.middayCheckInByDay = null;
    mockState.store.eveningWindDownEnabled = false;
    mockState.store.devotionals = [series()];
    mockState.store.currentDevotionalId = 'dev-1';
  });

  afterEach(() => {
    jest.useRealTimers();
    mockState.store.eveningWindDownEnabled = true;
    mockState.store.devotionals = [];
    mockState.store.currentDevotionalId = null;
  });

  it('writes today’s banner without the nudge at the open, then rewrites it with the nudge after the read', async () => {
    await expect(runCheckInNotificationSync('hydration')).resolves.toMatchObject({ kind: 'synced' });
    expect(todaysBanner()).toBeDefined();
    expect(todaysBanner()).not.toContain('whose name you carry');

    mockScheduleNotificationAsync.mockClear();
    jest.setSystemTime(finished);
    mockState.store.devotionals = [series(finished)];
    // The day has no carry line, so the nudge alone tells the sync the banner changed.
    await expect(runCheckInNotificationSync('fingerprint')).resolves.toMatchObject({ kind: 'synced' });
    expect(todaysBanner()).toContain('whose name you carry');
  });
});
