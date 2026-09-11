import type { Devotional, DevotionalDay } from '../store';
import { shouldShowShapedByCheckInChip } from '../auto-trial-series';

function series(kind?: 'auto_trial'): Devotional {
  return {
    id: 'series-1',
    title: 'Series',
    totalDays: 3,
    currentDay: 2,
    days: [],
    createdAt: '2026-09-10T12:00:00.000Z',
    userContext: {
      name: 'Nick',
      aboutMe: 'QA',
      currentSituation: 'Chip',
      emotionalState: 'Focused',
    },
    generationMode: 'batch',
    seriesArc: kind
      ? {
          totalDaysPlanned: 3,
          overarchingTheme: 'theme',
          narrativeShape: 'shape',
          dayHints: [],
          isOpenEnded: false,
          createdAt: '2026-09-10T12:00:00.000Z',
          seriesKind: kind,
        }
      : undefined,
  };
}

function day(dayNumber: number, shapedByCheckIn?: true): DevotionalDay {
  return {
    dayNumber,
    title: `Day ${dayNumber}`,
    scriptureReference: 'Psalm 23:1',
    scriptureText: 'The Lord is my shepherd.',
    bodyText: 'Body',
    quotableLine: 'Line',
    isRead: false,
    shapedByCheckIn,
  };
}

describe('J7 shaped-by-check-in chip', () => {
  it('stays hidden without the flag even when a local Day 1 check-in exists', () => {
    expect(shouldShowShapedByCheckInChip(series('auto_trial'), day(2))).toBe(false);
  });

  it('stays hidden for a non-auto series, Day 1, and Day 3', () => {
    expect(shouldShowShapedByCheckInChip(series(), day(2, true))).toBe(false);
    expect(shouldShowShapedByCheckInChip(series('auto_trial'), day(1, true))).toBe(false);
    expect(shouldShowShapedByCheckInChip(series('auto_trial'), day(3, true))).toBe(false);
  });

  it('shows only for an auto series Day 2 with the server flag', () => {
    expect(shouldShowShapedByCheckInChip(series('auto_trial'), day(2, true))).toBe(true);
  });
});
