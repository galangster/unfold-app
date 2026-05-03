/**
 * Pure premium access policy resolver.
 *
 * Keep this file free of Zustand/native imports so policy ordering can be
 * tested without loading React Native modules. Store-backed wrappers live in
 * `premium-state.ts` and `usePremiumAccessPolicy.ts`.
 */

export type PremiumAccessPolicy = 'granted' | 'denied' | 'unknown';

export interface PremiumAccessPolicyInputs {
  hydrated: boolean;
  revenueCatResolved: boolean;
  debugForceTrialExpired: boolean;
  isDev: boolean;
  isPremium: boolean;
  /** QA tools must be explicitly enabled for any local premium override. */
  qaToolsEnabled?: boolean;
  /** Session-local QA switch for internal TestFlight/UI testing only. */
  qaPremiumOverride?: boolean;
}

export function resolvePremiumAccessPolicy(inputs: PremiumAccessPolicyInputs): PremiumAccessPolicy {
  if (!inputs.hydrated || !inputs.revenueCatResolved) return 'unknown';
  if (inputs.debugForceTrialExpired) return 'denied';
  if (inputs.isDev) return 'granted';
  if (inputs.qaToolsEnabled && inputs.qaPremiumOverride) return 'granted';
  return inputs.isPremium ? 'granted' : 'denied';
}
