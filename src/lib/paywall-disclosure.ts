/**
 * Renewal-disclosure copy for the paywall bottom CTA (RV-UI-3).
 *
 * Pure so the offerings-loading contract is unit-testable:
 *  - While offerings are absent (`offeringsReady === false`) the disclosure is
 *    null — yearlyPrice/monthlyPrice are '' until RevenueCat resolves, and
 *    PRICE-1 forbids rendering any non-store-derived price text, so the only
 *    honest output is no disclosure at all.
 *  - `hasFreeTrial` is the CALLER's contract: it must be true only when the
 *    trial is store-verified for the SELECTED plan (Guideline 3.1.2 —
 *    ThreeStepPaywall passes effectiveHasTrial, which is yearly-verified AND
 *    yearly-selected; paywall.tsx passes its per-product RC-verified
 *    isTrialEligible).
 *  - Prices are RC's locale-aware priceStrings — never '$' wrapped around raw
 *    numbers (FAP-UI-2).
 */
export function getPaywallRenewalDisclosure({
  offeringsReady,
  selectedPlan,
  hasFreeTrial,
  trialDays,
  yearlyPrice,
  monthlyPrice,
}: {
  offeringsReady: boolean;
  selectedPlan: 'yearly' | 'monthly';
  hasFreeTrial: boolean;
  trialDays: number;
  yearlyPrice: string;
  monthlyPrice: string;
}): string | null {
  if (!offeringsReady) return null;

  if (selectedPlan === 'yearly') {
    return hasFreeTrial
      ? `${trialDays} days free, then ${yearlyPrice}/yr. Cancel anytime.`
      : `${yearlyPrice}/yr. Cancel anytime.`;
  }

  return hasFreeTrial
    ? `${trialDays} days free, then ${monthlyPrice}/mo. Cancel anytime.`
    : `${monthlyPrice}/mo. Cancel anytime.`;
}
