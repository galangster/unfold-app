import { useEffect } from 'react';

import { registerUserDataPullOnReconnect, triggerUserDataPull } from '@/lib/full-sync-pull';

/**
 * Pull all sync-enabled user data on app start and reconnect.
 *
 * The pull uses a persisted lastPulledAt cursor by default, so ordinary starts
 * are incremental. A full pull is reserved for explicit restore/reinstall flows.
 */
export function useFullSyncPull(): void {
  useEffect(() => {
    void triggerUserDataPull('app-start');
    return registerUserDataPullOnReconnect();
  }, []);
}
