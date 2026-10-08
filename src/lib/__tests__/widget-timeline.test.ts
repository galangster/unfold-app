import {
  getNextMidnight,
  getWeeklyProgress,
  buildWidgetSharedProps,
  buildWidgetTimelineEntries,
  type WidgetStateSlice,
} from '@/lib/widget-timeline';

const day = (over: Record<string, unknown> = {}) => ({
  dayNumber: 1,
  title: 'Day title',
  scriptureReference: 'John 1:1',
  scriptureText: 'In the beginning…',
  bodyText: '',
  quotableLine: 'A line',
  isRead: false,
  ...over,
});

const devo = (days: unknown[], over: Record<string, unknown> = {}) =>
  ({
    id: 'd1',
    title: 'Quiet Path Series',
    totalDays: 3,
    currentDay: 1,
    days,
    createdAt: '2026-06-01',
    userContext: { name: '', aboutMe: '', currentSituation: '', emotionalState: '' },
    ...over,
  }) as never;

const slice = (over: Partial<WidgetStateSlice> = {}): WidgetStateSlice => ({
  streakCurrent: 3,
  streakLongest: 5,
  streakLastReadDate: null,
  readingDuration: 5,
  currentDevotional: null,
  allDevotionals: [],
  ...over,
});

describe('getNextMidnight', () => {
  it('returns 00:00:00.000 of the next calendar day', () => {
    const now = new Date(2026, 5, 10, 20, 15, 30, 123); // Wed Jun 10, 20:15
    expect(getNextMidnight(now).getTime()).toBe(new Date(2026, 5, 11, 0, 0, 0, 0).getTime());
  });

  it('rolls over month boundaries', () => {
    const now = new Date(2026, 5, 30, 23, 59, 59);
    expect(getNextMidnight(now).getTime()).toBe(new Date(2026, 6, 1, 0, 0, 0, 0).getTime());
  });
});

describe('getWeeklyProgress (M-Su bits)', () => {
  it('is all zeros with no devotionals', () => {
    expect(getWeeklyProgress([], new Date(2026, 5, 10, 14, 0))).toBe('0,0,0,0,0,0,0');
  });

  it('marks read days of the current week', () => {
    const d = devo([
      day({ dayNumber: 1, readAt: new Date(2026, 5, 8, 9, 0).toISOString() }), // Mon
      day({ dayNumber: 2, readAt: new Date(2026, 5, 10, 9, 0).toISOString() }), // Wed
    ]);
    expect(getWeeklyProgress([d], new Date(2026, 5, 10, 14, 0))).toBe('1,0,1,0,0,0,0');
  });

  it('aggregates ACROSS devotionals (RT-WIDGETS-6)', () => {
    const a = devo([day({ dayNumber: 1, readAt: new Date(2026, 5, 8, 9, 0).toISOString() })]);
    const b = devo(
      [day({ dayNumber: 1, readAt: new Date(2026, 5, 9, 9, 0).toISOString() })],
      { id: 'd2', title: 'Other Series' }
    );
    expect(getWeeklyProgress([a, b], new Date(2026, 5, 10, 14, 0))).toBe('1,1,0,0,0,0,0');
  });

  it('Sunday read shows in slot 7; next-midnight (Monday) starts a fresh week', () => {
    const sundayNight = new Date(2026, 5, 14, 23, 0); // Sun Jun 14
    const d = devo([day({ dayNumber: 1, readAt: new Date(2026, 5, 14, 8, 0).toISOString() })]);
    expect(getWeeklyProgress([d], sundayNight)).toBe('0,0,0,0,0,0,1');
    expect(getWeeklyProgress([d], getNextMidnight(sundayNight))).toBe('0,0,0,0,0,0,0');
  });

  it('Sat/Sun then Monday reads give 0,0,0,0,0,1,1 then 1,0,0,0,0,0,0', () => {
    const saturday = new Date(2026, 5, 13, 10, 0);
    const sunday = new Date(2026, 5, 14, 10, 0);
    const monday = new Date(2026, 5, 15, 10, 0);
    const weekend = devo([
      day({ dayNumber: 1, readAt: saturday.toISOString() }),
      day({ dayNumber: 2, readAt: sunday.toISOString() }),
    ]);
    expect(getWeeklyProgress([weekend], sunday)).toBe('0,0,0,0,0,1,1');
    const withMonday = devo([
      day({ dayNumber: 1, readAt: saturday.toISOString() }),
      day({ dayNumber: 2, readAt: sunday.toISOString() }),
      day({ dayNumber: 3, readAt: monday.toISOString() }),
    ]);
    expect(getWeeklyProgress([withMonday], monday)).toBe('1,0,0,0,0,0,0');
  });
});

