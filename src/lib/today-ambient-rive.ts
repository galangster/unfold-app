// Today-tab ambient state logic.
//
// The Rive ambient path (wind/light-rays/rain loops) was dead code — the mode
// resolver always returned 'none' because Today motion only unlocks after
// completion, and completed/rest ambience is rendered by the shared
// EmberSystem layer (plans/07-ui-deslop-brief.md §2). The Rive component,
// mode mapping, and input plumbing were deleted with it.

export type TodayAmbientStateType =
  | 'empty'
  | 'preparing'
  | 'premium-paused'
  | 'unread'
  | 'complete-today'
  | 'tomorrow-locked'
  | 'reveal-ready'
  | 'journey-complete';

export interface CompletedEmberAmbienceInput {
  stateType: TodayAmbientStateType;
  hasReadToday: boolean;
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
