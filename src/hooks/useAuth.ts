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

  // Derive auth provider from Clerk external accounts
  const authProvider = (() => {
    if (!clerkUser) return null;
    const primary = clerkUser.externalAccounts?.[0];
    if (!primary) return 'apple'; // fallback
    const provider = primary.provider;
    if (provider === 'apple') return 'apple';
    if (provider === 'google') return 'google';
    if (provider === 'facebook') return 'facebook';
    return 'apple';
  })();

  // Resolve userId from Clerk
  const userId = clerkUserId ?? null;
  const email = clerkUser?.primaryEmailAddress?.emailAddress ?? null;
  const displayName = clerkUser?.firstName ?? null;

  const isAuthenticated = !!userId;
  const isLoading = !isLoaded;

  // Sync auth state to Zustand + RevenueCat when user changes
  useEffect(() => {
    if (!isLoaded) return;

    const newUserId = clerkUserId ?? null;

    // Skip if no change
    if (newUserId === prevUserIdRef.current) return;
    prevUserIdRef.current = newUserId;

    if (newUserId) {
      // Forced-sign-out guard. If the escape hatch in
      // src/app/index.tsx just force-signed-out this exact Clerk user,
      // ignore any late positive sync for that same id — it's a Clerk
      // recovery, not a fresh sign-in, and applying it would re-write
      // the authUserId into the store after we already cleared it.
      //
      // A DIFFERENT incoming id is a genuine new sign-in (e.g., user
      // re-signs-in with a different account, or to the same account
      // fresh from the welcome screen) — clear the guard and proceed.
      // We intentionally clear for same-id re-sign-in too, but that
      // requires the user to pass through the welcome sign-in flow,
      // which is the explicit intent signal we need.
      const guardedId = mmkvStorage.getItem(FORCED_SIGNED_OUT_KEY) as string | null;
      if (guardedId !== null && guardedId === newUserId) {
        logger.warn('[useAuth] Ignoring late Clerk sync for forced-signed-out user', { guardedId });
        return;
      }
      if (guardedId !== null && guardedId !== newUserId) {
        logger.log('[useAuth] Fresh sign-in to different account — clearing forced-signed-out guard');
        mmkvStorage.removeItem(FORCED_SIGNED_OUT_KEY);
      }

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
      // Signed out
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
