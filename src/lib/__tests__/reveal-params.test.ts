/**
 * P3-4 item 2b — reveal params must resolve to a local devotional + day
 * before the screen writes anything to the store.
 */
import { parsePositiveInteger, resolveRevealTarget, type RevealDevotional } from '../reveal-params';

const series: RevealDevotional = {
  id: 'devotional-1725000000000-abc123xyz',
  title: 'Quiet Strength',
  totalDays: 7,
  days: [
    { dayNumber: 1, title: 'Day One' },
    { dayNumber: 2, title: 'Day Two' },
    { dayNumber: 3, title: 'Day Three' },
  ],
};

const other: RevealDevotional = { id: 'other', title: 'Other', totalDays: 3, days: [] };

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

describe('resolveRevealTarget', () => {
  it('resolves an existing devotional and generated day from the store, not the params', () => {
    expect(resolveRevealTarget({ devotionalId: series.id, dayNumber: '3' }, [other, series])).toEqual({
      devotionalId: series.id,
      dayNumber: 3,
      seriesTitle: 'Quiet Strength',
      dayTitle: 'Day Three',
      totalDays: 7,
    });
  });

  it('accepts a day inside totalDays that is not generated yet (still preparing)', () => {
    expect(resolveRevealTarget({ devotionalId: series.id, dayNumber: '7' }, [series])).toMatchObject({
      dayNumber: 7,
      dayTitle: null,
    });
  });

  it('accepts a day beyond totalDays when the days array is longer (stretched series)', () => {
    const stretched: RevealDevotional = { ...series, totalDays: 2 };
    expect(resolveRevealTarget({ devotionalId: series.id, dayNumber: '3' }, [stretched])).toMatchObject({
      dayNumber: 3,
      totalDays: 2,
    });
    expect(resolveRevealTarget({ devotionalId: series.id, dayNumber: '4' }, [stretched])).toBeNull();
  });

  it('uses the first value of an array param (repeated query keys)', () => {
    expect(resolveRevealTarget({ devotionalId: [series.id, 'x'], dayNumber: ['2', '9'] }, [series])).toMatchObject({
      dayNumber: 2,
    });
  });

  it('returns null when the devotional does not exist locally', () => {
    expect(resolveRevealTarget({ devotionalId: 'nope', dayNumber: '1' }, [series])).toBeNull();
    expect(resolveRevealTarget({ devotionalId: series.id, dayNumber: '1' }, [])).toBeNull();
    expect(resolveRevealTarget({ devotionalId: undefined, dayNumber: '1' }, [series])).toBeNull();
    expect(resolveRevealTarget({ devotionalId: '', dayNumber: '1' }, [series])).toBeNull();
  });

  it('returns null when the day is missing, non-integer, zero, or out of range', () => {
    for (const dayNumber of [undefined, '', '0', '8', '999', '-1', '2.5', '1e1', 'NaN', 'three']) {
      expect(resolveRevealTarget({ devotionalId: series.id, dayNumber }, [series])).toBeNull();
    }
  });

  it('tolerates a corrupt totalDays / days shape without throwing', () => {
    const corrupt = { id: 'c', title: 'C', totalDays: Number.NaN, days: undefined } as unknown as RevealDevotional;
    expect(resolveRevealTarget({ devotionalId: 'c', dayNumber: '1' }, [corrupt])).toBeNull();
    const negative = { ...series, totalDays: -5 };
    expect(resolveRevealTarget({ devotionalId: series.id, dayNumber: '3' }, [negative])).toMatchObject({
      dayNumber: 3,
      totalDays: 3,
    });
  });
});
