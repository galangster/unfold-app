/**
 * useAuth — Clerk-based authentication hook.
 *
 * Bridges Clerk's auth state to the app's Zustand store and RevenueCat.
 * Returns the same interface the rest of the app expects.
 */

import { useEffect, useRef } from 'react';
import { useAuth as useClerkAuth, useUser } from '@clerk/clerk-expo';
import * as Sentry from '@sentry/react-native';
import { useUnfoldStore } from '@/lib/store';
import { logger } from '@/lib/logger';
import { setUserId as rcSetUserId, logoutUser as rcLogoutUser, isRevenueCatEnabled } from '@/lib/revenuecatClient';
import { Analytics } from '@/lib/analytics';
import { migrateAnonymousData } from '@/lib/api-config';
import { mmkvStorage } from '@/lib/mmkv-storage';

// Persistent guard set by the welcome-screen escape hatch
// (src/app/index.tsx handleSignOut) when the user force-signs-out while
// Clerk is stuck. Stores the Clerk user id that was just signed out so
// that if Clerk eventually recovers and reports the SAME id as
// authenticated, we know that sync is stale (the user explicitly asked
// to be signed out) and must be ignored. A different id means a genuine
// new sign-in to a different account and clears the guard.
//
// Why persistent: without this, the sequence is:
//   1. User hits escape hatch; handleSignOut clears store + fires
//      signOut() fire-and-forget
//   2. router.replace('/') lands on welcome
//   3. Clerk's signOut() finally resolves (or never does) — either way,
//      on Clerk's next sync `clerkUserId` can still flip back to the
//      previous value, at which point useAuth's effect writes the
//      previous authUserId back into the store, undoing the sign-out
//   4. User is "silently signed back in" despite having asked to leave
//
// The guard breaks this by making the sign-in write conditional: if
// the incoming id matches the guarded id, treat as signed-out.
const FORCED_SIGNED_OUT_KEY = 'forced-signed-out-clerk-id';

