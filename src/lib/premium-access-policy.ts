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

/**
 * Whether a ONE-SHOT premium reward may be granted right now — currently the
 * 7-day streak-freeze milestone.
 *
 * This is the one place the fail-closed rule is relaxed, and only because the
 * cost of waiting is not "act later" but "never": milestones fire once, at the
 * moment the streak crosses the multiple of seven, and a missed one cannot be
 * earned again. `unknown` is not a brief cold-start window when RevenueCat's
 * identity sync fails (Purchases.logIn needs the network, and the sticky error
 * keeps `revenueCatResolved` false) — it lasts the whole session, e.g. a first
 * launch after install or reset while offline. A paying user who completes day
 * 7 in that session would silently lose the freeze.
 *
 * So for this check only, `unknown` falls back to the persisted mirror, which
 * at worst grants one freeze to someone who churned since the last launch —
 * freezes are consumable regardless of plan status anyway (REVM-3). Never use
 * this for anything that unlocks content, writes to a server, or schedules an
 * OS side effect: those must keep using the raw policy and treat `unknown` as
 * "do not act."
 */
export function canEarnPremiumMilestone(
  policy: PremiumAccessPolicy,
  persistedIsPremium: boolean | undefined,
): boolean {
  if (policy === 'granted') return true;
  if (policy === 'unknown') return Boolean(persistedIsPremium);
  return false;
}
