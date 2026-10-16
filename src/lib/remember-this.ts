import type { BibleHighlight, Devotional, Highlight } from '@/lib/store';
import { formatScriptureReference } from '@/lib/bible-constants';
import { dayIndexFor, drawRotation, type CopyVariation } from '@/lib/variation-bag';

export type RememberThisPick =
  | { kind: 'devotional'; highlight: Highlight }
  | { kind: 'bible'; highlight: BibleHighlight };

const FIELD = 'remember-this';

/**
 * How many days back the card retraces its own picks. It looks back only
 * while yesterday's pick is in doubt, which a pool of three or more settles
 * within a day or two almost every time.
 */
const LOOKBACK_DAYS = 60;

interface PoolEntry {
  pick: RememberThisPick;
  key: string;
  /** The local day the highlight was saved. An unreadable date counts as long ago. */
  savedDay: number;
}

function savedDayOf(createdAt: string): number {
  const saved = new Date(createdAt);
  return Number.isNaN(saved.getTime()) ? -Infinity : dayIndexFor(saved);
}

/**
 * The card's pool on a local day, in id order: the highlights saved before
 * that day, so a save during the day does not move the card. With none that
 * old, every highlight saved by then, so a first highlight still shows.
 */
function poolOn(sorted: readonly PoolEntry[], dayIndex: number, today: number): readonly PoolEntry[] {
  const older = sorted.filter((entry) => entry.savedDay < dayIndex);
  if (older.length > 0) return older;
  // Today's fallback also keeps a highlight whose date runs ahead of the clock.
  return dayIndex >= today ? sorted : sorted.filter((entry) => entry.savedDay <= dayIndex);
}

/**
 * Two highlights take turns, the newer one first on the first day the pool
 * holds both, so neither shows twice in a row. The bag cannot promise that
 * for a pool this small.
 */
function alternate(pool: readonly PoolEntry[], dayIndex: number): PoolEntry | undefined {
  if (pool.length < 2) return pool[0];
  const [first, second] = pool;
  const newer = second.savedDay > first.savedDay ? second : first;
  const older = newer === first ? second : first;
  // The day after the newer one was saved, or that day when both were saved on it.
  const bothFrom = older.savedDay < newer.savedDay ? newer.savedDay + 1 : newer.savedDay;
  const anchor = Number.isFinite(bothFrom) ? bothFrom : 0;
  return (dayIndex - anchor) % 2 === 0 ? newer : older;
}

/**
 * The card's pick on `variation`'s day: the bag's draw over that day's pool,
 * or the next highlight when the draw is what the card showed the day
 * before. A new highlight changes the pool's length the next day and so
 * starts a new bag, and without the step it could bring back yesterday's.
 */
function pickOn(
  sorted: readonly PoolEntry[],
  variation: CopyVariation,
  today: number,
  lookback: number,
): PoolEntry | undefined {
  const pool = poolOn(sorted, variation.dayIndex, today);
  if (pool.length <= 2) return alternate(pool, variation.dayIndex);
  const [drawn, next] = drawRotation(pool, variation, FIELD);
  if (lookback === 0) return drawn;
  const before = { ...variation, dayIndex: variation.dayIndex - 1 };
  const poolBefore = poolOn(sorted, before.dayIndex, today);
  // Yesterday showed its own draw or the entry after it. A draw that is
  // neither cannot repeat it, so most days look back no further.
  if (poolBefore.length > 2) {
    const [shown, stepped] = drawRotation(poolBefore, before, FIELD);
    if (drawn !== shown && drawn !== stepped) return drawn;
  }
  return pickOn(sorted, before, today, lookback - 1) === drawn ? next : drawn;
}

/**
 * One saved line for today's "A line worth carrying" card, drawn from both
 * devotional and Bible highlights. Deterministic per calendar day so the card
 * does not change on every render or focus.
 *
 * The draw is the seeded bag over the pool sorted by id, so while the pool
 * holds still every highlight comes up once before any repeats. The old
 * seed summed the date's character codes, which gave 19 values a year and
 * never reached most of a long list. The pool is the highlights saved before
 * today, so the card holds through the day, and when yesterday's saves join
 * it, the card steps past yesterday's pick, which it works out exactly.
 * Highlights deleted since, or synced in with an older date, can still shift
 * a past pool. `variation` is today's draw: the install's copy seed and the
 * local day.
 */
export function pickRememberThis(
  highlights: Highlight[],
  bibleHighlights: BibleHighlight[],
  variation: CopyVariation,
): RememberThisPick | null {
  const picks: RememberThisPick[] = [
    ...highlights
      .filter((h) => h.highlightedText.trim().length > 0)
      .map((highlight) => ({ kind: 'devotional' as const, highlight })),
    ...bibleHighlights
      .filter((h) => h.color !== null && h.text.trim().length > 0)
      .map((highlight) => ({ kind: 'bible' as const, highlight })),
  ];
  if (picks.length === 0) return null;
  // Store order changes with edits and sync; id order does not. Each key is
  // built once, not on every comparison.
  const sorted: PoolEntry[] = picks.map((pick) => ({
    pick,
    key: `${pick.highlight.id}|${pick.kind}`,
    savedDay: savedDayOf(pick.highlight.createdAt),
  }));
  sorted.sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
  return pickOn(sorted, variation, variation.dayIndex, LOOKBACK_DAYS)?.pick ?? null;
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
