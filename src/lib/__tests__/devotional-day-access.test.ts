import {
  canOpenDevotionalDay,
  getCalendarDayNumber,
  getReadingDayLabel,
  getDayMenuPresentation,
  getLatestReadDayNumberToday,
  getLockedTodayDayNumber,
  getSelectableDayLimit,
  getTodayReaderDayNumber,
  isDevotionalDaySelectable,
  isPausedSeries,
  isPausedSeriesUnpreparedDay,
  resolveInitialReadingDayNumber,
} from '../devotional-day-access';
import { canonicalGeneratedDayId } from '../devotional-canonical-days';
import type { Devotional, DevotionalDay } from '../store';

const now = new Date(2026, 4, 10, 12, 0, 0);
const todayIso = new Date(2026, 4, 10, 9, 0, 0).toISOString();
const yesterdayIso = new Date(2026, 4, 9, 9, 0, 0).toISOString();

function day(overrides: Partial<DevotionalDay> = {}): DevotionalDay {
  const dayNumber = overrides.dayNumber ?? 1;
  return {
    id: overrides.id ?? canonicalGeneratedDayId('devotional-1', dayNumber),
    devotionalId: 'devotional-1',
    dayNumber,
    title: `Day ${dayNumber}`,
    scriptureReference: 'John 1:1',
    scriptureText: 'Scripture',
    bodyText: 'Body',
    quotableLine: 'Quote',
    isRead: false,
    reflectionQuestions: [],
    ...overrides,
  };
}

function devotional(overrides: Partial<Devotional> = {}): Devotional {
  return {
    id: 'devotional-1',
    title: 'Series',
    subtitle: 'Subtitle',
    days: [day({ dayNumber: 1 })],
    totalDays: 7,
    currentDay: 1,
    createdAt: '2026-05-01T00:00:00.000Z',
    updatedAt: '2026-05-01T00:00:00.000Z',
    generationMode: 'progressive',
    seriesStartDate: '2026-05-01T00:00:00.000Z',
    ...overrides,
  } as Devotional;
}

