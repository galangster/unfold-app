/**
 * useSmoothTextReveal — word-boundary reveal of streamed text.
 *
 * The store stays the source of truth for the full text; this hook runs a
 * local display ticker (see smooth-text-reveal.ts) that reveals toward
 * `fullText.length` at a steady per-word cadence with backlog-proportional
 * catch-up. Flushes instantly when `done` is set, when the user prefers
 * reduced motion, and stops cleanly on unmount.
 */
import { useEffect, useRef, useState } from 'react';
import { useReducedMotion } from 'react-native-reanimated';
import { createRevealTicker } from './smooth-text-reveal';

export function useSmoothTextReveal(
  fullText: string,
  { done = false }: { done?: boolean } = {},
): string {
  const reducedMotion = useReducedMotion();
  const instant = done || reducedMotion;

  const [revealedIndex, setRevealedIndex] = useState(() => (instant ? fullText.length : 0));
  const tickerRef = useRef<ReturnType<typeof createRevealTicker> | null>(null);
  if (!tickerRef.current) {
    tickerRef.current = createRevealTicker(setRevealedIndex);
  }

  // Render-phase guard: when the tail is replaced (paragraph promotion), the
  // stale revealed index would flash a not-yet-revealed prefix of the new
  // text for one frame before the effect resets the ticker.
  const prevTextRef = useRef('');
  const isReplacement = !fullText.startsWith(prevTextRef.current);

  useEffect(() => {
    const ticker = tickerRef.current!;
    prevTextRef.current = fullText;
    ticker.setText(fullText);
    if (instant) ticker.flush();
  }, [fullText, instant]);

  useEffect(() => () => tickerRef.current?.dispose(), []);

  const visibleIndex = instant
    ? fullText.length
    : isReplacement
      ? 0
      : Math.min(revealedIndex, fullText.length);
  return fullText.slice(0, visibleIndex);
}
