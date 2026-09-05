import {
  getThreeStepPaywallPrimaryAction,
  resolveOnboardingPurchaseAdvance,
  resolvePaywallCompletionNavigation,
  resolvePurchaseOutcome,
  resolveRestoreOutcome,
  runGuardedPaywallFlow,
  PAYWALL_ENTITLEMENT_PENDING_MESSAGE,
  PAYWALL_GENERIC_ERROR_MESSAGE,
  PAYWALL_PURCHASE_TIMEOUT_MESSAGE,
} from '../paywall-guardrails';

const entitledResult = {
  ok: true as const,
  data: { entitlements: { active: { 'Unfold Premium': { identifier: 'Unfold Premium' } } } },
};

const unentitledResult = {
  ok: true as const,
  data: { entitlements: { active: {} } },
};

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

  describe('onboarding purchase advance decision', () => {
    it('advances once on a result that carries the Unfold Premium entitlement', () => {
      expect(
        resolveOnboardingPurchaseAdvance({ result: entitledResult, hasAdvanced: false }),
      ).toEqual({ action: 'advance' });
    });

    it('is a no-op after the paywall has already advanced, whatever the result', () => {
      expect(
        resolveOnboardingPurchaseAdvance({ result: entitledResult, hasAdvanced: true }),
      ).toEqual({ action: 'noop' });
      expect(
        resolveOnboardingPurchaseAdvance({
          result: { ok: false, reason: 'sdk_error' },
          hasAdvanced: true,
        }),
      ).toEqual({ action: 'noop' });
    });

    it('waits for the entitlement when the store transaction resolved without it', () => {
      expect(
        resolveOnboardingPurchaseAdvance({ result: unentitledResult, hasAdvanced: false }),
      ).toEqual({ action: 'wait_for_entitlement', message: PAYWALL_ENTITLEMENT_PENDING_MESSAGE });
    });

    it('waits for the entitlement on a client-side timeout with the timeout copy', () => {
      expect(
        resolveOnboardingPurchaseAdvance({
          result: { ok: false, reason: 'timeout' },
          hasAdvanced: false,
        }),
      ).toEqual({ action: 'wait_for_entitlement', message: PAYWALL_PURCHASE_TIMEOUT_MESSAGE });
      expect(PAYWALL_PURCHASE_TIMEOUT_MESSAGE).not.toBe(PAYWALL_GENERIC_ERROR_MESSAGE);
    });

    it('reports a cancellation without a message', () => {
      expect(
        resolveOnboardingPurchaseAdvance({
          result: { ok: false, reason: 'user_cancelled' },
          hasAdvanced: false,
        }),
      ).toEqual({ action: 'cancelled' });
    });

    it('surfaces the generic message for every other failure', () => {
      for (const reason of ['sdk_error', 'not_configured', 'web_not_supported', undefined]) {
        expect(
          resolveOnboardingPurchaseAdvance({
            result: { ok: false, reason },
            hasAdvanced: false,
          }),
        ).toEqual({ action: 'error', message: PAYWALL_GENERIC_ERROR_MESSAGE });
      }
    });

    it('never advances without the entitlement on the result actually used (3.1.2)', () => {
      const decisions = [
        resolveOnboardingPurchaseAdvance({ result: unentitledResult, hasAdvanced: false }),
        resolveOnboardingPurchaseAdvance({ result: { ok: true, data: {} }, hasAdvanced: false }),
        resolveOnboardingPurchaseAdvance({ result: { ok: false, reason: 'timeout' }, hasAdvanced: false }),
      ];
      expect(decisions.map((d) => d.action)).not.toContain('advance');
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

  describe('runGuardedPaywallFlow (FIX 4: CTA spinner never sticks)', () => {
    it('clears loading and surfaces an error when the flow rejects', async () => {
      const setLoading = jest.fn();
      const setError = jest.fn();
      const onError = jest.fn();

      await runGuardedPaywallFlow({
        run: async () => {
          throw new Error('purchasePackage rejected');
        },
        setLoading,
        setError,
        onError,
      });

      expect(setError).toHaveBeenCalledWith(PAYWALL_GENERIC_ERROR_MESSAGE);
      expect(onError).toHaveBeenCalledTimes(1);
      // Loading MUST be reset to false — the stuck-spinner bug.
      expect(setLoading).toHaveBeenLastCalledWith(false);
    });

    it('uses a custom error message when provided', async () => {
      const setError = jest.fn();
      await runGuardedPaywallFlow({
        run: async () => {
          throw new Error('nope');
        },
        setLoading: jest.fn(),
        setError,
        errorMessage: 'Could not restore purchases. Please try again.',
      });
      expect(setError).toHaveBeenCalledWith('Could not restore purchases. Please try again.');
    });

    it('leaves the success path alone but still clears loading', async () => {
      const setLoading = jest.fn();
      const setError = jest.fn();
      const run = jest.fn(async () => {});

      await runGuardedPaywallFlow({ run, setLoading, setError });

      expect(run).toHaveBeenCalledTimes(1);
      // No error surfaced by the guard on success (run owns non-throwing branches).
      expect(setError).not.toHaveBeenCalled();
      expect(setLoading).toHaveBeenCalledWith(false);
    });
  });
});