export function useAuth() {
  const { isSignedIn, isLoaded, userId: clerkUserId } = useClerkAuth();
  const { user: clerkUser } = useUser();

  // Zustand store — authUserId and authProvider live inside UserProfile
  const updateUser = useUnfoldStore((s) => s.updateUser);

  const prevUserIdRef = useRef<string | null>(null);

  // Derive auth provider from Clerk external accounts. Computed
  // unconditionally so the effect can pass it into the store sync on
  // first observation — the gated PUBLIC value is computed below.
  const rawAuthProvider = (() => {
    if (!clerkUser) return null;
    const primary = clerkUser.externalAccounts?.[0];
    if (!primary) return 'apple'; // fallback
    const provider = primary.provider;
    if (provider === 'apple') return 'apple';
    if (provider === 'google') return 'google';
    if (provider === 'facebook') return 'facebook';
    return 'apple';
  })();

  // Effective auth state. The forced-sign-out guard must suppress the
  // hook's public output — not just the sync effect — because callers
  // like _layout.tsx start syncService and register push tokens off
  // `userId`. If we only gated the effect, a stale Clerk recovery
  // would still read as "signed in" to the rest of the app and
  // re-engage authenticated background behavior under the old
  // identity. Gate everything on the guard.
  //
  // Read on every render: the guard is set/cleared synchronously
  // right before router.replace() calls that re-render this hook, so
  // each render sees the authoritative current value without needing
  // a separate subscribe mechanism.
  const rawClerkUserId = clerkUserId ?? null;
  const guardedId = mmkvStorage.getItem(FORCED_SIGNED_OUT_KEY) as string | null;
  const isGuardedStaleRecovery =
    rawClerkUserId !== null && guardedId !== null && guardedId === rawClerkUserId;

  const userId = isGuardedStaleRecovery ? null : rawClerkUserId;
  const email = isGuardedStaleRecovery ? null : clerkUser?.primaryEmailAddress?.emailAddress ?? null;
  const displayName = isGuardedStaleRecovery ? null : clerkUser?.firstName ?? null;
  const authProvider = isGuardedStaleRecovery ? null : rawAuthProvider;

  const isAuthenticated = !!userId;
  const isLoading = !isLoaded;

  // Sync auth state to Zustand + RevenueCat when user changes
  useEffect(() => {
    if (!isLoaded) return;

    const newUserId = clerkUserId ?? null;

    // Forced-sign-out guard check runs BEFORE the skip-if-no-change
    // gate, AND resets prevUserIdRef to null on a guarded return.
    // This matters for the "same account re-auth after escape
    // hatch" flow:
    //
    //   1. Initial mount (signed in as X): prevRef=null → advances
    //      to X, sign-in sync runs.
    //   2. Escape hatch fires: guard set to X. Clerk may be wedged
    //      and keep reporting X. Next effect run sees newUserId=X,
    //      guard matches → we reset prevRef=null and return.
    //   3. Clerk eventually unwedges and reports signed-out
    //      (newUserId=null). The "Clerk confirmed signed-out"
    //      block below clears the guard (outside the gate, so
    //      prevRef=null doesn't poison the clear).
    //   4. User re-signs in to the same X. Clerk reports X,
    //      guard is now null, prevRef is still null → advances
    //      to X, sign-in sync runs. If we had left prevRef=X in
    //      step 2, step 4's skip-if-no-change gate would short-
    //      circuit and the store would stay empty until restart.
    if (newUserId) {
      const currentGuardedId = mmkvStorage.getItem(FORCED_SIGNED_OUT_KEY) as string | null;
      if (currentGuardedId !== null && currentGuardedId === newUserId) {
        logger.warn('[useAuth] Ignoring late Clerk sync for forced-signed-out user', {
          guardedId: currentGuardedId,
        });
        prevUserIdRef.current = null;
        return;
      }
      if (currentGuardedId !== null && currentGuardedId !== newUserId) {
        logger.log('[useAuth] Fresh sign-in to different account — clearing forced-signed-out guard');
        mmkvStorage.removeItem(FORCED_SIGNED_OUT_KEY);
      }
    }

    // Authoritative signed-out confirmation from Clerk — clear the
    // forced-signed-out guard BEFORE the skip-if-no-change gate.
    //
    // Why before the gate: the guarded-return path above resets
    // prevRef to null whenever a guarded userId matches. If the next
    // effect run arrives with newUserId=null (Clerk finally
    // transitioned to signed-out), the skip-if-no-change check
    // would see null===null and short-circuit before the signed-out
    // branch could run — leaving the guard set forever. Clearing
    // here, outside the gate, makes the signed-out signal land
    // regardless of the prevRef state the guarded return poisoned.
    //
    // This is the "same account" clear path: user escape-hatch'd
    // from X, Clerk eventually confirms signed-out, guard cleared,
    // a subsequent re-sign-in to X will now be accepted. The other
    // clear path is "different userId fresh sign-in," handled in
    // the newUserId guard block above.
    if (!isSignedIn && newUserId === null) {
      if (mmkvStorage.getItem(FORCED_SIGNED_OUT_KEY) !== null) {
        logger.log('[useAuth] Clerk confirmed signed-out — clearing forced-signed-out guard');
        mmkvStorage.removeItem(FORCED_SIGNED_OUT_KEY);
      }
    }

    // Skip if no change. Runs AFTER the guard so a guarded return
    // does not poison prevRef.
    if (newUserId === prevUserIdRef.current) return;
    prevUserIdRef.current = newUserId;

    if (newUserId) {
      // User signed in via Clerk
      const state = useUnfoldStore.getState();
      const hasExistingContent = (state.devotionals?.length ?? 0) > 0;
      updateUser({
        authUserId: newUserId,
        authProvider,
        authEmail: email,
        authDisplayName: displayName,
        // Restore onboarding flag if user has existing devotional content (re-sign-in after sign-out)
        ...(hasExistingContent ? { hasCompletedOnboarding: true } : {}),
      });

      // Sync RevenueCat (wrapper returns { ok, reason }, never rejects)
      if (isRevenueCatEnabled()) {
        rcSetUserId(newUserId).then((result) => {
          if (!result.ok) {
            logger.warn('[useAuth] RevenueCat setUserId failed:', result.reason);
          }
        });
      }

      // Analytics context
      Analytics.setUserId(newUserId);
      Analytics.setUserProperty('auth_provider', authProvider);

      // Sentry context
      Sentry.setUser({ id: newUserId, email: email ?? undefined });

      // Migrate anonymous device data to the signed-in account (fire-and-forget)
      migrateAnonymousData(newUserId);

      logger.log('[useAuth] Clerk user synced:', newUserId);
    } else if (!isSignedIn) {
      // Signed out — authoritative confirmation from Clerk. See the
      // "Clerk confirmed signed-out" block above the skip-if-no-
      // change gate for the full guard-clear rationale.
      updateUser({
        authUserId: null,
        authProvider: null,
        authEmail: null,
        authDisplayName: null,
      });

      // Clear RevenueCat (wrapper returns { ok, reason }, never rejects)
      if (isRevenueCatEnabled()) {
        rcLogoutUser().then((result) => {
          if (!result.ok) {
            logger.warn('[useAuth] RevenueCat logoutUser failed:', result.reason);
          }
        });
      }

      // Clear analytics & Sentry
      Analytics.setUserId(null);
      Sentry.setUser(null);

      logger.log('[useAuth] User signed out');
    }
  }, [isLoaded, isSignedIn, clerkUserId, authProvider, email, displayName]);

  return {
    // Auth state
    user: clerkUser ?? null,
    isAuthenticated,
    isLoading,
    authProvider,

    // User info helpers
    displayName,
    email,
    userId,
  };
}
