/**
 * The fixed wait line under the cycling messages on the generating screen.
 * The estimates come from measured first-series waits; see
 * LONG_RUNNING_AFTER_MS in generation-poll-outcome.ts.
 */
import { WAIT_LINE_NOTIFY_PROMISE_COPY, type NotifyPromisePlacement } from './generating-notify-state';
import { isLongSeries } from './generation-poll-outcome';

function resolveWaitEstimate(totalDays: number): string {
  // Negated comparisons so a non-finite length reads as the shortest series.
  if (!(totalDays > 7)) return 'This usually takes about two minutes.';
  if (!isLongSeries(totalDays)) return 'This usually takes about three minutes.';
  if (totalDays === 30) return 'A 30-day series usually takes four to six minutes.';
  return 'A longer series usually takes four to six minutes.';
}

/** A long series also says the reader can leave when the line carries the notification promise. */
export function resolveGeneratingWaitCopy(totalDays: number, notifyPromise: NotifyPromisePlacement): string {
  const estimate = resolveWaitEstimate(totalDays);
  return notifyPromise === 'wait-line' ? `${estimate} ${WAIT_LINE_NOTIFY_PROMISE_COPY}` : estimate;
}
