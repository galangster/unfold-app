import type { BibleHighlight, Bookmark, Devotional, Highlight } from '@/lib/store';
import {
  applySavedUndo,
  buildSavedEntries,
  countSavedEntries,
  filterSavedEntries,
  savedEntryKey,
  savedUndoMessage,
  toBookmarkSavedItem,
  undoSavedDeletions,
} from '@/lib/saved-items';
import { EXCERPT_BOOKMARK_REFERENCE } from '@/lib/bookmark-identity';

jest.mock('@/lib/sync-outbox', () => ({
  enqueueSyncChanges: jest.fn(),
  removeSyncChangesForRecords: jest.fn(),
}));

import { enqueueSyncChanges, removeSyncChangesForRecords } from '@/lib/sync-outbox';

const highlight: Highlight = {
  id: 'h1',
  devotionalId: 'dev1',
  devotionalTitle: 'Quiet Path',
  dayNumber: 2,
  highlightedText: 'Be still',
  color: 'yellow',
  createdAt: '2026-09-01T00:00:00.000Z',
} as unknown as Highlight;

const bibleHighlight: BibleHighlight = {
  id: 'b1',
  bookId: 19,
  bookName: 'Psalms',
  chapter: 23,
  verseStart: 1,
  verseEnd: 1,
  translation: 'BSB',
  text: 'The LORD is my shepherd',
  color: 'green',
  createdAt: '2026-09-02T00:00:00.000Z',
} as unknown as BibleHighlight;

const bibleNote: BibleHighlight = {
  ...bibleHighlight,
  id: 'b2',
  color: null,
  note: 'Rest here',
  createdAt: '2026-09-03T00:00:00.000Z',
} as unknown as BibleHighlight;

const bookmark: Bookmark = {
  id: 'bm1',
  devotionalId: 'dev1',
  devotionalTitle: 'Quiet Path',
  dayNumber: 3,
  dayTitle: '',
  scriptureReference: 'Quote',
  scriptureText: '"A quoted line"',
  savedAt: '2026-09-04T00:00:00.000Z',
};

const devotional = {
  id: 'dev1',
  title: 'Quiet Path',
  days: [{ dayNumber: 3, title: 'Strength', scriptureReference: 'Isaiah 40:31', quotableLine: 'Soar' }],
} as unknown as Devotional;

