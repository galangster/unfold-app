import {
  getThreeStepPaywallPrimaryAction,
  resolvePaywallCompletionNavigation,
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

  describe('completion navigation', () => {
    it('goes back for early onboarding paywalls', () => {
      expect(
        resolvePaywallCompletionNavigation({
          isEarlyOnboarding: true,
          isFromOnboarding: true,
          currentDevotionalId: 'devotional-1',
        }),
      ).toEqual({ action: 'back' });
    });

    it('routes onboarding users with an existing devotional to Today', () => {
      expect(
        resolvePaywallCompletionNavigation({
          isEarlyOnboarding: false,
          isFromOnboarding: true,
          currentDevotionalId: 'devotional-1',
        }),
      ).toEqual({ action: 'replace', href: '/(tabs)/(today)' });
    });

    it('routes onboarding users without an existing devotional to generating', () => {
      expect(
        resolvePaywallCompletionNavigation({
          isEarlyOnboarding: false,
          isFromOnboarding: true,
          currentDevotionalId: null,
        }),
      ).toEqual({ action: 'replace', href: '/generating' });
    });

    it('goes back for non-onboarding paywalls', () => {
      expect(
        resolvePaywallCompletionNavigation({
          isEarlyOnboarding: false,
          isFromOnboarding: false,
          currentDevotionalId: 'devotional-1',
        }),
      ).toEqual({ action: 'back' });
    });
  });

  describe('purchase entitlement verification', () => {
    it('does not claim purchase completion when no active Unfold Premium entitlement is returned', () => {
      expect(
        resolvePurchaseOutcome({
          ok: true,
          data: { entitlements: { active: {} } },
        }),
      ).toEqual({
        kind: 'error',
        message:
          'Premium was not activated because Apple did not return an active subscription. Please tap Restore purchases or contact support.',
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
