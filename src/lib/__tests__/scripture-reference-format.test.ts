import {
  citationBookName,
  formatScriptureReference,
  normalizeScriptureReference,
  routeToReference,
} from '@/lib/bible-constants';

describe('citationBookName', () => {
  it('cites a single psalm in the singular', () => {
    expect(citationBookName('Psalms')).toBe('Psalm');
  });
  it('leaves every other book title untouched', () => {
    expect(citationBookName('John')).toBe('John');
    expect(citationBookName('1 Corinthians')).toBe('1 Corinthians');
    expect(citationBookName(' Psalms ')).toBe('Psalm');
  });
});

describe('formatScriptureReference', () => {
  it('formats the canonical citation shapes', () => {
    expect(formatScriptureReference('Psalms', 46, 10)).toBe('Psalm 46:10');
    expect(formatScriptureReference('Psalms', 23, 1, 6)).toBe('Psalm 23:1-6');
    expect(formatScriptureReference('John', 3)).toBe('John 3');
    expect(formatScriptureReference('1 Corinthians', 13, 4)).toBe('1 Corinthians 13:4');
  });
  it('suppresses a degenerate single-verse range', () => {
    expect(formatScriptureReference('Romans', 8, 28, 28)).toBe('Romans 8:28');
  });
});

describe('normalizeScriptureReference', () => {
  it('fixes the wrong plural produced by bible-api.com and local builders', () => {
    expect(normalizeScriptureReference('Psalms 46:10')).toBe('Psalm 46:10');
  });
  it('round-trips already-canonical references', () => {
    expect(normalizeScriptureReference('Psalm 46:10')).toBe('Psalm 46:10');
    expect(normalizeScriptureReference('John 3:16')).toBe('John 3:16');
  });
  it('passes unparseable strings through unchanged', () => {
    expect(normalizeScriptureReference('Quote')).toBe('Quote');
    expect(normalizeScriptureReference('')).toBe('');
  });
});

describe('routeToReference', () => {
  it('emits the citation form for psalms', () => {
    expect(routeToReference({ bookId: 19, chapter: 46, verse: 10 })).toBe('Psalm 46:10');
  });
});
