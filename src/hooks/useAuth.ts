/**
 * useAuth — Clerk-based authentication hook.
 *
 * Bridges Clerk's auth state to the app's Zustand store and RevenueCat.
 * Returns the same interface the rest of the app expects.
 */

import { useEffect, useCallback, useRef } from 'react';
import { useAuth as useClerkAuth, useUser } from '@clerk/clerk-expo';
import * as Sentry from '@sentry/react-native';
import { useUnfoldStore } from '@/lib/store';
import { logger } from '@/lib/logger';
import { setUserId as rcSetUserId, logoutUser as rcLogoutUser, isRevenueCatEnabled } from '@/lib/revenuecatClient';
import { Analytics } from '@/lib/analytics';

export function useAuth() {
  const { isSignedIn, isLoaded, userId: clerkUserId } = useClerkAuth();
  const { user: clerkUser } = useUser();

  // Zustand store — authUserId and authProvider live inside UserProfile
  const storeUserId = useUnfoldStore((s) => s.user?.authUserId);
  const storeProvider = useUnfoldStore((s) => s.user?.authProvider);
  const updateUser = useUnfoldStore((s) => s.updateUser);
  const signInPromptCount = useUnfoldStore((s) => s.user?.signInPromptCount ?? 0);

  const prevUserIdRef = useRef<string | null>(null);

  // Derive auth provider from Clerk external accounts
  const authProvider = (() => {
    if (!clerkUser) {
      return storeProvider === 'guest' ? 'guest' : null;
    }
    const primary = clerkUser.externalAccounts?.[0];
    if (!primary) return 'apple'; // fallback
    const provider = primary.provider;
    if (provider === 'apple') return 'apple';
    if (provider === 'google') return 'google';
    if (provider === 'facebook') return 'facebook';
    return 'apple';
  })();

  // Resolve userId: Clerk user, or local guest, or null
  const userId = clerkUserId ?? storeUserId ?? null;
  const email = clerkUser?.primaryEmailAddress?.emailAddress ?? null;
  const displayName = clerkUser?.firstName ?? null;

  const isAuthenticated = !!userId;
  const isAnonymous = storeProvider === 'guest';
  const isLoading = !isLoaded;

  // Sync auth state to Zustand + RevenueCat when user changes
  useEffect(() => {
    if (!isLoaded) return;

    const newUserId = clerkUserId ?? null;

    // Skip if no change
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

      logger.log('[useAuth] Clerk user synced:', newUserId);
    } else if (!isSignedIn && storeProvider !== 'guest') {
      // Signed out (not guest mode)
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

  // Sign-in prompt management — preserve existing progressive backoff logic
  const hasSeenSignInPrompt = useUnfoldStore((s) => s.user?.hasSeenSignInPrompt ?? false);

  const shouldShowSignInPrompt = (() => {
    if (!isAnonymous) return false; // Signed in with a provider
    if (!hasSeenSignInPrompt) return true; // First time
    if (signInPromptCount >= 3) return false; // Max prompts reached
    return true; // Progressive backoff (timing handled by caller)
  })();

  const recordSignInPrompt = useCallback(() => {
    const state = useUnfoldStore.getState();
    const current = state.user?.signInPromptCount ?? 0;
    state.updateUser({
      hasSeenSignInPrompt: true,
      signInPromptCount: current + 1,
    });
  }, []);

  return {
    // Auth state
    user: clerkUser ?? null,
    isAuthenticated,
    isAnonymous,
    isLoading,
    authProvider,

    // User info helpers
    displayName,
    email,
    userId,

    // Sign in prompt management
    shouldShowSignInPrompt,
    recordSignInPrompt,
    signInPromptCount,
  };
}