describe('devotional day access', () => {
  it.each([undefined, 'invalid-date'])('does not date a prepared reading from generatedAt when the series anchor is %s', (seriesStartDate) => {
    const previous = day({ dayNumber: 4, isRead: true, readAt: yesterdayIso });
    const next = day({ dayNumber: 5, generatedAt: yesterdayIso });
    const series = devotional({ currentDay: 5, seriesStartDate, days: [previous, next] });
    expect(getReadingDayLabel(series, next, now)).toBe('Today');
    expect(getTodayReaderDayNumber(series, now)).toBe(5);
  });

  it('labels a pre-generated reading by its local calendar day', () => {
    const next = day({ dayNumber: 5, generatedAt: yesterdayIso });
    const series = devotional({ currentDay: 5, seriesStartDate: new Date(2026, 4, 6, 12).toISOString(), days: [next] });
    expect(getReadingDayLabel(series, next, now)).toBe('Today');
    expect(getReadingDayLabel(series, next, new Date(2026, 4, 11, 0, 1))).toBe('Overdue');
  });

  it('keeps a pre-generated future reading locked after today is complete', () => {
    const finished = day({ dayNumber: 4, isRead: true, readAt: todayIso });
    const next = day({ dayNumber: 5, generatedAt: yesterdayIso });
    const series = devotional({ currentDay: 5, seriesStartDate: new Date(2026, 4, 7, 12).toISOString(), days: [finished, next] });
    expect(getReadingDayLabel(series, next, now)).toBe('Tomorrow');
    expect(getReadingDayLabel(series, finished, now)).toBe('Today');
    expect(getTodayReaderDayNumber(series, now)).toBe(4);
    expect(isDevotionalDaySelectable(series, 5, now)).toBe(false);
  });

  it('counts local calendar dates across the spring-forward boundary', () => {
    const series = devotional({
      seriesStartDate: new Date(2026, 2, 7, 12, 0, 0).toISOString(),
    });

    expect(getCalendarDayNumber(series, new Date(2026, 2, 9, 12, 0, 0))).toBe(3);
  });

  it('locks the reader and day menu to the day completed today when currentDay has advanced to tomorrow', () => {
    const series = devotional({
      currentDay: 6,
      seriesStartDate: '2026-05-06T12:00:00.000Z',
      days: [
        day({ dayNumber: 1, isRead: true, readAt: yesterdayIso }),
        day({ dayNumber: 2, isRead: true, readAt: yesterdayIso }),
        day({ dayNumber: 3, isRead: true, readAt: yesterdayIso }),
        day({ dayNumber: 4, isRead: true, readAt: yesterdayIso }),
        day({ dayNumber: 5, isRead: true, readAt: todayIso }),
        day({ dayNumber: 6, isRead: false }),
      ],
    });

    expect(getLatestReadDayNumberToday(series, now)).toBe(5);
    expect(getLockedTodayDayNumber(series, now)).toBe(5);
    expect(getTodayReaderDayNumber(series, now)).toBe(5);
    expect(getSelectableDayLimit(series, now)).toBe(5);
    expect(isDevotionalDaySelectable(series, 5, now)).toBe(true);
    expect(isDevotionalDaySelectable(series, 6, now)).toBe(false);
    expect(resolveInitialReadingDayNumber(series, undefined, now)).toBe(5);
    expect(resolveInitialReadingDayNumber(series, 6, now)).toBe(5);
  });

  it('keeps Day 6 selectable and Day 7 locked after Day 6 is completed today', () => {
    const series = devotional({
      currentDay: 7,
      seriesStartDate: '2026-05-05T12:00:00.000Z',
      days: [
        day({ dayNumber: 1, isRead: true, readAt: yesterdayIso }),
        day({ dayNumber: 2, isRead: true, readAt: yesterdayIso }),
        day({ dayNumber: 3, isRead: true, readAt: yesterdayIso }),
        day({ dayNumber: 4, isRead: true, readAt: yesterdayIso }),
        day({ dayNumber: 5, isRead: true, readAt: yesterdayIso }),
        day({ dayNumber: 6, isRead: true, readAt: todayIso }),
        day({ dayNumber: 7, isRead: false }),
      ],
    });

    expect(getLockedTodayDayNumber(series, now)).toBe(6);
    expect(getTodayReaderDayNumber(series, now)).toBe(6);
    expect(getSelectableDayLimit(series, now)).toBe(6);
    expect(isDevotionalDaySelectable(series, 5, now)).toBe(true);
    expect(isDevotionalDaySelectable(series, 6, now)).toBe(true);
    expect(isDevotionalDaySelectable(series, 7, now)).toBe(false);
    expect(resolveInitialReadingDayNumber(series, 7, now)).toBe(6);
  });

  it('keeps an unread current day selectable when nothing has been read today', () => {
    const series = devotional({
      currentDay: 6,
      days: [
        day({ dayNumber: 1, isRead: true, readAt: yesterdayIso }),
        day({ dayNumber: 2, isRead: true, readAt: yesterdayIso }),
        day({ dayNumber: 3, isRead: true, readAt: yesterdayIso }),
        day({ dayNumber: 4, isRead: true, readAt: yesterdayIso }),
        day({ dayNumber: 5, isRead: true, readAt: yesterdayIso }),
        day({ dayNumber: 6, isRead: false }),
      ],
    });

    expect(getLockedTodayDayNumber(series, now)).toBeNull();
    expect(getTodayReaderDayNumber(series, now)).toBe(6);
    expect(getSelectableDayLimit(series, now)).toBe(6);
    expect(resolveInitialReadingDayNumber(series, undefined, now)).toBe(6);
    expect(resolveInitialReadingDayNumber(series, 6, now)).toBe(6);
  });

  it('allows direct recovery for a missing current day unless today is already complete', () => {
    const missingCurrentDay = devotional({
      currentDay: 2,
      days: [day({ dayNumber: 1, isRead: true, readAt: yesterdayIso })],
    });

    expect(getSelectableDayLimit(missingCurrentDay, now)).toBe(1);
    expect(resolveInitialReadingDayNumber(missingCurrentDay, 2, now)).toBe(2);

    const tomorrowAfterCompletion = devotional({
      currentDay: 2,
      seriesStartDate: '2026-05-10T12:00:00.000Z',
      days: [day({ dayNumber: 1, isRead: true, readAt: todayIso })],
    });

    expect(getLockedTodayDayNumber(tomorrowAfterCompletion, now)).toBe(1);
    expect(resolveInitialReadingDayNumber(tomorrowAfterCompletion, 2, now)).toBe(1);
  });

  it('locks the next reading after completion even when the calendar is ahead', () => {
    const catchUpThenToday = devotional({
      currentDay: 7,
      seriesStartDate: '2026-05-04T12:00:00.000Z',
      days: [
        day({ dayNumber: 1, isRead: true, readAt: yesterdayIso }),
        day({ dayNumber: 2, isRead: true, readAt: yesterdayIso }),
        day({ dayNumber: 3, isRead: true, readAt: yesterdayIso }),
        day({ dayNumber: 4, isRead: true, readAt: yesterdayIso }),
        day({ dayNumber: 5, isRead: true, readAt: yesterdayIso }),
        day({ dayNumber: 6, isRead: true, readAt: todayIso }),
        day({ dayNumber: 7, isRead: false }),
      ],
    });

    expect(getCalendarDayNumber(catchUpThenToday, now)).toBe(7);
    expect(getLockedTodayDayNumber(catchUpThenToday, now)).toBe(6);
    expect(getTodayReaderDayNumber(catchUpThenToday, now)).toBe(6);
    expect(getSelectableDayLimit(catchUpThenToday, now)).toBe(6);
    expect(isDevotionalDaySelectable(catchUpThenToday, 7, now)).toBe(false);
    expect(resolveInitialReadingDayNumber(catchUpThenToday, 7, now)).toBe(6);
  });
});

