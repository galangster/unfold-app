/**
 * Drain the sync outbox on mount and on network reconnect.
 *
 * Mount in RootLayoutNav (next to useUserProfileSync()) so it runs once
 * for the app's lifetime. Also called from the Today focus effect so that
 * a user who completes a day offline and then reopens Today gets immediate
 * delivery when they're back online.
 */
import { useEffect } from 'react';
import NetInfo from '@react-native-community/netinfo';
import { drainSyncOutbox } from '@/lib/sync-outbox';

export function useSyncOutboxDrain(): void {
  useEffect(() => {
    // Drain immediately on mount (handles app restart while online)
    void drainSyncOutbox();

    // Re-drain whenever the device comes back online
    const unsubscribe = NetInfo.addEventListener((state) => {
      const online = Boolean(state.isConnected && state.isInternetReachable !== false);
      if (online) {
        void drainSyncOutbox();
      }
    });

    return () => unsubscribe();
  }, []);
}