describe('buildWidgetSharedProps', () => {
  it('hasReadToday compares streakLastReadDate against forDate (not wall clock)', () => {
    const s = slice({ streakLastReadDate: new Date(2026, 5, 10, 9, 0).toISOString() });
    expect(buildWidgetSharedProps(s, new Date(2026, 5, 10, 14, 0)).hasReadToday).toBe(true);
    expect(buildWidgetSharedProps(s, new Date(2026, 5, 11, 0, 0)).hasReadToday).toBe(false);
  });

  it('fills safe defaults with no devotional', () => {
    const p = buildWidgetSharedProps(slice(), new Date(2026, 5, 10, 14, 0));
    expect(p.devotionalTitle).toBe('Unfold');
    expect(p.dayTitle).toBe('Start your series');
    expect(p.dayNumber).toBe(0);
    expect(p.totalDays).toBe(0);
    expect(p.weeklyProgress).toBe('0,0,0,0,0,0,0');
    expect(p.lockLine).toBe('');
    // Wed Jun 10 2026 → Monday-based index 2
    expect(p.weekTodayIndex).toBe(2);
  });

  it('weekTodayIndex maps Sunday to the last slot', () => {
    const p = buildWidgetSharedProps(slice(), new Date(2026, 5, 14, 14, 0)); // Sun Jun 14
    expect(p.weekTodayIndex).toBe(6);
  });

  it('uses the series boundary for totalDays', () => {
    const d = devo([day()], {
      totalDays: 7,
      seriesArc: { totalDaysPlanned: 3 },
    });
    const p = buildWidgetSharedProps(slice({ currentDevotional: d }), new Date(2026, 5, 10, 14, 0));
    expect(p.totalDays).toBe(3);
  });
});

describe('buildWidgetTimelineEntries', () => {
  it('returns [now, nextMidnight] entries built by the SAME helper', () => {
    const now = new Date(2026, 5, 10, 14, 0);
    const s = slice({ streakLastReadDate: new Date(2026, 5, 10, 9, 0).toISOString() });
    const entries = buildWidgetTimelineEntries(s, now);
    expect(entries).toHaveLength(2);
    expect(entries[0].date.getTime()).toBe(now.getTime());
    expect(entries[1].date.getTime()).toBe(new Date(2026, 5, 11, 0, 0, 0, 0).getTime());
    expect(entries[0].props.hasReadToday).toBe(true);
    expect(entries[1].props.hasReadToday).toBe(false); // the staleness fix
    expect(entries[0].props.streakCount).toBe(3);
    expect(entries[1].props.streakCount).toBe(3); // streak not zeroed at midnight
  });

  it('carries the lock-screen verse line in BOTH entries (UnfoldVerse)', () => {
    const d = devo([
      day({
        scriptureReference: 'Matthew 11:28-29',
        scriptureText:
          'Come to Me, all you who are weary and burdened, and I will give you rest. Take My yoke upon you and learn from Me.',
      }),
    ]);
    const entries = buildWidgetTimelineEntries(
      slice({ currentDevotional: d, allDevotionals: [d] }),
      new Date(2026, 5, 10, 14, 0)
    );
    for (const entry of entries) {
      expect(entry.props.lockLine).toBe(
        'Come to Me, all you who are weary and burdened, and I will give you rest.'
      );
      expect(entry.props.scriptureReference).toBe('Matthew 11:28-29');
    }
  });

  it('keeps the day read today on the Lock Screen until midnight, though advanceDay moved currentDay on', () => {
    const readAt = new Date(2026, 5, 10, 9, 0).toISOString();
    const d = devo(
      [
        day({ dayNumber: 1, isRead: true, readAt: new Date(2026, 5, 8, 9, 0).toISOString() }),
        day({ dayNumber: 2, isRead: true, readAt: new Date(2026, 5, 9, 9, 0).toISOString() }),
        day({
          dayNumber: 3,
          isRead: true,
          readAt,
          scriptureReference: 'Psalm 23:1-2',
          scriptureText: 'The LORD is my shepherd; I shall not want. He makes me lie down in green pastures.',
        }),
        day({
          dayNumber: 4,
          scriptureReference: 'Psalm 46:10',
          scriptureText: 'Be still, and know that I am God. I will be exalted among the nations.',
        }),
      ],
      { totalDays: 7, currentDay: 4 }
    );
    const [today, midnight] = buildWidgetTimelineEntries(
      slice({ currentDevotional: d, allDevotionals: [d], streakLastReadDate: readAt }),
      new Date(2026, 5, 10, 14, 0)
    );
    expect(today.props).toMatchObject({
      lockDayNumber: 3,
      lockDaysRead: 3,
      lockReadToday: true,
      lockReference: 'Psalm 23:1-2',
      lockLine: 'The LORD is my shepherd; I shall not want.',
      hasReadToday: true,
    });
    expect(midnight.props).toMatchObject({
      lockDayNumber: 4,
      lockDaysRead: 3,
      lockReadToday: false,
      lockReference: 'Psalm 46:10',
      lockLine: 'Be still, and know that I am God.',
      hasReadToday: false,
    });
  });

  it('marks the Lock Screen read today only for a reading in this series', () => {
    // Read another series this morning: the streak says read, this series has not been.
    const d = devo(
      [day({ dayNumber: 1, isRead: true, readAt: new Date(2026, 5, 8, 9, 0).toISOString() }), day({ dayNumber: 2 })],
      { totalDays: 7, currentDay: 2 }
    );
    const p = buildWidgetSharedProps(
      slice({ currentDevotional: d, streakLastReadDate: new Date(2026, 5, 10, 8, 0).toISOString() }),
      new Date(2026, 5, 10, 14, 0)
    );
    expect(p).toMatchObject({ hasReadToday: true, lockReadToday: false });
  });

  it('fills the Lock Screen ring only with days inside the series boundary', () => {
    // A repaired three-day plan can keep a stored day 4; Today does not count it.
    const d = devo(
      [
        day({ dayNumber: 1, isRead: true, readAt: new Date(2026, 5, 8, 9, 0).toISOString() }),
        day({ dayNumber: 2 }),
        day({ dayNumber: 4, isRead: true, readAt: new Date(2026, 5, 9, 9, 0).toISOString() }),
      ],
      { totalDays: 7, currentDay: 2, seriesArc: { totalDaysPlanned: 3 } }
    );
    const p = buildWidgetSharedProps(slice({ currentDevotional: d }), new Date(2026, 5, 10, 14, 0));
    expect(p.lockDaysRead).toBe(1);
  });

  it('keeps the series day on the Lock Screen while that day has no content yet', () => {
    const d = devo(
      [day({ dayNumber: 1, isRead: true, readAt: new Date(2026, 5, 8, 9, 0).toISOString() })],
      { totalDays: 7, currentDay: 2 }
    );
    const [entry] = buildWidgetTimelineEntries(
      slice({ currentDevotional: d, allDevotionals: [d] }),
      new Date(2026, 5, 10, 14, 0)
    );
    expect(entry.props).toMatchObject({ lockDayNumber: 2, lockReference: '', lockLine: '' });
  });
});

