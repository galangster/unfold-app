import type { VerifiedEntitlementExit, VerifiedExitDecision } from '@/lib/auto-trial-exit';

export function runOnboardingPurchaseSuccess(i: {
  exit: VerifiedEntitlementExit;
  ensureDeviceId(): void;
  decide(exit: VerifiedEntitlementExit): VerifiedExitDecision;
  saveDraft(): void;
  setPurchased(): void;
  setAutoTrialMode(active: boolean): void;
  markPremium(): void;
  advance(): void;
}): void {
  i.ensureDeviceId();
  const decision = i.decide(i.exit);
  i.saveDraft();
  i.setPurchased();
  i.setAutoTrialMode(decision.kind === 'auto');
  i.markPremium();
  i.advance();
}
