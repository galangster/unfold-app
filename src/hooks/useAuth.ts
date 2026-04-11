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

export function useAuth() {
  const { isSignedIn, isLoaded, userId: clerkUserId } = useClerkAuth();
  const { user: clerkUser } = useUser();

  // Zustand store — authUserId and authProvider live inside UserProfile
  const updateUser = useUnfoldStore((s) => s.updateUser);

  // Sentinel `undefined` = "no reconciliation yet". On initial boot we
  // MUST run the sync path once even when Clerk says signed-out, so a
  // persisted `authUserId` from a revoked or expired session is cleared
  // from the store. Without this, a stale signed-out boot leaves the
  // store claiming a Clerk identity that Clerk itself no longer recognizes
  // — which is exactly the stale-auth state WelcomeScreenWrapper now
  // guards against. Clearing here is the root-cause fix.
  const prevUserIdRef = useRef<string | null | undefined>(undefined);

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

    // Skip if no change — but the very first reconciliation always runs
    // (prevUserIdRef starts as `undefined`) so an initial signed-out boot
    // can clear stale persisted authUserId.
    if (prevUserIdRef.current !== undefined && newUserId === prevUserIdRef.current) return;
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
