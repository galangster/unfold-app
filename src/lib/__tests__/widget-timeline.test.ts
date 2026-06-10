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
});
