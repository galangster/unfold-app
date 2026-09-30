import type { Bookmark } from '@/lib/store';
import {
  bookmarkIdentity,
  bookmarkIdentityEquals,
  bookmarkKind,
  EXCERPT_BOOKMARK_REFERENCE,
  parseBookmarkKind,
} from '@/lib/bookmark-identity';

function legacyBookmark(scriptureReference: string, scriptureText = 'Saved text'): Bookmark {
  return {
    id: `bookmark-${scriptureReference}`,
    devotionalId: 'devotional-1',
    devotionalTitle: 'A Quiet Path',
    dayNumber: 2,
    dayTitle: 'Held in Grace',
    scriptureReference,
    scriptureText,
    savedAt: '2026-09-28T12:00:00.000Z',
  };
}

describe('bookmark identity', () => {
  it.each([
    ['Quote', 'quote'],
    ['Historical Context', 'context'],
    ['Word Study', 'word-study'],
    ['quote', 'excerpt'],
    ['Excerpt', 'scripture'],
    ['John 3:16', 'scripture'],
    ['', 'scripture'],
  ] as const)('derives legacy %s bookmarks as %s', (reference, expectedKind) => {
    expect(bookmarkKind(legacyBookmark(reference))).toBe(expectedKind);
  });

  it('keeps an excerpt bookmark the same after a sync round trip', () => {
    const saved = {
      ...legacyBookmark(EXCERPT_BOOKMARK_REFERENCE, 'Grace meets you in the next act of trust.'),
      kind: 'excerpt' as const,
      key: 'Grace meets you in the next act of trust.',
      quotedText: 'Grace meets you in the next act of trust.',
    };
    // A pull rebuilds the record from scriptureReference and scriptureText only.
    const pulled = legacyBookmark(saved.scriptureReference, saved.scriptureText);

    expect(bookmarkKind(pulled)).toBe('excerpt');
    expect(bookmarkIdentity(pulled)).toEqual(bookmarkIdentity(saved));
    expect(bookmarkIdentityEquals(pulled, saved)).toBe(true);
  });

  it('keeps two synced excerpts of a day apart on builds from before excerpts', () => {
    // Those builds (59835e64) read the kind from the reference alone, trimmed
    // and in lower case, and key Scripture by its reference.
    const olderBuildKinds: Record<string, string> = { quote: 'quote', 'historical context': 'context', 'word study': 'word-study' };
    const olderBuildIdentity = (bookmark: Bookmark) => {
      const kind = olderBuildKinds[bookmark.scriptureReference.trim().toLowerCase()] ?? 'scripture';
      const key = kind === 'scripture' ? bookmark.scriptureReference.trim().toLowerCase() : bookmark.scriptureText.trim();
      return { kind, key };
    };
    // What a pull hands those builds: the reference and the text only.
    const first = legacyBookmark(EXCERPT_BOOKMARK_REFERENCE, 'Grace meets you in the next act of trust.');
    const second = legacyBookmark(EXCERPT_BOOKMARK_REFERENCE, 'Rest is a gift.');

    expect(olderBuildIdentity(first)).toEqual({ kind: 'quote', key: 'Grace meets you in the next act of trust.' });
    expect(olderBuildIdentity(second)).toEqual({ kind: 'quote', key: 'Rest is a gift.' });
    // This build reads both back as excerpts, still apart.
    expect(bookmarkKind(first)).toBe('excerpt');
    expect(bookmarkIdentityEquals(first, second)).toBe(false);
    // A quote box keeps its capitalised label, so it stays a quote here.
    expect(bookmarkKind(legacyBookmark('Quote', 'Grace meets you in the next act of trust.'))).toBe('quote');
  });

  it('keeps a Scripture selection bookmark the same after a sync round trip', () => {
    const saved = {
      ...legacyBookmark('Psalm 46:10', 'Be still'),
      kind: 'scripture' as const,
      key: 'Psalm 46:10',
      quotedText: 'Be still',
    };
    const pulled = legacyBookmark(saved.scriptureReference, saved.scriptureText);

    expect(bookmarkKind(pulled)).toBe('scripture');
    expect(bookmarkIdentityEquals(pulled, saved)).toBe(true);
  });

  it('parses excerpt as a bookmark kind', () => {
    expect(parseBookmarkKind('excerpt')).toBe('excerpt');
    expect(parseBookmarkKind('Excerpt')).toBeUndefined();
  });

  it('keeps an excerpt separate from a quote with the same text', () => {
    expect(bookmarkIdentityEquals(
      { devotionalId: 'devotional-1', dayNumber: 2, kind: 'excerpt', key: 'Be still' },
      { devotionalId: 'devotional-1', dayNumber: 2, kind: 'quote', key: 'Be still' },
    )).toBe(false);
  });

  it('uses the reference for Scripture and the saved text for boxes', () => {
    expect(bookmarkIdentity(legacyBookmark('John 3:16', 'Passage text'))).toEqual({
      devotionalId: 'devotional-1',
      dayNumber: 2,
      kind: 'scripture',
      key: 'john 3:16',
    });
    expect(bookmarkIdentity(legacyBookmark('Quote', 'Carry this line'))).toEqual({
      devotionalId: 'devotional-1',
      dayNumber: 2,
      kind: 'quote',
      key: 'Carry this line',
    });
  });

  it('prefers an explicit kind over a legacy-looking reference', () => {
    expect(bookmarkKind({ kind: 'scripture', scriptureReference: 'Quote' })).toBe('scripture');
  });

  it('keeps each kind separate even when two items share the same text', () => {
    expect(bookmarkIdentityEquals(
      { devotionalId: 'devotional-1', dayNumber: 2, kind: 'quote', key: 'Be still' },
      { devotionalId: 'devotional-1', dayNumber: 2, kind: 'context', key: 'Be still' },
    )).toBe(false);
  });

  it('canonicalizes Scripture reference case, whitespace, and range dashes', () => {
    expect(bookmarkIdentityEquals(
      legacyBookmark('John  3:16–17', 'Passage text'),
      { devotionalId: 'devotional-1', dayNumber: 2, kind: 'scripture', key: ' john 3:16-17 ' },
    )).toBe(true);
    expect(bookmarkIdentity(legacyBookmark('JOHN 3:16—17'))).toEqual({
      devotionalId: 'devotional-1',
      dayNumber: 2,
      kind: 'scripture',
      key: 'john 3:16-17',
    });
  });

  it('keeps box bookmark text case-sensitive', () => {
    expect(bookmarkIdentityEquals(
      { devotionalId: 'devotional-1', dayNumber: 2, kind: 'quote', key: 'Be Still' },
      { devotionalId: 'devotional-1', dayNumber: 2, kind: 'quote', key: 'be still' },
    )).toBe(false);
  });
});
