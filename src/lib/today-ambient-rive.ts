// Today-tab completion ambience state logic.
//
// Completion motion unlocks only after the reader taps Complete Day. The Today
// screen then chooses one stable ambience option for that completed day: the
// native EmberSystem look or an approved bundled Rive loop. Pre-completion
// states stay quiet so reveal-ready/unread surfaces never borrow completion
// celebration language.

export type TodayAmbientStateType =
  | 'empty'
  | 'preparing'
  | 'first-series-failed'
  | 'premium-paused'
  | 'unread'
  | 'complete-today'
  | 'tomorrow-locked'
  | 'reveal-ready'
  | 'journey-complete';

export type TodayCompletionAmbience =
  | 'ember'
  | 'campfire-rive'
  | 'canopy-lights-rive'
  | 'doors-rive'
  | 'tree-rive'
  | 'waterfall-rive'
  | 'wind-leaves-rive';

// The completed-day ambience rotates across the native ember look plus the
// approved Rive scenes. Selection is a stable hash of the completion key, so a
// given completed devotional/day always shows the same scene.
export const TODAY_COMPLETION_AMBIENCE_OPTIONS: readonly TodayCompletionAmbience[] = [
  'campfire-rive',
  'canopy-lights-rive',
  'doors-rive',
  'tree-rive',
  'waterfall-rive',
  'wind-leaves-rive',
  'ember',
];

export interface CompletedEmberAmbienceInput {
  stateType: TodayAmbientStateType;
  hasReadToday: boolean;
}

export interface TodayCompletionAmbienceInput extends CompletedEmberAmbienceInput {
  /** Stable per completed devotional/day/date. Never use a render counter. */
  selectionKey: string | null | undefined;
}

export function shouldShowCompletedEmberAmbience({
  stateType,
  hasReadToday,
}: CompletedEmberAmbienceInput): boolean {
  return hasReadToday && (
    stateType === 'complete-today'
    || stateType === 'tomorrow-locked'
    || stateType === 'journey-complete'
  );
}

export function selectTodayCompletionAmbience({
  stateType,
  hasReadToday,
  selectionKey,
}: TodayCompletionAmbienceInput): TodayCompletionAmbience | null {
  if (!shouldShowCompletedEmberAmbience({ stateType, hasReadToday })) return null;
  if (!selectionKey) return 'ember';

  const index = stableHash(selectionKey) % TODAY_COMPLETION_AMBIENCE_OPTION_COUNT;
  return TODAY_COMPLETION_AMBIENCE_OPTIONS[index] ?? 'ember';
}

const TODAY_COMPLETION_AMBIENCE_OPTION_COUNT = TODAY_COMPLETION_AMBIENCE_OPTIONS.length;

/** FNV-1a 32-bit hash: tiny, deterministic, and stable across app launches. */
export function stableHash(value: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}
