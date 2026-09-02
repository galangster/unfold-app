/**
 * Bible reader route-param clamping (P3-4 item 2c).
 *
 * The reader used `parseInt(...) || 1`, which only defended against
 * non-numbers: `bookId=999` or `chapter=9999` ran an empty SQLite chapter
 * query and rendered a blank screen. These helpers clamp to the canon
 * (1–66), to the book's real chapter count from BIBLE_BOOKS, and — once the
 * chapter is loaded — to its last verse. Parsing stays as lenient as before
 * (`parseInt`), so nothing a legitimate in-app producer sends changes.
 */
import { BIBLE_BOOKS } from '@/lib/bible-constants';

type RouteParam = string | string[] | undefined;

export const MIN_BOOK_ID = 1;
export const MAX_BOOK_ID = BIBLE_BOOKS.length;
/** Psalm 119 — static ceiling used before the chapter has loaded. */
export const MAX_VERSE_NUMBER = 176;

function parseIntParam(value: RouteParam): number | null {
  const raw = Array.isArray(value) ? value[0] : value;
  if (raw === undefined || raw === null) return null;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export function getChapterCount(bookId: number): number {
  return BIBLE_BOOKS.find((book) => book.id === bookId)?.chapterCount ?? 1;
}

export function clampBookId(value: RouteParam): number {
  const parsed = parseIntParam(value);
  if (parsed === null) return MIN_BOOK_ID;
  return clamp(parsed, MIN_BOOK_ID, MAX_BOOK_ID);
}

export function clampChapter(value: RouteParam, bookId: number): number {
  const parsed = parseIntParam(value);
  if (parsed === null) return 1;
  return clamp(parsed, 1, getChapterCount(bookId));
}

export function resolveBibleReaderLocation(params: {
  bookId?: RouteParam;
  chapter?: RouteParam;
}): { bookId: number; chapter: number } {
  const bookId = clampBookId(params.bookId);
  return { bookId, chapter: clampChapter(params.chapter, bookId) };
}

/**
 * Verse to scroll to, or null when absent/invalid. Clamped to the loaded
 * chapter's last verse; before the chapter loads, to the canon-wide ceiling.
 */
export function resolveTargetVerse(
  value: RouteParam,
  verses: readonly { verse: number }[] | null | undefined,
): number | null {
  const parsed = parseIntParam(value);
  if (parsed === null || parsed < 1) return null;
  if (verses && verses.length > 0) {
    const lastVerse = verses.reduce((max, entry) => Math.max(max, entry.verse), 0);
    return lastVerse > 0 ? Math.min(parsed, lastVerse) : parsed;
  }
  return Math.min(parsed, MAX_VERSE_NUMBER);
}
