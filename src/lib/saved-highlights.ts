import type {
  BibleHighlight,
  BibleHighlightColor,
  Highlight,
  HighlightColor,
} from '@/lib/store';
import { formatScriptureReference } from '@/lib/bible-constants';

export type SavedItemSource = 'devotional' | 'bible';
export type SavedItemKind = 'highlight' | 'note';

/**
 * Unified view-layer shape for a saved highlight/note regardless of origin
 * (devotional vs. Bible). Adapter — does not touch the persisted stores.
 */
export interface SavedItem {
  id: string;
  source: SavedItemSource;
  kind: SavedItemKind;
  text: string;
  note?: string;
  hasNote: boolean;
  color: HighlightColor | BibleHighlightColor | null;
  createdAt: string;
  updatedAt?: string;
  /** Short contextual label shown under the text (e.g., "Psalm 23:1 (ESV)"). */
  contextLabel: string;
  /** Original record, kept so routing can pull source-specific fields. */
  raw: Highlight | BibleHighlight;
}

export interface SavedHighlightsResult {
  all: SavedItem[];
  highlights: SavedItem[];
  notes: SavedItem[];
  devotional: SavedItem[];
  bible: SavedItem[];
  count: {
    all: number;
    highlights: number;
    notes: number;
    devotional: number;
    bible: number;
  };
}

export function toDevotionalSavedItem(h: Highlight): SavedItem {
  return {
    id: h.id,
    source: 'devotional',
    kind: 'highlight',
    text: h.highlightedText,
    hasNote: false,
    color: h.color ?? null,
    createdAt: h.createdAt,
    updatedAt: h.updatedAt,
    contextLabel: h.devotionalTitle
      ? `${h.devotionalTitle} — Day ${h.dayNumber}`
      : `Day ${h.dayNumber}`,
    raw: h,
  };
}

export function toBibleSavedItem(h: BibleHighlight): SavedItem | null {
  const ref = formatScriptureReference(h.bookName, h.chapter, h.verseStart, h.verseEnd);
  const note = h.note?.trim();
  const hasNote = Boolean(note);

  // A BibleHighlight with no color and no note is not a visible saved item.
  if (!hasNote && h.color === null) {
    return null;
  }

  return {
    id: h.id,
    source: 'bible',
    kind: hasNote ? 'note' : 'highlight',
    text: h.text,
    note: hasNote ? note : undefined,
    hasNote,
    color: h.color,
    createdAt: h.createdAt,
    updatedAt: h.updatedAt,
    contextLabel: `${ref} (${h.translation})`,
    raw: h,
  };
}

function sortNewestFirst(a: SavedItem, b: SavedItem): number {
  const ta = new Date(a.updatedAt ?? a.createdAt).getTime();
  const tb = new Date(b.updatedAt ?? b.createdAt).getTime();
  return tb - ta;
}

function isHighlightItem(item: SavedItem): boolean {
  return item.source === 'devotional' || item.color !== null;
}

export function buildSavedHighlights(
  highlights: Highlight[],
  bibleHighlights: BibleHighlight[],
): SavedHighlightsResult {
  const devotional = highlights.map(toDevotionalSavedItem).sort(sortNewestFirst);
  const bible = bibleHighlights
    .map(toBibleSavedItem)
    .filter((item): item is SavedItem => item !== null)
    .sort(sortNewestFirst);
  const all = [...devotional, ...bible].sort(sortNewestFirst);
  const notes = all.filter((item) => item.kind === 'note');
  const highlightItems = all.filter(isHighlightItem);

  return {
    all,
    highlights: highlightItems,
    notes,
    devotional,
    bible,
    count: {
      all: all.length,
      highlights: highlightItems.length,
      notes: notes.length,
      devotional: devotional.length,
      bible: bible.length,
    },
  };
}
