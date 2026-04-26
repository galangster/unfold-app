type MinimalRevenueCatResult =
  | { ok: true; data: { entitlements?: { active?: Record<string, unknown> } } }
  | { ok: false; reason?: string; error?: unknown };

export type ThreeStepPaywallPrimaryAction = 'next' | 'purchase';

export type PaywallOutcome =
  | { kind: 'success' }
  | { kind: 'error'; message: string };

export type PaywallCompletionNavigation =
  | { action: 'back' }
  | { action: 'replace'; href: '/(tabs)/(today)' | '/generating' };

const UNFOLD_PREMIUM_ENTITLEMENT = 'Unfold Premium';

export function hasUnfoldPremiumEntitlement(result: {
  entitlements?: { active?: Record<string, unknown> };
}): boolean {
  return Boolean(result.entitlements?.active?.[UNFOLD_PREMIUM_ENTITLEMENT]);
}

export function getThreeStepPaywallPrimaryAction(
  currentPage: number,
  totalPages: number,
  _hasFreeTrial: boolean,
): ThreeStepPaywallPrimaryAction {
  const isFinalPage = currentPage >= totalPages - 1;
  return isFinalPage ? 'purchase' : 'next';
}

export function resolvePaywallCompletionNavigation({
  isEarlyOnboarding,
  isFromOnboarding,
  currentDevotionalId,
}: {
  isEarlyOnboarding: boolean;
  isFromOnboarding: boolean;
  currentDevotionalId: string | null | undefined;
}): PaywallCompletionNavigation {
  if (isEarlyOnboarding) {
    return { action: 'back' };
  }

  if (!isFromOnboarding) {
    return { action: 'back' };
  }

  return currentDevotionalId
    ? { action: 'replace', href: '/(tabs)/(today)' }
    : { action: 'replace', href: '/generating' };
}

export function resolvePurchaseOutcome(
  result: MinimalRevenueCatResult,
): PaywallOutcome {
  if (!result.ok) {
    return {
      kind: 'error',
      message: 'Something went wrong. Please try again.',
    };
  }

  if (!hasUnfoldPremiumEntitlement(result.data)) {
    return {
      kind: 'error',
      message:
        'Purchase completed but premium was not activated. Please tap Restore purchases or contact support.',
    };
  }

  return { kind: 'success' };
}

export function resolveRestoreOutcome(
  result: MinimalRevenueCatResult,
): PaywallOutcome {
  if (!result.ok) {
    return {
      kind: 'error',
      message: 'Could not restore purchases. Please try again.',
    };
  }

  if (!hasUnfoldPremiumEntitlement(result.data)) {
    return {
      kind: 'error',
      message: 'No active subscription found.',
    };
  }

  return { kind: 'success' };
}
