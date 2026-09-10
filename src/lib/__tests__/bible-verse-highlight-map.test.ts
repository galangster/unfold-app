import { buildVerseColorMap } from '@/lib/bible-verse-highlight-map';
import type { BibleHighlight } from '@/lib/store';

function hl(partial: Partial<BibleHighlight>): BibleHighlight {
  return {
    id: 'id', bookId: 43, bookName: 'John', chapter: 3, verseStart: 1, verseEnd: 1,
    text: '', color: 'yellow', translation: 'BSB', createdAt: '2026-01-01', ...partial,
  };
}

describe('buildVerseColorMap', () => {
  it('spans a multi-verse highlight and skips note-only entries', () => {
    const map = buildVerseColorMap([
      hl({ id: 'a', verseStart: 2, verseEnd: 4, color: 'green' }),
      hl({ id: 'b', verseStart: 7, verseEnd: 7, color: null }),
    ]);
    expect(map).toEqual({ 2: 'green', 3: 'green', 4: 'green' });
  });

  it('lets the later record win on overlap', () => {
    const map = buildVerseColorMap([
      hl({ id: 'a', verseStart: 1, verseEnd: 2, color: 'yellow' }),
      hl({ id: 'b', verseStart: 2, verseEnd: 2, color: 'red' }),
    ]);
    expect(map).toEqual({ 1: 'yellow', 2: 'red' });
  });
});
