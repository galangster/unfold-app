import { BIBLE_VERSE_LAYOUT } from '@/constants/bible-verse-layout';

type LayoutTranslation = keyof typeof BIBLE_VERSE_LAYOUT;

export function expectedVerseNumbers(query: {
  translation: LayoutTranslation;
  bookId: number;
  chapter: number;
  verseStart?: number;
  verseEnd?: number;
}): number[] | null {
  if (!Object.prototype.hasOwnProperty.call(BIBLE_VERSE_LAYOUT, query.translation)) return null;
  const layout = BIBLE_VERSE_LAYOUT[query.translation];
  if (!layout) return null;

  const { bookId, chapter } = query;
  if (!Number.isInteger(bookId) || !Number.isInteger(chapter) || bookId < 1 || chapter < 1) {
    return null;
  }

  const lastVerse = layout.lastVerses[bookId - 1]?.[chapter - 1];
  if (lastVerse === undefined || lastVerse < 1) return null;

  const start = query.verseStart ?? 1;
  const end = query.verseEnd ?? query.verseStart ?? lastVerse;
  if (!Number.isInteger(start) || !Number.isInteger(end) || start < 1 || end < start || end > lastVerse) {
    return null;
  }

  const omitted = layout.omissions[`${bookId}:${chapter}`];
  const expected: number[] = [];
  for (let verse = start; verse <= end; verse += 1) {
    if (!omitted?.includes(verse)) expected.push(verse);
  }
  return expected.length === 0 ? null : expected;
}

export function versesMatchExpected(
  verses: readonly { verse: number }[],
  expected: readonly number[],
): boolean {
  return expected.length > 0
    && verses.length === expected.length
    && verses.every((row, index) => row.verse === expected[index]);
}
