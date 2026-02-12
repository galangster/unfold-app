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

    // Set up real-time listener for subscription changes
    // This is triggered on purchases, restores, and when entitlements change
    const unsubscribe = Purchases.addCustomerInfoUpdateListener((customerInfo) => {
      const hasSubscription = Object.keys(customerInfo.entitlements.active || {}).length > 0;
      updateUser({ isPremium: hasSubscription });
    });

    // Cleanup listener on unmount
    return unsubscribe;
  }, [updateUser]);
}
