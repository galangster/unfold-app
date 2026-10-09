/**
 * The fixed wait line under the cycling messages on the generating screen.
 * The estimates come from measured first-series waits; see
 * LONG_RUNNING_AFTER_MS in generation-poll-outcome.ts.
 */
import type { NotifyControlState } from './generating-notify-state';
import { isLongSeries } from './generation-poll-outcome';

const LEAVE_WITH_NOTIFICATION_COPY = 'You can leave this screen. We’ll let you know when Day 1 is ready.';

function resolveWaitEstimate(totalDays: number): string {
  // Negated comparisons so a non-finite length reads as the shortest series.
  if (!(totalDays > 7)) return 'This usually takes about two minutes.';
  if (!isLongSeries(totalDays)) return 'This usually takes about three minutes.';
  if (totalDays === 30) return 'A 30-day series usually takes four to six minutes.';
  return 'A longer series usually takes four to six minutes.';
}

/**
 * A long series also says the reader can leave, but only once the server
 * holds a push token: the same rule that gates every other notification
 * promise on this screen.
 */
export function resolveGeneratingWaitCopy(totalDays: number, notifyControl: NotifyControlState): string {
  const estimate = resolveWaitEstimate(totalDays);
  return isLongSeries(totalDays) && notifyControl === 'confirmed'
    ? `${estimate} ${LEAVE_WITH_NOTIFICATION_COPY}`
    : estimate;
}
