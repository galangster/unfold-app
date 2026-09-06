import { useEffect } from 'react';

import { recoverCompletedGenerationResult } from '@/lib/generation-api';
import { captureSyncSession, isSyncSessionCurrent } from '@/lib/generation-session';
import { watchForGeneratedDay } from '@/lib/generated-day-watch';
import type { DevotionalDay } from '@/lib/store';

/**
 * While `enabled`, keep asking the server for a day that is being generated
 * and hand it to `onDay` when it lands. Queuing a day job is fire-and-forget
 * on both Today and the reader; without this the "preparing" state stayed up
 * until the screen was left and re-entered. The watch restarts whenever the
 * target day changes and stops when `enabled` turns false or on unmount.
 */
export function useGeneratedDayWatch({
  devotionalId,
  dayNumber,
  enabled,
  onDay,
}: {
  devotionalId: string | null | undefined;
  dayNumber: number | null | undefined;
  enabled: boolean;
  onDay: (devotionalId: string, day: DevotionalDay) => void;
}): void {
  useEffect(() => {
    if (!enabled || !devotionalId || !dayNumber) return;

    let cancelled = false;
    const session = captureSyncSession();
    void watchForGeneratedDay(
      () => recoverCompletedGenerationResult({ devotionalId, dayNumber, session }),
      { isCancelled: () => cancelled || !isSyncSessionCurrent(session) },
    ).then((recovered) => {
      if (cancelled || !isSyncSessionCurrent(session) || !recovered?.devotionalDay) return;
      onDay(devotionalId, recovered.devotionalDay);
    });

    return () => { cancelled = true; };
  }, [enabled, devotionalId, dayNumber, onDay]);
}
