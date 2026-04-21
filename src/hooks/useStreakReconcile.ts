import { useEffect } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import { useHasHydrated, useUnfoldStore } from '@/lib/store';

export function useStreakReconcile(): void {
  const hasHydrated = useHasHydrated();
  const reconcile = useUnfoldStore((s) => s.reconcileStreakState);

  useEffect(() => {
    if (!hasHydrated) return;
    reconcile();
  }, [hasHydrated, reconcile]);

  useEffect(() => {
    if (!hasHydrated) return;

    const handle = (nextState: AppStateStatus) => {
      if (nextState !== 'active') return;
      reconcile();
    };

    const sub = AppState.addEventListener('change', handle);
    return () => sub.remove();
  }, [hasHydrated, reconcile]);
}
