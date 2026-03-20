/**
 * Hook to sync RevenueCat subscription status with Zustand store
 *
 * Uses RevenueCat's real-time customer info listener for efficient updates
 * instead of aggressive polling.
 */

import { useEffect } from 'react';
import Purchases from 'react-native-purchases';
import { useUnfoldStore } from '@/lib/store';
import { isRevenueCatEnabled } from '@/lib/revenuecatClient';

export function useRevenueCatSync() {
  const updateUser = useUnfoldStore((s) => s.updateUser);

  useEffect(() => {
    // Only sync if RevenueCat is configured
    if (!isRevenueCatEnabled()) {
      return;
    }

    // Fetch current subscription status on launch
    // This catches lapses that occurred between app sessions
    Purchases.getCustomerInfo()
      .then((customerInfo) => {
        const hasSubscription = Boolean(customerInfo.entitlements.active?.['Unfold Premium']);
        updateUser({ isPremium: hasSubscription });
      })
      .catch(() => {
        // Silently fail — stale store value is acceptable as a fallback
        // The listener below will correct it when connectivity returns
      });

    // Set up real-time listener for subscription changes
    // This is triggered on purchases, restores, and when entitlements change
    const unsubscribe = Purchases.addCustomerInfoUpdateListener((customerInfo) => {
      const hasSubscription = Boolean(customerInfo.entitlements.active?.['Unfold Premium']);
      updateUser({ isPremium: hasSubscription });
    });

    // Cleanup listener on unmount
    return unsubscribe;
  }, [updateUser]);
}