// Completion controls daily pacing with or without a calendar anchor.
describe('missing seriesStartDate anchor', () => {
  // 3 days before `now` (2026-05-10), built in local time like the rest of this file.
  const threeDaysAgoIso = new Date(2026, 4, 7, 9, 0, 0).toISOString();

  const anchorless = devotional({
    currentDay: 2,
    seriesStartDate: undefined,
    createdAt: threeDaysAgoIso,
    days: [
      day({ dayNumber: 1, isRead: true, readAt: todayIso }),
      day({ dayNumber: 2 }),
    ],
  });

  it('has no calendar day at all', () => {
    expect(getCalendarDayNumber(anchorless, now)).toBeNull();
  });

  it('locks the user to today despite being days behind the calendar', () => {
    expect(getLockedTodayDayNumber(anchorless, now)).toBe(1);
    expect(isDevotionalDaySelectable(anchorless, 2, now)).toBe(false);
    expect(resolveInitialReadingDayNumber(anchorless, 2, now)).toBe(1);
  });

  it('keeps the same daily pace once the anchor is present', () => {
    const anchored = devotional({
      ...anchorless,
      seriesStartDate: threeDaysAgoIso,
    });
    expect(getCalendarDayNumber(anchored, now)).toBe(4);
    expect(getLockedTodayDayNumber(anchored, now)).toBe(1);
    expect(isDevotionalDaySelectable(anchored, 2, now)).toBe(false);
    expect(resolveInitialReadingDayNumber(anchored, 2, now)).toBe(1);
  });
});

