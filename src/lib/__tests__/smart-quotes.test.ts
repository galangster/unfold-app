import { smartQuotes } from '@/lib/smart-quotes';

describe('smartQuotes', () => {
  it('converts contractions to typographic apostrophes', () => {
    expect(smartQuotes("What's on your heart?")).toBe('What’s on your heart?');
    expect(smartQuotes("don't can't won't")).toBe('don’t can’t won’t');
  });

  it('pairs double quotes by left context', () => {
    expect(smartQuotes('He said "be still" and waited.')).toBe(
      'He said “be still” and waited.',
    );
    expect(smartQuotes('"Be still."')).toBe('“Be still.”');
  });

  it('pairs single quotes by left context', () => {
    expect(smartQuotes("He said 'peace' twice.")).toBe('He said ‘peace’ twice.');
  });

  it('handles decade abbreviations as apostrophes', () => {
    expect(smartQuotes("the '90s revival")).toBe('the ’90s revival');
  });

  it('is idempotent', () => {
    const once = smartQuotes('He said "be still" — it\'s true.');
    expect(smartQuotes(once)).toBe(once);
  });

  it('is prefix-stable across streamed chunks', () => {
    const full = 'He said "be still" and it\'s true that \'rest\' matters.';
    const fullOut = smartQuotes(full);
    for (let i = 1; i < full.length; i++) {
      const prefixOut = smartQuotes(full.slice(0, i));
      // the converted prefix must be a prefix of the converted full string,
      // except the decade rule which needs right context (not present here)
      expect(fullOut.startsWith(prefixOut)).toBe(true);
    }
  });

  it('opens after dashes and brackets', () => {
    expect(smartQuotes('Psalm 46 — "Be still"')).toBe('Psalm 46 — “Be still”');
    expect(smartQuotes('("quiet")')).toBe('(“quiet”)');
  });

  it('passes through text without straight quotes untouched', () => {
    const s = 'Already “curly” and it’s fine';
    expect(smartQuotes(s)).toBe(s);
    expect(smartQuotes('')).toBe('');
  });
});
