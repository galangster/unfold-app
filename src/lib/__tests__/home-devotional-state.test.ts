import {
  getCurrentDevotional,
  getHomeDevotionalDayData,
  hasReadDevotionalToday,
  shouldPrepareCurrentDevotionalDay,
} from '../home-devotional-state';
import type { Devotional, DevotionalDay } from '../store';

const today = new Date(2026, 3, 25, 12, 0, 0);

function day(overrides: Partial<DevotionalDay> = {}): DevotionalDay {
  return {
    id: 'day-1',
    devotionalId: 'dev-1',
    dayNumber: 1,
    title: 'Day 1',
    scriptureReference: 'John 1:1',
    scriptureText: 'In the beginning',
    bodyText: 'Body',
    quotableLine: 'Quote',
    isRead: false,
    ...overrides,
  };
}

function devotional(overrides: Partial<Devotional> = {}): Devotional {
  return {
    id: 'dev-1',
    title: 'Series',
    totalDays: 7,
    currentDay: 1,
    days: [],
    createdAt: '2026-04-24T00:00:00.000Z',
    updatedAt: '2026-04-24T00:00:00.000Z',
    userContext: {
      name: 'Nick',
      aboutMe: '',
      currentSituation: '',
      emotionalState: '',
    },
    generationMode: 'progressive',
    ...overrides,
  };
}

describe('home devotional state helpers', () => {
  it('finds the current devotional by id', () => {
    const current = devotional({ id: 'current' });
    expect(getCurrentDevotional([devotional({ id: 'other' }), current], 'current')).toBe(current);
    expect(getCurrentDevotional([current], null)).toBeUndefined();
  });

  it('detects whether the current devotional was read today', () => {
    const current = devotional({
      days: [
        day({ isRead: true, readAt: new Date(2026, 3, 24, 23, 0, 0).toISOString() }),
        day({ id: 'day-2', dayNumber: 2, isRead: true, readAt: new Date(2026, 3, 25, 9, 0, 0).toISOString() }),
      ],
    });

    expect(hasReadDevotionalToday({ devotionals: [current], currentDevotionalId: 'dev-1', now: today })).toBe(true);
    expect(hasReadDevotionalToday({ devotionals: [current], currentDevotionalId: 'missing', now: today })).toBe(false);
  });

  it('keeps the Today hero focused on the completed day when the next generated day is tomorrow-locked', () => {
    const day6ReadToday = day({
      id: 'day-6',
      dayNumber: 6,
      title: "Today's Completed Reading",
      isRead: true,
      readAt: new Date(2026, 3, 25, 9, 0, 0).toISOString(),
    });
    const day7Generated = day({
      id: 'day-7',
      dayNumber: 7,
      title: "Tomorrow's Locked Reading",
      isRead: false,
    });

    const current = devotional({
      currentDay: 7,
      days: [day6ReadToday, day7Generated],
    });

    const homeDayData = getHomeDevotionalDayData(current, today);

    expect(homeDayData).toBe(day6ReadToday);
    expect(homeDayData?.dayNumber).toBe(6);
  });

  it('prepares a progressive current day only when missing and calendar-eligible', () => {
    expect(
      shouldPrepareCurrentDevotionalDay(
        devotional({ currentDay: 2, seriesStartDate: new Date(2026, 3, 24, 8, 0, 0).toISOString() }),
        today,
      ),
    ).toBe(true);

    expect(
      shouldPrepareCurrentDevotionalDay(
        devotional({ currentDay: 2, seriesStartDate: new Date(2026, 3, 25, 8, 0, 0).toISOString() }),
        today,
      ),
    ).toBe(false);

    expect(
      shouldPrepareCurrentDevotionalDay(
        devotional({ currentDay: 2, days: [day({ dayNumber: 2 })] }),
        today,
      ),
    ).toBe(false);

    expect(shouldPrepareCurrentDevotionalDay(devotional({ generationMode: 'batch' }), today)).toBe(false);
  });
});
