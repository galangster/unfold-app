import type { BibleHighlight, Devotional, Highlight } from '@/lib/store';
import { formatScriptureReference } from '@/lib/bible-constants';

export type RememberThisPick =
  | { kind: 'devotional'; highlight: Highlight }
  | { kind: 'bible'; highlight: BibleHighlight };

/**
 * One saved line for today's "A line worth carrying" card, drawn from both
 * devotional and Bible highlights. Deterministic per calendar day so the card
 * does not change on every render or focus.
 */
export function pickRememberThis(
  highlights: Highlight[],
  bibleHighlights: BibleHighlight[],
  dateKey: string,
): RememberThisPick | null {
  const pool: RememberThisPick[] = [
    ...highlights.map((highlight) => ({ kind: 'devotional' as const, highlight })),
    ...bibleHighlights
      .filter((h) => h.color !== null && h.text.trim().length > 0)
      .map((highlight) => ({ kind: 'bible' as const, highlight })),
  ];
  if (pool.length === 0) return null;
  const seed = dateKey.split('').reduce((sum, char) => sum + char.charCodeAt(0), 0);
  return pool[seed % pool.length];
}

export function rememberThisQuote(pick: RememberThisPick): string {
  return pick.kind === 'devotional' ? pick.highlight.highlightedText : pick.highlight.text;
}

/** "Day 3 · Quiet Path" for a devotional line, "Psalm 23:1 (BSB)" for a verse. */
export function rememberThisSource(pick: RememberThisPick, devotionals: Devotional[]): string {
  if (pick.kind === 'bible') {
    const h = pick.highlight;
    return `${formatScriptureReference(h.bookName, h.chapter, h.verseStart, h.verseEnd)} (${h.translation})`;
  }
  const h = pick.highlight;
  const title = devotionals.find((d) => d.id === h.devotionalId)?.title || h.devotionalTitle || 'Untitled Series';
  return `Day ${h.dayNumber} · ${title}`;
}
