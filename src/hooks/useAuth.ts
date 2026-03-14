/**
 * Authentication Hook
 * Manages Firebase Auth state and syncs with Zustand store
 * Also handles RevenueCat user linking for subscription tracking
 *
 * Graceful degradation: If Firebase Auth is not available, the hook
 * will still work -- it simply treats the user as unauthenticated
 * and the app operates in local-only mode.
 */
import { useEffect, useState, useCallback, useRef } from 'react';
import type { FirebaseAuthTypes } from '@react-native-firebase/auth';
import { useUnfoldStore } from '@/lib/store';
import { isRevenueCatEnabled, setUserId, logoutUser } from '@/lib/revenuecatClient';
import { logger } from '@/lib/logger';
import { initializeAuth } from '@/lib/appleAuth';
import { Analytics } from '@/lib/analytics';

/**
 * Safely get the Firebase Auth instance for subscribing to state changes.
 * Returns null if Firebase is not configured.
 */
function getAuthInstance(): ReturnType<typeof import('@react-native-firebase/auth').default> | null {
  try {
    const auth = require('@react-native-firebase/auth').default;
    return auth();
  } catch {
    return null;
  }
}

interface AuthState {
  user: FirebaseAuthTypes.User | null;
  isAuthenticated: boolean;
  isAnonymous: boolean;
  isLoading: boolean;
  authProvider: 'apple' | 'anonymous' | null;
}

