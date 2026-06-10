/**
 * Hook to sync RevenueCat subscription status with Zustand store
 *
 * Uses RevenueCat's real-time customer info listener for efficient updates
 * instead of aggressive polling.
 *
 * Also prefetches offerings into the React Query cache at app startup so the
 * paywall can display instantly when opened (no "loading plans" spinner).
 */

import { useEffect } from 'react';
import { AppState } from 'react-native';
import type { CustomerInfo } from 'react-native-purchases';
import { useQueryClient } from '@tanstack/react-query';
import { useUnfoldStore } from '@/lib/store';
import { useUIState } from '@/lib/ui-state';
import {
  addCustomerInfoUpdateListener,
  getCustomerInfo,
  getOfferings,
  hasRevenueCatConfigurationAttemptFailed,
  isRevenueCatEnabled,
  retryRevenueCatIdentitySync,
} from '@/lib/revenuecatClient';
import { syncTrialEndingNotification } from '@/lib/trial-notification';
import { createSingleListenerGuard } from '@/lib/listener-registration';
import { logger } from '@/lib/logger';

export function useRevenueCatSync() {
  const updateUser = useUnfoldStore((s) => s.updateUser);
  const queryClient = useQueryClient();

  useEffect(() => {
    // Only sync if RevenueCat is configured
    if (!isRevenueCatEnabled()) {
      if (hasRevenueCatConfigurationAttemptFailed()) {
        logger.log('[RevenueCat] Configuration failed; leaving premium policy unresolved');
        return;
      }
      // No external source to wait for — mark as resolved so downstream
      // tri-state gates (usePremiumAccessPolicy) don't stay in `unknown`
      // forever. In this state, premium falls back to persisted user.isPremium
      // (usually false in dev without RC keys) or the __DEV__ override.
      useUIState.getState().setRevenueCatResolved();
      return;
    }

    let didCancel = false;

    const applyCustomerInfo = (customerInfo: CustomerInfo) => {
      if (didCancel) return;
      const hasSubscription = Boolean(customerInfo.entitlements.active?.['Unfold Premium']);
      updateUser({ isPremium: hasSubscription });
      // Any first-hand answer from RevenueCat counts as resolved for this
      // session — even a "no subscription" answer.
      useUIState.getState().setRevenueCatResolved();
      // Re-sync the trial-ending local notification whenever entitlements
      // change (purchase, restore, lapse). Fire-and-forget.
      void syncTrialEndingNotification();
    };

    // Fetch current subscription status on launch. This waits for the
    // RevenueCat anonymous→deterministic ID migration before reading customer
    // info, so update installs do not briefly demote active anonymous-ID users.
    getCustomerInfo()
      .then((result) => {
        if (result.ok) {
          applyCustomerInfo(result.data);
          return;
        }
        logger.log('[RevenueCat] Initial customer info sync returned non-ok result:', result.reason);
      })
      .catch(() => {
        // Silently fail — stale store value is acceptable as a fallback.
        // IMPORTANT: do NOT setRevenueCatResolved() here. A failure means
        // the source has not told us anything this session; downstream gates
        // must continue to treat premium policy as `unknown` and fail closed.
        // The listener below will correct it (and flip resolved) when
        // connectivity returns.
      });

    // Prefetch offerings into React Query cache so the paywall opens instantly.
    // Uses prefetchQuery which won't throw — failures are silently cached and
    // the paywall's own useQuery will retry as needed.
    queryClient.prefetchQuery({
      queryKey: ['revenuecat', 'offerings'],
      queryFn: getOfferings,
      staleTime: 1000 * 60 * 10, // 10 min — offerings rarely change
    }).then(() => {
      const cached = queryClient.getQueryData<Awaited<ReturnType<typeof getOfferings>>>(['revenuecat', 'offerings']);
      if (cached?.ok) {
        const pkgCount = cached.data.current?.availablePackages?.length ?? 0;
        logger.log(`[RevenueCat] Offerings prefetched: ${pkgCount} packages available`);
      } else {
        logger.log('[RevenueCat] Offerings prefetch returned non-ok result:', cached && !cached.ok ? cached.reason : 'no data');
      }
    });

    // Set up real-time listener for subscription changes. ONE guard owns
    // registration for both the launch path and the foreground-recovery path
    // (REVM-6) — registration also waits for the deterministic identity.
    const listenerGuard = createSingleListenerGuard(async () => {
      const result = await addCustomerInfoUpdateListener(applyCustomerInfo);
      if (!result.ok) {
        logger.log('[RevenueCat] Customer info listener not registered:', result.reason);
      }
      return result;
    });
    void listenerGuard.ensure();

    // Foreground recovery: if RevenueCat identity sync failed at session start
    // and the user backgrounds+foregrounds the app (network may have returned),
    // retry once. Naturally rate-limited to foreground transitions.
    const appStateSub = AppState.addEventListener('change', (next) => {
      if (next !== 'active') return;
      if (useUIState.getState().revenueCatResolved) return; // recovered already
      void (async () => {
        await retryRevenueCatIdentitySync();
        const result = await getCustomerInfo();
        if (result.ok) applyCustomerInfo(result.data);
        void listenerGuard.ensure();
      })();
    });

    return () => {
      didCancel = true;
      listenerGuard.dispose();
      appStateSub.remove();
    };
  }, [updateUser, queryClient]);
}
