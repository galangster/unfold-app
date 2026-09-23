import { getDayMenuPresentation } from './devotional-day-access';
import type { CompletionType } from './completion-dismiss-route';
import type { Devotional } from './store';

export function getCompletionNextStep(
  devotional: Devotional | null | undefined,
  completedDay: number,
  type: CompletionType,
  now = new Date(),
): { title: string; detail: string; nextDay?: number } {
  if (type === 'series') {
    return {
      title: 'Where would you like to go next?',
      detail: 'On Today, continue with a recommended study or choose a new direction. Your completed series stays in your library.',
    };
  }

  const nextDay = completedDay + 1;
  const next = getDayMenuPresentation(devotional, nextDay, now);
  const title = next.kind === 'ready' || next.kind === 'locked-titled'
    ? `Up next · ${next.title}`
    : `Up next · Day ${nextDay}`;

  if (next.kind === 'ready') {
    return { title, detail: 'Your next reading is ready whenever you are.', nextDay };
  }
  if (next.kind === 'locked-titled') {
    return {
      title,
      detail: next.unlockLabel === 'Tomorrow'
        ? 'Your next reading opens tomorrow. Take today’s words with you.'
        : next.unlockLabel ?? 'Your next reading will open on a future day.',
    };
  }
  return {
    title,
    detail: next.kind === 'preparing'
      ? 'Your next reading is being prepared. You can find it on Today when it is ready.'
      : 'There is more ahead in this series. Return to Today for your next reading.',
  };
}
