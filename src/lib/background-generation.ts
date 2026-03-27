import * as BackgroundFetch from 'expo-background-fetch';
import * as TaskManager from 'expo-task-manager';
import { useUnfoldStore } from './store';
import { triggerNextDayGeneration } from './progressive-generation';
import { refreshDailyReminder } from './notifications';
import { isPastCutoff, todayDateString } from './cutoff-logic';
import { logger } from './logger';

export const GENERATION_TASK = 'DEFERRED_DEVOTIONAL_GENERATION';

/**
 * Pure guard function — extracted for testability.
 * Returns true if background generation should be attempted.
 */
export function shouldAttemptBackgroundGeneration(
  state: {
    currentDevotionalId: string | null;
    devotionals: Array<{
      id: string;
      generationMode: string;
      currentDay: number;
      totalDays: number;
      days: Array<{ dayNumber: number }>;
    }>;
    lastGenerationCutoffDate: string;
  },
  now: Date = new Date(),
): boolean {
  // Guard: has active devotional?
  if (!state.currentDevotionalId) return false;

  const devotional = state.devotionals.find(
    (d) => d.id === state.currentDevotionalId && d.generationMode === 'progressive',
  );
  if (!devotional) return false;

  // Guard: past midnight cutoff?
  if (!isPastCutoff(state.lastGenerationCutoffDate, now)) return false;

  // Guard: next day doesn't already exist?
  const nextDay = devotional.currentDay;
  if (devotional.days.some((d) => d.dayNumber === nextDay)) return false;

  // Guard: not past end of series?
  if (nextDay > devotional.totalDays) return false;

  return true;
}

// Define the background task
TaskManager.defineTask(GENERATION_TASK, async () => {
  try {
    const store = useUnfoldStore.getState();

    if (!shouldAttemptBackgroundGeneration(store)) {
      return BackgroundFetch.BackgroundFetchResult.NoData;
    }

    const devotional = store.devotionals.find(
      (d) => d.id === store.currentDevotionalId && d.generationMode === 'progressive',
    )!;

    const completedDay = devotional.currentDay - 1;
    logger.log(`[bg-gen] Attempting background generation for day ${devotional.currentDay}`);

    const result = await triggerNextDayGeneration(devotional.id, completedDay);

    if (result) {
      store.setLastGenerationCutoffDate(todayDateString());
      refreshDailyReminder();
      logger.log(`[bg-gen] Background generation succeeded for day ${devotional.currentDay}`);
      return BackgroundFetch.BackgroundFetchResult.NewData;
    }

    return BackgroundFetch.BackgroundFetchResult.Failed;
  } catch (err) {
    logger.error('[bg-gen] Background generation failed:', err);
    return BackgroundFetch.BackgroundFetchResult.Failed;
  }
});

/**
 * Register the background fetch task. Call once during app startup.
 */
export async function registerBackgroundGeneration(): Promise<void> {
  try {
    await BackgroundFetch.registerTaskAsync(GENERATION_TASK, {
      minimumInterval: 60 * 60, // 1 hour minimum between attempts
    });
    logger.log('[bg-gen] Background generation task registered');
  } catch (err) {
    logger.warn('[bg-gen] Failed to register background task:', err);
  }
}
