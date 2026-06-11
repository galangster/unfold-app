/**
 * Renewal-disclosure copy for the paywall bottom CTA (RV-UI-3).
 *
 * Pure so the offerings-loading contract is unit-testable:
 *  - While offerings are absent (`offeringsReady === false`) the disclosure is
 *    null — yearlyPrice/monthlyPrice are '' until RevenueCat resolves, and
 *    PRICE-1 forbids rendering any non-store-derived price text, so the only
 *    honest output is no disclosure at all.
 *  - `hasFreeTrial` reflects YEARLY-plan eligibility only. Monthly has its own
 *    cadence and unverified intro-offer state, so trial copy is never attached
 *    to the monthly plan (Guideline 3.1.2 misrepresentation risk).
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

  return `${monthlyPrice}/mo. Cancel anytime.`;
}