describe('the Today and Dashboard widgets name the day Today shows', () => {
  // Day 5 was read this morning, so advanceDay moved currentDay to Day 6,
  // which Today keeps locked until tomorrow.
  const readThisMorning = new Date(2026, 9, 7, 8, 0).toISOString();
  const now = new Date(2026, 9, 7, 14, 0);
  const seriesDay = (dayNumber: number, over: Record<string, unknown> = {}) =>
    day({
      dayNumber,
      title: `Title ${dayNumber}`,
      scriptureReference: `Psalm ${dayNumber}:1`,
      scriptureText: `Verse ${dayNumber}.`,
      quotableLine: `Line ${dayNumber}`,
      ...over,
    });
  const readDays = (lastReadAt: string) =>
    [1, 2, 3, 4, 5].map((n) =>
      seriesDay(n, {
        isRead: true,
        readAt: n === 5 ? lastReadAt : new Date(2026, 9, 2 + n, 8, 0).toISOString(),
      })
    );
  const entriesFor = (days: unknown[], streakLastReadDate: string | null = readThisMorning) => {
    const d = devo(days, { totalDays: 7, currentDay: 6 });
    return buildWidgetTimelineEntries(
      slice({ currentDevotional: d, allDevotionals: [d], streakLastReadDate }),
      now
    );
  };

  it('keeps the day read today until midnight while the next day is not on the device', () => {
    const [today] = entriesFor(readDays(readThisMorning));
    expect(today.props).toMatchObject({
      dayTitle: 'Title 5',
      dayNumber: 5,
      scriptureReference: 'Psalm 5:1',
      scriptureText: 'Verse 5.',
      quotableLine: 'Line 5',
      nextDayTitle: '',
      lockDayNumber: 5,
    });
  });

  it('says the next day is not on the device yet at midnight, never "Start your series"', () => {
    const [, midnight] = entriesFor(readDays(readThisMorning));
    expect(midnight.props).toMatchObject({
      dayTitle: 'Day 6 isn’t available yet',
      dayNumber: 6,
      scriptureReference: '',
      scriptureText: '',
      quotableLine: '',
      lockDayNumber: 6,
    });
  });

  it('keeps a behind reader on the day read today though the next day is on the device', () => {
    const [today, midnight] = entriesFor([...readDays(readThisMorning), seriesDay(6)]);
    expect(today.props).toMatchObject({
      dayTitle: 'Title 5',
      dayNumber: 5,
      scriptureReference: 'Psalm 5:1',
      quotableLine: 'Line 5',
      nextDayTitle: 'Title 6',
      lockDayNumber: 5,
    });
    expect(midnight.props).toMatchObject({
      dayTitle: 'Title 6',
      dayNumber: 6,
      scriptureReference: 'Psalm 6:1',
      quotableLine: 'Line 6',
      nextDayTitle: '',
      lockDayNumber: 6,
    });
  });

  it('names the unread day by number before its content reaches the device', () => {
    // Day 5 was read yesterday: Day 6 is today's reading, not pulled yet.
    const readYesterday = new Date(2026, 9, 6, 8, 0).toISOString();
    const [today] = entriesFor(readDays(readYesterday), readYesterday);
    expect(today.props).toMatchObject({
      dayTitle: 'Day 6 isn’t available yet',
      dayNumber: 6,
      scriptureReference: '',
      quotableLine: '',
      lockDayNumber: 6,
    });
  });
});
