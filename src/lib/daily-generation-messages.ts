import type { DailyGenerationRecoveryState } from './daily-generation-recovery';
import type { PausedSeriesMissingDayKind } from './devotional-day-access';

export function getDailyGenerationNotice(
  state: DailyGenerationRecoveryState | undefined,
  dayNumber: number,
): { title: string; body: string } | null {
  switch (state?.status) {
    case 'offline':
      return {
        title: 'We lost the connection',
        body: 'Your reading may still be preparing. Reconnect, then check again.',
      };
    case 'blocked':
      if (state.reason === 'series-read-only') {
        return {
          title: 'This series is read-only',
          body: 'Open Today to continue with your active series.',
        };
      }
      // The day is open here; the server is still waiting on the last read.
      if (state.reason === 'read-sync-pending') {
        return {
          title: 'Saving your last reading',
          body: `Day ${dayNumber} will start once it’s saved. Check again in a moment.`,
        };
      }
      return {
        title: `Day ${dayNumber} isn’t available yet`,
        body: 'Your series is safe. Check again after this day unlocks.',
      };
    case 'failed':
      // The server reopens a day whose retries are spent on the reader's next
      // local day. Until then, retrying or checking now cannot prepare it.
      return state.failureKind === 'job' && state.retriesExhausted
        ? {
            title: `We couldn’t prepare Day ${dayNumber}`,
            body: 'Your series is safe. We’ll try this reading again tomorrow.',
          }
        : null;
    case 'service-error':
      return {
        title: `We couldn’t check Day ${dayNumber}`,
        body: 'Please check again in a moment.',
      };
    default:
      return null;
  }
}

/**
 * A paused series (any series but the current one) is never generated
 * further. Once a full pull confirms a day is not on the server, checking
 * again cannot produce it, so the reader points to Today instead.
 */
export function getPausedSeriesDayNotice(
  dayNumber: number,
  kind: PausedSeriesMissingDayKind,
): { title: string; body: string } {
  if (kind === 'restore-failed') {
    return {
      title: `Day ${dayNumber} couldn’t be restored`,
      body: 'We couldn’t find this reading on the server. Open Today to keep reading.',
    };
  }
  return {
    title: `Day ${dayNumber} wasn’t prepared`,
    body: `This series was paused before Day ${dayNumber}. Open Today to keep reading.`,
  };
}
