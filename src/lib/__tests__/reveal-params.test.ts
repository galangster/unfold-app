/**
 * P3-4 item 2b — reveal params must resolve to a local devotional + day
 * before the screen writes anything to the store.
 */
import { parsePositiveInteger, resolveRevealOutcome, type RevealDevotional } from '../reveal-params';

const series: RevealDevotional = {
  id: 'devotional-1725000000000-abc123xyz',
  title: 'Quiet Strength',
  currentDay: 3,
  totalDays: 7,
  days: [
    { dayNumber: 1, title: 'Day One' },
    { dayNumber: 2, title: 'Day Two' },
    { dayNumber: 3, title: 'Day Three' },
  ],
};

const other: RevealDevotional = { id: 'other', title: 'Other', totalDays: 3, currentDay: 1, days: [] };

// The target of an `open` outcome, null for anything else.
const targetOf = (...args: Parameters<typeof resolveRevealOutcome>) => {
  const outcome = resolveRevealOutcome(...args);
  return outcome.kind === 'open' ? outcome.target : null;
};

describe('parsePositiveInteger', () => {
  it.each([
    ['3', 3],
    ['366', 366],
    [['4', '5'], 4],
    ['0', null],
    ['-1', null],
    ['1.5', null],
    ['1e3', null],
    ['007', null],
    ['3abc', null],
    ['', null],
    [undefined, null],
    ['1234567', null],
  ])('%j → %s', (input, expected) => {
    expect(parsePositiveInteger(input as string | string[] | undefined)).toBe(expected);
  });
});

describe('resolveRevealOutcome: open targets', () => {
  it('resolves an existing devotional and generated day from the store, not the params', () => {
    expect(targetOf({ devotionalId: series.id, dayNumber: '3' }, [other, series])).toEqual({
      devotionalId: series.id,
      dayNumber: 3,
      seriesTitle: 'Quiet Strength',
      dayTitle: 'Day Three',
      totalDays: 7,
    });
  });

  it('accepts a day inside totalDays that is not generated yet (still preparing)', () => {
    expect(targetOf({ devotionalId: series.id, dayNumber: '7' }, [{ ...series, currentDay: 7 }])).toMatchObject({
      dayNumber: 7,
      dayTitle: null,
    });
  });

  it('accepts a day beyond totalDays when the days array is longer (stretched series)', () => {
    const stretched: RevealDevotional = { ...series, totalDays: 2 };
    expect(targetOf({ devotionalId: series.id, dayNumber: '3' }, [stretched])).toMatchObject({
      dayNumber: 3,
      totalDays: 2,
    });
    expect(targetOf({ devotionalId: series.id, dayNumber: '4' }, [stretched])).toBeNull();
  });

  it('uses the first value of an array param (repeated query keys)', () => {
    expect(targetOf({ devotionalId: [series.id, 'x'], dayNumber: ['2', '9'] }, [series])).toMatchObject({
      dayNumber: 2,
    });
  });

  it('returns null when the devotional does not exist locally', () => {
    expect(targetOf({ devotionalId: 'nope', dayNumber: '1' }, [series])).toBeNull();
    expect(targetOf({ devotionalId: series.id, dayNumber: '1' }, [])).toBeNull();
    expect(targetOf({ devotionalId: undefined, dayNumber: '1' }, [series])).toBeNull();
    expect(targetOf({ devotionalId: '', dayNumber: '1' }, [series])).toBeNull();
  });

  it('returns null when the day is missing, non-integer, zero, or out of range', () => {
    for (const dayNumber of [undefined, '', '0', '8', '999', '-1', '2.5', '1e1', 'NaN', 'three']) {
      expect(targetOf({ devotionalId: series.id, dayNumber }, [series])).toBeNull();
    }
  });

  it('tolerates a corrupt totalDays / days shape without throwing', () => {
    const corrupt = { id: 'c', title: 'C', totalDays: Number.NaN, days: undefined } as unknown as RevealDevotional;
    expect(targetOf({ devotionalId: 'c', dayNumber: '1' }, [corrupt])).toBeNull();
    const negative = { ...series, totalDays: -5 };
    expect(targetOf({ devotionalId: series.id, dayNumber: '3' }, [negative])).toMatchObject({
      dayNumber: 3,
      totalDays: 3,
    });
  });
});

describe('resolveRevealOutcome: locked days', () => {
  // The reader finished Day 3 this morning. Day 4 is on the device, so a
  // "ready" push can name it, but the pacing lock keeps it closed until tomorrow.
  const morning = new Date(2026, 9, 4, 5, 30);
  const noon = new Date(2026, 9, 4, 12, 0);
  const nextMidnight = new Date(2026, 9, 5, 0, 1);
  const finishedDayThree: RevealDevotional = {
    id: 'zeal',
    title: 'Zeal Without a Fist',
    currentDay: 4,
    totalDays: 7,
    days: [
      { dayNumber: 1, title: 'One', isRead: true, readAt: new Date(2026, 9, 2, 6, 10).toISOString() },
      { dayNumber: 2, title: 'Two', isRead: true, readAt: new Date(2026, 9, 3, 6, 5).toISOString() },
      { dayNumber: 3, title: 'Three', isRead: true, readAt: morning.toISOString() },
      { dayNumber: 4, title: 'Four' },
      { dayNumber: 5, title: 'Five' },
    ],
  };
  const outcomeFor = (dayNumber: string, now: Date, devotional: RevealDevotional = finishedDayThree) =>
    resolveRevealOutcome({ devotionalId: devotional.id, dayNumber }, [devotional], now);

  it('names the locked day when a ready push points at the reading the lock keeps closed', () => {
    expect(outcomeFor('4', noon)).toEqual({ kind: 'locked', dayNumber: 4 });
  });

  it('opens that same day once the next local day starts', () => {
    expect(outcomeFor('4', nextMidnight)).toMatchObject({
      kind: 'open',
      target: { dayNumber: 4, dayTitle: 'Four' },
    });
  });

  it('calls a later day locked too while the lock is in force', () => {
    expect(outcomeFor('5', noon)).toEqual({ kind: 'locked', dayNumber: 5 });
  });

  it('calls the day at currentDay locked when out-of-order reads leave the lock further back', () => {
    // Day 2 finished today, Day 3 finished on an earlier day, currentDay is 4.
    const outOfOrder: RevealDevotional = {
      ...finishedDayThree,
      days: finishedDayThree.days.map((day) => (
        day.dayNumber === 2
          ? { ...day, readAt: morning.toISOString() }
          : day.dayNumber === 3
            ? { ...day, readAt: new Date(2026, 9, 3, 7, 0).toISOString() }
            : day
      )),
    };
    expect(outcomeFor('4', noon, outOfOrder)).toEqual({ kind: 'locked', dayNumber: 4 });
  });

  it('calls a day above currentDay invalid, not locked, when no lock is in force', () => {
    expect(outcomeFor('5', nextMidnight)).toEqual({ kind: 'invalid' });
  });

  it('calls a day past the series, an unknown devotional or a junk day invalid', () => {
    expect(outcomeFor('8', noon)).toEqual({ kind: 'invalid' });
    expect(resolveRevealOutcome({ devotionalId: 'missing', dayNumber: '4' }, [finishedDayThree], noon)).toEqual({ kind: 'invalid' });
    expect(outcomeFor('x', noon)).toEqual({ kind: 'invalid' });
  });

  it('still opens a day the reader already finished', () => {
    expect(outcomeFor('3', noon)).toMatchObject({ kind: 'open', target: { dayNumber: 3 } });
  });
});
