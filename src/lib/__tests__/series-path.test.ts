import { canonicalGeneratedDayId } from '../devotional-canonical-days';
import type { Devotional, DevotionalDay } from '../store';
import {
  buildPlannedSeriesPath,
  buildSeriesPath,
  describeSeriesPath,
} from '../series-path';

const ID = 'auto-1';

function day(n: number, over: Partial<DevotionalDay> = {}): DevotionalDay {
  return {
    id: canonicalGeneratedDayId(ID, n),
    devotionalId: ID,
    dayNumber: n,
    title: `Day ${n} title`,
    scriptureReference: 'John 1:1',
    scriptureText: 'In the beginning',
    bodyText: 'Body',
    quotableLine: 'Quote',
    isRead: false,
    ...over,
  };
}

function autoSeries(over: Partial<Devotional> = {}): Devotional {
  const createdAt = new Date(2026, 5, 8, 12, 0, 0).toISOString();
  return {
    id: ID,
    title: 'Trial Series',
    totalDays: 3,
    currentDay: 1,
    days: [],
    createdAt,
    userContext: { name: '', aboutMe: '', currentSituation: '', emotionalState: '' },
    generationMode: 'progressive',
    seriesStartDate: createdAt,
    seriesArc: {
      totalDaysPlanned: 3,
      overarchingTheme: 'theme',
      narrativeShape: 'shape',
      dayHints: [
        { dayNumber: 1, themeHint: 'a', scriptureRegion: 'gospels', narrativeRole: 'foundation', dayTitle: 'Begin' },
        { dayNumber: 2, themeHint: 'b', scriptureRegion: 'gospels', narrativeRole: 'deepening', dayTitle: 'Continue' },
        { dayNumber: 3, themeHint: 'c', scriptureRegion: 'gospels', narrativeRole: 'resolution', dayTitle: 'Close' },
      ],
      isOpenEnded: false,
      createdAt,
      seriesKind: 'auto_trial',
    },
    ...over,
  };
}

function states(nodes: { state: string }[]) {
  return nodes.map((node) => node.state);
}

