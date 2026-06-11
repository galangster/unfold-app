/**
 * RV-UI-3: BottomCTA renewal disclosure must respect the offeringsReady
 * loading branch.
 *
 * ThreeStepPaywall only swaps in the loading/retry state on the FINAL page;
 * on earlier pages BottomCTA rendered the renewal disclosure unconditionally,
 * producing price-less garbage ("/yr. Cancel anytime.") while offerings were
 * still absent (yearlyPrice/monthlyPrice are '' until RC resolves — PRICE-1
 * forbids hardcoded fallbacks). No price text may render until offerings load.
 */
import * as fs from 'fs';
import * as path from 'path';
import { getPaywallRenewalDisclosure } from '../paywall-disclosure';

describe('getPaywallRenewalDisclosure', () => {
  const ready = {
    offeringsReady: true,
    selectedPlan: 'yearly' as const,
    hasFreeTrial: false,
    trialDays: 3,
    yearlyPrice: '$59.99',
    monthlyPrice: '$9.99',
  };

  it('returns null while offerings are absent — never price-less disclosure text', () => {
    expect(getPaywallRenewalDisclosure({ ...ready, offeringsReady: false })).toBeNull();
    expect(
      getPaywallRenewalDisclosure({
        ...ready,
        offeringsReady: false,
        selectedPlan: 'monthly',
      }),
    ).toBeNull();
    expect(
      getPaywallRenewalDisclosure({
        ...ready,
        offeringsReady: false,
        hasFreeTrial: true,
        yearlyPrice: '',
        monthlyPrice: '',
      }),
    ).toBeNull();
  });

  it('yearly with verified trial: states the trial then the real annual charge', () => {
    expect(getPaywallRenewalDisclosure({ ...ready, hasFreeTrial: true })).toBe(
      '3 days free, then $59.99/yr. Cancel anytime.',
    );
  });

  it('yearly without trial: states the annual charge only', () => {
    expect(getPaywallRenewalDisclosure(ready)).toBe('$59.99/yr. Cancel anytime.');
  });

  it('monthly with caller-verified trial states the trial then the real monthly charge', () => {
    expect(
      getPaywallRenewalDisclosure({ ...ready, selectedPlan: 'monthly', hasFreeTrial: true }),
    ).toBe('3 days free, then $9.99/mo. Cancel anytime.');
  });

  it('monthly without verified trial states the monthly charge only (Guideline 3.1.2 lives at the call site)', () => {
    expect(
      getPaywallRenewalDisclosure({ ...ready, selectedPlan: 'monthly', hasFreeTrial: false }),
    ).toBe('$9.99/mo. Cancel anytime.');
  });
});

describe('ThreeStepPaywall wiring (RV-UI-3)', () => {
  const src = fs.readFileSync(
    path.join(__dirname, '../../components/onboarding/ThreeStepPaywall.tsx'),
    'utf-8',
  );

  it('BottomCTA receives offeringsReady and derives disclosure through the helper', () => {
    expect(src).toMatch(/<BottomCTA[\s\S]*?offeringsReady=\{offeringsReady\}/);
    expect(src).toMatch(/getPaywallRenewalDisclosure\(/);
  });

  it('the disclosure Text only renders when the helper returns text', () => {
    expect(src).toMatch(/\{disclosureText\s*(!=|!==)\s*null\s*&&/);
  });
});
