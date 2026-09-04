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

/** Copy for a purchase Apple has not answered inside the client deadline. */
export const PAYWALL_PURCHASE_TIMEOUT_MESSAGE =
  'Purchase took too long. Please check your connection and try again.';

/** Copy while the store transaction is done but Premium has not been granted yet. */
export const PAYWALL_ENTITLEMENT_PENDING_MESSAGE =
  'Your purchase went through, but Premium has not activated yet. It will unlock on its own in a moment — or tap Restore purchases.';

/**
 * Cue shown beside a spinner while the onboarding paywall waits on the grant.
 * The wait is not an error — the person has paid — so it renders in a neutral
 * slot, never in the error slot.
 */
export const PAYWALL_ENTITLEMENT_PENDING_CUE = 'Finishing up…';

export type OnboardingPurchaseAdvanceDecision =
  | { action: 'advance' }
  | { action: 'noop' }
  | { action: 'cancelled' }
  | { action: 'wait_for_entitlement'; message: string }
  | { action: 'error'; message: string };

/**
 * Decide what the onboarding paywall does with a purchase result.
 *
 * The paywall has exactly one exit that advances onboarding. Before this
 * decision existed, every terminal branch except a clean success stranded a
 * completed Apple purchase on the paywall with Restore as the only way out.
 *
 * - `advance` fires at most once per paywall mount (`hasAdvanced`).
 * - `wait_for_entitlement` covers the two branches where the store
 *   transaction may have completed even though the result carries no
 *   entitlement yet: an `ok` result whose customer info lags the grant, and a
 *   client-side timeout. The caller keeps listening for the entitlement.
 * - The entitlement gate is unchanged: `advance` never fires without
 *   `entitlements.active['Unfold Premium']` on the result actually used (3.1.2).
 */
export function resolveOnboardingPurchaseAdvance({
  result,
  hasAdvanced,
}: {
  result: MinimalRevenueCatResult;
  hasAdvanced: boolean;
}): OnboardingPurchaseAdvanceDecision {
  if (hasAdvanced) {
    return { action: 'noop' };
  }

  if (!result.ok) {
    if (result.reason === 'user_cancelled') {
      return { action: 'cancelled' };
    }
    if (result.reason === 'timeout') {
      return { action: 'wait_for_entitlement', message: PAYWALL_PURCHASE_TIMEOUT_MESSAGE };
    }
    return { action: 'error', message: PAYWALL_GENERIC_ERROR_MESSAGE };
  }

  if (!hasUnfoldPremiumEntitlement(result.data)) {
    return { action: 'wait_for_entitlement', message: PAYWALL_ENTITLEMENT_PENDING_MESSAGE };
  }

  return { action: 'advance' };
}

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
