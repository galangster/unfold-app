/** `word-study` is the stable sync slug for the product's “word study” kind. */
export type BookmarkKind = 'scripture' | 'quote' | 'context' | 'word-study' | 'excerpt';
/** The kinds a box in the devotional reader (quote, context, word study) saves. */
export type BoxBookmarkKind = 'quote' | 'context' | 'word-study';

const STORED_REFERENCES: Record<Exclude<BookmarkKind, 'scripture'>, string> = {
  quote: 'Quote',
  context: 'Historical Context',
  'word-study': 'Word Study',
  excerpt: 'quote',
};

/**
 * What a bookmark that is not Scripture stores in `scriptureReference`
 * (Scripture stores its own reference). Sync carries only
 * `scriptureReference` and `scriptureText`, so this value must bring the kind
 * back after a round trip: bookmarkKind reads it.
 *
 * - A box (quote, context, word study) stores its legacy label: 'Quote',
 *   'Historical Context', 'Word Study'.
 * - An excerpt (prose selected in the devotional reader) stores 'quote', in
 *   lower case. Builds from before excerpts read the reference through
 *   LEGACY_KIND_BY_REFERENCE, trimmed and in lower case. With 'quote' they
 *   keep each excerpt as its own quote bookmark, keyed by its text. Any other
 *   label makes them read every excerpt of a day as one Scripture passage, so
 *   deleting one there deletes them all.
 *
 * So this build tells the two apart by case alone: 'quote' is an excerpt and
 * 'Quote' is a quote box. No build has stored 'quote' for a quote box.
 */
export function storedReferenceFor(kind: Exclude<BookmarkKind, 'scripture'>): string {
  return STORED_REFERENCES[kind];
}

/** What My library shows as the reference of an excerpt. */
export const EXCERPT_BOOKMARK_LABEL = 'Excerpt';

export interface BookmarkIdentity {
  devotionalId: string;
  dayNumber: number;
  kind: BookmarkKind;
  key: string;
}

export interface BookmarkIdentitySource {
  devotionalId: string;
  dayNumber: number;
  kind?: BookmarkKind;
  key?: string;
  scriptureReference: string;
  scriptureText: string;
  quotedText?: string;
}

const LEGACY_KIND_BY_REFERENCE: Record<string, Exclude<BookmarkKind, 'scripture'>> = {
  quote: 'quote',
  'historical context': 'context',
  'word study': 'word-study',
};
const BOOKMARK_KINDS = new Set<BookmarkKind>(['scripture', 'quote', 'context', 'word-study', 'excerpt']);

function normalizeKey(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

export function canonicalizeScriptureReference(value: string): string {
  return normalizeKey(value).replace(/[\u2013\u2014]/g, '-').toLowerCase();
}

function normalizeIdentityKey(kind: BookmarkKind, value: string): string {
  return kind === 'scripture' ? canonicalizeScriptureReference(value) : normalizeKey(value);
}

export function parseBookmarkKind(value: unknown): BookmarkKind | undefined {
  return typeof value === 'string' && BOOKMARK_KINDS.has(value as BookmarkKind)
    ? value as BookmarkKind
    : undefined;
}

export function bookmarkKind(bookmark: Pick<BookmarkIdentitySource, 'kind' | 'scriptureReference'>): BookmarkKind {
  const explicitKind = parseBookmarkKind(bookmark.kind);
  if (explicitKind) return explicitKind;
  const reference = bookmark.scriptureReference.trim();
  if (reference === STORED_REFERENCES.excerpt) return 'excerpt';
  return LEGACY_KIND_BY_REFERENCE[reference.toLowerCase()] ?? 'scripture';
}

export function bookmarkKey(bookmark: BookmarkIdentitySource): string {
  const kind = bookmarkKind(bookmark);
  if (bookmark.key?.trim()) return normalizeIdentityKey(kind, bookmark.key);
  return normalizeIdentityKey(
    kind,
    kind === 'scripture'
      ? bookmark.scriptureReference
      : bookmark.quotedText || bookmark.scriptureText,
  );
}

export function bookmarkIdentity(bookmark: BookmarkIdentitySource): BookmarkIdentity {
  return {
    devotionalId: bookmark.devotionalId,
    dayNumber: bookmark.dayNumber,
    kind: bookmarkKind(bookmark),
    key: bookmarkKey(bookmark),
  };
}

export function bookmarkIdentityEquals(
  left: BookmarkIdentitySource | BookmarkIdentity,
  right: BookmarkIdentitySource | BookmarkIdentity,
): boolean {
  const a = 'scriptureReference' in left
    ? bookmarkIdentity(left)
    : { ...left, key: normalizeIdentityKey(left.kind, left.key) };
  const b = 'scriptureReference' in right
    ? bookmarkIdentity(right)
    : { ...right, key: normalizeIdentityKey(right.kind, right.key) };
  return a.devotionalId === b.devotionalId
    && a.dayNumber === b.dayNumber
    && a.kind === b.kind
    && a.key === b.key;
}

export function findBookmarkByIdentity<T extends BookmarkIdentitySource>(
  bookmarks: readonly T[],
  identity: BookmarkIdentity,
): T | undefined {
  return bookmarks.find((bookmark) => bookmarkIdentityEquals(bookmark, identity));
}

export function bookmarkIdentityToken(identity: Pick<BookmarkIdentity, 'kind' | 'key'>): string {
  return JSON.stringify([identity.kind, normalizeIdentityKey(identity.kind, identity.key)]);
}

export function bookmarkKindFromBoxType(contentType: string): BoxBookmarkKind | null {
  if (contentType === 'quote') return 'quote';
  if (contentType === 'context') return 'context';
  if (contentType === 'wordstudy') return 'word-study';
  return null;
}
