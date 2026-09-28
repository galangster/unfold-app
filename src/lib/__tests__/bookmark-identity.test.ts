import type { Bookmark } from '@/lib/store';
import {
  bookmarkIdentity,
  bookmarkIdentityEquals,
  bookmarkKind,
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
    ['John 3:16', 'scripture'],
    ['', 'scripture'],
  ] as const)('derives legacy %s bookmarks as %s', (reference, expectedKind) => {
    expect(bookmarkKind(legacyBookmark(reference))).toBe(expectedKind);
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