describe('saved-items', () => {
  const entries = buildSavedEntries([highlight], [bibleHighlight, bibleNote], [bookmark], [devotional]);

  it('merges highlights, Bible notes and bookmarks newest-first', () => {
    expect(entries.map(savedEntryKey)).toEqual([
      'devotional:bookmark:bm1',
      'bible:note:b2',
      'bible:highlight:b1',
      'devotional:highlight:h1',
    ]);
  });

  it('resolves bookmark label and quote from the devotional day, stripping outer quotes', () => {
    const item = toBookmarkSavedItem(bookmark, devotional);
    expect(item.label).toBe('Strength');
    expect(item.reference).toBe('Isaiah 40:31');
    expect(item.quote).toBe('A quoted line');
  });

  it('shows a Scripture bookmark reference and passage text instead of the day quotable line', () => {
    const scriptureBookmark: Bookmark = {
      ...bookmark,
      id: 'scripture-bookmark',
      scriptureReference: 'Isaiah 40:31',
      scriptureText: 'Those who wait upon the LORD will renew their strength.',
      quotedText: 'A stale quotable line from an older build',
    };

    expect(toBookmarkSavedItem(scriptureBookmark, devotional)).toMatchObject({
      reference: 'Isaiah 40:31',
      quote: 'Those who wait upon the LORD will renew their strength.',
    });
  });

  it('labels a selection excerpt Excerpt, not the day passage it does not quote', () => {
    const excerpt: Bookmark = {
      ...bookmark,
      id: 'excerpt-bookmark',
      kind: 'excerpt',
      key: 'Rest is given before it is earned.',
      scriptureReference: EXCERPT_BOOKMARK_REFERENCE,
      scriptureText: 'Rest is given before it is earned.',
      quotedText: 'Rest is given before it is earned.',
    };
    expect(toBookmarkSavedItem(excerpt, devotional)).toMatchObject({
      label: 'Strength',
      reference: 'Excerpt',
      quote: 'Rest is given before it is earned.',
    });
    // A synced copy carries no kind: the Excerpt label alone restores it.
    const { kind: _kind, key: _key, ...synced } = excerpt;
    expect(toBookmarkSavedItem(synced as Bookmark, devotional).reference).toBe('Excerpt');
  });

  it('keeps the quote marks of an excerpt paired', () => {
    const excerpt: Bookmark = {
      ...bookmark,
      id: 'excerpt-with-quote',
      kind: 'excerpt',
      key: '“Come to me,” Jesus says.',
      scriptureReference: EXCERPT_BOOKMARK_REFERENCE,
      scriptureText: '“Come to me,” Jesus says.',
      quotedText: '“Come to me,” Jesus says.',
    };
    expect(toBookmarkSavedItem(excerpt, devotional).quote).toBe('“Come to me,” Jesus says.');
    expect(toBookmarkSavedItem({ ...excerpt, quotedText: '“Rest is a gift.”', scriptureText: '“Rest is a gift.”' }, devotional).quote)
      .toBe('Rest is a gift.');
  });

  it('filters on both axes and by search text', () => {
    expect(filterSavedEntries(entries, { source: 'bible', type: 'all' }).map((e) => e.id)).toEqual(['b2', 'b1']);
    expect(filterSavedEntries(entries, { source: 'all', type: 'bookmarks' }).map((e) => e.id)).toEqual(['bm1']);
    expect(filterSavedEntries(entries, { source: 'devotional', type: 'notes' })).toEqual([]);
    expect(filterSavedEntries(entries, { source: 'all', type: 'all', query: 'shepherd' }).map((e) => e.id)).toEqual(['b2', 'b1']);
    expect(filterSavedEntries(entries, { source: 'all', type: 'all', query: 'strength' }).map((e) => e.id)).toEqual(['bm1']);
  });

  it('counts each axis with the other axis applied', () => {
    const counts = countSavedEntries(entries, { source: 'bible', type: 'all' });
    expect(counts.bySource).toEqual({ devotional: 2, bible: 2 });
    expect(counts.byType).toEqual({ highlights: 1, notes: 1, bookmarks: 0 });
  });

  it('restores removed records without duplicating live ids', () => {
    const removed = entries.filter((e) => e.id === 'h1' || e.id === 'bm1' || e.id === 'b2');
    const state = { highlights: [], bibleHighlights: [bibleHighlight], bookmarks: [bookmark] };
    const restored = applySavedUndo(state, removed.map((entry) => ({ entry })));
    expect(restored.highlights.map((h) => h.id)).toEqual(['h1']);
    expect(restored.bibleHighlights.map((h) => h.id)).toEqual(['b2', 'b1']);
    expect(restored.bookmarks.map((b) => b.id)).toEqual(['bm1']);
  });

  it('drops the tombstone and re-enqueues an upsert for every restored record, stamped with the same updatedAt', () => {
    const removed = entries.filter((e) => e.id === 'h1' || e.id === 'b1');
    const restored = undoSavedDeletions({ highlights: [], bibleHighlights: [], bookmarks: [] }, removed.map((entry) => ({ entry })), '2026-09-10T00:00:00.000Z');
    // The local row and the enqueued upsert agree on updatedAt, or the next pull re-applies the server copy.
    expect(restored.highlights[0].updatedAt).toBe('2026-09-10T00:00:00.000Z');
    expect(restored.bibleHighlights[0].updatedAt).toBe('2026-09-10T00:00:00.000Z');
    expect(removeSyncChangesForRecords).toHaveBeenCalledWith([
      { table: 'bible_highlights', id: 'b1' },
      { table: 'highlights', id: 'h1' },
    ]);
    const changes = (enqueueSyncChanges as jest.Mock).mock.calls[0][0];
    expect(changes.map((c: { table: string; id: string; deleted: boolean }) => [c.table, c.id, c.deleted])).toEqual([
      ['bible_highlights', 'b1', false],
      ['highlights', 'h1', false],
    ]);
  });

  it('names the undo toast by kind', () => {
    expect(savedUndoMessage([{ entry: entries[0] }])).toBe('Bookmark removed');
    expect(savedUndoMessage([{ entry: entries[1] }])).toBe('Note removed');
    expect(savedUndoMessage([{ entry: entries[2] }])).toBe('Highlight removed');
    expect(savedUndoMessage([{ entry: entries[0] }, { entry: entries[1] }])).toBe('2 items removed');
  });
});
