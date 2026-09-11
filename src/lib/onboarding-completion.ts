import type { AutoTrialIntentV1 } from '@/lib/auto-trial-intent';

export type OnboardingCompletionMode = 'auto_trial' | 'generated' | 'deferred';

export type CompletionTarget =
  | '/generating'
  | '/(tabs)/(today)'
  | { pathname: '/series-reveal'; params: { intentId: string } };

export async function runOnboardingCompletion(
  state: { started: boolean },
  mode: OnboardingCompletionMode,
  intent: AutoTrialIntentV1 | null,
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

  let target: CompletionTarget;
  switch (mode) {
    case 'auto_trial':
      target = {
        pathname: '/series-reveal',
        params: { intentId: intent?.intentId ?? '' },
      };
      break;
    case 'generated':
      target = '/generating';
      break;
    case 'deferred':
      target = '/(tabs)/(today)';
      break;
  }

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
