import type { BibleHighlight, Bookmark, Devotional, Highlight } from '@/lib/store';
import {
  bibleHighlightSyncData,
  bookmarkSyncData,
  buildPersonalDataSyncChange,
  devotionalHighlightSyncData,
} from '@/lib/personal-data-sync-records';
import { enqueueSyncChanges, removeSyncChangesForRecords } from '@/lib/sync-outbox';
import { stripOuterQuotes } from '@/lib/cn';
import { buildSavedHighlights, type SavedItem } from '@/lib/saved-highlights';
import type { SyncPushChange } from '@/lib/sync-types';

/**
 * Journal › Saved: one list over devotional highlights, Bible highlights,
 * Bible notes and bookmarks. `SavedItem` (saved-highlights.ts) already covers
 * the first three; bookmarks get a sibling shape so rows and filters can
 * discriminate on `kind` without touching the persisted stores.
 */
export interface SavedBookmarkItem {
  id: string;
  source: 'devotional';
  kind: 'bookmark';
  /** Day title, or the devotional title when the day has none. */
  label: string;
  reference: string;
  quote: string;
  createdAt: string;
  updatedAt?: string;
  raw: Bookmark;
}

export type SavedEntry = SavedItem | SavedBookmarkItem;

export type SavedSourceFilter = 'all' | 'devotional' | 'bible';
export type SavedTypeFilter = 'all' | 'highlights' | 'notes' | 'bookmarks';

export const SAVED_SOURCE_FILTERS: readonly SavedSourceFilter[] = ['all', 'devotional', 'bible'];
export const SAVED_TYPE_FILTERS: readonly SavedTypeFilter[] = ['all', 'highlights', 'notes', 'bookmarks'];

const QUOTE_FALLBACK_REFERENCES = new Set(['Quote', 'Historical Context', 'Word Study']);

export function toBookmarkSavedItem(bookmark: Bookmark, devotional?: Devotional): SavedBookmarkItem {
  const day = devotional?.days.find((d) => d.dayNumber === bookmark.dayNumber);
  const quoteSource =
    bookmark.quotedText ||
    (QUOTE_FALLBACK_REFERENCES.has(bookmark.scriptureReference) ? bookmark.scriptureText : null) ||
    day?.quotableLine ||
    day?.scriptureText ||
    bookmark.scriptureText;
  return {
    id: bookmark.id,
    source: 'devotional',
    kind: 'bookmark',
    label: bookmark.dayTitle || day?.title || 'Saved Passage',
    reference: day?.scriptureReference || bookmark.scriptureReference,
    quote: stripOuterQuotes(quoteSource),
    createdAt: bookmark.savedAt,
    updatedAt: bookmark.updatedAt,
    raw: bookmark,
  };
}

function sortNewestFirst(a: SavedEntry, b: SavedEntry): number {
  return new Date(b.updatedAt ?? b.createdAt).getTime() - new Date(a.updatedAt ?? a.createdAt).getTime();
}

export function buildSavedEntries(
  highlights: Highlight[],
  bibleHighlights: BibleHighlight[],
  bookmarks: Bookmark[],
  devotionals: Devotional[],
): SavedEntry[] {
  const devotionalById = new Map(devotionals.map((d) => [d.id, d]));
  const bookmarkItems = bookmarks.map((b) => toBookmarkSavedItem(b, devotionalById.get(b.devotionalId)));
  return [...buildSavedHighlights(highlights, bibleHighlights).all, ...bookmarkItems].sort(sortNewestFirst);
}

export function savedEntryType(entry: SavedEntry): Exclude<SavedTypeFilter, 'all'> {
  if (entry.kind === 'bookmark') return 'bookmarks';
  if (entry.kind === 'note') return 'notes';
  return 'highlights';
}

export function savedEntryKey(entry: SavedEntry): string {
  return `${entry.source}:${entry.kind}:${entry.id}`;
}

function savedEntryMatches(entry: SavedEntry, query: string): boolean {
  const haystack =
    entry.kind === 'bookmark'
      ? [entry.label, entry.reference, entry.quote, entry.raw.devotionalTitle]
      : [entry.text, entry.note, entry.contextLabel];
  return haystack.some((field) => field?.toLowerCase().includes(query));
}

export interface SavedFilter {
  source: SavedSourceFilter;
  type: SavedTypeFilter;
  query?: string;
}

export function filterSavedEntries(entries: SavedEntry[], filter: SavedFilter): SavedEntry[] {
  const query = filter.query?.trim().toLowerCase() ?? '';
  return entries.filter(
    (entry) =>
      (filter.source === 'all' || entry.source === filter.source) &&
      (filter.type === 'all' || savedEntryType(entry) === filter.type) &&
      (query.length === 0 || savedEntryMatches(entry, query)),
  );
}

