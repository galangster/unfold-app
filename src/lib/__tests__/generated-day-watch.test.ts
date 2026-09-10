import {
  shouldWatchForGeneratedDay,
} from '../generated-day-watch';
import type { Devotional, DevotionalDay } from '../store';

function day(dayNumber: number, devotionalId = 'devo-1'): DevotionalDay {
  return {
    id: `day-${devotionalId}-${dayNumber}`,
    devotionalId,
    dayNumber,
    title: `Day ${dayNumber}`,
    scriptureReference: 'John 1:1',
    scriptureText: 'In the beginning was the Word.',
    bodyText: 'Body',
    quotableLine: 'Line',
    isRead: false,
  };
}

function devotional(overrides: Partial<Devotional> = {}): Devotional {
  return {
    id: 'devo-1',
    title: 'Rooted',
    totalDays: 7,
    currentDay: 2,
    days: [day(1)],
    createdAt: '2026-09-01T08:00:00.000Z',
    seriesStartDate: '2026-09-01T08:00:00.000Z',
    generationMode: 'progressive',
    userContext: { name: 'Nick', aboutMe: '', currentSituation: '', emotionalState: '' },
    ...overrides,
  };
}

describe('shouldWatchForGeneratedDay', () => {
  const now = new Date(2026, 8, 3, 9, 0, 0); // Sep 3 — calendar day 3 of a Sep 1 series

  it('watches a missing, due, in-series day of a progressive series', () => {
    expect(shouldWatchForGeneratedDay(devotional(), 2, now)).toBe(true);
    expect(shouldWatchForGeneratedDay(devotional(), 3, now)).toBe(true);
  });

  it('does not watch a day that is already on device', () => {
    expect(shouldWatchForGeneratedDay(devotional(), 1, now)).toBe(false);
  });

  it('does not watch a day the calendar has not reached', () => {
    expect(shouldWatchForGeneratedDay(devotional(), 4, now)).toBe(false);
  });

  it('watches any missing in-series day when the series has no calendar anchor', () => {
    expect(shouldWatchForGeneratedDay(devotional({ seriesStartDate: undefined }), 6, now)).toBe(true);
  });

  it('does not watch beyond the series or for legacy batch series', () => {
    expect(shouldWatchForGeneratedDay(devotional(), 8, now)).toBe(false);
    expect(
      shouldWatchForGeneratedDay(
        devotional({ generationMode: 'batch', seriesStartDate: undefined }),
        2,
        now,
      ),
    ).toBe(false);
    expect(shouldWatchForGeneratedDay(null, 2, now)).toBe(false);
  });
});
