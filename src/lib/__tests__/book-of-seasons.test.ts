import { canonicalGeneratedDayId } from '../devotional-canonical-days';
import {
  buildBookChapters,
  buildBookTodayPage,
  chapterStatusLabel,
  isSeriesComplete,
  listDaysInOrder,
  listSeriesActs,
  resolveBookOpenDayNumber,
} from '../book-of-seasons';
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
    title: overrides.title ?? `Day ${dayNumber} title`,
    scriptureReference: 'John 1:1',
    scriptureText: 'Scripture',
    bodyText: 'Body',
    quotableLine: 'A real invitation line',
    isRead: false,
    reflectionQuestions: [],
    ...overrides,
  };
}

function series(overrides: Partial<Devotional> = {}): Devotional {
  return {
    id: 'devotional-1',
    title: 'Ordinary Hours',
    subtitle: 'Subtitle',
    days: [day({ dayNumber: 1 })],
    totalDays: 14,
    currentDay: 4,
    createdAt: '2026-05-01T00:00:00.000Z',
    updatedAt: '2026-05-01T00:00:00.000Z',
    generationMode: 'progressive',
    seriesStartDate: '2026-05-07T12:00:00.000Z',
    userContext: { name: '', aboutMe: '', currentSituation: '', emotionalState: '' },
    seriesArc: {
      totalDaysPlanned: 14,
      overarchingTheme: 'God in ordinary hours',
      narrativeShape: 'shape',
      dayHints: [],
      isOpenEnded: false,
      createdAt: '2026-05-01T00:00:00.000Z',
      acts: [
        { name: 'Wilderness', fromDay: 1, toDay: 7, function: 'Begin in the quiet.' },
        { name: 'A Quiet Place', fromDay: 8, toDay: 14, function: 'Stay with one word.' },
      ],
    },
    ...overrides,
  } as Devotional;
}

describe('listDaysInOrder', () => {
  it('copies before sorting so the store array stays untouched', () => {
    const days = [day({ dayNumber: 3 }), day({ dayNumber: 1 }), day({ dayNumber: 2 })];
    const ordered = listDaysInOrder(days);
    expect(days.map((item) => item.dayNumber)).toEqual([3, 1, 2]);
    expect(ordered.map((item) => item.dayNumber)).toEqual([1, 2, 3]);
  });
});

describe('listSeriesActs', () => {
  it('falls back to real days when act coverage is partial or overlaps', () => {
    const arc = series().seriesArc!;
    expect(listSeriesActs({ ...arc, acts: [arc.acts![0]] })).toEqual([]);
    expect(listSeriesActs({ ...arc, acts: [
      arc.acts![0], { ...arc.acts![1], fromDay: 7 },
    ] })).toEqual([]);
    expect(listSeriesActs({ ...arc, acts: [
      arc.acts![0], { ...arc.acts![1], fromDay: 9 },
    ] })).toEqual([]);
  });
  it('ignores invalid chapter ranges instead of inventing a journey from them', () => {
    const arc = series().seriesArc!;
    expect(listSeriesActs({ ...arc, acts: [
      { name: 'Reversed', fromDay: 7, toDay: 1, function: '' },
      { name: 'Outside series', fromDay: 8, toDay: 30, function: '' },
      { name: 'Invalid start', fromDay: 0, toDay: 7, function: '' },
    ] })).toEqual([]);
  });
  it('uses real act names and does not invent empty labels', () => {
    const acts = listSeriesActs(series().seriesArc);
    expect(acts.map((act) => act.name)).toEqual(['Wilderness', 'A Quiet Place']);
    expect(listSeriesActs({ ...series().seriesArc!, acts: undefined })).toEqual([]);
  });
});

