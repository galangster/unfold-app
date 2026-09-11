export type OnboardingCompletionMode = 'auto_trial' | 'generated' | 'deferred';

export type CompletionTarget =
  | '/generating'
  | '/(tabs)/(today)';

export async function runOnboardingCompletion(
  state: { started: boolean },
  mode: OnboardingCompletionMode,
  deps: {
    retireDraftAutosave(): void;
    clearSampleJob(): void;
    applyProfileOverrides(): void;
    saveProfile(): void;
    addDeferredSample?(): void;
    flushStoreAsync(): Promise<void>;
    clearDraft(): void;
    trackCompleted(outcome: 'generated' | 'deferred' | 'auto_trial'): boolean;
    navigate(target: CompletionTarget): void;
  },
): Promise<boolean> {
  if (state.started) return false;
  state.started = true;

  const target: CompletionTarget = mode === 'deferred' ? '/(tabs)/(today)' : '/generating';

  deps.retireDraftAutosave();
  deps.clearSampleJob();
  if (mode === 'auto_trial') {
    deps.applyProfileOverrides();
  }
  deps.saveProfile();
  if (mode === 'deferred') {
    deps.addDeferredSample?.();
  }
  await deps.flushStoreAsync();
  deps.clearDraft();
  deps.trackCompleted(mode);
  deps.navigate(target);
  return true;
}
