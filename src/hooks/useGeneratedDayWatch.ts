import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import NetInfo from '@react-native-community/netinfo';

import {
  createDailyGenerationRecovery,
  type DailyGenerationRecoveryController,
  type DailyGenerationRecoveryState,
} from '@/lib/daily-generation-recovery';
import { captureSyncSession } from '@/lib/generation-session';
import type { DevotionalDay } from '@/lib/store';

export type GeneratedDayWatchResult = {
  state: DailyGenerationRecoveryState;
  checkAgain: () => Promise<void>;
  retry: () => Promise<void>;
};

/**
 * Reconciles one missing progressive day with the server's authoritative job.
 * Each enabled mount or focus discovers an existing job before submission.
 * Foreground and network recovery run the same discovery path. Active jobs
 * keep polling until the server returns a terminal state or the scope changes.
 */
export function useGeneratedDayWatch({
  devotionalId,
  dayNumber,
  enabled,
  canMutate,
  onDay,
}: {
  devotionalId: string | null | undefined;
  dayNumber: number | null | undefined;
  enabled: boolean;
  canMutate: boolean;
  onDay: (devotionalId: string, day: DevotionalDay) => void;
}): GeneratedDayWatchResult {
  const recoveryKey = enabled && devotionalId && dayNumber ? `${devotionalId}:${dayNumber}` : null;
  const [snapshot, setSnapshot] = useState<{ key: string | null; state: DailyGenerationRecoveryState }>({
    key: null,
    state: { status: 'idle' },
  });
  const controllerRef = useRef<DailyGenerationRecoveryController | null>(null);
  const onDayRef = useRef(onDay);
  onDayRef.current = onDay;

  useEffect(() => {
    if (!enabled || !devotionalId || !dayNumber) {
      controllerRef.current?.cancel();
      controllerRef.current = null;
      return;
    }

    let disposed = false;
    const controller = createDailyGenerationRecovery({
      devotionalId,
      dayNumber,
      session: captureSyncSession(),
      canMutate,
      onDay: (resolvedDevotionalId, day) => onDayRef.current(resolvedDevotionalId, day),
      onState: (nextState) => {
        if (!disposed) setSnapshot({ key: recoveryKey, state: nextState });
      },
    });
    controllerRef.current = controller;

    const applyNetworkState = (network: { isConnected: boolean | null; isInternetReachable: boolean | null }) => (
      controller.setOnline(Boolean(network.isConnected && network.isInternetReachable !== false))
    );
    let networkInitialized = false;
    const unsubscribeNetwork = NetInfo.addEventListener((network) => {
      if (networkInitialized) void applyNetworkState(network);
    });
    const appStateSubscription = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') void controller.checkAgain();
    });

    void NetInfo.fetch()
      .then(async (network) => {
        networkInitialized = true;
        await applyNetworkState(network);
        if (network.isConnected && network.isInternetReachable !== false) {
          await controller.start();
        }
      })
      .catch(() => {
        networkInitialized = true;
        return controller.start();
      });

    return () => {
      disposed = true;
      controller.cancel();
      unsubscribeNetwork();
      appStateSubscription.remove();
      if (controllerRef.current === controller) controllerRef.current = null;
    };
  }, [enabled, devotionalId, dayNumber, canMutate, recoveryKey]);

  const checkAgain = useCallback(
    () => controllerRef.current?.checkAgain() ?? Promise.resolve(),
    [],
  );
  const retry = useCallback(
    () => controllerRef.current?.retry() ?? Promise.resolve(),
    [],
  );

  const state = recoveryKey && snapshot.key === recoveryKey ? snapshot.state : { status: 'idle' as const };
  return { state, checkAgain, retry };
}