describe('J1 series path', () => {
  it('uses 3 nodes when totalDays is 7 but totalDaysPlanned is 3', () => {
    const now = new Date(2026, 5, 8, 9, 0, 0);
    const nodes = buildSeriesPath(
      autoSeries({
        totalDays: 7,
        days: [day(1)],
      }),
      now,
      { isCurrentSeries: true },
    );
    expect(nodes).toHaveLength(3);
    expect(nodes.map((node) => node.dayNumber)).toEqual([1, 2, 3]);
  });

  it('matches the S4 3-day node table', () => {
    const monday = new Date(2026, 5, 8, 18, 0, 0);
    const tuesday = new Date(2026, 5, 9, 10, 0, 0);
    const wednesday = new Date(2026, 5, 10, 10, 0, 0);

    expect(states(buildSeriesPath(
      autoSeries({ days: [day(1)], currentDay: 1 }),
      monday,
      { isCurrentSeries: true },
    ))).toEqual(['today', 'locked', 'locked']);

    const day1ReadNoDay2 = autoSeries({
      days: [day(1, { isRead: true, readAt: monday.toISOString() })],
      currentDay: 2,
    });
    const evening = buildSeriesPath(day1ReadNoDay2, monday, { isCurrentSeries: true });
    expect(states(evening)).toEqual(['read', 'tomorrow', 'locked']);
    expect(evening[1]?.contentReady).toBe(false);
    expect(describeSeriesPath(evening)).toBe('Day 1 read. Day 2 is on its way. Day 3 locked.');

    expect(states(buildSeriesPath(
      autoSeries({
        days: [
          day(1, { isRead: true, readAt: monday.toISOString() }),
          day(2),
        ],
        currentDay: 2,
      }),
      monday,
      { isCurrentSeries: true },
    ))).toEqual(['read', 'tomorrow', 'locked']);
    expect(buildSeriesPath(
      autoSeries({
        days: [
          day(1, { isRead: true, readAt: monday.toISOString() }),
          day(2),
        ],
        currentDay: 2,
      }),
      monday,
      { isCurrentSeries: true },
    )[1]?.contentReady).toBe(true);

    expect(states(buildSeriesPath(
      autoSeries({
        days: [day(1, { isRead: true, readAt: monday.toISOString() })],
        currentDay: 2,
      }),
      tuesday,
      { isCurrentSeries: true },
    ))).toEqual(['read', 'preparing', 'locked']);

    expect(states(buildSeriesPath(
      autoSeries({
        days: [
          day(1, { isRead: true, readAt: monday.toISOString() }),
          day(2),
        ],
        currentDay: 2,
      }),
      tuesday,
      { isCurrentSeries: true },
    ))).toEqual(['read', 'today', 'locked']);

    expect(states(buildSeriesPath(
      autoSeries({
        days: [
          day(1, { isRead: true, readAt: monday.toISOString() }),
          day(2, { isRead: true, readAt: tuesday.toISOString() }),
          day(3, { isRead: true, readAt: wednesday.toISOString() }),
        ],
        currentDay: 4,
      }),
      wednesday,
      { isCurrentSeries: true },
    ))).toEqual(['read', 'read', 'read']);

    expect(states(buildSeriesPath(
      autoSeries({
        days: [
          day(1, { isRead: true, readAt: monday.toISOString() }),
          day(2, { isRead: true, readAt: tuesday.toISOString() }),
        ],
        currentDay: 3,
      }),
      wednesday,
      { isCurrentSeries: true },
    ))).toEqual(['read', 'read', 'preparing']);

    expect(states(buildSeriesPath(
      autoSeries({
        days: [
          day(1, { isRead: true, readAt: monday.toISOString() }),
          day(2, { isRead: true, readAt: tuesday.toISOString() }),
          day(3),
        ],
        currentDay: 3,
      }),
      wednesday,
      { isCurrentSeries: true },
    ))).toEqual(['read', 'read', 'today']);
  });

  it('keeps a rowless currentDay locked when the series is not current', () => {
    const thursday = new Date(2026, 5, 11, 8, 0, 0);
    const nodes = buildSeriesPath(
      autoSeries({
        days: [
          day(1, { isRead: true, readAt: new Date(2026, 5, 8, 18, 0, 0).toISOString() }),
          day(2, { isRead: true, readAt: new Date(2026, 5, 9, 18, 0, 0).toISOString() }),
        ],
        currentDay: 3,
      }),
      thursday,
      { isCurrentSeries: false },
    );
    expect(states(nodes)).toEqual(['read', 'read', 'locked']);
    expect(nodes[2]?.state).not.toBe('preparing');
  });

  it('assigns date words from an injected now', () => {
    const monday = new Date(2026, 5, 8, 12, 0, 0);
    const thursday = new Date(2026, 5, 11, 8, 0, 0);
    const wednesday = new Date(2026, 5, 10, 10, 0, 0);

    const behind = buildSeriesPath(
      autoSeries({
        days: [
          day(1, { isRead: true, readAt: monday.toISOString() }),
          day(2),
        ],
        currentDay: 2,
      }),
      thursday,
      { isCurrentSeries: true },
    );
    expect(behind[1]?.dateWord).toBe('today');
    expect(behind[2]?.dateWord).toBe('tomorrow');

    const lateSubmit = buildSeriesPath(
      autoSeries({
        days: [day(1, { isRead: true, readAt: monday.toISOString() })],
        currentDay: 2,
      }),
      wednesday,
      { isCurrentSeries: true },
    );
    expect(lateSubmit[1]?.dateWord).toBe('tomorrow');
    expect(lateSubmit[2]?.dateWord).toEqual({ weekday: 5 });

    const afterMidnight = buildSeriesPath(
      autoSeries({
        days: [day(1)],
        currentDay: 1,
        seriesStartDate: new Date(2026, 5, 8, 23, 50, 0).toISOString(),
      }),
      new Date(2026, 5, 9, 0, 2, 0),
      { isCurrentSeries: true },
    );
    const namedWeekdays = afterMidnight
      .map((node) => (node.dateWord && typeof node.dateWord === 'object' ? node.dateWord.weekday : null))
      .filter((weekday): weekday is 0 | 1 | 2 | 3 | 4 | 5 | 6 => weekday != null);
    expect(namedWeekdays).not.toContain(1);
    expect(afterMidnight.some((node) => node.dateWord === 'today' && node.dayNumber === 1)).toBe(true);

    const missingAnchor = buildSeriesPath(
      autoSeries({
        seriesStartDate: undefined,
        days: [day(1)],
      }),
      thursday,
      { isCurrentSeries: true },
    );
    expect(missingAnchor.every((node) => node.dateWord === null)).toBe(true);
  });

  it('builds a planned path of preparing then locked nodes', () => {
    const now = new Date(2026, 5, 8, 12, 0, 0);
    const nodes = buildPlannedSeriesPath(3, now);
    expect(states(nodes)).toEqual(['preparing', 'locked', 'locked']);
  });
});
