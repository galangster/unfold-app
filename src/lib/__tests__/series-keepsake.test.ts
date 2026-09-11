import { canonicalGeneratedDayId } from '../devotional-canonical-days';
import { buildSeriesKeepsake } from '../series-keepsake';
import type { CheckIn, Devotional, DevotionalDay, Highlight } from '../store';

const ID = 'keep-1';

function day(n: number, over: Partial<DevotionalDay> = {}): DevotionalDay {
  return {
    id: canonicalGeneratedDayId(ID, n),
    devotionalId: ID,
    dayNumber: n,
    title: `Day ${n}`,
    scriptureReference: 'John 1:1',
    scriptureText: 'Text',
    bodyText: 'Body',
    quotableLine: n === 2 ? '' : `Quotable ${n}`,
    isRead: true,
    act: `Act ${n}`,
    actOutcome: 'done',
    ...over,
  };
}

function series(over: Partial<Devotional> = {}): Devotional {
  return {
    id: ID,
    title: 'Keepsake Series',
    totalDays: 3,
    currentDay: 4,
    days: [day(1), day(2), day(3, { nextPick: { theme: 't', themeName: 'Hope', type: 'thematic', suggestedLength: 7, line: 'A 7-day series on hope.' } })],
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
    ...over,
  };
}

function highlight(over: Partial<Highlight> = {}): Highlight {
  return {
    id: 'h1',
    devotionalId: ID,
    devotionalTitle: 'Keepsake Series',
    dayNumber: 1,
    dayTitle: 'Day 1',
    highlightedText: 'A kept line',
    createdAt: '2026-06-08T13:00:00.000Z',
    ...over,
  };
}

function checkIn(over: Partial<CheckIn> = {}): CheckIn {
  return {
    id: 'c1',
    devotionalId: ID,
    dayNumber: 1,
    mood: 5,
    moodLabel: 'Grateful',
    freeText: 'User words',
    createdAt: '2026-06-08T14:00:00.000Z',
    timeOfDay: 'midday',
    ...over,
  };
}

describe('J8 series keepsake', () => {
  it('selects highlight, freeText, and a done act for a complete series', () => {
    const keepsake = buildSeriesKeepsake({
      devotional: series(),
      highlights: [highlight()],
      checkIns: [checkIn()],
    });
    expect(keepsake.line).toEqual({ text: 'A kept line', dayNumber: 1, source: 'highlight' });
    expect(keepsake.words).toEqual({ text: 'User words', dayNumber: 1, source: 'freeText' });
    expect(keepsake.act).toEqual({ text: 'Act 3', dayNumber: 3, status: 'done' });
    expect(keepsake.completeness).toBe('full');
    expect(keepsake.isSeriesComplete).toBe(true);
    expect(keepsake.nextPickLine).toBe('A 7-day series on hope.');
  });

  it('falls back to quotable and chip, and excludes pulse and completed rows', () => {
    const keepsake = buildSeriesKeepsake({
      devotional: series({
        days: [
          day(1, { quotableLine: 'Keep this quote' }),
          day(2, { isRead: false, act: undefined }),
        ],
        currentDay: 2,
      }),
      highlights: [highlight({ highlightedText: '   ' })],
      checkIns: [
        checkIn({ id: 'pulse', chipAnswer: 'day1-pulse:peace', freeText: undefined, createdAt: '2026-06-08T16:00:00.000Z' }),
        checkIn({ id: 'done', moodLabel: 'completed', chipAnswer: 'ignored', freeText: 'masked', createdAt: '2026-06-08T17:00:00.000Z' }),
        checkIn({ id: 'chip', chipAnswer: 'Steady', freeText: undefined, createdAt: '2026-06-08T15:00:00.000Z' }),
      ],
    });
    expect(keepsake.line).toEqual({ text: 'Keep this quote', dayNumber: 1, source: 'quotable' });
    expect(keepsake.words).toEqual({ text: 'Steady', dayNumber: 1, source: 'chip' });
    expect(keepsake.nextPickLine).toBeNull();
    // Day 1 is read with a done act, so the act slot is filled (spec S6: a done
    // act from any read day within the boundary). Only the finale is missing.
    expect(keepsake.act).toEqual({ text: 'Act 1', dayNumber: 1, status: 'done' });
    expect(keepsake.completeness).toBe('full');
    expect(keepsake.isSeriesComplete).toBe(false);
  });

  it('marks completeness none and omits nextPickLine until the series is complete', () => {
    const keepsake = buildSeriesKeepsake({
      devotional: series({
        days: [day(1, { isRead: true, act: undefined, quotableLine: '' })],
        currentDay: 2,
      }),
      highlights: [],
      checkIns: [],
    });
    expect(keepsake.line).toBeNull();
    expect(keepsake.words).toBeNull();
    expect(keepsake.act).toBeNull();
    expect(keepsake.completeness).toBe('none');
    expect(keepsake.nextPickLine).toBeNull();
  });

  it('uses the day nextPickLine when present', () => {
    const keepsake = buildSeriesKeepsake({
      devotional: series({
        days: [
          day(1),
          day(2),
          day(3, {
            nextPickLine: 'Keep going with a series on courage.',
            nextPick: {
              theme: 't',
              themeName: 'Hope',
              type: 'thematic',
              suggestedLength: 7,
              line: 'A 7-day series on hope.',
            },
          }),
        ],
      }),
      highlights: [highlight()],
      checkIns: [checkIn()],
    });
    expect(keepsake.nextPickLine).toBe('Keep going with a series on courage.');
  });

  it('builds with no price keys or currency text, including under premium denied', () => {
    const keepsake = buildSeriesKeepsake({
      devotional: series(),
      highlights: [highlight()],
      checkIns: [checkIn()],
    });
    const serialized = JSON.stringify(keepsake);
    expect(serialized).not.toMatch(/price|offer|package|\$|USD|EUR/i);
    expect(keepsake).not.toHaveProperty('price');
    expect(keepsake).not.toHaveProperty('offer');
    expect(keepsake).not.toHaveProperty('package');
  });
});
