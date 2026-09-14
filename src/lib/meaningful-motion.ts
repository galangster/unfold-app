export const PROCESSING_BAR_CYCLE_MS = 1600;
export const PROCESSING_BAR_STAGGER_MS = 200;
export const BREATH_HALF_MS = 4000;
export const BREATH_RING_SIZE = 168;
export const BREATH_INNER_RING_SIZE = 148;
export const BREATH_PEAK_SCALE = 1.16;
export const BREATH_RESERVED_SIZE = Math.ceil(BREATH_RING_SIZE * BREATH_PEAK_SCALE);
export const BREATH_BUTTON_CLEARANCE = 24;

export type ReflectionSaveState = 'saving' | 'saved' | 'error';
export type ReflectionCheckMode = 'hidden' | 'static' | 'draw';

export function shouldAnnounceReadingReady(
  previousType: string | null,
  nextType: string,
): boolean {
  return previousType === 'preparing' && (nextType === 'unread' || nextType === 'reveal-ready');
}

export function progressFillMotion(
  previous: { seriesKey: string; progress: number } | null,
  next: { seriesKey: string; progress: number },
): { mode: 'snap' | 'advance'; from: number; to: number } {
  if (
    previous == null
    || previous.seriesKey !== next.seriesKey
    || next.progress <= previous.progress
  ) {
    return { mode: 'snap', from: next.progress, to: next.progress };
  }

  return { mode: 'advance', from: previous.progress, to: next.progress };
}

export function reflectionCheckMode(input: {
  saveState: ReflectionSaveState | null;
  hadPersistedResponse: boolean;
  finishRevision: number | null;
  savedRevision: number | null;
}): ReflectionCheckMode {
  if (input.saveState === 'saving' || input.saveState === 'error') return 'hidden';

  if (
    input.saveState === 'saved'
    && input.savedRevision != null
    && input.finishRevision === input.savedRevision
  ) {
    return 'draw';
  }

  if (input.savedRevision != null && input.finishRevision !== input.savedRevision) {
    return 'hidden';
  }

  if (input.hadPersistedResponse) return 'static';
  return 'hidden';
}

export function shouldShowBreathGuide(
  methodId: string | null | undefined,
  stepId: string | null | undefined,
): boolean {
  return methodId === 'breath_prayer' && stepId === 'breathe';
}

