/**
 * Apple Authentication module
 * Handles Apple Sign In and Firebase Auth integration
 */
import * as AppleAuthentication from 'expo-apple-authentication';
import { getRandomBytesAsync } from 'expo-crypto';
import auth, { FirebaseAuthTypes } from '@react-native-firebase/auth';
import { logger } from './logger';

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
 */
export async function sha256(nonce: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(nonce);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  return hashHex;
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
    // Check if Apple Sign In is available (only on iOS)
    const isAvailable = await AppleAuthentication.isAvailableAsync();
    if (!isAvailable) {
      logger.warn('[AppleAuth] Apple Sign In not available on this device');
      return {
        success: false,
        user: null,
        error: 'Apple Sign In is not available on this device',
      };
    }

    // Generate nonce for security
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

    // Check if user cancelled
    if (!credential.identityToken) {
      return {
        success: false,
        user: null,
        error: 'No identity token received',
      };
    }

    // Create Firebase credential
    const appleCredential = auth.AppleAuthProvider.credential(
      credential.identityToken,
      nonce
    );

    // Sign in to Firebase
    const userCredential = await auth().signInWithCredential(appleCredential);

    // Update user profile if display name is available (only on first sign-in)
    if (credential.fullName) {
      const displayName = [
        credential.fullName.givenName,
        credential.fullName.familyName,
      ]
        .filter(Boolean)
        .join(' ');

      if (displayName && !userCredential.user.displayName) {
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
    
    // Check if user cancelled
    if (errorMessage.includes('canceled') || errorMessage.includes('cancelled')) {
      logger.log('[AppleAuth] User cancelled sign in');
      return {
        success: false,
        user: null,
        isCancelled: true,
        error: 'User cancelled sign in',
      };
    }

    logger.error('[AppleAuth] Sign in error', { error: errorMessage });
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
    const userCredential = await auth().signInAnonymously();
    
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
 */
export function getCurrentUser(): FirebaseAuthTypes.User | null {
  return auth().currentUser;
}

/**
 * Sign out the current user
 */
export async function signOut(): Promise<void> {
  try {
    await auth().signOut();
    logger.log('[AppleAuth] User signed out');
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('[AppleAuth] Sign out error', { error: errorMessage });
    throw error;
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
 * Initialize authentication on app startup
 * Attempts to restore existing session or create anonymous user
 */
export async function initializeAuth(): Promise<FirebaseAuthTypes.User | null> {
  try {
    // Check if there's already a current user
    const currentUser = auth().currentUser;
    
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
    const currentUser = auth().currentUser;
    
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
    const appleCredential = auth.AppleAuthProvider.credential(
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
        user: auth().currentUser,
        isCancelled: true,
        error: 'User cancelled sign in',
      };
    }

    logger.error('[AppleAuth] Link anonymous to Apple error', { error: errorMessage });
    return {
      success: false,
      user: auth().currentUser,
      error: errorMessage,
    };
  }
}
