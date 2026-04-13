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
import Purchases from 'react-native-purchases';
import { useQueryClient } from '@tanstack/react-query';
import { useUnfoldStore } from '@/lib/store';
import { useUIState } from '@/lib/ui-state';
import { isRevenueCatEnabled, getOfferings } from '@/lib/revenuecatClient';
import { syncTrialEndingNotification } from '@/lib/trial-notification';
import { logger } from '@/lib/logger';

export function useRevenueCatSync() {
  const updateUser = useUnfoldStore((s) => s.updateUser);
  const queryClient = useQueryClient();

  useEffect(() => {
    // Only sync if RevenueCat is configured
    if (!isRevenueCatEnabled()) {
      // No external source to wait for — mark as resolved so downstream
      // tri-state gates (usePremiumAccessPolicy) don't stay in `unknown`
      // forever. In this state, premium falls back to persisted user.isPremium
      // (usually false in dev without RC keys) or the __DEV__ override.
      useUIState.getState().setRevenueCatResolved();
      return;
    }

    // Fetch current subscription status on launch
    // This catches lapses that occurred between app sessions
    Purchases.getCustomerInfo()
      .then((customerInfo) => {
        const hasSubscription = Boolean(customerInfo.entitlements.active?.['Unfold Premium']);
        updateUser({ isPremium: hasSubscription });
        // Mark RevenueCat as resolved for this session. Downstream gates
        // (useCheckInNotifications, scheduleMidday/Evening*) fail closed
        // until this flips — even a "no subscription" answer counts.
        useUIState.getState().setRevenueCatResolved();
        // Re-validate the trial-ending local notification against the latest
        // customer info. Fire-and-forget — failures are logged internally.
        void syncTrialEndingNotification();
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

    // Set up real-time listener for subscription changes
    // This is triggered on purchases, restores, and when entitlements change
    const unsubscribe = Purchases.addCustomerInfoUpdateListener((customerInfo) => {
      const hasSubscription = Boolean(customerInfo.entitlements.active?.['Unfold Premium']);
      updateUser({ isPremium: hasSubscription });
      // Any callback here is a first-hand answer from RevenueCat, so mark
      // resolved even if the initial getCustomerInfo() call failed earlier.
      useUIState.getState().setRevenueCatResolved();
      // Re-sync the trial-ending notification whenever entitlements change
      // (purchase, restore, lapse). Fire-and-forget.
      void syncTrialEndingNotification();
    });

    // Cleanup listener on unmount
    return unsubscribe;
  }, [updateUser, queryClient]);
}
