/**
 * Authentication Hook
 * Manages Firebase Auth state and syncs with Zustand store
 * Also handles RevenueCat user linking for subscription tracking
 */
import { useEffect, useState, useCallback } from 'react';
import auth, { FirebaseAuthTypes } from '@react-native-firebase/auth';
import { useUnfoldStore } from '@/lib/store';
import { isRevenueCatEnabled, setUserId, logoutUser } from '@/lib/revenuecatClient';
import { logger } from '@/lib/logger';
import { initializeAuth } from '@/lib/appleAuth';

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

    logger.log('[useAuth] Synced auth to store', {
      userId: user.uid,
      authProvider,
      isAnonymous: user.isAnonymous,
    });
  }, [updateUser]);

  // Link RevenueCat user
  const linkRevenueCatUser = useCallback(async (userId: string | null) => {
    if (!isRevenueCatEnabled()) {
      return;
    }

    try {
      if (userId) {
        // Log in the user to RevenueCat with their Firebase UID
        const result = await setUserId(userId);
        if (result.ok) {
          logger.log('[useAuth] RevenueCat user linked', { userId });
        } else {
          logger.warn('[useAuth] Failed to link RevenueCat user', { 
            userId, 
            reason: result.reason 
          });
        }
      } else {
        // User signed out, log out from RevenueCat
        const result = await logoutUser();
        if (result.ok) {
          logger.log('[useAuth] RevenueCat user logged out');
        }
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error('[useAuth] RevenueCat link error', { error: errorMessage });
    }
  }, []);

  // Initialize auth on mount
  useEffect(() => {
    let isMounted = true;

    const init = async () => {
      try {
        const user = await initializeAuth();
        if (isMounted) {
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
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        logger.error('[useAuth] Init error', { error: errorMessage });
        if (isMounted) {
          setAuthState(prev => ({ ...prev, isLoading: false }));
        }
      }
    };

    init();

    return () => {
      isMounted = false;
    };
  }, [syncAuthToStore, linkRevenueCatUser]);

  // Subscribe to auth state changes
  useEffect(() => {
    const unsubscribe = auth().onAuthStateChanged(async (user) => {
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

      // Link/unlink RevenueCat user
      await linkRevenueCatUser(user?.uid ?? null);
    });

    return unsubscribe;
  }, [syncAuthToStore, linkRevenueCatUser]);

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
