import { useMemo } from 'react';
import { useUnfoldStore } from '@/lib/store';
import type {
  BibleHighlight,
  BibleHighlightColor,
  Highlight,
  HighlightColor,
} from '@/lib/store';

export type SavedItemSource = 'devotional' | 'bible';

/**
 * Unified view-layer shape for a saved highlight regardless of origin
 * (devotional vs. Bible). Adapter — does not touch the persisted stores.
 */
export interface SavedItem {
  id: string;
  source: SavedItemSource;
  text: string;
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
  devotional: SavedItem[];
  bible: SavedItem[];
  count: {
    all: number;
    devotional: number;
    bible: number;
  };
}

function toDevotionalItem(h: Highlight): SavedItem {
  return {
    id: h.id,
    source: 'devotional',
    text: h.highlightedText,
    color: h.color ?? null,
    createdAt: h.createdAt,
    updatedAt: h.updatedAt,
    contextLabel: h.devotionalTitle
      ? `${h.devotionalTitle} — Day ${h.dayNumber}`
      : `Day ${h.dayNumber}`,
    raw: h,
  };
}

function toBibleItem(h: BibleHighlight): SavedItem {
  const ref =
    h.verseStart === h.verseEnd
      ? `${h.bookName} ${h.chapter}:${h.verseStart}`
      : `${h.bookName} ${h.chapter}:${h.verseStart}-${h.verseEnd}`;
  return {
    id: h.id,
    source: 'bible',
    text: h.text,
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

/**
 * Returns saved highlights from both stores, pre-sorted newest-first and
 * broken down by source. No source parameter — callers decide which slice
 * to render.
 */
export function useSavedHighlights(): SavedHighlightsResult {
  const highlights = useUnfoldStore((s) => s.highlights);
  const bibleHighlights = useUnfoldStore((s) => s.bibleHighlights);

  return useMemo(() => {
    const devotional = highlights.map(toDevotionalItem).sort(sortNewestFirst);
    const bible = bibleHighlights.map(toBibleItem).sort(sortNewestFirst);
    const all = [...devotional, ...bible].sort(sortNewestFirst);
    return {
      all,
      devotional,
      bible,
      count: {
        all: all.length,
        devotional: devotional.length,
        bible: bible.length,
      },
    };
  }, [highlights, bibleHighlights]);
}