export interface SavedCounts {
  bySource: Record<Exclude<SavedSourceFilter, 'all'>, number>;
  byType: Record<Exclude<SavedTypeFilter, 'all'>, number>;
}

/**
 * Counts for the chip rows. Each axis is counted with the *other* axis
 * applied, so a chip always says how many rows tapping it will show.
 */
export function countSavedEntries(entries: SavedEntry[], filter: SavedFilter): SavedCounts {
  const byType = filterSavedEntries(entries, { ...filter, type: 'all' });
  const bySource = filterSavedEntries(entries, { ...filter, source: 'all' });
  const counts: SavedCounts = {
    bySource: { devotional: 0, bible: 0 },
    byType: { highlights: 0, notes: 0, bookmarks: 0 },
  };
  for (const entry of bySource) counts.bySource[entry.source] += 1;
  for (const entry of byType) counts.byType[savedEntryType(entry)] += 1;
  return counts;
}

// ---------------------------------------------------------------------------
// Delete + Undo
// ---------------------------------------------------------------------------

export type SavedUndoAction = { entry: SavedEntry };

type SavedStoreSlice = {
  highlights: Highlight[];
  bibleHighlights: BibleHighlight[];
  bookmarks: Bookmark[];
};

function hasId<T extends { id: string }>(list: T[], id: string): boolean {
  return list.some((record) => record.id === id);
}

/**
 * Pure reducer: puts deleted records back. Records whose id is live again
 * (a sync pull raced the Undo) are left alone — the live copy is newer.
 */
export function applySavedUndo(state: SavedStoreSlice, actions: SavedUndoAction[]): SavedStoreSlice {
  let { highlights, bibleHighlights, bookmarks } = state;
  for (const { entry } of [...actions].reverse()) {
    if (entry.kind === 'bookmark') {
      if (!hasId(bookmarks, entry.id)) bookmarks = [entry.raw, ...bookmarks];
    } else if (entry.source === 'devotional') {
      const raw = entry.raw as Highlight;
      if (!hasId(highlights, raw.id)) highlights = [raw, ...highlights];
    } else {
      const raw = entry.raw as BibleHighlight;
      if (!hasId(bibleHighlights, raw.id)) bibleHighlights = [raw, ...bibleHighlights];
    }
  }
  return { highlights, bibleHighlights, bookmarks };
}

function syncChangeFor(entry: SavedEntry, clientUpdatedAt: string): SyncPushChange {
  if (entry.kind === 'bookmark') {
    return buildPersonalDataSyncChange('bookmarks', entry.id, bookmarkSyncData(entry.raw), clientUpdatedAt);
  }
  if (entry.source === 'devotional') {
    return buildPersonalDataSyncChange(
      'highlights',
      entry.id,
      devotionalHighlightSyncData(entry.raw as Highlight),
      clientUpdatedAt,
    );
  }
  return buildPersonalDataSyncChange(
    'bible_highlights',
    entry.id,
    bibleHighlightSyncData(entry.raw as BibleHighlight),
    clientUpdatedAt,
  );
}

/**
 * Undo for Journal › Saved. The store's remove* actions enqueue a tombstone;
 * this drops that tombstone from the outbox and re-enqueues the record as an
 * upsert, mirroring `applyUndoActionsWithSync` for notes.
 */
function stampEntry(entry: SavedEntry, updatedAt: string): SavedEntry {
  // The local row must carry the same updatedAt as the upsert it enqueues,
  // or the next pull sees the server copy as newer and re-applies it.
  return { ...entry, updatedAt, raw: { ...entry.raw, updatedAt } } as SavedEntry;
}

export function undoSavedDeletions(
  state: SavedStoreSlice,
  actions: SavedUndoAction[],
  clientUpdatedAt = new Date().toISOString(),
): SavedStoreSlice {
  const stamped = actions.map(({ entry }) => ({ entry: stampEntry(entry, clientUpdatedAt) }));
  const restored = applySavedUndo(state, stamped);
  const changes = stamped.map(({ entry }) => syncChangeFor(entry, clientUpdatedAt));
  if (changes.length > 0) {
    removeSyncChangesForRecords(changes.map(({ table, id }) => ({ table, id })));
    enqueueSyncChanges(changes);
  }
  return restored;
}

export function savedUndoMessage(actions: SavedUndoAction[]): string {
  if (actions.length > 1) return `${actions.length} items removed`;
  const entry = actions[0]?.entry;
  if (!entry) return '';
  if (entry.kind === 'bookmark') return 'Bookmark removed';
  if (entry.kind === 'note') return 'Note removed';
  return 'Highlight removed';
}
