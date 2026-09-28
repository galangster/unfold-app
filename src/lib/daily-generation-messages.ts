import type { DailyGenerationRecoveryState } from './daily-generation-recovery';

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
      return state.reason === 'series-read-only'
        ? {
            title: 'This series is read-only',
            body: 'Open Today to continue with your active series.',
          }
        : {
            title: `Day ${dayNumber} isn’t available yet`,
            body: 'Your series is safe. Check again after this day unlocks.',
          };
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
export function getPausedSeriesDayNotice(dayNumber: number): { title: string; body: string } {
  return {
    title: `Day ${dayNumber} wasn’t prepared`,
    body: `This series was paused before Day ${dayNumber}. Open Today to keep reading.`,
  };
}
