/**
 * P3-4 item 2c — Bible reader params are clamped to the canon and to the
 * book's real chapter/verse range instead of `parseInt(...) || 1`.
 */
import {
  MAX_BOOK_ID,
  MAX_VERSE_NUMBER,
  clampBookId,
  clampChapter,
  getChapterCount,
  resolveBibleReaderLocation,
  resolveTargetVerse,
} from '../bible-reader-params';

describe('clampBookId', () => {
  it.each([
    ['43', 43],
    ['1', 1],
    ['66', 66],
    ['0', 1],
    ['-4', 1],
    ['67', 66],
    ['999', 66],
    ['abc', 1],
    ['', 1],
    [undefined, 1],
    [['19', '1'], 19],
    ['3abc', 3],
  ])('%j → %s', (input, expected) => {
    expect(clampBookId(input as string | string[] | undefined)).toBe(expected);
  });

  it('caps at the 66-book canon', () => {
    expect(MAX_BOOK_ID).toBe(66);
  });
});

describe('clampChapter', () => {
  it('clamps to the real chapter count of the book', () => {
    expect(getChapterCount(19)).toBe(150);
    expect(getChapterCount(65)).toBe(1);
    expect(clampChapter('150', 19)).toBe(150);
    expect(clampChapter('151', 19)).toBe(150);
    expect(clampChapter('9999', 43)).toBe(21);
    expect(clampChapter('2', 65)).toBe(1);
    expect(clampChapter('0', 1)).toBe(1);
    expect(clampChapter('-3', 1)).toBe(1);
    expect(clampChapter('x', 1)).toBe(1);
    expect(clampChapter(undefined, 1)).toBe(1);
    expect(clampChapter('12', 1)).toBe(12);
  });

  it('falls back to a single chapter for an unknown book id', () => {
    expect(getChapterCount(999)).toBe(1);
    expect(clampChapter('40', 999)).toBe(1);
  });
});

describe('resolveBibleReaderLocation', () => {
  it('keeps every legitimate in-app producer shape unchanged', () => {
    expect(resolveBibleReaderLocation({ bookId: '43', chapter: '3' })).toEqual({ bookId: 43, chapter: 3 });
    expect(resolveBibleReaderLocation({ bookId: '1', chapter: '50' })).toEqual({ bookId: 1, chapter: 50 });
    expect(resolveBibleReaderLocation({})).toEqual({ bookId: 1, chapter: 1 });
  });

  it('clamps an out-of-range deep link onto a real chapter of a real book', () => {
    expect(resolveBibleReaderLocation({ bookId: '999', chapter: '9999' })).toEqual({ bookId: 66, chapter: 22 });
    expect(resolveBibleReaderLocation({ bookId: '0', chapter: '0' })).toEqual({ bookId: 1, chapter: 1 });
    expect(resolveBibleReaderLocation({ bookId: '8', chapter: '99' })).toEqual({ bookId: 8, chapter: 4 });
  });
});

describe('resolveTargetVerse', () => {
  const chapter = [{ verse: 1 }, { verse: 2 }, { verse: 3 }];

  it('returns null when absent or invalid', () => {
    expect(resolveTargetVerse(undefined, chapter)).toBeNull();
    expect(resolveTargetVerse('', chapter)).toBeNull();
    expect(resolveTargetVerse('0', chapter)).toBeNull();
    expect(resolveTargetVerse('-2', chapter)).toBeNull();
    expect(resolveTargetVerse('abc', chapter)).toBeNull();
  });

  it('clamps to the loaded chapter\'s last verse', () => {
    expect(resolveTargetVerse('2', chapter)).toBe(2);
    expect(resolveTargetVerse('3', chapter)).toBe(3);
    expect(resolveTargetVerse('16', chapter)).toBe(3);
    expect(resolveTargetVerse('99999', chapter)).toBe(3);
    expect(resolveTargetVerse(['2', '9'], chapter)).toBe(2);
  });

  it('caps at the canon-wide ceiling before the chapter loads', () => {
    expect(resolveTargetVerse('16', undefined)).toBe(16);
    expect(resolveTargetVerse('16', [])).toBe(16);
    expect(resolveTargetVerse('99999', null)).toBe(MAX_VERSE_NUMBER);
  });
});
