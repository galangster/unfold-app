import { isPastEveningCutoff } from '../cutoff-logic';

describe('isPastEveningCutoff', () => {
  it('returns true at exactly 9 PM (21:00)', () => {
    const ninePM = new Date(2026, 2, 28, 21, 0, 0);
    expect(isPastEveningCutoff(ninePM)).toBe(true);
  });

  it('returns false at 8:59 PM (20:59)', () => {
    const beforeNine = new Date(2026, 2, 28, 20, 59, 0);
    expect(isPastEveningCutoff(beforeNine)).toBe(false);
  });

  it('returns true at 11 PM', () => {
    const elevenPM = new Date(2026, 2, 28, 23, 0, 0);
    expect(isPastEveningCutoff(elevenPM)).toBe(true);
  });

  it('returns false in the morning', () => {
    const morning = new Date(2026, 2, 28, 8, 0, 0);
    expect(isPastEveningCutoff(morning)).toBe(false);
  });

  it('supports custom cutoff hour', () => {
    const eightPM = new Date(2026, 2, 28, 20, 0, 0);
    expect(isPastEveningCutoff(eightPM, 20)).toBe(true);
    expect(isPastEveningCutoff(eightPM, 21)).toBe(false);
  });
});
