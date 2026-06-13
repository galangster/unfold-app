import { balanceHeadline } from '../balance-headline';

const NBSP = ' ';

describe('balanceHeadline', () => {
  it('binds the last two words of a 3+ word headline with a non-breaking space', () => {
    expect(balanceHeadline('When the Path Is Quiet')).toBe(`When the Path Is${NBSP}Quiet`);
  });

  it('prevents a single-word widow on a real Today hero title', () => {
    const balanced = balanceHeadline('Wind down with today’s reading');
    expect(balanced).toBe(`Wind down with today’s${NBSP}reading`);
    // The final two words can never wrap apart.
    expect(balanced.split(' ').pop()).not.toBe('reading');
  });

  it('leaves one- and two-word headlines untouched (nothing can orphan)', () => {
    expect(balanceHeadline('Reflect')).toBe('Reflect');
    expect(balanceHeadline('Resume reading')).toBe('Resume reading');
    expect(balanceHeadline('Resume reading')).not.toContain(NBSP);
  });

  it('is idempotent — re-running on bound text is a no-op', () => {
    const once = balanceHeadline('A thread from yesterday to today');
    const twice = balanceHeadline(once);
    expect(twice).toBe(once);
    expect(once.split(NBSP)).toHaveLength(2);
  });

  it('collapses redundant whitespace without binding short titles', () => {
    expect(balanceHeadline('Resume    reading')).toBe('Resume reading');
  });

  it('returns empty input unchanged', () => {
    expect(balanceHeadline('')).toBe('');
  });

  it('keeps only one non-breaking space — the bound pair — in a long headline', () => {
    const balanced = balanceHeadline('Did today’s reading feel personal?');
    expect(balanced.match(new RegExp(NBSP, 'g'))).toHaveLength(1);
    expect(balanced.endsWith(`feel${NBSP}personal?`)).toBe(true);
  });
});
