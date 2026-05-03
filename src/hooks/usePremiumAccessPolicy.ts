/**
 * React wrapper for the tri-state premium access policy.
 *
 * Subscribes to every input of `getEffectivePremiumAccessPolicy()` so the
 * consuming component re-renders whenever any of them change. Use in React
 * components; use `getEffectivePremiumAccessPolicy()` directly from
 * `@/lib/premium-state` for non-React callers (lib helpers, imperative
 * code at OS boundaries).
 *
 * Returns 'granted' | 'denied' | 'unknown'.
 *
 * Handling `unknown` in UI:
 *   - Do NOT collapse `unknown` into `denied` — that would flash a churn
 *     upsell at cold start before RevenueCat has reported in. Show a neutral
 *     "pending" affordance instead (disabled button, spinner, placeholder).
 *   - `unknown` windows should be brief (the time between Zustand hydration
 *     and the first `getCustomerInfo()` resolution, usually < 1s on
 *     reasonable networks).
 *
 * See `~/vault/standards/persisted-external-state-is-cache-not-truth.md`.
 */

import { useUnfoldStore, useHasHydrated } from '@/lib/store';
import { useUIState } from '@/lib/ui-state';
import { isQaToolsEnabled } from '@/lib/qa-tools';
import { resolvePremiumAccessPolicy, type PremiumAccessPolicy } from '@/lib/premium-access-policy';

export function usePremiumAccessPolicy(): PremiumAccessPolicy {
  const hydrated = useHasHydrated();
  const revenueCatResolved = useUIState((s) => s.revenueCatResolved);
  const debugForceTrialExpired = useUIState((s) => s.debugForceTrialExpired);
  const qaPremiumOverride = useUIState((s) => s.qaPremiumOverride);
  const isPremium = useUnfoldStore((s) => s.user?.isPremium ?? false);

  return resolvePremiumAccessPolicy({
    hydrated,
    revenueCatResolved,
    debugForceTrialExpired,
    isDev: __DEV__,
    isPremium,
    qaToolsEnabled: isQaToolsEnabled(),
    qaPremiumOverride,
  });
}
