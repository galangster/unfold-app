import { completionAnnouncement, resolveWeekCompletion } from '../completion-next-step';
import { readSeriesWeeks } from '../series-weeks';
import { canonicalGeneratedDayId } from '../devotional-canonical-days';
import type { Devotional, DevotionalDay } from '../store';
import { makeChapteredArc } from './fixtures/chaptered-arc';

const now = new Date(2026, 9, 24, 12);
const todayIso = new Date(2026, 9, 24, 9).toISOString();
const earlierIso = new Date(2026, 9, 18, 9).toISOString();
const startIso = new Date(2026, 9, 18, 8).toISOString();

function day(n: number, over: Partial<DevotionalDay> = {}): DevotionalDay {
  return {
    id: canonicalGeneratedDayId('devo-week', n), devotionalId: 'devo-week', dayNumber: n,
    title: `Synthetic day ${n}`, scriptureReference: 'Psalm 1:1', scriptureText: 's', bodyText: 'b',
    quotableLine: 'q', isRead: false, ...over,
  };
}

/** The reader just finished `completed` today; earlier days were read before. */
function series(completed: number, over: Partial<Devotional> = {}): Devotional {
  const days = Array.from({ length: completed }, (_, i) => day(i + 1, {
    isRead: true, readAt: i + 1 === completed ? todayIso : earlierIso,
  }));
  return {
    id: 'devo-week', title: 'Synthetic Series', totalDays: 28, currentDay: Math.min(completed + 1, 28),
    createdAt: startIso, seriesStartDate: startIso, generationMode: 'progressive', days,
    userContext: { name: '', aboutMe: '', currentSituation: '', emotionalState: '' },
    seriesArc: makeChapteredArc(['planned', 'planned', 'outline', 'outline']),
    ...over,
  } as Devotional;
}

const weeksOf = (devotional: Devotional | null) =>
  readSeriesWeeks(devotional?.seriesArc, { totalDays: devotional?.totalDays, nowMs: now.getTime() });
const resolve = (devotional: Devotional | null, completed: number, seriesPaused = false) =>
  resolveWeekCompletion(devotional, weeksOf(devotional), completed, now, { seriesPaused });

describe('resolveWeekCompletion (spec r2 section 7)', () => {
  it('shows after days 7, 14 and 21 of a chaptered series, never on day 28', () => {
    expect(resolve(series(7), 7)?.title).toBe('Week 1 complete');
    expect(resolve(series(14), 14)?.title).toBe('Week 2 complete');
    expect(resolve(series(21), 21)?.title).toBe('Week 3 complete');
    expect(resolve(series(28), 28)).toBeNull();
    expect(resolve(series(6), 6)).toBeNull();
    expect(resolve(series(8), 8)).toBeNull();
  });

  it('never shows for a legacy series or a missing devotional', () => {
    const legacyArc = makeChapteredArc();
    delete legacyArc.planning;
    expect(resolve(series(7, { seriesArc: legacyArc }), 7)).toBeNull();
    expect(resolve(null, 7)).toBeNull();
  });

  it('names the next week by the name rule and says tomorrow by pacing', () => {
    expect(resolve(series(7), 7)).toEqual({
      title: 'Week 1 complete',
      line: '1 of 4 weeks · 7 of 28 days',
      spokenLine: '1 of 4 weeks, 7 of 28 days',
      nextLine: 'Week 2 · Synthetic Week Two begins tomorrow',
    });
    expect(resolve(series(14), 14)?.nextLine).toBe('Week 3 begins tomorrow');
  });

  it('says the next week is ready when pacing already opens its first day', () => {
    // Day 7 was read on an earlier day, and day 8 is written: it opens now.
    const devotional = series(7);
    devotional.days[6] = { ...devotional.days[6], readAt: earlierIso };
    devotional.days.push(day(8));
    expect(resolve(devotional, 7)?.nextLine).toBe('Week 2 · Synthetic Week Two is ready');
  });

  it('promises nothing for a paused series (R4)', () => {
    expect(resolve(series(7), 7, true)?.nextLine).toBeNull();
    expect(resolve(series(7), 7, true)?.title).toBe('Week 1 complete');
  });
});

describe('completionAnnouncement (row 20)', () => {
  const weeks = weeksOf(series(7));

  it('announces "Week N complete" on days 7, 14 and 21 of a chaptered series', () => {
    expect(completionAnnouncement(weeks, 7, false)).toBe('Week 1 complete');
    expect(completionAnnouncement(weeks, 21, false)).toBe('Week 3 complete');
  });

  it('keeps the series and day announcements', () => {
    expect(completionAnnouncement(weeks, 28, true)).toBe('Congratulations! You’ve completed this devotional series.');
    expect(completionAnnouncement(weeks, 9, false)).toBe('Day 9 completed. Great job!');
    expect(completionAnnouncement(null, 7, false)).toBe('Day 7 completed. Great job!');
  });
});
