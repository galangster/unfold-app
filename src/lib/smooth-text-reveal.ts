/**
 * Smooth text reveal — pure scheduling logic (client-side smoothStream).
 *
 * SSE token flushes land in the store every ~32ms in multi-word chunks, so
 * streamed text visually "pops". The reveal ticker turns the latest full text
 * into a steady word-by-word reveal:
 *
 *   - words appear on word boundaries at a fixed cadence (WORD_INTERVAL_MS)
 *   - when the network runs ahead, the ticker reveals multiple words per tick,
 *     proportional to the backlog, so the display never trails the full text
 *     by more than ~MAX_LAG_MS
 *   - `flush()` reveals everything instantly (done / unmount / reduced motion)
 *
 * Dependency-free on purpose (companion-limits.ts precedent): consumed by the
 * `useSmoothTextReveal` hook but unit-testable with fake timers only.
 */

/** Base cadence: one word per tick. */
export const WORD_INTERVAL_MS = 28;
/** The reveal must never trail the full text by more than this. */
export const MAX_LAG_MS = 1000;

/**
 * Index just past the next whole word from `from`: skips leading whitespace,
 * then consumes the word. Revealed slices therefore always end on a word
 * boundary — a partially-revealed word never renders.
 */
export function nextWordBoundary(text: string, from: number): number {
  let i = from;
  while (i < text.length && /\s/.test(text[i])) i += 1;
  while (i < text.length && !/\s/.test(text[i])) i += 1;
  return i;
}

/** Number of not-yet-revealed words after `from`. */
export function countRemainingWords(text: string, from: number): number {
  let count = 0;
  let i = from;
  while (i < text.length) {
    const next = nextWordBoundary(text, i);
    if (next === i) break;
    count += 1;
    i = next;
  }
  return count;
}

export interface RevealStep {
  nextIndex: number;
  delayMs: number;
}

/** Ticks the reveal is allowed to take to drain a backlog completely. */
export function budgetTicks(intervalMs = WORD_INTERVAL_MS, maxLagMs = MAX_LAG_MS): number {
  return Math.max(1, Math.ceil(maxLagMs / intervalMs));
}

/**
 * One reveal tick: how far to advance and when to tick again.
 *
 * Reveals ceil(backlog / ticksRemaining) words. Because `ticksRemaining` counts
 * down as the backlog drains, the remaining backlog after k ticks is bounded by
 * backlog₀ × (T−k)/T — so the reveal always catches up in exactly T ticks
 * (≈ maxLagMs), no matter how large the chunk. Deriving the rate from the
 * backlog alone would instead decay geometrically and never converge.
 */
export function computeRevealStep(
  fullText: string,
  revealedIndex: number,
  {
    intervalMs = WORD_INTERVAL_MS,
    maxLagMs = MAX_LAG_MS,
    ticksRemaining = budgetTicks(intervalMs, maxLagMs),
  }: { intervalMs?: number; maxLagMs?: number; ticksRemaining?: number } = {},
): RevealStep | null {
  if (revealedIndex >= fullText.length) return null;

  const backlogWords = countRemainingWords(fullText, revealedIndex);
  if (backlogWords === 0) {
    // Only trailing whitespace left — reveal it outright.
    return { nextIndex: fullText.length, delayMs: intervalMs };
  }

  const wordsPerTick = Math.max(1, Math.ceil(backlogWords / Math.max(1, ticksRemaining)));
  let next = revealedIndex;
  for (let i = 0; i < wordsPerTick && next < fullText.length; i += 1) {
    next = nextWordBoundary(fullText, next);
  }
  return { nextIndex: next, delayMs: intervalMs };
}

export interface RevealTicker {
  /** Update the target text. Appends continue the reveal; a replacement
   * (paragraph promotion swapped the tail) restarts from the beginning. */
  setText: (fullText: string) => void;
  /** Reveal everything immediately (done / reduced motion). */
  flush: () => void;
  /** Stop ticking without emitting (unmount). */
  dispose: () => void;
  getRevealedIndex: () => number;
}

export function createRevealTicker(
  onChange: (revealedIndex: number) => void,
  options: { intervalMs?: number; maxLagMs?: number } = {},
): RevealTicker {
  const { intervalMs = WORD_INTERVAL_MS, maxLagMs = MAX_LAG_MS } = options;
  let fullText = '';
  let revealedIndex = 0;
  let timer: ReturnType<typeof setTimeout> | null = null;
  // Ticks left to catch up to the newest text; refilled whenever text arrives,
  // so the deadline is always measured from the most recent chunk.
  let ticksRemaining = budgetTicks(intervalMs, maxLagMs);

  const clearTimer = () => {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
  };

  const tick = () => {
    timer = null;
    const step = computeRevealStep(fullText, revealedIndex, { intervalMs, maxLagMs, ticksRemaining });
    if (!step) return;
    ticksRemaining = Math.max(1, ticksRemaining - 1);
    revealedIndex = step.nextIndex;
    onChange(revealedIndex);
    if (revealedIndex < fullText.length) {
      timer = setTimeout(tick, step.delayMs);
    }
  };

  return {
    setText: (next) => {
      if (!next.startsWith(fullText)) {
        // Tail replacement, not an append — restart the reveal.
        revealedIndex = 0;
        onChange(0);
      }
      if (next !== fullText) ticksRemaining = budgetTicks(intervalMs, maxLagMs);
      fullText = next;
      if (revealedIndex > fullText.length) {
        revealedIndex = fullText.length;
        onChange(revealedIndex);
      }
      if (revealedIndex < fullText.length && !timer) {
        timer = setTimeout(tick, intervalMs);
      }
    },
    flush: () => {
      clearTimer();
      if (revealedIndex !== fullText.length) {
        revealedIndex = fullText.length;
        onChange(revealedIndex);
      }
    },
    dispose: clearTimer,
    getRevealedIndex: () => revealedIndex,
  };
}
