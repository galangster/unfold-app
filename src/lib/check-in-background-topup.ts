/**
 * BGAppRefresh body for check-in notification top-up.
 *
 * iOS launches this JS without mounting React. The owner hook therefore
 * cannot run. This module waits for the persisted store, asks RevenueCat
 * the same question the foreground hook asks, then calls
 * `runCheckInNotificationSync` — the same cancel-then-write, the same
 * 14-day builder, the same identifier space. It never touches the trial
 * ending notice.
 *
 * Fail closed: recovery session, a reset in flight, an unhydrated store,
 * or an unanswered RevenueCat read are no-ops. They must not cancel a
 * live premium queue from empty defaults.
 */

import { Platform } from 'react-native';
import * as BackgroundFetch from 'expo-background-fetch';

import { useUnfoldStore } from '@/lib/store';
import { useUIState } from '@/lib/ui-state';
import { isRecoverySession } from '@/lib/mmkv-storage';
import { isLocalResetInProgress } from '@/lib/sync-session-fence';
import {
  getCustomerInfo,
  hasRevenueCatConfigurationAttemptFailed,
  isRevenueCatEnabled,
} from '@/lib/revenuecatClient';
import { logger } from '@/lib/logger';
import { runCheckInNotificationSync } from '@/lib/check-in-notification-sync';

const DEFAULT_HYDRATION_WAIT_MS = 5_000;
let hydrationWaitMs = DEFAULT_HYDRATION_WAIT_MS;

/** Test-only: skip the production hydration grace period. */
export function setCheckInBackgroundHydrationWaitForTests(ms: number): void {
  hydrationWaitMs = ms;
}

export function resetCheckInBackgroundHydrationWaitForTests(): void {
  hydrationWaitMs = DEFAULT_HYDRATION_WAIT_MS;
}

export async function waitForUnfoldStoreHydration(): Promise<boolean> {
  if (useUnfoldStore.persist.hasHydrated()) return true;

  return new Promise((resolve) => {
    let settled = false;
    const finish = (value: boolean) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      unsub();
      resolve(value);
    };
    const unsub = useUnfoldStore.persist.onFinishHydration(() => finish(true));
    const timer = setTimeout(() => finish(useUnfoldStore.persist.hasHydrated()), hydrationWaitMs);
  });
}

/**
 * Make `getEffectivePremiumAccessPolicy` answer the way a mounted
 * `useRevenueCatSync` would. Without this, a terminated-app wake always
 * sees `revenueCatResolved === false` and the shared sync defers.
 *
 * Returns false when the source has not spoken — caller must not write.
 */
function shouldAbortBackgroundTopup(): boolean {
  return isRecoverySession() || isLocalResetInProgress();
}

export async function prepareCheckInBackgroundPremium(): Promise<boolean> {
  if (shouldAbortBackgroundTopup()) return false;
  if (useUIState.getState().revenueCatResolved) return true;

  if (!isRevenueCatEnabled()) {
    if (hasRevenueCatConfigurationAttemptFailed()) {
      logger.log('[check-in-topup] RevenueCat configure failed; leaving policy unresolved');
      return false;
    }
    if (shouldAbortBackgroundTopup()) return false;
    useUIState.getState().setRevenueCatResolved();
    return true;
  }

  const result = await getCustomerInfo();
  // Reset can start while Purchases is in flight. Do not write the old
  // profile's entitlement onto a store that Delete Everything is wiping.
  if (shouldAbortBackgroundTopup()) {
    logger.log('[check-in-topup] Reset began during RevenueCat read; not applying');
    return false;
  }
  if (!result.ok) {
    logger.log(`[check-in-topup] Customer info unavailable (${result.reason}); deferring`);
    return false;
  }

  const hasSubscription = Boolean(result.data.entitlements.active?.['Unfold Premium']);
  useUnfoldStore.getState().updateUser({ isPremium: hasSubscription });
  useUIState.getState().setRevenueCatResolved();
  return true;
}

export async function runCheckInBackgroundTopup(): Promise<BackgroundFetch.BackgroundFetchResult> {
  try {
    if (Platform.OS === 'web') {
      return BackgroundFetch.BackgroundFetchResult.NoData;
    }
    if (shouldAbortBackgroundTopup()) {
      logger.log('[check-in-topup] Recovery or reset; not touching OS queue');
      return BackgroundFetch.BackgroundFetchResult.NoData;
    }

    const hydrated = await waitForUnfoldStoreHydration();
    if (!hydrated) {
      logger.log('[check-in-topup] Store not hydrated; deferring');
      return BackgroundFetch.BackgroundFetchResult.NoData;
    }
    if (shouldAbortBackgroundTopup()) {
      logger.log('[check-in-topup] Reset began during hydration; not touching OS queue');
      return BackgroundFetch.BackgroundFetchResult.NoData;
    }

    const premiumReady = await prepareCheckInBackgroundPremium();
    if (!premiumReady || shouldAbortBackgroundTopup()) {
      return BackgroundFetch.BackgroundFetchResult.NoData;
    }

    const outcome = await runCheckInNotificationSync('background');
    if (outcome.kind === 'synced' || outcome.kind === 'cancelled') {
      return BackgroundFetch.BackgroundFetchResult.NewData;
    }
    if (outcome.kind === 'retry') {
      return BackgroundFetch.BackgroundFetchResult.Failed;
    }
    return BackgroundFetch.BackgroundFetchResult.NoData;
  } catch (error) {
    logger.error('[check-in-topup] Background top-up failed:', error);
    return BackgroundFetch.BackgroundFetchResult.Failed;
  }
}