describe('buildBookTodayPage', () => {
  it('keeps today actionable when an earlier canonical reading is missing', () => {
    const page = buildBookTodayPage(series({ currentDay: 4, days: [
      day({ dayNumber: 1, isRead: true, readAt: yesterdayIso }),
      day({ dayNumber: 4, title: 'Be still' }),
    ] }), now);
    expect(page).toMatchObject({ dayNumber: 4, contentReady: true, canOpen: true, action: 'continue' });
  });
  it('does not treat duplicate or surplus read records as a complete series', () => {
    const devotional = series({ totalDays: 3, seriesArc: undefined, days: [
      day({ dayNumber: 1, isRead: true }),
      day({ dayNumber: 1, isRead: true, id: 'duplicate-1' }),
      day({ dayNumber: 4, isRead: true }),
    ] });
    expect(isSeriesComplete(devotional)).toBe(false);
  });

  it('keeps earlier unfinished chapters available and counts each read day once', () => {
    const devotional = series({ currentDay: 8, days: [
      day({ dayNumber: 1, isRead: true }),
      day({ dayNumber: 1, isRead: true, id: 'duplicate-1' }),
      day({ dayNumber: 8 }),
    ] });
    const chapters = buildBookChapters(devotional, now);
    expect(chapters[0]).toMatchObject({ status: 'available', readCount: 1, dayCount: 7 });
    expect(chapterStatusLabel(chapters[0])).toBe('1 of 7 days complete');
    expect(resolveBookOpenDayNumber(devotional, chapters[0], now)).toBe(1);
  });
  it('opens the unread current day with real title and scripture', () => {
    const page = buildBookTodayPage(
      series({
        currentDay: 4,
        days: [
          day({ dayNumber: 1, isRead: true, readAt: yesterdayIso }),
          day({ dayNumber: 2, isRead: true, readAt: yesterdayIso }),
          day({ dayNumber: 3, isRead: true, readAt: yesterdayIso }),
          day({ dayNumber: 4, title: 'Be still' }),
        ],
      }),
      now,
    );

    expect(page).toMatchObject({
      dayNumber: 4,
      title: 'Be still',
      scriptureReference: 'John 1:1',
      invitation: 'A real invitation line',
      chapterName: 'Wilderness',
      chapterDayNumber: 4,
      chapterDayCount: 7,
      action: 'continue',
      canOpen: true,
      contentReady: true,
      eyebrow: 'today',
    });
  });

  it('keeps today on the completed page instead of advertising tomorrow', () => {
    const page = buildBookTodayPage(
      series({
        currentDay: 5,
        seriesStartDate: '2026-05-10T12:00:00.000Z',
        days: [
          day({ dayNumber: 1, isRead: true, readAt: yesterdayIso }),
          day({ dayNumber: 2, isRead: true, readAt: yesterdayIso }),
          day({ dayNumber: 3, isRead: true, readAt: yesterdayIso }),
          day({ dayNumber: 4, isRead: true, readAt: todayIso, title: 'Be still' }),
          day({ dayNumber: 5, title: 'Future title' }),
        ],
      }),
      now,
    );

    expect(page?.dayNumber).toBe(4);
    expect(page?.title).toBe('Be still');
    expect(page?.action).toBe('read-again');
    expect(page?.eyebrow).toBe('today-complete');
    expect(page?.title).not.toBe('Future title');
  });

  it('does not invent a title when today is still being prepared', () => {
    const page = buildBookTodayPage(
      series({
        currentDay: 2,
        seriesStartDate: new Date(2026, 4, 9, 12, 0, 0).toISOString(),
        days: [day({ dayNumber: 1, isRead: true, readAt: yesterdayIso })],
      }),
      now,
    );

    expect(page).toMatchObject({
      dayNumber: 2,
      title: undefined,
      scriptureReference: undefined,
      invitation: undefined,
      contentReady: false,
      canOpen: true,
      action: 'continue',
      eyebrow: 'preparing',
    });
  });

  it('marks a finished series complete and keeps a return action', () => {
    const finished = series({
      totalDays: 2,
      currentDay: 3,
      seriesArc: {
        ...series().seriesArc!,
        totalDaysPlanned: 2,
        acts: [{ name: 'Wilderness', fromDay: 1, toDay: 2, function: 'Begin.' }],
      },
      days: [
        day({ dayNumber: 1, isRead: true, readAt: yesterdayIso }),
        day({ dayNumber: 2, isRead: true, readAt: todayIso, title: 'Last page' }),
      ],
    });

    expect(isSeriesComplete(finished)).toBe(true);
    expect(buildBookTodayPage(finished, now)).toMatchObject({
      seriesComplete: true,
      eyebrow: 'series-complete',
      action: 'read-again',
      title: 'Last page',
    });
  });
});

describe('buildBookChapters', () => {
  it('maps real acts to done, current, and upcoming without future day titles', () => {
    const chapters = buildBookChapters(
      series({
        currentDay: 4,
        days: [
          day({ dayNumber: 1, isRead: true, readAt: yesterdayIso }),
          day({ dayNumber: 2, isRead: true, readAt: yesterdayIso }),
          day({ dayNumber: 3, isRead: true, readAt: yesterdayIso }),
          day({ dayNumber: 4 }),
        ],
      }),
      now,
    );

    expect(chapters).toHaveLength(2);
    expect(chapters[0]).toMatchObject({
      name: 'Wilderness',
      status: 'current',
      readCount: 3,
      dayCount: 7,
    });
    expect(chapters[1]).toMatchObject({
      name: 'A Quiet Place',
      status: 'upcoming',
      readCount: 0,
    });
    expect(chapterStatusLabel(chapters[0])).toBe('3 of 7 days complete');
    expect(chapterStatusLabel(chapters[1])).toBe('7 days · Still to come');
    expect(resolveBookOpenDayNumber(
      series({
        currentDay: 4,
        days: [
          day({ dayNumber: 1, isRead: true, readAt: yesterdayIso }),
          day({ dayNumber: 2, isRead: true, readAt: yesterdayIso }),
          day({ dayNumber: 3, isRead: true, readAt: yesterdayIso }),
          day({ dayNumber: 4 }),
        ],
      }),
      chapters[1],
      now,
    )).toBeNull();
  });

  it('opens a completed chapter on its last read day', () => {
    const devotional = series({
      currentDay: 8,
      days: [
        ...Array.from({ length: 7 }, (_, index) =>
          day({ dayNumber: index + 1, isRead: true, readAt: yesterdayIso }),
        ),
        day({ dayNumber: 8 }),
      ],
    });
    const chapters = buildBookChapters(devotional, now);
    expect(chapters[0].status).toBe('done');
    expect(resolveBookOpenDayNumber(devotional, chapters[0], now)).toBe(7);
    expect(resolveBookOpenDayNumber(devotional, chapters[1], now)).toBe(8);
  });
});
