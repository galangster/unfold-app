import { useMemo } from 'react';
import { useUnfoldStore } from '@/lib/store';
import { buildSavedHighlights } from '@/lib/saved-highlights';
import type { SavedHighlightsResult, SavedItem, SavedItemKind, SavedItemSource } from '@/lib/saved-highlights';

export { buildSavedHighlights, toBibleSavedItem, toDevotionalSavedItem } from '@/lib/saved-highlights';
export type { SavedHighlightsResult, SavedItem, SavedItemKind, SavedItemSource };

/**
 * Returns saved highlights from both stores, pre-sorted newest-first and
 * broken down by source/type. No source parameter — callers decide which slice
 * to render.
 */
export function useSavedHighlights(): SavedHighlightsResult {
  const highlights = useUnfoldStore((s) => s.highlights);
  const bibleHighlights = useUnfoldStore((s) => s.bibleHighlights);

  return useMemo(() => buildSavedHighlights(highlights, bibleHighlights), [highlights, bibleHighlights]);
}
