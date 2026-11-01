import type { SeriesArc } from '../store';
import { makeChapteredArc } from './fixtures/chaptered-arc';
import {
  WEEK_PREPARING_STALE_MS,
  dayFraming,
  weekProgressLabel,
  withholdsWeekPromise,
  findWeekForDay,
  readSeriesWeeks,
  weekCompleteAnnouncement,
  weekCompleteMoment,
  weekFinishedBy,
  weekLabel,
  weekRowDetail,
  weekRowSpokenLabel,
  weekRowTitle,
  weeksHeadingLabel,
} from '../series-weeks';

const NOW_MS = Date.parse('2026-10-24T12:00:00.000Z');

describe('readSeriesWeeks', () => {
  it('reads four weeks of a chaptered arc and shows a name only for a planned week', () => {
    const weeks = readSeriesWeeks(makeChapteredArc(['planned', 'outline', 'preparing', 'outline_only']), { nowMs: NOW_MS });
    expect(weeks?.totalDays).toBe(28);
    expect(weeks?.weeks.map((week) => [week.index, week.fromDay, week.toDay, week.name])).toEqual([
      [1, 1, 7, 'Synthetic Week One'],
      [2, 8, 14, null],
      [3, 15, 21, null],
      [4, 22, 28, null],
    ]);
  });

  it('returns null for a legacy arc, a missing arc, or bad planning (R6)', () => {
    expect(readSeriesWeeks(null)).toBeNull();
    expect(readSeriesWeeks(undefined)).toBeNull();
    const { planning: _planning, ...legacy } = makeChapteredArc();
    void _planning;
    expect(readSeriesWeeks(legacy as SeriesArc)).toBeNull();
    const arc = makeChapteredArc();
    expect(readSeriesWeeks({ ...arc, planning: { ...arc.planning!, mode: 'other' as 'chapters' } })).toBeNull();
    expect(readSeriesWeeks({ ...arc, planning: { ...arc.planning!, version: 2 as 1 } })).toBeNull();
    expect(readSeriesWeeks({ ...arc, planning: { ...arc.planning!, chapters: [] } })).toBeNull();
    // A gap between weeks.
    expect(readSeriesWeeks({ ...arc, planning: { ...arc.planning!, chapters: arc.planning!.chapters.map((c) => (c.index === 2 ? { ...c, fromDay: 9 } : c)) } })).toBeNull();
    // Weeks that stop short of the series total.
    expect(readSeriesWeeks({ ...arc, totalDaysPlanned: 30 })).toBeNull();
    // An unknown status.
    expect(readSeriesWeeks({ ...arc, planning: { ...arc.planning!, chapters: arc.planning!.chapters.map((c) => (c.index === 2 ? { ...c, status: 'later' as 'planned' } : c)) } })).toBeNull();
  });

  it('returns null when acts are missing or do not mirror the weeks', () => {
    const arc = makeChapteredArc();
    expect(readSeriesWeeks({ ...arc, acts: undefined })).toBeNull();
    expect(readSeriesWeeks({ ...arc, acts: arc.acts!.slice(0, 3) })).toBeNull();
    expect(readSeriesWeeks({ ...arc, acts: arc.acts!.map((act, i) => (i === 1 ? { ...act, toDay: 15 } : act)) })).toBeNull();
    expect(readSeriesWeeks({ ...arc, acts: arc.acts!.map((act, i) => (i === 0 ? { ...act, name: '  ' } : act)) })).toBeNull();
  });

  it('reads a preparing week older than 24 hours, or with no start time, as outline', () => {
    const fresh = new Date(NOW_MS - WEEK_PREPARING_STALE_MS + 60_000).toISOString();
    const stale = new Date(NOW_MS - WEEK_PREPARING_STALE_MS - 60_000).toISOString();
    const arc = makeChapteredArc(['planned', 'preparing', 'preparing', 'preparing']);
    arc.planning!.chapters[1].preparingSince = fresh;
    arc.planning!.chapters[2].preparingSince = stale;
    const weeks = readSeriesWeeks(arc, { nowMs: NOW_MS })!;
    expect(weeks.weeks.map((week) => week.status)).toEqual(['planned', 'preparing', 'outline', 'outline']);
  });
});

