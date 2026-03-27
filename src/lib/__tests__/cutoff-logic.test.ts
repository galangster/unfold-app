import { isPastCutoff, todayDateString } from '../cutoff-logic';

describe('isPastCutoff', () => {
  it('returns true when lastCutoff is empty (never run)', () => {
    expect(isPastCutoff('', new Date('2026-03-27T08:00:00'))).toBe(true);
  });

  it('returns true when lastCutoff is yesterday', () => {
    expect(isPastCutoff('2026-03-26', new Date('2026-03-27T02:00:00'))).toBe(true);
  });

  it('returns false when lastCutoff is today', () => {
    expect(isPastCutoff('2026-03-27', new Date('2026-03-27T08:00:00'))).toBe(false);
  });

  it('returns true when lastCutoff is two days ago', () => {
    expect(isPastCutoff('2026-03-25', new Date('2026-03-27T08:00:00'))).toBe(true);
  });
});

describe('todayDateString', () => {
  it('returns YYYY-MM-DD format', () => {
    const result = todayDateString(new Date('2026-03-27T15:30:00'));
    expect(result).toBe('2026-03-27');
  });

  it('uses local date (not UTC) for midnight boundary', () => {
    // 11:30 PM on March 27 local time
    const lateNight = new Date(2026, 2, 27, 23, 30, 0); // month is 0-indexed
    const result = todayDateString(lateNight);
    expect(result).toBe('2026-03-27');
  });
});
