import { useEffect } from 'react';
import { useIsFocused } from 'expo-router';
import { emitSuccessCue } from '@/lib/success-cues';
import type { SuccessCueEventType } from '@/lib/success-cue-assets';

/** Consume the reveal once, even when another audio owner makes it silent. */
export function useSuccessRevealCue(
  type: SuccessCueEventType,
  devotionalId: string | null | undefined,
  dayNumber: number,
  ready: boolean,
): void {
  const focused = useIsFocused();
  useEffect(() => {
    if (!ready || !devotionalId) return;
    return emitSuccessCue({ type, devotionalId, dayNumber, eligible: focused });
  }, [type, devotionalId, dayNumber, ready, focused]);
}
