import { latestNonQuietAtOrBefore } from '../quiet-hours';

/** Non-DST January 2026 dates (OI-29: accept DST; no transition cases). */
function at(day: number, hour: number, minute: number): Date {
  return new Date(2026, 0, day, hour, minute, 0, 0);
}

describe('I2 latestNonQuietAtOrBefore', () => {
  it('leaves 12:00 unchanged', () => {
    const input = at(5, 12, 0);
    const result = latestNonQuietAtOrBefore(input);
    expect(result.getTime()).toBe(input.getTime());
    expect(result).not.toBe(input);
  });

  it('moves 22:30 to 21:59 the same day', () => {
    const result = latestNonQuietAtOrBefore(at(5, 22, 30));
    expect(result).toEqual(at(5, 21, 59));
  });

  it('moves 06:30 to 21:59 the previous day', () => {
    const result = latestNonQuietAtOrBefore(at(5, 6, 30));
    expect(result).toEqual(at(4, 21, 59));
  });

  it('leaves 07:00 and 21:59 unchanged', () => {
    expect(latestNonQuietAtOrBefore(at(5, 7, 0))).toEqual(at(5, 7, 0));
    expect(latestNonQuietAtOrBefore(at(5, 21, 59))).toEqual(at(5, 21, 59));
  });
});
