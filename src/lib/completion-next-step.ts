import { NEXT_STEP_DETAILS } from '@/constants/daily-copy';
import { getDayMenuPresentation } from './devotional-day-access';
import type { CompletionType } from './completion-dismiss-route';
import type { Devotional } from './store';
import { copyVariationAt, drawCopyAt } from './variation-bag';

/**
 * The "Up next" step of the completion overlay. The paragraph rotates by
 * local day through the bag; `seed` is the install's copy seed (copySeed()).
 * `step` counts the completions earlier on this local day
 * (countReadsEarlierOnDay), and each one moves the paragraph on one entry.
 */
export function getCompletionNextStep(
  devotional: Devotional | null | undefined,
  completedDay: number,
  type: CompletionType,
  now: Date,
  seed: string,
  step = 0,
): { title: string; detail: string; nextDay?: number } {
  const variation = copyVariationAt(seed, now);
  if (type === 'series') {
    return {
      title: 'Where would you like to go next?',
      detail: drawCopyAt(NEXT_STEP_DETAILS.series, variation, 'next-step-series', step),
    };
  }

  const nextDay = completedDay + 1;
  const next = getDayMenuPresentation(devotional, nextDay, now);
  const title = next.kind === 'ready' || next.kind === 'locked-titled'
    ? `Up next · ${next.title}`
    : `Up next · Day ${nextDay}`;

  if (next.kind === 'ready') {
    return { title, detail: drawCopyAt(NEXT_STEP_DETAILS.ready, variation, 'next-step-ready', step), nextDay };
  }
  if (next.kind === 'locked-titled') {
    return {
      title,
      detail: next.unlockLabel === 'Tomorrow'
        ? drawCopyAt(NEXT_STEP_DETAILS.opensTomorrow, variation, 'next-step-tomorrow', step)
        : next.unlockLabel ?? 'Your next reading will open on a future day.',
    };
  }
  return {
    title,
    detail: next.kind === 'preparing'
      ? drawCopyAt(NEXT_STEP_DETAILS.preparing, variation, 'next-step-preparing', step)
      : drawCopyAt(NEXT_STEP_DETAILS.ahead, variation, 'next-step-ahead', step),
  };
}
