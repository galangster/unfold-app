import { useEffect } from 'react';
import type { AutoTrialEntry, AutoTrialSurface } from '@/lib/auto-trial-exit';
import { useUIState } from '@/lib/ui-state';

export function usePendingPaywallGrantOnUnmount(i: {
  surface: AutoTrialSurface;
  entry: AutoTrialEntry;
  armedRef: { current: boolean };
  advancedRef: { current: boolean };
}): void {
  const { surface, entry, armedRef, advancedRef } = i;
  useEffect(() => {
    return () => {
      if (armedRef.current && !advancedRef.current) {
        useUIState.getState().setPendingPaywallGrant({
          surface,
          entry,
          setAtMs: Date.now(),
        });
      }
    };
  }, [advancedRef, armedRef, entry, surface]);
}