// ── getDayMenuPresentation ───────────────────────────────────────────────
// Four distinct row states used to collapse into one "Being prepared…"
// string. These pin the classification for each state plus the case-1 bug
// (a selectable day with a missing title falling back to placeholder copy
// instead of `Day N`).
describe('getDayMenuPresentation', () => {
  it('keeps missing upcoming content distinct from content due after local midnight', () => {
    const series = devotional({
      currentDay: 2,
      seriesStartDate: new Date(2026, 4, 1, 12).toISOString(),
      days: [day({ dayNumber: 1, isRead: true, readAt: todayIso })],
    });

    expect(getDayMenuPresentation(series, 2, now)).toEqual({
      kind: 'coming-soon', title: 'Coming soon',
    });
    const tomorrow = new Date(2026, 4, 11, 0, 1);
    expect(getDayMenuPresentation(series, 2, tomorrow)).toEqual({
      kind: 'preparing', title: 'Being prepared…',
    });
    expect(getDayMenuPresentation(series, 3, tomorrow)).toEqual({
      kind: 'coming-soon', title: 'Coming soon',
    });
  });

  it('shows the real title for a selectable day', () => {
    const series = devotional({
      currentDay: 3,
      days: [day({ dayNumber: 1 }), day({ dayNumber: 2 }), day({ dayNumber: 3 })],
    });

    expect(getDayMenuPresentation(series, 1, now)).toEqual({ kind: 'ready', title: 'Day 1' });
  });

  it('falls back to "Day N" — not "Being prepared…" — for a selectable day with a missing title', () => {
    const series = devotional({
      currentDay: 2,
      days: [
        day({ dayNumber: 1 }),
        day({ dayNumber: 2, title: undefined as unknown as string }),
      ],
    });

    expect(getDayMenuPresentation(series, 2, now)).toEqual({ kind: 'ready', title: 'Day 2' });
  });

  it('shows the real title with an "Unlocks Wed" label when content is ready but paced-locked a few days out', () => {
    // seriesStartDate 2026-05-08; Day 6 unlocks on start + 5 days = 2026-05-13,
    // 3 days after `now` (2026-05-10) — inside the "next 6 days" window.
    const series = devotional({
      currentDay: 3,
      totalDays: 10,
      seriesStartDate: new Date(2026, 4, 8, 12, 0, 0).toISOString(),
      days: Array.from({ length: 10 }, (_, i) => day({ dayNumber: i + 1 })),
    });

    expect(getDayMenuPresentation(series, 6, now)).toEqual({
      kind: 'locked-titled',
      title: 'Day 6',
      unlockLabel: 'Unlocks Wed',
    });
  });

  it('labels the very next paced-locked day "Tomorrow"', () => {
    // Day 4 unlocks on start + 3 days = 2026-05-11, the day after `now`.
    const series = devotional({
      currentDay: 3,
      totalDays: 10,
      seriesStartDate: new Date(2026, 4, 8, 12, 0, 0).toISOString(),
      days: Array.from({ length: 10 }, (_, i) => day({ dayNumber: i + 1 })),
    });

    expect(getDayMenuPresentation(series, 4, now)).toEqual({
      kind: 'locked-titled',
      title: 'Day 4',
      unlockLabel: 'Tomorrow',
    });
  });

  it('labels a far-future paced-locked day with a short date', () => {
    // Day 10 unlocks on start + 9 days = 2026-05-17, 7 days after `now`.
    const series = devotional({
      currentDay: 3,
      totalDays: 10,
      seriesStartDate: new Date(2026, 4, 8, 12, 0, 0).toISOString(),
      days: Array.from({ length: 10 }, (_, i) => day({ dayNumber: i + 1 })),
    });

    expect(getDayMenuPresentation(series, 10, now)).toEqual({
      kind: 'locked-titled',
      title: 'Day 10',
      unlockLabel: 'Unlocks May 17',
    });
  });

  it('bases the unlock label on how far behind the reader actually is, not on seriesStartDate math', () => {
    // 3-day series, seriesStartDate yesterday, Day 1 still unread — the
    // reader is a day behind schedule, so getSelectableDayLimit is still 1.
    // seriesStartDate + (N-1) would put Day 3 at "Tomorrow" too (wrong: it's
    // 2 days out, once Day 2 is read). The limit-based offset must catch this.
    const series = devotional({
      currentDay: 1,
      totalDays: 3,
      seriesStartDate: new Date(2026, 4, 9, 12, 0, 0).toISOString(),
      days: [day({ dayNumber: 1 }), day({ dayNumber: 2 }), day({ dayNumber: 3 })],
    });

    expect(getSelectableDayLimit(series, now)).toBe(1);
    expect(getDayMenuPresentation(series, 2, now)).toEqual({
      kind: 'locked-titled',
      title: 'Day 2',
      unlockLabel: 'Tomorrow',
    });
    expect(getDayMenuPresentation(series, 3, now)).toEqual({
      kind: 'locked-titled',
      title: 'Day 3',
      unlockLabel: 'Unlocks Tue',
    });
  });

  it('shows the title with no unlock label when content is ready but the series has no calendar anchor', () => {
    const series = devotional({
      currentDay: 1,
      generationMode: 'progressive',
      seriesStartDate: undefined,
      days: [day({ dayNumber: 1 }), day({ dayNumber: 2 })],
    });

    expect(getDayMenuPresentation(series, 2, now)).toEqual({ kind: 'locked-titled', title: 'Day 2' });
  });

  it('says "Being prepared…" when content is missing and the day is due today', () => {
    // seriesStartDate 2026-05-09 puts the calendar day at 2 for `now`.
    const series = devotional({
      currentDay: 2,
      seriesStartDate: new Date(2026, 4, 9, 12, 0, 0).toISOString(),
      days: [day({ dayNumber: 1, isRead: true, readAt: yesterdayIso })],
    });

    expect(getCalendarDayNumber(series, now)).toBe(2);
    expect(getDayMenuPresentation(series, 2, now)).toEqual({
      kind: 'preparing',
      title: 'Being prepared…',
    });
  });

  it('says "Coming soon" when content is missing and the day is not due yet', () => {
    const series = devotional({
      currentDay: 2,
      seriesStartDate: new Date(2026, 4, 9, 12, 0, 0).toISOString(),
      days: [day({ dayNumber: 1, isRead: true, readAt: todayIso })],
    });

    expect(getDayMenuPresentation(series, 3, now)).toEqual({
      kind: 'coming-soon',
      title: 'Coming soon',
    });
  });

  it('says "Coming soon" (not "Being prepared…") when content is missing and there is no calendar anchor', () => {
    const series = devotional({
      currentDay: 2,
      seriesStartDate: undefined,
      days: [day({ dayNumber: 1, isRead: true, readAt: todayIso })],
    });

    expect(getCalendarDayNumber(series, now)).toBeNull();
    expect(getDayMenuPresentation(series, 2, now)).toEqual({
      kind: 'coming-soon',
      title: 'Coming soon',
    });
  });
});

