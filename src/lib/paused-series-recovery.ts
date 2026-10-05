import type { Devotional } from './store';
import type { DailyGenerationRecoveryState } from './daily-generation-recovery';
import { getTodayReaderDayNumber, isPausedSeriesUnpreparedDay } from './devotional-day-access';
import { shouldWatchForGeneratedDay } from './generated-day-watch';

export interface PausedSeriesRecoveryContext {
  devotional: Devotional | null | undefined;
  currentDevotionalId: string | null;
  dayNumber: number;
  confirmedMissingDayKey: string | null;
  discoveredAbsentKey: string | null;
  generationState: DailyGenerationRecoveryState;
  isCheckingForSyncedDay: boolean;
  isFocused: boolean;
  isOnline: boolean;
  readBudgetBlocked: boolean;
}

/** A continuation offer requires a missing current reading, not a history visit. */
export function getPausedSeriesContinuationDay(
  context: PausedSeriesRecoveryContext,
  now = new Date(),
): number | null {
  const { devotional, dayNumber, generationState } = context;
  if (!devotional || !context.isFocused || !context.isOnline
    || context.isCheckingForSyncedDay || context.readBudgetBlocked) return null;
  if (devotional.id === context.currentDevotionalId
    || !isPausedSeriesUnpreparedDay(devotional, dayNumber, true)) return null;
  const key = `${devotional.id}:${dayNumber}`;
  if (context.confirmedMissingDayKey !== key || context.discoveredAbsentKey !== key) return null;
  // A stored absence verdict must not hide a newer job, connection, or service state.
  if (generationState.status !== 'idle' || generationState.discovered !== true) return null;
  if (dayNumber !== getTodayReaderDayNumber(devotional, now)
    || !shouldWatchForGeneratedDay(devotional, dayNumber, now)) return null;
  return dayNumber;
}
