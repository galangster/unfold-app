import { compositeId, newId } from './sync-ids';

/** The v32→33 / recordBibleReading recipe. Same on every install. */
function isBrpShapedReadingId(id: string): boolean {
  return /^brp_\d+_\d+_.+$/.test(id);
}

function legacyCompositeReadingIds(bookId: number, translation: string): string[] {
  return [...new Set([
    compositeId(bookId, translation),
    compositeId(bookId, 'BSB'),
  ])];
}

/**
 * True when this id would collide across users if used as a global PK.
 * Missing ids collide. Known recipes collide. Anything else is retained.
 */
export function isCollidingBibleReadingId(
  id: string | undefined,
  bookId?: number,
  translation?: string,
): boolean {
  if (!id) return true;
  if (isBrpShapedReadingId(id)) return true;
  if (typeof bookId !== 'number') return false;
  // v28 used compositeId(book, translation || 'BSB'). Detect that BSB
  // fallback even when the stored row omitted translation.
  const known = typeof translation === 'string'
    ? legacyCompositeReadingIds(bookId, translation)
    : [compositeId(bookId, 'BSB')];
  return known.includes(id);
}

export function bibleReadingCoordKey(
  bookId: unknown,
  chapter: unknown,
  translation: unknown,
  id?: string,
): string | null {
  if (typeof bookId !== 'number' || !Number.isFinite(bookId)) return null;
  if (typeof chapter !== 'number' || !Number.isFinite(chapter)) return null;
  if (typeof translation === 'string') return `${bookId}:${chapter}:${translation}`;
  // Same v28 default: missing translation used BSB, so history and a
  // queued BSB write must share one coordinate.
  if (!id || id === compositeId(bookId, 'BSB')) {
    return `${bookId}:${chapter}:BSB`;
  }
  return null;
}

export function allocateBibleReadingId(
  position: {
    id?: string;
    bookId: number;
    chapter: number;
    translation: string;
  },
  history: ReadonlyArray<{
    id?: string;
    bookId: number;
    chapter: number;
    translation: string;
  }> = [],
): string {
  if (position.id && !isCollidingBibleReadingId(position.id, position.bookId, position.translation)) {
    return position.id;
  }
  const existing = history.find((row) => (
    row.bookId === position.bookId
    && row.chapter === position.chapter
    && row.translation === position.translation
    && !!row.id
    && !isCollidingBibleReadingId(row.id, row.bookId, row.translation)
  ));
  if (existing?.id) return existing.id;
  return newId();
}
