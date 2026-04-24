/**
 * Pure-function tests for the tri-state premium access policy decision logic.
 *
 * We mirror the decision function from `getEffectivePremiumAccessPolicy()` as
 * a pure helper here and test every branch. The live function in
 * `src/lib/premium-state.ts` is a thin wrapper that pulls its inputs from
 * Zustand stores — testing it in isolation from those stores is the point
 * of this file. If you change the ORDER of checks in the live function,
 * change them here too (and add a test for the new branch).
 *
 * See `~/vault/standards/persisted-external-state-is-cache-not-truth.md` for
 * why tri-state exists.
 */

import { canUsePremiumFeature } from '../premium-access-helpers';

type Policy = 'granted' | 'denied' | 'unknown';

interface Inputs {
  hydrated: boolean;
  revenueCatResolved: boolean;
  debugForceTrialExpired: boolean;
  isDev: boolean;
  isPremium: boolean;
}

function decide(inputs: Inputs): Policy {
  if (!inputs.hydrated || !inputs.revenueCatResolved) return 'unknown';
  if (inputs.debugForceTrialExpired) return 'denied';
  if (inputs.isDev) return 'granted';
  return inputs.isPremium ? 'granted' : 'denied';
}

describe('Premium access policy — tri-state decision logic', () => {
  describe('unknown — cold start / pre-resolution', () => {
    it('returns unknown when store has not hydrated', () => {
      expect(
        decide({
          hydrated: false,
          revenueCatResolved: false,
          debugForceTrialExpired: false,
          isDev: false,
          isPremium: true,
        }),
      ).toBe('unknown');
    });

    it('returns unknown when RevenueCat has not resolved, even if store hydrated', () => {
      expect(
        decide({
          hydrated: true,
          revenueCatResolved: false,
          debugForceTrialExpired: false,
          isDev: false,
          isPremium: true,
        }),
      ).toBe('unknown');
    });

    it('returns unknown when stale persisted isPremium=true but RC not resolved', () => {
      // THIS is the canonical churn-window bug this whole system exists to
      // prevent. The persisted mirror still says "premium" but we have NOT
      // heard from the source yet this session. Never grant on unknown.
      expect(
        decide({
          hydrated: true,
          revenueCatResolved: false,
          debugForceTrialExpired: false,
          isDev: false,
          isPremium: true,
        }),
      ).toBe('unknown');
    });

    it('returns unknown even when DEV mode is on, if gates are not met', () => {
      // __DEV__ fallback MUST run AFTER the hydration + resolved gates.
      // Otherwise dev builds would grant at cold start before signals settle,
      // masking the race on local machines.
      expect(
        decide({
          hydrated: false,
          revenueCatResolved: false,
          debugForceTrialExpired: false,
          isDev: true,
          isPremium: false,
        }),
      ).toBe('unknown');
    });
  });

  describe('denied — debug override', () => {
    it('returns denied when debugForceTrialExpired is set, regardless of isPremium', () => {
      expect(
        decide({
          hydrated: true,
          revenueCatResolved: true,
          debugForceTrialExpired: true,
          isDev: true,
          isPremium: true,
        }),
      ).toBe('denied');
    });

    it('debug override beats DEV fallback', () => {
      expect(
        decide({
          hydrated: true,
          revenueCatResolved: true,
          debugForceTrialExpired: true,
          isDev: true,
          isPremium: false,
        }),
      ).toBe('denied');
    });
  });

  describe('granted — DEV fallback', () => {
    it('returns granted in DEV when gates pass and debug is off', () => {
      expect(
        decide({
          hydrated: true,
          revenueCatResolved: true,
          debugForceTrialExpired: false,
          isDev: true,
          isPremium: false,
        }),
      ).toBe('granted');
    });
  });

  describe('granted / denied — production fallback on isPremium', () => {
    it('returns granted when user.isPremium is true in production', () => {
      expect(
        decide({
          hydrated: true,
          revenueCatResolved: true,
          debugForceTrialExpired: false,
          isDev: false,
          isPremium: true,
        }),
      ).toBe('granted');
    });

    it('returns denied when user.isPremium is false in production', () => {
      expect(
        decide({
          hydrated: true,
          revenueCatResolved: true,
          debugForceTrialExpired: false,
          isDev: false,
          isPremium: false,
        }),
      ).toBe('denied');
    });
  });

  describe('ordering guarantees', () => {
    it('hydration gate fires before RevenueCat gate', () => {
      // Both false — we should return from the first gate.
      expect(
        decide({
          hydrated: false,
          revenueCatResolved: false,
          debugForceTrialExpired: false,
          isDev: false,
          isPremium: false,
        }),
      ).toBe('unknown');
    });

    it('unknown never collapses to denied even when isPremium is false', () => {
      // Collapsing would flash the churn upsell at cold start on users who
      // are actually premium — the whole point of tri-state.
      expect(
        decide({
          hydrated: false,
          revenueCatResolved: false,
          debugForceTrialExpired: false,
          isDev: false,
          isPremium: false,
        }),
      ).toBe('unknown');
    });
  });

  describe('premium feature gates', () => {
    it('fails closed for premium unlocks while entitlement is unknown', () => {
      expect(canUsePremiumFeature('unknown')).toBe(false);
    });

    it('only unlocks premium features when policy is granted', () => {
      expect(canUsePremiumFeature('granted')).toBe(true);
      expect(canUsePremiumFeature('denied')).toBe(false);
    });
  });
});
