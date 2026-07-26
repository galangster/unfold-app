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
        'Premium was not activated because Apple did not return an active subscription. Please tap Restore purchases or contact support.',
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

/** User-facing fallback when a purchase/restore rejects unexpectedly. */
export const PAYWALL_GENERIC_ERROR_MESSAGE = 'Something went wrong. Please try again.';

/**
 * Run a paywall purchase/restore flow with guaranteed loading + error hygiene.
 *
 * Without this, a rejected purchasePackage / restorePurchases / fetchQuery left
 * `isLoading` stuck at true forever, freezing the CTA on a permanent spinner.
 * The guard ALWAYS clears loading (finally) and surfaces a user-facing error
 * message on any thrown rejection, while leaving the success path untouched —
 * `run` owns all the non-throwing branches (cancellation, outcome messages).
 */
export async function runGuardedPaywallFlow(params: {
  run: () => Promise<void>;
  setLoading: (value: boolean) => void;
  setError: (message: string | null) => void;
  onError?: (error: unknown) => void;
  errorMessage?: string;
}): Promise<void> {
  try {
    await params.run();
  } catch (error) {
    params.onError?.(error);
    params.setError(params.errorMessage ?? PAYWALL_GENERIC_ERROR_MESSAGE);
  } finally {
    params.setLoading(false);
  }
}