// ── Paused series ───────────────────────────────────────────────────────
// Only the current series gets new days, so a day a paused series is missing
// will never be prepared.

describe('paused series days', () => {
  beforeEach(() => {
    jest.useFakeTimers({ now });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  // Day 1 was read yesterday. Nothing has prepared Day 2.
  const series = devotional({
    currentDay: 2,
    days: [day({ dayNumber: 1, isRead: true, readAt: yesterdayIso })],
  });

  it('pauses every series except the current one', () => {
    expect(isPausedSeries(series, 'devotional-1')).toBe(false);
    expect(isPausedSeries(series, 'devotional-2')).toBe(true);
    expect(isPausedSeries(series, null)).toBe(true);
    expect(isPausedSeries(null, 'devotional-1')).toBe(false);
  });

  it('keeps a missing day of the current series in preparation', () => {
    expect(isPausedSeriesUnpreparedDay(series, 2, false)).toBe(false);
    expect(getDayMenuPresentation(series, 2, now)).toEqual({
      kind: 'preparing',
      title: 'Being prepared…',
    });
  });

  it('says "Not prepared" for every missing unread day of a paused series', () => {
    expect(isPausedSeriesUnpreparedDay(series, 2, true)).toBe(true);
    expect(getDayMenuPresentation(series, 2, now, true)).toEqual({
      kind: 'not-prepared',
      title: 'Not prepared',
    });
    expect(getDayMenuPresentation(series, 5, now, true)).toEqual({
      kind: 'not-prepared',
      title: 'Not prepared',
    });
  });

  it('leaves read and ready days of a paused series unchanged', () => {
    const withContent = devotional({
      currentDay: 3,
      days: [
        // Read, but only a local copy is on this device: the reader restores it.
        day({ dayNumber: 1, id: 'local-day-1', isRead: true, readAt: yesterdayIso }),
        day({ dayNumber: 2, isRead: true, readAt: yesterdayIso }),
        day({ dayNumber: 3, title: 'Be still' }),
      ],
    });

    expect(isPausedSeriesUnpreparedDay(withContent, 1, true)).toBe(false);
    expect(isPausedSeriesUnpreparedDay(withContent, 3, true)).toBe(false);
    expect(getDayMenuPresentation(withContent, 3, now, true))
      .toEqual(getDayMenuPresentation(withContent, 3, now));
  });
});

// ── Read days with only a local copy ────────────────────────────────────
// A day can be read while this device has only a local copy of it, not the
// canonical day. The reader restores it with a pull, so the day stays open
// and does not hold back the days after it.

describe('read days with only a local copy', () => {
  beforeEach(() => {
    jest.useFakeTimers({ now });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  // Day 2 was read, but this device has only a local copy of it.
  const series = devotional({
    currentDay: 4,
    days: [
      day({ dayNumber: 1, isRead: true, readAt: yesterdayIso }),
      day({ dayNumber: 2, id: 'local-day-2', isRead: true, readAt: yesterdayIso }),
      day({ dayNumber: 3, isRead: true, readAt: yesterdayIso }),
      day({ dayNumber: 4 }),
    ],
  });

  it('opens the day to restore it, in current and paused series alike', () => {
    const restore = { kind: 'restore', title: 'Tap to restore reading' };

    expect(isDevotionalDaySelectable(series, 2, now)).toBe(false);
    expect(canOpenDevotionalDay(series, 2, now)).toBe(true);
    expect(resolveInitialReadingDayNumber(series, 2, now)).toBe(2);
    expect(getDayMenuPresentation(series, 2, now)).toEqual(restore);
    expect(getDayMenuPresentation(series, 2, now, true)).toEqual(restore);
  });

  it('does not hold back the days after it', () => {
    expect(getSelectableDayLimit(series, now)).toBe(4);
    expect(isDevotionalDaySelectable(series, 3, now)).toBe(true);
    expect(isDevotionalDaySelectable(series, 4, now)).toBe(true);
    expect(getDayMenuPresentation(series, 4, now)).toEqual({ kind: 'ready', title: 'Day 4' });
  });

  it('still stops at a local copy that was never read', () => {
    const unread = devotional({
      currentDay: 3,
      days: [
        day({ dayNumber: 1, isRead: true, readAt: yesterdayIso }),
        day({ dayNumber: 2, id: 'local-day-2' }),
        day({ dayNumber: 3 }),
      ],
    });

    expect(getSelectableDayLimit(unread, now)).toBe(1);
    expect(canOpenDevotionalDay(unread, 2, now)).toBe(false);
    expect(canOpenDevotionalDay(unread, 3, now)).toBe(false);
  });

  it('keeps read days after the current day in reach, up to the first unread day', () => {
    // Read out of order: Days 3 and 4 were read before Day 2, and only a
    // local copy of Day 3 is here. The reader can move between Days 2 to 4.
    const outOfOrder = devotional({
      currentDay: 2,
      days: [
        day({ dayNumber: 1, isRead: true, readAt: yesterdayIso }),
        day({ dayNumber: 2 }),
        day({ dayNumber: 3, id: 'local-day-3', isRead: true, readAt: yesterdayIso }),
        day({ dayNumber: 4, isRead: true, readAt: yesterdayIso }),
        day({ dayNumber: 5 }),
      ],
    });

    expect(getSelectableDayLimit(outOfOrder, now)).toBe(4);
    expect(canOpenDevotionalDay(outOfOrder, 3, now)).toBe(true);
    expect(isDevotionalDaySelectable(outOfOrder, 4, now)).toBe(true);
    expect(isDevotionalDaySelectable(outOfOrder, 5, now)).toBe(false);

    // An unread day after the current day still holds back the read day after it.
    const unreadAhead = devotional({
      currentDay: 2,
      days: [
        day({ dayNumber: 1, isRead: true, readAt: yesterdayIso }),
        day({ dayNumber: 2 }),
        day({ dayNumber: 3 }),
        day({ dayNumber: 4, isRead: true, readAt: yesterdayIso }),
      ],
    });
    expect(getSelectableDayLimit(unreadAhead, now)).toBe(2);
    expect(isDevotionalDaySelectable(unreadAhead, 3, now)).toBe(false);
  });

  it('keeps a read day closed while the reader holds today’s completed reading', () => {
    // Day 2 was completed today, so the reader stays on Day 2 until tomorrow.
    const heldToday = devotional({
      currentDay: 4,
      days: [
        day({ dayNumber: 1, isRead: true, readAt: yesterdayIso }),
        day({ dayNumber: 2, isRead: true, readAt: todayIso }),
        day({ dayNumber: 3, id: 'local-day-3', isRead: true, readAt: yesterdayIso }),
        day({ dayNumber: 4 }),
      ],
    });

    expect(getLockedTodayDayNumber(heldToday, now)).toBe(2);
    expect(resolveInitialReadingDayNumber(heldToday, 3, now)).toBe(2);
    expect(canOpenDevotionalDay(heldToday, 3, now)).toBe(false);
  });
});
