import type { PurchasesPackage } from 'react-native-purchases';

export const PURCHASE_PLANS_UNAVAILABLE_MESSAGE =
  "Couldn't load subscription plans. Check your connection and try again.";

export type PurchaseReadinessResult =
  | { action: 'purchase' }
  | { action: 'purchase-after-refetch' }
  | { action: 'error'; message: string };

interface ResolvePurchaseReadinessArgs {
  pkg: PurchasesPackage | null | undefined;
  refetchedPkg?: PurchasesPackage | null;
}

/**
 * Pure decision function for the handlePurchase flow in ThreeStepPaywall.
 *
 * - pkg present → proceed with purchase immediately
 * - pkg missing, refetch yielded one → proceed with the refetched package
 * - pkg missing, refetch also empty → surface a visible error
 */
export function resolvePurchaseReadiness(
  args: ResolvePurchaseReadinessArgs,
): PurchaseReadinessResult {
  if (args.pkg) {
    return { action: 'purchase' };
  }
  if (args.refetchedPkg) {
    return { action: 'purchase-after-refetch' };
  }
  return { action: 'error', message: PURCHASE_PLANS_UNAVAILABLE_MESSAGE };
}
