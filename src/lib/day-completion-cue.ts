import { flushUnfoldStorePersistAsync, useUnfoldStore } from './store';
import { getDeviceId } from './mmkv-storage';
import { emitSuccessCue } from './success-cues';
import { logger } from './logger';

/** Saving and navigation continue while this awaits the concrete local write. */
export async function emitDayCompletionCueAfterSave(
  devotionalId: string,
  dayNumber: number,
  isVisible: () => boolean,
  soundEnding: Promise<void> = Promise.resolve(),
): Promise<void> {
  const identity = getDeviceId();
  try {
    const [saved] = await Promise.all([flushUnfoldStorePersistAsync(), soundEnding]);
    if (!saved || identity !== getDeviceId()) return;
    const day = useUnfoldStore.getState().devotionals
      .find((row) => row.id === devotionalId)?.days?.find((row) => row.dayNumber === dayNumber);
    if (!day?.isRead) return;
    emitSuccessCue({ type: 'day-completed', devotionalId, dayNumber, eligible: isVisible() });
  } catch (error) {
    logger.warn('[SuccessCue] completion save was not confirmed', error);
  }
}
