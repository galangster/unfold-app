/**
 * BGAppRefresh registration for check-in notification top-up.
 *
 * `TaskManager.defineTask` must run in the global scope of the JS bundle so
 * iOS can launch the task without mounting React. `index.ts` imports this
 * file before `expo-router/entry` for that reason. The handler is loaded
 * lazily so a cold start does not pull the notification stack before the
 * router.
 *
 * Registration (`registerCheckInBackgroundTopup`) happens from `_layout`
 * after a normal launch — iOS will not wake a task that was never
 * registered in a previous foreground session.
 */

import { Platform } from 'react-native';
import * as BackgroundFetch from 'expo-background-fetch';
import * as TaskManager from 'expo-task-manager';

import { logger } from '@/lib/logger';

export const CHECK_IN_BACKGROUND_TASK = 'unfold-check-in-topup';

const MINIMUM_INTERVAL_SEC = 60 * 60;

if (Platform.OS !== 'web') {
  TaskManager.defineTask(CHECK_IN_BACKGROUND_TASK, async () => {
    const { runCheckInBackgroundTopup } = await import('./check-in-background-topup');
    return runCheckInBackgroundTopup();
  });
}

export async function registerCheckInBackgroundTopup(): Promise<void> {
  if (Platform.OS === 'web') return;

  try {
    await BackgroundFetch.registerTaskAsync(CHECK_IN_BACKGROUND_TASK, {
      minimumInterval: MINIMUM_INTERVAL_SEC,
      stopOnTerminate: false,
      startOnBoot: true,
    });
    logger.log('[check-in-topup] Background fetch task registered');
  } catch (error) {
    logger.warn('[check-in-topup] Failed to register background task:', error);
  }
}
