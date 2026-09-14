import { getDailyRevealVariant } from '@/lib/reveal-variant';
import { REVEAL_GRADIENT_VARIANTS } from '@/lib/reveal-gradient-palette';

const series = [
  { id: 'first', createdAt: '2026-09-01T10:00:00Z' },
  { id: 'second', createdAt: '2026-09-12T10:00:00Z' },
];

describe('reveal rotation', () => {
  it('uses Prism on day one and remains stable on reopen', () => {
    expect(getDailyRevealVariant('first', 1)).toBe('prism');
    expect(getDailyRevealVariant('second', 1)).toBe('prism');
    expect(getDailyRevealVariant('first', 5)).toBe(getDailyRevealVariant('first', 5));
  });

  it('covers every allowed family and avoids consecutive repetitions', () => {
    for (const row of series) {
      const cycle = Array.from({ length: 7 }, (_, index) => getDailyRevealVariant(row.id, index + 2));
      expect(new Set(cycle)).toEqual(new Set(REVEAL_GRADIENT_VARIANTS));
      let previous = getDailyRevealVariant(row.id, 1);
      for (let day = 2; day <= 21; day += 1) {
        const current = getDailyRevealVariant(row.id, day);
        expect(current).not.toBe(previous);
        expect(current).not.toBe('forms');
        previous = current;
      }
    }
  });
});
