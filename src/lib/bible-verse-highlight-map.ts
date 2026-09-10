import type { BibleHighlight, BibleHighlightColor } from '@/lib/store';

/**
 * Verse number → highlight colour for one chapter's highlights.
 * Note-only entries (color: null) carry no visual highlight and are skipped.
 * When highlights overlap, the later record in the array wins.
 */
export function buildVerseColorMap(chapterHighlights: BibleHighlight[]): Record<number, BibleHighlightColor> {
  const map: Record<number, BibleHighlightColor> = {};
  for (const h of chapterHighlights) {
    if (h.color === null) continue;
    for (let v = h.verseStart; v <= h.verseEnd; v++) {
      map[v] = h.color;
    }
  }
  return map;
}
