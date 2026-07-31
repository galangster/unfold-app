import {
  getCalendarDayNumber,
  getLatestReadDayNumberToday,
  getLockedTodayDayNumber,
  getSelectableDayLimit,
  getTodayReaderDayNumber,
  isDevotionalDaySelectable,
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

  it('does not lock the next current day when a catch-up completion makes it calendar-eligible today', () => {
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
    expect(getLockedTodayDayNumber(catchUpThenToday, now)).toBeNull();
    expect(getTodayReaderDayNumber(catchUpThenToday, now)).toBe(7);
    expect(getSelectableDayLimit(catchUpThenToday, now)).toBe(7);
    expect(isDevotionalDaySelectable(catchUpThenToday, 7, now)).toBe(true);
    expect(resolveInitialReadingDayNumber(catchUpThenToday, 7, now)).toBe(7);
  });
});

// ── Regression: the missing-anchor fail-closed default ──────────────────────
// `mapDevotional` (full-sync-pull.ts) and `buildDevotionalSyncMetadataPatch`
// never carry `seriesStartDate`, so any devotional restored from server sync
// has no calendar anchor. getCalendarDayNumber then returns null and
// isCurrentDayAfterCalendarDay fails CLOSED — locking a legitimately behind
// (catch-up) user out of the day they are entitled to.
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
    // Series began 2026-05-07; `now` is 2026-05-10, so the calendar says this
    // user is on day 4 and Day 2 should be freely available.
    expect(getLockedTodayDayNumber(anchorless, now)).toBe(1);
    expect(isDevotionalDaySelectable(anchorless, 2, now)).toBe(false);
    expect(resolveInitialReadingDayNumber(anchorless, 2, now)).toBe(1);
  });

  it('behaves correctly once the anchor is present', () => {
    const anchored = devotional({
      ...anchorless,
      seriesStartDate: threeDaysAgoIso,
    });
    expect(getCalendarDayNumber(anchored, now)).toBe(4);
    expect(getLockedTodayDayNumber(anchored, now)).toBeNull();
    expect(isDevotionalDaySelectable(anchored, 2, now)).toBe(true);
    expect(resolveInitialReadingDayNumber(anchored, 2, now)).toBe(2);
  });
});
