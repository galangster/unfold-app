import { canonicalGeneratedDayId } from '../devotional-canonical-days';
import { getServerOwnedSeriesTotalDays } from '../devotional-series-boundary';
import { countReadDaysWithinBoundary } from '../series-path';
import type { Devotional, DevotionalDay } from '../store';

const ID = 'gate-1';

function day(n: number, isRead: boolean): DevotionalDay {
  return {
    id: canonicalGeneratedDayId(ID, n),
    devotionalId: ID,
    dayNumber: n,
    title: `Day ${n}`,
    scriptureReference: 'John 1:1',
    scriptureText: 'Text',
    bodyText: 'Body',
    quotableLine: 'Line',
    isRead,
  };
}

function series(days: DevotionalDay[]): Devotional {
  return {
    id: ID,
    title: 'Gate',
    totalDays: 7,
    currentDay: 4,
    days,
    createdAt: '2026-06-08T12:00:00.000Z',
    userContext: { name: '', aboutMe: '', currentSituation: '', emotionalState: '' },
    generationMode: 'progressive',
    seriesStartDate: '2026-06-08T12:00:00.000Z',
    seriesArc: {
      totalDaysPlanned: 3,
      overarchingTheme: 'theme',
      narrativeShape: 'shape',
      dayHints: [],
      isOpenEnded: false,
      createdAt: '2026-06-08T12:00:00.000Z',
      seriesKind: 'auto_trial',
    },
  };
}

describe('J3 today journey gate', () => {
  it('treats 3 read of planned 3 as complete and ignores a pulled day 4 row', () => {
    const d = series([day(1, true), day(2, true), day(3, true), day(4, true)]);
    expect(getServerOwnedSeriesTotalDays(d)).toBe(3);
    expect(countReadDaysWithinBoundary(d)).toBe(3);
    expect(countReadDaysWithinBoundary(d) >= getServerOwnedSeriesTotalDays(d)).toBe(true);
  });
});
