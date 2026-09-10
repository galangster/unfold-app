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

type SavedBiblePosition = {
  bookId: number;
  chapter: number;
  verse?: number;
};

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

/**
 * Pick the saved semantic verse anchor for a newly loaded chapter. Older
 * reading-history rows have no verse and keep the previous chapter-start
 * behavior.
 */
export function resolveInitialVerseAnchor(params: {
  bookId: number;
  chapter: number;
  history: readonly SavedBiblePosition[];
}): number | null {
  const saved = params.history.find(
    (position) => position.bookId === params.bookId && position.chapter === params.chapter,
  );
  return resolveTargetVerse(saved?.verse === undefined ? undefined : String(saved.verse), undefined);
}

/** Keep the current chapter anchor when settings trigger a position rewrite. */
export function resolveRecordedVerseAnchor(params: {
  entryVerse: number;
  currentVerse?: number;
  verses: readonly { verse: number }[] | null | undefined;
}): number {
  return resolveTargetVerse(String(params.currentVerse ?? params.entryVerse), params.verses) ?? 1;
}

/** Restore the semantic verse only when the same chapter's rendered content changes. */
export function resolveTranslationRefreshVerse(params: {
  hadPreviousContent: boolean;
  previousChapterKey: string;
  chapterKey: string;
  persistedPosition: { chapterKey: string; verse: number } | null;
}): number | null {
  if (!params.hadPreviousContent || params.previousChapterKey !== params.chapterKey) return null;
  if (params.persistedPosition?.chapterKey !== params.chapterKey) return null;
  return params.persistedPosition.verse;
}

export type BibleVerseScrollTarget = {
  verse: number;
  source: 'explicit' | 'saved';
};

/**
 * Resolve one scroll target for the current render. A later explicit target
 * remains valid after the saved chapter-entry fallback has been consumed.
 */
export function resolveVerseScrollTarget(params: {
  routeVerse?: RouteParam;
  explicitVerseConsumed?: boolean;
  savedVerse: number | null;
  savedVerseConsumed: boolean;
  verses: readonly { verse: number }[] | null | undefined;
}): BibleVerseScrollTarget | null {
  const explicitVerse = resolveTargetVerse(params.routeVerse, params.verses);
  if (explicitVerse !== null && !params.explicitVerseConsumed) {
    return { verse: explicitVerse, source: 'explicit' };
  }
  if (params.savedVerseConsumed || params.savedVerse === null) return null;

  const savedVerse = resolveTargetVerse(String(params.savedVerse), params.verses);
  return savedVerse === null ? null : { verse: savedVerse, source: 'saved' };
}

/** Find the first verse visible below the fixed reader header. */
export function findVisibleVerseAnchor(
  layouts: Readonly<Record<number, number>>,
  contentOffsetY: number,
  headerOffset: number,
): number | null {
  const ordered = Object.entries(layouts)
    .map(([verse, y]) => ({ verse: Number(verse), y }))
    .filter(({ verse, y }) => Number.isInteger(verse) && verse > 0 && Number.isFinite(y))
    .sort((left, right) => left.y - right.y);
  if (ordered.length === 0) return null;

  const visibleTop = Math.max(0, contentOffsetY + headerOffset);
  let anchor = ordered[0].verse;
  for (const entry of ordered) {
    if (entry.y > visibleTop) break;
    anchor = entry.verse;
  }
  return anchor;
}