describe('week framing strings', () => {
  const weeks = readSeriesWeeks(makeChapteredArc(['planned', 'planned', 'outline', 'outline']), { nowMs: NOW_MS })!;

  it('frames a day inside its week', () => {
    expect(findWeekForDay(weeks, 10)).toMatchObject({ dayInWeek: 3, week: { index: 2 } });
    expect(findWeekForDay(weeks, 29)).toBeNull();
    expect(dayFraming(weeks, 10, 28)).toEqual({
      inWeek: true,
      label: 'Week 2 · Day 3 of 7',
      spoken: 'Week 2, day 3 of 7',
      caption: 'Synthetic Week Two',
    });
    expect(weekProgressLabel(weeks, 9, 28)).toBe('9 of 28 days complete. Week 2 of 4.');
    expect(weekProgressLabel(weeks, 7, 28)).toBe('7 of 28 days complete. Week 1 of 4.');
    expect(weekProgressLabel(weeks, 0, 28)).toBe('0 of 28 days complete. Week 1 of 4.');
    expect(dayFraming(weeks, 8, 28).label).toBe('Week 2 · Day 1 of 7');
  });

  it('falls back to today\'s day framing without weeks (R6)', () => {
    expect(dayFraming(null, 10, 28)).toEqual({
      inWeek: false,
      label: 'Day 10 of 28',
      spoken: 'day 10 of 28',
      caption: null,
    });
    expect(weekProgressLabel(null, 9, 28)).toBeUndefined();
  });

  it('captions with the week name only once the week is planned', () => {
    expect(dayFraming(weeks, 16, 28).caption).toBeNull();
    expect(weekLabel(weeks.weeks[1])).toBe('Week 2 · Synthetic Week Two');
    expect(weekLabel(weeks.weeks[2])).toBe('Week 3');
  });

  it('titles series detail rows by week state (Ruled 6)', () => {
    const all = readSeriesWeeks(makeChapteredArc(['planned', 'outline', 'preparing', 'outline_only']), { nowMs: NOW_MS })!;
    all.weeks[2].status = 'preparing';
    expect(all.weeks.map((week) => weekRowTitle(week, { withholdsPromise: false }))).toEqual([
      'Week 1 · Synthetic Week One',
      'Week 2 · Planned when you reach it',
      'Week 3 · Planned when you reach it',
      'Week 4',
    ]);
    // A paused series promises nothing (R4).
    expect(all.weeks.map((week) => weekRowTitle(week, { withholdsPromise: true }))).toEqual([
      'Week 1 · Synthetic Week One',
      'Week 2',
      'Week 3',
      'Week 4',
    ]);
  });

  it('gives each row its days and progress', () => {
    const [w1, w2, w3] = weeks.weeks;
    expect(weekRowDetail(w1, 'done', 7)).toBe('Days 1-7 · Complete');
    expect(weekRowDetail(w2, 'current', 0)).toBe('Days 8-14 · Your current week');
    expect(weekRowDetail(w2, 'current', 3)).toBe('Days 8-14 · Your current week');
    expect(weekRowDetail(w2, 'available', 2)).toBe('Days 8-14 · 2 of 7 days complete');
    expect(weekRowDetail(w3, 'upcoming', 0)).toBe('Days 15-21 · Still to come');
  });

  it('speaks each row without the separator', () => {
    const [w1, w2, w3] = weeks.weeks;
    expect(weekRowSpokenLabel(w2, 'current', 0, { withholdsPromise: false })).toBe('Week 2, Synthetic Week Two, days 8 to 14, current week');
    expect(weekRowSpokenLabel(w2, 'current', 3, { withholdsPromise: false })).toBe('Week 2, Synthetic Week Two, days 8 to 14, current week');
    expect(weekRowSpokenLabel(w3, 'upcoming', 0, { withholdsPromise: false })).toBe('Week 3, planned when you reach it, days 15 to 21, still to come');
    expect(weekRowSpokenLabel(w3, 'upcoming', 0, { withholdsPromise: true })).toBe('Week 3, days 15 to 21, still to come');
    expect(weekRowSpokenLabel(w1, 'done', 7, { withholdsPromise: false })).toBe('Week 1, Synthetic Week One, days 1 to 7, complete');
    for (const label of [weekRowSpokenLabel(w2, 'current', 3, { withholdsPromise: false }), dayFraming(weeks, 10, 28).spoken]) {
      expect(label).not.toContain('·');
    }
  });

  it('heads series detail with weeks and days', () => {
    expect(weeksHeadingLabel(weeks)).toBe('4 weeks · 28 days');
  });
});

describe('week-complete moment', () => {
  const planned = readSeriesWeeks(makeChapteredArc(['planned', 'planned', 'outline', 'outline']), { nowMs: NOW_MS })!;

  it('shows after days 7, 14 and 21 only, never on day 28', () => {
    const shown = Array.from({ length: 28 }, (_, i) => i + 1)
      .filter((day) => weekCompleteMoment(planned, day, 'tomorrow') !== null);
    expect(shown).toEqual([7, 14, 21]);
    expect(weekCompleteMoment(null, 7, 'tomorrow')).toBeNull();
  });

  it('names the finished week and the next one by the name rule', () => {
    expect(weekCompleteMoment(planned, 7, 'tomorrow')).toEqual({
      title: 'Week 1 complete',
      line: '1 of 4 weeks · 7 of 28 days',
      spokenLine: '1 of 4 weeks, 7 of 28 days',
      nextLine: 'Week 2 · Synthetic Week Two begins tomorrow',
    });
    expect(weekCompleteMoment(planned, 14, 'tomorrow')?.nextLine).toBe('Week 3 begins tomorrow');
    expect(weekCompleteMoment(planned, 14, 'now')?.nextLine).toBe('Week 3 is ready');
    // No promise without pacing to back it, and none for a paused series.
    expect(weekCompleteMoment(planned, 14, null)?.nextLine).toBeNull();
  });

  it('finds the week a day finishes, never the last one', () => {
    expect(weekFinishedBy(planned, 14)?.index).toBe(2);
    expect(weekFinishedBy(planned, 13)).toBeNull();
    expect(weekFinishedBy(planned, 28)).toBeNull();
  });

  it('announces the finished week', () => {
    expect(weekCompleteAnnouncement(planned, 7)).toBe('Week 1 complete');
    expect(weekCompleteAnnouncement(planned, 21)).toBe('Week 3 complete');
    expect(weekCompleteAnnouncement(planned, 28)).toBeNull();
    expect(weekCompleteAnnouncement(planned, 6)).toBeNull();
    expect(weekCompleteAnnouncement(null, 7)).toBeNull();
  });
});

describe('withholdsWeekPromise (R4, fail closed on entitlement)', () => {
  it('promises only for a current series with granted premium', () => {
    expect(withholdsWeekPromise(false, 'granted')).toBe(false);
    expect(withholdsWeekPromise(false, 'denied')).toBe(true);
    expect(withholdsWeekPromise(false, 'unknown')).toBe(true);
    expect(withholdsWeekPromise(true, 'granted')).toBe(true);
  });
});
