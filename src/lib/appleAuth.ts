/**
 * Apple Authentication module
 * Handles Apple Sign In and Firebase Auth integration
 *
 * Graceful degradation: All Firebase calls go through getAuthInstance()
 * which returns null if Firebase is not configured. Every function
 * handles that null case and falls back to local-only mode.
 */
import * as AppleAuthentication from 'expo-apple-authentication';
import { getRandomBytesAsync } from 'expo-crypto';
import { logger } from './logger';

// Re-export the type so consumers don't need to import Firebase directly
export type { FirebaseAuthTypes } from '@react-native-firebase/auth';
import type { FirebaseAuthTypes } from '@react-native-firebase/auth';

/**
 * Safely get the Firebase Auth instance.
 * Returns null if Firebase is not configured or the module fails to load.
 */
function getAuthInstance(): ReturnType<typeof import('@react-native-firebase/auth').default> | null {
  try {
    const auth = require('@react-native-firebase/auth').default;
    // Calling auth() will throw if Firebase app is not initialized
    return auth();
  } catch (error) {
    logger.warn('[AppleAuth] Firebase Auth not available, running in local-only mode', {
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

/**
 * Safely get the Firebase Auth module (for static methods like AppleAuthProvider).
 * Returns null if the module fails to load.
 */
function getAuthModule(): typeof import('@react-native-firebase/auth').default | null {
  try {
    return require('@react-native-firebase/auth').default;
  } catch {
    return null;
  }
}

/**
 * Generate a random nonce for Apple Sign In
 * This helps prevent replay attacks
 */
export async function generateNonce(length = 32): Promise<string> {
  const charset = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz-._~';
  const randomBytes = await getRandomBytesAsync(length);
  let nonce = '';
  for (let i = 0; i < length; i++) {
    nonce += charset[randomBytes[i] % charset.length];
  }
  return nonce;
}

/**
 * Hash a nonce using SHA-256
 * Apple requires the nonce to be hashed before sending
 * Uses expo-crypto which works in Hermes (crypto.subtle does not)
 */
export async function sha256(nonce: string): Promise<string> {
  const { digestStringAsync, CryptoDigestAlgorithm } = await import('expo-crypto');
  return digestStringAsync(CryptoDigestAlgorithm.SHA256, nonce);
}

export interface AppleAuthResult {
  success: boolean;
  user: FirebaseAuthTypes.User | null;
  error?: string;
  isCancelled?: boolean;
}

/**
 * Sign in with Apple
 * Uses expo-apple-authentication for the native Apple Sign In flow,
 * then links to Firebase Auth for backend identity
 */
export async function signInWithApple(): Promise<AppleAuthResult> {
  try {
    // Step 1: Check availability
    logger.log('[AppleAuth] Step 1: Checking availability...');
    const isAvailable = await AppleAuthentication.isAvailableAsync();
    logger.log('[AppleAuth] Step 1 result: isAvailable =', isAvailable);
    if (!isAvailable) {
      logger.warn('[AppleAuth] Apple Sign In not available on this device');
      return {
        success: false,
        user: null,
        error: 'Apple Sign In is not available on this device',
      };
    }

    // Step 2: Generate nonce
    logger.log('[AppleAuth] Step 2: Generating nonce...');
    const nonce = await generateNonce();
    const hashedNonce = await sha256(nonce);
    logger.log('[AppleAuth] Step 2 done: nonce generated');

    // Step 3: Request Apple Sign In
    logger.log('[AppleAuth] Step 3: Requesting Apple Sign In...');
    const credential = await AppleAuthentication.signInAsync({
      requestedScopes: [
        AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
        AppleAuthentication.AppleAuthenticationScope.EMAIL,
      ],
      nonce: hashedNonce,
    });
    logger.log('[AppleAuth] Step 3 done: got credential');

    // Check if user cancelled
    if (!credential.identityToken) {
      return {
        success: false,
        user: null,
        error: 'No identity token received',
      };
    }

    // Step 4: Load Firebase modules
    logger.log('[AppleAuth] Step 4: Loading Firebase auth module...');
    const authModule = getAuthModule();
    logger.log('[AppleAuth] Step 4a: authModule loaded =', !!authModule);
    const authInstance = getAuthInstance();
    logger.log('[AppleAuth] Step 4b: authInstance loaded =', !!authInstance);

    if (!authModule || !authInstance) {
      logger.warn('[AppleAuth] Firebase not available, cannot complete Apple Sign In');
      return {
        success: false,
        user: null,
        error: 'Firebase is not configured. Sign in is unavailable.',
      };
    }

    // Step 5: Create Firebase credential from Apple token
    logger.log('[AppleAuth] Step 5: Creating Firebase credential...');
    const appleCredential = authModule.AppleAuthProvider.credential(
      credential.identityToken,
      nonce
    );
    logger.log('[AppleAuth] Step 5 done: Firebase credential created');

    // Step 6: Sign in to Firebase
    logger.log('[AppleAuth] Step 6: Signing in to Firebase...');
    const userCredential = await authInstance.signInWithCredential(appleCredential);
    logger.log('[AppleAuth] Step 6 done: Firebase sign in successful');

    // Update user profile if display name is available (only on first sign-in)
    if (credential.fullName) {
      const displayName = [
        credential.fullName.givenName,
        credential.fullName.familyName,
      ]
        .filter(Boolean)
        .join(' ');

      if (displayName && !userCredential.user.displayName) {
        logger.log('[AppleAuth] Updating display name');
        await userCredential.user.updateProfile({
          displayName,
        });
      }
    }

    logger.log('[AppleAuth] Successfully signed in with Apple', {
      userId: userCredential.user.uid,
    });

    return {
      success: true,
      user: userCredential.user,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    const errorCode = (error as any)?.code;
    const fullError = error instanceof Error ? error.stack : String(error);

    logger.log('[AppleAuth] ERROR caught:', errorMessage);
    logger.log('[AppleAuth] ERROR code:', errorCode);
    logger.log('[AppleAuth] ERROR stack:', fullError);

    // Check if user cancelled
    if (errorMessage.includes('canceled') || errorMessage.includes('cancelled') ||
        errorCode === 'ERR_CANCELED') {
      logger.log('[AppleAuth] User cancelled sign in');
      return {
        success: false,
        user: null,
        isCancelled: true,
        error: 'User cancelled sign in',
      };
    }

    // Firebase-specific error codes
    if (errorCode) {
      logger.log('[AppleAuth] Firebase error code detected:', errorCode);
      if (errorCode === 'auth/invalid-credential' || errorCode === 'auth/operation-not-allowed') {
        logger.error('[AppleAuth] Firebase auth provider not enabled', { code: errorCode });
        return {
          success: false,
          user: null,
          error: `Firebase: ${errorCode} — Apple Sign In provider may not be enabled in Firebase Console.`,
        };
      }
    }

    logger.error('[AppleAuth] Sign in error', { error: errorMessage, code: errorCode });
    return {
      success: false,
      user: null,
      error: errorMessage,
    };
  }
}

/**
 * Sign in anonymously
 * Used as a fallback when Apple Sign In is not available or fails
 */
export async function signInAnonymously(): Promise<AppleAuthResult> {
  try {
    const authInstance = getAuthInstance();
    if (!authInstance) {
      logger.warn('[AppleAuth] Firebase not available, cannot sign in anonymously');
      return {
        success: false,
        user: null,
        error: 'Firebase is not configured',
      };
    }

    const userCredential = await authInstance.signInAnonymously();

    logger.log('[AppleAuth] Signed in anonymously', {
      userId: userCredential.user.uid,
    });

    return {
      success: true,
      user: userCredential.user,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('[AppleAuth] Anonymous sign in error', { error: errorMessage });
    return {
      success: false,
      user: null,
      error: errorMessage,
    };
  }
}

/**
 * Get the current authenticated user
 * Returns null if Firebase is not available
 */
export function getCurrentUser(): FirebaseAuthTypes.User | null {
  const authInstance = getAuthInstance();
  return authInstance?.currentUser ?? null;
}

/**
 * Sign out the current user
 * No-ops if Firebase is not available
 */
export async function signOut(): Promise<void> {
  try {
    const authInstance = getAuthInstance();
    if (!authInstance) {
      logger.log('[AppleAuth] Firebase not available, sign out is a no-op');
      return;
    }

    await authInstance.signOut();
    logger.log('[AppleAuth] User signed out');
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('[AppleAuth] Sign out error', { error: errorMessage });
    // Don't re-throw -- callers should not crash on sign-out failure
  }
}

/**
 * Update the current user's display name
 * Used when user sets their name manually (e.g., after Apple Sign In with hidden email)
 * Silently no-ops if Firebase is not available
 */
export async function updateUserProfile(displayName: string): Promise<void> {
  try {
    const authInstance = getAuthInstance();
    if (!authInstance) {
      logger.log('[AppleAuth] Firebase not available, skipping profile update');
      return;
    }

    const currentUser = authInstance.currentUser;
    if (!currentUser) {
      logger.warn('[AppleAuth] No current user to update profile for');
      return;
    }

    await currentUser.updateProfile({ displayName });
    logger.log('[AppleAuth] User profile updated', { displayName });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('[AppleAuth] Update profile error', { error: errorMessage });
    // Don't re-throw -- callers already handle failure gracefully
  }
}

/**
 * Check if Apple Sign In is available on this device
 */
export async function isAppleSignInAvailable(): Promise<boolean> {
  try {
    return await AppleAuthentication.isAvailableAsync();
  } catch {
    return false;
  }
}

/**
 * Delete the current user's account
 * This deletes the Firebase Auth user and should be called before clearing local data
 * Required by App Store for apps with Sign In with Apple
 */
export async function deleteAccount(): Promise<{ success: boolean; error?: string }> {
  try {
    const authInstance = getAuthInstance();
    if (!authInstance) {
      logger.log('[AppleAuth] Firebase not available, no account to delete');
      return { success: true };
    }

    const currentUser = authInstance.currentUser;

    if (!currentUser) {
      logger.log('[AppleAuth] No user to delete');
      return { success: true }; // Already deleted / never existed
    }

    // Delete the user
    await currentUser.delete();

    logger.log('[AppleAuth] User account deleted successfully');
    return { success: true };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('[AppleAuth] Account deletion error', { error: errorMessage });

    // Handle specific error cases
    if (errorMessage.includes('requires-recent-login')) {
      return {
        success: false,
        error: 'For security, please sign out and sign back in before deleting your account.',
      };
    }

    return {
      success: false,
      error: errorMessage,
    };
  }
}

/**
 * Initialize authentication on app startup
 * Attempts to restore existing session or create anonymous user
 */
export async function initializeAuth(): Promise<FirebaseAuthTypes.User | null> {
  try {
    logger.log('[AppleAuth] initializeAuth: starting...');

    const authInstance = getAuthInstance();
    if (!authInstance) {
      logger.log('[AppleAuth] Firebase not available, skipping auth initialization (local-only mode)');
      return null;
    }

    // Check if there's already a current user
    const currentUser = authInstance.currentUser;

    if (currentUser) {
      logger.log('[AppleAuth] Found existing user session', {
        userId: currentUser.uid,
        isAnonymous: currentUser.isAnonymous,
      });
      return currentUser;
    }

    // No existing user, check if Apple Sign In is available
    const appleAvailable = await isAppleSignInAvailable();

    if (appleAvailable) {
      logger.log('[AppleAuth] Apple Sign In available but no user signed in');
      // Return null - UI will prompt for sign in
      return null;
    }

    // Apple Sign In not available, create anonymous user
    logger.log('[AppleAuth] Apple Sign In not available, creating anonymous user');
    const result = await signInAnonymously();
    return result.user;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('[AppleAuth] Initialize auth error', { error: errorMessage });
    return null;
  }
}

/**
 * Link anonymous account to Apple Sign In
 * Used when a user was previously anonymous and wants to upgrade
 */
export async function linkAnonymousToApple(): Promise<AppleAuthResult> {
  try {
    const authInstance = getAuthInstance();
    const authModule = getAuthModule();

    if (!authInstance || !authModule) {
      return {
        success: false,
        user: null,
        error: 'Firebase is not configured',
      };
    }

    const currentUser = authInstance.currentUser;

    if (!currentUser) {
      return {
        success: false,
        user: null,
        error: 'No current user to link',
      };
    }

    if (!currentUser.isAnonymous) {
      return {
        success: false,
        user: currentUser,
        error: 'User is not anonymous',
      };
    }

    // Check if Apple Sign In is available
    const isAvailable = await AppleAuthentication.isAvailableAsync();
    if (!isAvailable) {
      return {
        success: false,
        user: currentUser,
        error: 'Apple Sign In is not available on this device',
      };
    }

    // Generate nonce
    const nonce = await generateNonce();
    const hashedNonce = await sha256(nonce);

    // Request Apple Sign In
    const credential = await AppleAuthentication.signInAsync({
      requestedScopes: [
        AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
        AppleAuthentication.AppleAuthenticationScope.EMAIL,
      ],
      nonce: hashedNonce,
    });

    if (!credential.identityToken) {
      return {
        success: false,
        user: currentUser,
        error: 'No identity token received',
      };
    }

    // Create Firebase credential and link
    const appleCredential = authModule.AppleAuthProvider.credential(
      credential.identityToken,
      nonce
    );

    const linkedCredential = await currentUser.linkWithCredential(appleCredential);

    // Update display name if available
    if (credential.fullName) {
      const displayName = [
        credential.fullName.givenName,
        credential.fullName.familyName,
      ]
        .filter(Boolean)
        .join(' ');

      if (displayName) {
        await linkedCredential.user.updateProfile({
          displayName,
        });
      }
    }

    logger.log('[AppleAuth] Successfully linked anonymous account to Apple', {
      userId: linkedCredential.user.uid,
    });

    return {
      success: true,
      user: linkedCredential.user,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    if (errorMessage.includes('canceled') || errorMessage.includes('cancelled')) {
      return {
        success: false,
        user: getCurrentUser(),
        isCancelled: true,
        error: 'User cancelled sign in',
      };
    }

    logger.error('[AppleAuth] Link anonymous to Apple error', { error: errorMessage });
    return {
      success: false,
      user: getCurrentUser(),
      error: errorMessage,
    };
  }
}
