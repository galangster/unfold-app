import { NEXT_STEP_DETAILS } from '@/constants/daily-copy';
import { getDayMenuPresentation } from './devotional-day-access';
import type { CompletionType } from './completion-dismiss-route';
import type { Devotional } from './store';
import { copyVariationAt, drawCopy } from './variation-bag';

/**
 * The "Up next" step of the completion overlay. The paragraph rotates by
 * local day through the bag; `seed` is the install's copy seed (copySeed()).
 */
export function getCompletionNextStep(
  devotional: Devotional | null | undefined,
  completedDay: number,
  type: CompletionType,
  now: Date,
  seed: string,
): { title: string; detail: string; nextDay?: number } {
  const variation = copyVariationAt(seed, now);
  if (type === 'series') {
    return {
      title: 'Where would you like to go next?',
      detail: drawCopy(NEXT_STEP_DETAILS.series, variation, 'next-step-series'),
    };
  }

  const nextDay = completedDay + 1;
  const next = getDayMenuPresentation(devotional, nextDay, now);
  const title = next.kind === 'ready' || next.kind === 'locked-titled'
    ? `Up next · ${next.title}`
    : `Up next · Day ${nextDay}`;

  if (next.kind === 'ready') {
    return { title, detail: drawCopy(NEXT_STEP_DETAILS.ready, variation, 'next-step-ready'), nextDay };
  }
  if (next.kind === 'locked-titled') {
    return {
      title,
      detail: next.unlockLabel === 'Tomorrow'
        ? drawCopy(NEXT_STEP_DETAILS.opensTomorrow, variation, 'next-step-tomorrow')
        : next.unlockLabel ?? 'Your next reading will open on a future day.',
    };
  }
  return {
    title,
    detail: next.kind === 'preparing'
      ? drawCopy(NEXT_STEP_DETAILS.preparing, variation, 'next-step-preparing')
      : drawCopy(NEXT_STEP_DETAILS.ahead, variation, 'next-step-ahead'),
  };
}
