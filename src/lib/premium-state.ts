/**
 * Tri-state premium access policy
 *
 * Premium state comes from RevenueCat, which is an external authority. The
 * Zustand store mirrors the last known answer, but that mirror is a cache,
 * not ground truth: at cold start there is a window where the persisted
 * `user.isPremium=true` survives relaunch after the user has already churned,
 * and the app reads it before `getCustomerInfo()` has reported in for this
 * session. Any side effect that fires in that window (scheduling a notification,
 * unlocking a premium screen, running a server-trusted action) will misfire.
 *
 * A boolean gate is not enough. We need three states:
 *
 *   'granted' — external source has confirmed premium this session
 *   'denied'  — external source has confirmed non-premium this session
 *   'unknown' — external source has NOT reported in yet this session; fail closed
 *
 * The gate is fail-closed: callers MUST treat `unknown` as "do not act." The
 * whole point is to avoid firing side effects on stale persisted state.
 *
 * See `~/vault/standards/persisted-external-state-is-cache-not-truth.md` for
 * the full rationale and the 2026-04-12 incident that drove this.
 */

import { useUnfoldStore } from '@/lib/store';
import { useUIState } from '@/lib/ui-state';

export type PremiumAccessPolicy = 'granted' | 'denied' | 'unknown';

/**
 * Non-React getter for the current premium access policy.
 *
 * Use this at OS boundaries — lib helpers that call `scheduleNotificationAsync`,
 * write to Keychain, register background tasks, etc. — where a React
 * subscription is not available. The React equivalent is
 * `usePremiumAccessPolicy()` in `src/hooks/usePremiumAccessPolicy.ts`.
 *
 * Order of checks (important — each guards the next):
 *
 *   1. Zustand persist layer has hydrated. If not, we may be reading default
 *      state (not the user's actual persisted state), which would mean we
 *      don't know the historical answer yet.
 *
 *   2. `revenueCatResolved` signal is true. If not, the source has not
 *      reported in this session yet — the persisted value in step 1 may be
 *      a stale cache from before a churn event.
 *
 *   3. `debugForceTrialExpired` → force `denied`. DEV-only override for
 *      previewing the churned-user experience without touching real
 *      subscription data.
 *
 *   4. `__DEV__` → force `granted`. DEV default so local builds work without
 *      a functional RC sandbox. Note: this runs AFTER the hydration + resolved
 *      gates, so even DEV builds wait briefly at cold start until the signals
 *      settle — this is intentional and preserves correctness.
 *
 *   5. Fall back to persisted `user.isPremium`. Guaranteed to be fresh at
 *      this point because steps 1 + 2 passed.
 */
export function getEffectivePremiumAccessPolicy(): PremiumAccessPolicy {
  const hydrated = useUnfoldStore.persist.hasHydrated();
  const resolved = useUIState.getState().revenueCatResolved;
  if (!hydrated || !resolved) return 'unknown';

  const debug = useUIState.getState().debugForceTrialExpired;
  if (debug) return 'denied';
  if (__DEV__) return 'granted';

  const isPremium = useUnfoldStore.getState().user?.isPremium ?? false;
  return isPremium ? 'granted' : 'denied';
}

/**
 * Convenience helper — equivalent to `policy === 'granted'`. Use when
 * branching at a call site that only cares "is the user fully paid right now."
 * Never collapse `unknown` + `denied` with `!== 'granted'` at UI layer —
 * use the raw policy and handle `unknown` distinctly (usually "show nothing
 * yet" rather than "show churn upsell").
 */
export function isPremiumGranted(policy: PremiumAccessPolicy): boolean {
  return policy === 'granted';
}
