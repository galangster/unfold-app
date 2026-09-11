import type { VerifiedExitDecision } from '@/lib/auto-trial-exit';

export function runOnboardingPurchaseSuccess(i: {
  decision: VerifiedExitDecision;
  saveDraft(): void;
  setPurchased(): void;
  setAutoTrialMode(active: boolean): void;
  markPremium(): void;
  advance(): void;
}): void {
  i.saveDraft();
  i.setPurchased();
  i.setAutoTrialMode(i.decision.kind === 'auto');
  i.markPremium();
  i.advance();
}
