import type { BibleHighlight, Devotional, Highlight } from '@/lib/store';
import { formatScriptureReference } from '@/lib/bible-constants';
import { drawCopy, type CopyVariation } from '@/lib/variation-bag';

export type RememberThisPick =
  | { kind: 'devotional'; highlight: Highlight }
  | { kind: 'bible'; highlight: BibleHighlight };

/**
 * One saved line for today's "A line worth carrying" card, drawn from both
 * devotional and Bible highlights. Deterministic per calendar day so the card
 * does not change on every render or focus.
 *
 * The draw is the seeded bag over the pool sorted by id, so every highlight
 * comes up once before any repeats. The old seed summed the date's character
 * codes, which gave 19 values a year and never reached most of a long list.
 * `variation` is today's draw: the install's copy seed and the local day.
 */
export function pickRememberThis(
  highlights: Highlight[],
  bibleHighlights: BibleHighlight[],
  variation: CopyVariation,
): RememberThisPick | null {
  const pool: RememberThisPick[] = [
    ...highlights
      .filter((h) => h.highlightedText.trim().length > 0)
      .map((highlight) => ({ kind: 'devotional' as const, highlight })),
    ...bibleHighlights
      .filter((h) => h.color !== null && h.text.trim().length > 0)
      .map((highlight) => ({ kind: 'bible' as const, highlight })),
  ];
  if (pool.length === 0) return null;
  // Store order changes with edits and sync; id order does not. Each key is
  // built once, not on every comparison.
  const keyed = pool.map((pick) => ({ pick, key: `${pick.highlight.id}|${pick.kind}` }));
  keyed.sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
  return drawCopy(keyed.map((entry) => entry.pick), variation, 'remember-this');
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
