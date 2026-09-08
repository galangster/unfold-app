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