export function useAuth() {
  const [authState, setAuthState] = useState<AuthState>({
    user: null,
    isAuthenticated: false,
    isAnonymous: true,
    isLoading: true,
    authProvider: null,
  });

  const isMountedRef = useRef(true);
  // Track the latest RevenueCat link call to prevent stale completions
  const revenueCatCallIdRef = useRef(0);

  const updateUser = useUnfoldStore((s) => s.updateUser);
  const currentUserProfile = useUnfoldStore((s) => s.user);

  // Sync auth state to Zustand store
  const syncAuthToStore = useCallback((user: FirebaseAuthTypes.User | null) => {
    if (!user) {
      updateUser({
        authUserId: null,
        authProvider: null,
        authEmail: null,
        authDisplayName: null,
      });
      Analytics.setUserId(null);
      return;
    }

    // Determine auth provider
    const providerId = user.providerData[0]?.providerId;
    const authProvider: 'apple' | 'anonymous' | null = 
      user.isAnonymous ? 'anonymous' :
      providerId === 'apple.com' ? 'apple' :
      null;

    updateUser({
      authUserId: user.uid,
      authProvider,
      authEmail: user.email,
      authDisplayName: user.displayName,
    });

    // Set analytics user ID and properties
    Analytics.setUserId(user.uid);
    Analytics.setUserProperty('auth_provider', authProvider || 'none');

    logger.log('[useAuth] Synced auth to store', {
      userId: user.uid,
      authProvider,
      isAnonymous: user.isAnonymous,
    });
  }, [updateUser]);

  // Link RevenueCat user — uses call ID to discard stale completions
  const linkRevenueCatUser = useCallback(async (userId: string | null) => {
    if (!isRevenueCatEnabled()) {
      return;
    }

    // Increment call ID so any previous in-flight call becomes stale
    const callId = ++revenueCatCallIdRef.current;

    try {
      if (userId) {
        const result = await setUserId(userId);
        // Check if this call is still the latest and component is still mounted
        if (callId !== revenueCatCallIdRef.current || !isMountedRef.current) return;
        if (result.ok) {
          logger.log('[useAuth] RevenueCat user linked', { userId });
        } else {
          logger.warn('[useAuth] Failed to link RevenueCat user', {
            userId,
            reason: result.reason
          });
        }
      } else {
        const result = await logoutUser();
        if (callId !== revenueCatCallIdRef.current || !isMountedRef.current) return;
        if (result.ok) {
          logger.log('[useAuth] RevenueCat user logged out');
        }
      }
    } catch (error) {
      if (callId !== revenueCatCallIdRef.current || !isMountedRef.current) return;
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error('[useAuth] RevenueCat link error', { error: errorMessage });
    }
  }, []);

  // Initialize auth on mount
  useEffect(() => {
    const init = async () => {
      try {
        const user = await initializeAuth();
        if (!isMountedRef.current) return;

        setAuthState({
          user,
          isAuthenticated: !!user,
          isAnonymous: user?.isAnonymous ?? true,
          isLoading: false,
          authProvider: user?.isAnonymous ? 'anonymous' :
                       user?.providerData[0]?.providerId === 'apple.com' ? 'apple' : null,
        });

        // Sync to store
        syncAuthToStore(user);

        // Link to RevenueCat
        if (user) {
          await linkRevenueCatUser(user.uid);
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        logger.error('[useAuth] Init error', { error: errorMessage });
        if (isMountedRef.current) {
          setAuthState(prev => ({ ...prev, isLoading: false }));
        }
      }
    };

    init();
  }, [syncAuthToStore, linkRevenueCatUser]);

  // Subscribe to auth state changes (only if Firebase is available)
  useEffect(() => {
    const authInstance = getAuthInstance();
    if (!authInstance) {
      logger.log('[useAuth] Firebase Auth not available, skipping onAuthStateChanged subscription');
      return;
    }

    let unsubscribe: (() => void) | undefined;
    try {
      unsubscribe = authInstance.onAuthStateChanged(async (user) => {
        // Guard against updates after unmount
        if (!isMountedRef.current) return;

        logger.log('[useAuth] Auth state changed', {
          hasUser: !!user,
          isAnonymous: user?.isAnonymous,
        });

        const providerId = user?.providerData[0]?.providerId;
        const authProvider: 'apple' | 'anonymous' | null =
          user?.isAnonymous ? 'anonymous' :
          providerId === 'apple.com' ? 'apple' :
          null;

        setAuthState({
          user,
          isAuthenticated: !!user,
          isAnonymous: user?.isAnonymous ?? true,
          isLoading: false,
          authProvider,
        });

        // Sync to store
        syncAuthToStore(user);

        // Link/unlink RevenueCat user (the callback itself checks isMountedRef
        // and uses call ID to discard stale completions from rapid auth changes)
        await linkRevenueCatUser(user?.uid ?? null);
      });
    } catch (error) {
      logger.error('[useAuth] Failed to subscribe to auth state changes', {
        error: error instanceof Error ? error.message : String(error),
      });
    }

    return () => {
      unsubscribe?.();
    };
  }, [syncAuthToStore, linkRevenueCatUser]);

  // Clean up mounted ref on unmount
  useEffect(() => {
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  // Get current user's display name
  const getDisplayName = useCallback((): string | null => {
    return authState.user?.displayName ?? 
           currentUserProfile?.authDisplayName ?? 
           currentUserProfile?.name ?? 
           null;
  }, [authState.user, currentUserProfile]);

  // Get current user's email
  const getEmail = useCallback((): string | null => {
    return authState.user?.email ?? 
           currentUserProfile?.authEmail ?? 
           null;
  }, [authState.user, currentUserProfile]);

  // Check if user needs to see sign in prompt
  const shouldShowSignInPrompt = useCallback((): boolean => {
    if (authState.isAuthenticated && !authState.isAnonymous) {
      return false; // Already signed in with Apple
    }
    
    const promptCount = currentUserProfile?.signInPromptCount ?? 0;
    const hasSeenPrompt = currentUserProfile?.hasSeenSignInPrompt ?? false;
    
    // Show prompt if:
    // 1. User hasn't seen it yet, OR
    // 2. User has seen it but hasn't signed in (count < 3, with backoff)
    if (!hasSeenPrompt) {
      return true;
    }
    
    // Progressive backoff: 1 day, 3 days, 7 days
    if (promptCount === 1) return true; // 1 day handled by caller
    if (promptCount === 2) return true; // 3 days handled by caller
    if (promptCount >= 3) return false; // Max prompts reached
    
    return true;
  }, [authState.isAuthenticated, authState.isAnonymous, currentUserProfile]);

  // Record that user saw sign in prompt
  const recordSignInPrompt = useCallback(() => {
    const currentCount = currentUserProfile?.signInPromptCount ?? 0;
    updateUser({
      hasSeenSignInPrompt: true,
      signInPromptCount: currentCount + 1,
    });
  }, [currentUserProfile?.signInPromptCount, updateUser]);

  return {
    // Auth state
    user: authState.user,
    isAuthenticated: authState.isAuthenticated,
    isAnonymous: authState.isAnonymous,
    isLoading: authState.isLoading,
    authProvider: authState.authProvider,
    
    // User info helpers
    displayName: getDisplayName(),
    email: getEmail(),
    userId: authState.user?.uid ?? null,
    
    // Sign in prompt management
    shouldShowSignInPrompt: shouldShowSignInPrompt(),
    recordSignInPrompt,
    signInPromptCount: currentUserProfile?.signInPromptCount ?? 0,
  };
}
