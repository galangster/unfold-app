import {
  getThreeStepPaywallPrimaryAction,
  resolvePurchaseOutcome,
  resolveRestoreOutcome,
} from '../paywall-guardrails';

describe('paywall guardrails', () => {
  describe('three-step onboarding paywall primary CTA', () => {
    it('keeps the trial-reminder CTA as next so users still reach the final decision screen', () => {
      expect(getThreeStepPaywallPrimaryAction(1, 3, true)).toBe('next');
    });

    it('keeps the first trial page CTA as next', () => {
      expect(getThreeStepPaywallPrimaryAction(0, 3, true)).toBe('next');
    });

    it('treats the final page CTA as purchase', () => {
      expect(getThreeStepPaywallPrimaryAction(2, 3, true)).toBe('purchase');
    });
  });

  describe('purchase entitlement verification', () => {
    it('does not grant success when purchase completes without the Unfold Premium entitlement', () => {
      expect(
        resolvePurchaseOutcome({
          ok: true,
          data: { entitlements: { active: {} } },
        }),
      ).toEqual({
        kind: 'error',
        message:
          'Purchase completed but premium was not activated. Please tap Restore purchases or contact support.',
      });
    });

    it('grants success when purchase completes with the Unfold Premium entitlement', () => {
      expect(
        resolvePurchaseOutcome({
          ok: true,
          data: { entitlements: { active: { 'Unfold Premium': { identifier: 'Unfold Premium' } } } },
        }),
      ).toEqual({ kind: 'success' });
    });
  });

  describe('restore entitlement verification', () => {
    it('does not treat restore as success when no active entitlement is present', () => {
      expect(
        resolveRestoreOutcome({
          ok: true,
          data: { entitlements: { active: {} } },
        }),
      ).toEqual({
        kind: 'error',
        message: 'No active subscription found.',
      });
    });

    it('treats restore as success only when Unfold Premium is active', () => {
      expect(
        resolveRestoreOutcome({
          ok: true,
          data: { entitlements: { active: { 'Unfold Premium': { identifier: 'Unfold Premium' } } } },
        }),
      ).toEqual({ kind: 'success' });
    });
  });
});
