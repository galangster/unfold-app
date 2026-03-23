# Clerk Auth Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Firebase Auth with Clerk across Unfold mobile app and Express backend — Apple, Google, Facebook OAuth + local-only guest mode.

**Architecture:** Backend gets Clerk Express middleware (replaces Firebase Admin token verification). Mobile gets ClerkProvider + OAuth flows via `@clerk/clerk-expo`. A module-level token ref bridges Clerk's React hooks to non-React service files. Store bumps to v24 mapping `'anonymous'` → `'guest'`.

**Tech Stack:** `@clerk/clerk-expo`, `@clerk/express`, `expo-web-browser`, `expo-secure-store`, Zustand, Express

**Spec:** `docs/superpowers/specs/2026-03-22-clerk-auth-migration-design.md`

---

## File Structure

| Action | File | Responsibility |
|--------|------|----------------|
| Create | `src/lib/clerk.ts` | Token cache, token getter ref, sign-in/sign-out/delete helpers |
| Modify | `src/app/_layout.tsx` | ClerkProvider wrapper, token ref sync |
| Modify | `src/hooks/useAuth.ts` | Clerk useAuth/useUser → same return interface |
| Modify | `src/lib/api-config.ts` | getAuthHeaders via Clerk token getter |
| Modify | `src/app/(onboarding)/sign-in.tsx` | 3 OAuth buttons + guest link |
| Modify | `src/app/onboarding.tsx` | Remove Firebase auth calls |
| Modify | `src/app/generating.tsx` | Remove Firebase auth check |
| Modify | `src/app/(tabs)/(you)/settings.tsx` | Clerk user info instead of Firebase |
| Modify | `src/components/DeleteAccountSheet.tsx` | Clerk user.delete() |
| Modify | `src/lib/store.ts` | v24 migration, authProvider type |
| Modify | `app.json` | Remove Firebase plugin (conditional) |
| Delete | `src/lib/appleAuth.ts` | Replaced by clerk.ts |
| Modify | `backend/src/index.ts` | Clerk middleware replaces Firebase Admin |
| Modify | `backend/package.json` | Add @clerk/express, remove firebase-admin |

---

### Task 1: Backend — Install Clerk Express and replace Firebase auth middleware

**Files:**
- Modify: `/Users/galangster/clawd/work/unfold/backend/package.json`
- Modify: `/Users/galangster/clawd/work/unfold/backend/src/index.ts`

- [ ] **Step 1: Install @clerk/express**

```bash
cd /Users/galangster/clawd/work/unfold/backend
npm install @clerk/express
```

- [ ] **Step 2: Replace Firebase Admin initialization with Clerk**

In `src/index.ts`, replace the Firebase Admin block (lines 1-67) with:

```typescript
// REPLACE these imports:
// import * as admin from 'firebase-admin';
// WITH:
import { clerkMiddleware, getAuth } from '@clerk/express';

// REMOVE the entire Firebase initialization block (lines 26-67):
// const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
// ... all of it through the closing brace

// ADD after Express app creation (after `const app = express()`):
app.use(clerkMiddleware());
```

Keep all other imports unchanged (express, cors, drizzle, routers, etc.).

- [ ] **Step 3: Replace authMiddleware function**

Replace the `authMiddleware` function (lines 131-182) with:

```typescript
function authMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  // Dev mode fallback
  if (process.env.NODE_ENV !== 'production' && !req.headers.authorization) {
    req.uid = 'dev-user';
    return next();
  }

  const auth = getAuth(req);
  if (!auth?.userId) {
    return res.status(401).json({
      error: {
        code: 'UNAUTHENTICATED',
        message: 'Missing or invalid authorization token',
      },
    });
  }

  req.uid = auth.userId;
  next();
}
```

- [ ] **Step 4: Make adaptive-question endpoint public**

Find the line (around line 768-775):
```typescript
app.post('/api/generate/adaptive-question', authMiddleware, rateLimitMiddleware, handleAIRequest);
```

Change to (remove `authMiddleware`):
```typescript
app.post('/api/generate/adaptive-question', rateLimitMiddleware, handleAIRequest);
```

- [ ] **Step 5: Remove firebase-admin dependency**

```bash
cd /Users/galangster/clawd/work/unfold/backend
npm uninstall firebase-admin
```

- [ ] **Step 6: Verify backend builds**

```bash
cd /Users/galangster/clawd/work/unfold/backend
npx tsc --noEmit
```

Expected: No errors (or only pre-existing unrelated errors).

- [ ] **Step 7: Commit**

```bash
cd /Users/galangster/clawd/work/unfold/backend
git add package.json package-lock.json src/index.ts
git commit -m "feat: replace Firebase Admin with Clerk Express middleware

- Install @clerk/express, remove firebase-admin
- authMiddleware now uses Clerk getAuth() for token verification
- Make adaptive-question endpoint public (IP rate limited only)
- Dev mode fallback preserved (req.uid = 'dev-user')"
```

**Note:** Before deploying, add `CLERK_SECRET_KEY` and `CLERK_PUBLISHABLE_KEY` to Railway env vars via the dashboard.

---

### Task 2: Mobile — Install Clerk and create clerk.ts module

**Files:**
- Create: `src/lib/clerk.ts`
- Modify: `package.json`

- [ ] **Step 1: Install @clerk/clerk-expo**

```bash
cd /Users/galangster/clawd/work/unfold/app/mobile
bun add @clerk/clerk-expo
```

- [ ] **Step 2: Create src/lib/clerk.ts**

```typescript
/**
 * Clerk authentication module.
 *
 * Provides token caching, a module-level token getter ref (bridges
 * Clerk's React hooks to non-React service files), and auth helpers.
 */

import * as SecureStore from 'expo-secure-store';
import { useUnfoldStore } from '@/lib/store';
import { logger } from '@/lib/logger';

/* ─────────────────────────────────────────────────────────
 * Token cache — persists Clerk tokens in Secure Store
 * ───────────────────────────────────────────────────────── */

export const tokenCache = {
  async getToken(key: string): Promise<string | null> {
    try {
      return await SecureStore.getItemAsync(key);
    } catch (err) {
      logger.error('[Clerk] tokenCache.getToken error:', err);
      return null;
    }
  },
  async saveToken(key: string, value: string): Promise<void> {
    try {
      await SecureStore.setItemAsync(key, value);
    } catch (err) {
      logger.error('[Clerk] tokenCache.saveToken error:', err);
    }
  },
  async clearToken(key: string): Promise<void> {
    try {
      await SecureStore.deleteItemAsync(key);
    } catch (err) {
      logger.error('[Clerk] tokenCache.clearToken error:', err);
    }
  },
};

/* ─────────────────────────────────────────────────────────
 * Module-level token getter ref
 *
 * Clerk's getToken() is only available via useAuth() React hook.
 * The root _layout.tsx syncs the hook's getToken function here
 * so non-React service files (api-config.ts) can fetch tokens.
 * ───────────────────────────────────────────────────────── */

let _getToken: (() => Promise<string | null>) | null = null;

export function setTokenGetter(fn: () => Promise<string | null>) {
  _getToken = fn;
}

export async function getClerkToken(): Promise<string | null> {
  if (!_getToken) return null;
  try {
    return await _getToken();
  } catch (err) {
    logger.error('[Clerk] getClerkToken error:', err);
    return null;
  }
}

/* ─────────────────────────────────────────────────────────
 * Guest mode helper
 * ───────────────────────────────────────────────────────── */

export function continueAsGuest(): void {
  const store = useUnfoldStore.getState();
  store.updateUser({
    authUserId: `local-${Date.now()}`,
    authProvider: 'guest',
    authEmail: null,
    authDisplayName: null,
  });
  logger.log('[Clerk] Continuing as guest');
}
```

- [ ] **Step 3: Verify no type errors**

```bash
cd /Users/galangster/clawd/work/unfold/app/mobile
npx tsc --noEmit 2>&1 | grep -E "clerk" | head -20
```

Expected: No errors in clerk.ts.

- [ ] **Step 4: Commit**

```bash
git add src/lib/clerk.ts package.json bun.lock
git commit -m "feat: add Clerk auth module with token cache and helpers"
```

---

### Task 3: Mobile — Wrap app in ClerkProvider and sync token ref

**Files:**
- Modify: `src/app/_layout.tsx`

- [ ] **Step 1: Read the current _layout.tsx**

Read `/Users/galangster/clawd/work/unfold/app/mobile/src/app/_layout.tsx` to understand the current structure — find the root component, Firebase auth init, and Sentry user context sync.

- [ ] **Step 2: Add ClerkProvider import and wrap the app**

The file has two components: `RootLayout` (provider wrapper tree) and `RootLayoutNav` (uses hooks, renders routes). ClerkProvider goes in `RootLayout`; hook-based code goes in `RootLayoutNav`.

Add imports at top of file:
```typescript
import { ClerkProvider, ClerkLoaded, useAuth as useClerkAuth } from '@clerk/clerk-expo';
import { tokenCache, setTokenGetter } from '@/lib/clerk';
```

Get the publishable key (at module scope, before `RootLayout`):
```typescript
const CLERK_PUBLISHABLE_KEY = process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY;
```

In `RootLayout`'s return JSX, wrap the outermost provider with ClerkProvider:
```tsx
<ClerkProvider publishableKey={CLERK_PUBLISHABLE_KEY!} tokenCache={tokenCache}>
  <ClerkLoaded>
    {/* existing providers (ThemeProvider, QueryClientProvider, etc.) and <RootLayoutNav /> */}
  </ClerkLoaded>
</ClerkProvider>
```

- [ ] **Step 3: Sync Clerk getToken to module ref**

In `RootLayoutNav` (which is inside ClerkProvider's tree), add:

```typescript
const { getToken } = useClerkAuth();

useEffect(() => {
  setTokenGetter(getToken);
}, [getToken]);
```

This ensures `getClerkToken()` in `api-config.ts` always has a fresh token getter.

- [ ] **Step 4: Remove Firebase auth initialization**

Remove any `initializeAuth()` call from `appleAuth.ts` and the Firebase auth `require` statement.

- [ ] **Step 5: Update Sentry user context**

Change the Sentry user sync from Firebase userId to Clerk:
```typescript
// Before: if (userId) Sentry.setUser({ id: userId });
// The useAuth hook (Task 4) will return Clerk userId — just keep the sync as-is
```

- [ ] **Step 6: Add EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY to .env**

Create or update `.env` in the mobile project root:
```
EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_your_key_here
```

Also add to EAS secrets for production builds:
```bash
eas secret:create --name EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY --value "pk_live_your_key_here" --scope project
```

(Replace with actual Clerk publishable key from Clerk dashboard)

- [ ] **Step 7: Verify no type errors**

```bash
npx tsc --noEmit 2>&1 | grep "_layout" | head -10
```

- [ ] **Step 8: Commit**

```bash
git add src/app/_layout.tsx .env
git commit -m "feat: wrap app in ClerkProvider, sync token getter ref"
```

---

### Task 4: Mobile — Rewrite useAuth hook for Clerk

**Files:**
- Modify: `src/hooks/useAuth.ts`

- [ ] **Step 1: Read the current useAuth.ts**

Read `/Users/galangster/clawd/work/unfold/app/mobile/src/hooks/useAuth.ts` (289 lines). Note every field in the return value and every side effect (Zustand sync, RevenueCat, Sentry).

- [ ] **Step 2: Rewrite the hook**

Replace the entire file with:

```typescript
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
    if (provider === 'oauth_apple' || provider === 'apple') return 'apple';
    if (provider === 'oauth_google' || provider === 'google') return 'google';
    if (provider === 'oauth_facebook' || provider === 'facebook') return 'facebook';
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
      updateUser({
        authUserId: newUserId,
        authProvider,
        authEmail: email,
        authDisplayName: displayName,
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
```

- [ ] **Step 3: Verify no type errors**

```bash
npx tsc --noEmit 2>&1 | grep "useAuth" | head -10
```

- [ ] **Step 4: Commit**

```bash
git add src/hooks/useAuth.ts
git commit -m "feat: rewrite useAuth hook for Clerk

Replace Firebase onAuthStateChanged with Clerk useAuth/useUser.
Syncs to Zustand store, RevenueCat, and Sentry on user change.
Same return interface for all consumers."
```

---

### Task 5: Mobile — Update getAuthHeaders in api-config.ts

**Files:**
- Modify: `src/lib/api-config.ts`

- [ ] **Step 1: Read the current api-config.ts**

Read `/Users/galangster/clawd/work/unfold/app/mobile/src/lib/api-config.ts` (110 lines).

- [ ] **Step 2: Replace getAuthHeaders**

Replace the Firebase-based `getAuthHeaders` function with:

```typescript
import { getClerkToken } from '@/lib/clerk';

export async function getAuthHeaders(
  _forceRefresh = false,
): Promise<Record<string, string>> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  try {
    const token = await getClerkToken();
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
  } catch {
    // No token available — guest mode, requests will get 401 on protected endpoints
  }

  return headers;
}
```

Remove the Firebase auth `require` statement:
```typescript
// DELETE: const auth = require('@react-native-firebase/auth').default;
```

Keep `sanitizeForPrompt()` and all other exports unchanged.

- [ ] **Step 3: Verify no type errors**

```bash
npx tsc --noEmit 2>&1 | grep "api-config" | head -10
```

- [ ] **Step 4: Commit**

```bash
git add src/lib/api-config.ts
git commit -m "feat: getAuthHeaders uses Clerk token instead of Firebase"
```

---

### Task 6: Mobile — Rewrite sign-in screen with 3 OAuth providers

**Files:**
- Modify: `src/app/(onboarding)/sign-in.tsx`

- [ ] **Step 1: Read the current sign-in.tsx**

Read `/Users/galangster/clawd/work/unfold/app/mobile/src/app/(onboarding)/sign-in.tsx` (602 lines). Note the layout structure, animations, and navigation.

- [ ] **Step 2: Replace auth imports and add Clerk OAuth**

Remove:
```typescript
import { signInWithApple, signInAnonymously } from '@/lib/appleAuth';
```

Add:
```typescript
import { useOAuth, useAuth as useClerkAuth } from '@clerk/clerk-expo';
import * as WebBrowser from 'expo-web-browser';
import { continueAsGuest } from '@/lib/clerk';

WebBrowser.maybeCompleteAuthSession();
```

- [ ] **Step 3: Add OAuth hooks inside the component**

At the top of the component function:

```typescript
const { startOAuthFlow: startAppleFlow } = useOAuth({ strategy: 'oauth_apple' });
const { startOAuthFlow: startGoogleFlow } = useOAuth({ strategy: 'oauth_google' });
const { startOAuthFlow: startFacebookFlow } = useOAuth({ strategy: 'oauth_facebook' });
```

- [ ] **Step 4: Replace sign-in handler**

Replace the `handleAppleSignIn` function with a generic OAuth handler:

```typescript
const [isSigningIn, setIsSigningIn] = useState(false);
const [error, setError] = useState<string | null>(null);

const handleOAuthSignIn = useCallback(
  async (
    startFlow: typeof startAppleFlow,
    providerName: string,
  ) => {
    if (isSigningIn) return;
    setIsSigningIn(true);
    setError(null);

    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

      const { createdSessionId, setActive } = await startFlow({
        redirectUrl: 'unfold://oauth-callback',
      });

      if (createdSessionId && setActive) {
        await setActive({ session: createdSessionId });
        // useAuth hook will sync to Zustand + RevenueCat automatically
        router.replace('/(tabs)/(today)');
      }
    } catch (err: any) {
      logger.error(`[SignIn] ${providerName} OAuth error:`, err);

      if (err?.errors?.[0]?.code === 'session_exists') {
        router.replace('/(tabs)/(today)');
        return;
      }

      // User cancelled — silent
      if (
        err?.errors?.[0]?.code === 'user_cancelled' ||
        err?.message?.includes('cancelled')
      ) {
        setIsSigningIn(false);
        return;
      }

      setError(
        err?.errors?.[0]?.longMessage ??
          "We couldn't reach our servers. Please check your connection.",
      );
    } finally {
      setIsSigningIn(false);
    }
  },
  [isSigningIn, router],
);

const handleGuestMode = useCallback(() => {
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  continueAsGuest();
  router.replace('/(tabs)/(today)');
}, [router]);
```

- [ ] **Step 5: Replace the button JSX**

Replace the Apple Sign In button with three equal buttons + guest link. Keep existing layout patterns (SafeAreaView, scroll, animations):

```tsx
{/* OAuth Buttons */}
<View style={styles.authButtons}>
  <TouchableOpacity
    style={[styles.oauthButton, styles.appleButton]}
    onPress={() => handleOAuthSignIn(startAppleFlow, 'Apple')}
    activeOpacity={0.8}
    disabled={isSigningIn}
  >
    <AppleLogo size={20} color="#FFFFFF" weight="fill" />
    <Text style={[styles.oauthButtonText, { color: '#FFFFFF' }]}>
      Sign in with Apple
    </Text>
  </TouchableOpacity>

  <TouchableOpacity
    style={[styles.oauthButton, styles.googleButton]}
    onPress={() => handleOAuthSignIn(startGoogleFlow, 'Google')}
    activeOpacity={0.8}
    disabled={isSigningIn}
  >
    <GoogleLogo size={20} color="#1F1F1F" weight="bold" />
    <Text style={[styles.oauthButtonText, { color: '#1F1F1F' }]}>
      Sign in with Google
    </Text>
  </TouchableOpacity>

  <TouchableOpacity
    style={[styles.oauthButton, styles.facebookButton]}
    onPress={() => handleOAuthSignIn(startFacebookFlow, 'Facebook')}
    activeOpacity={0.8}
    disabled={isSigningIn}
  >
    <FacebookLogo size={20} color="#FFFFFF" weight="fill" />
    <Text style={[styles.oauthButtonText, { color: '#FFFFFF' }]}>
      Sign in with Facebook
    </Text>
  </TouchableOpacity>
</View>

{/* Guest link */}
<TouchableOpacity
  onPress={handleGuestMode}
  style={styles.guestLink}
  activeOpacity={0.6}
>
  <Text style={[styles.guestLinkText, { color: colors.textMuted }]}>
    Continue as Guest
  </Text>
</TouchableOpacity>

{/* Error message */}
{error && (
  <Text style={[styles.errorText, { color: colors.error }]}>
    {error}
  </Text>
)}
```

- [ ] **Step 6: Add button styles**

Add to the StyleSheet:

```typescript
authButtons: {
  gap: 14,
  width: '100%',
  paddingHorizontal: 24,
},
oauthButton: {
  flexDirection: 'row',
  alignItems: 'center',
  justifyContent: 'center',
  height: 52,
  borderRadius: 12,
  gap: 10,
},
appleButton: {
  backgroundColor: '#000000',
},
googleButton: {
  backgroundColor: '#FFFFFF',
},
facebookButton: {
  backgroundColor: '#1877F2',
},
oauthButtonText: {
  fontFamily: FontFamily.uiSemiBold,
  fontSize: 16,
},
guestLink: {
  paddingVertical: 16,
  alignItems: 'center',
},
guestLinkText: {
  fontFamily: FontFamily.ui,
  fontSize: 14,
},
errorText: {
  fontFamily: FontFamily.body,
  fontSize: 13,
  textAlign: 'center',
  paddingHorizontal: 24,
  marginTop: 8,
},
```

- [ ] **Step 7: Add phosphor icon imports**

Add to imports (if not already present):

```typescript
import { AppleLogo, GoogleLogo, FacebookLogo } from 'phosphor-react-native';
```

Note: Check if `GoogleLogo` and `FacebookLogo` exist in phosphor-react-native. If not, use generic icons or inline SVG components for brand logos.

- [ ] **Step 8: Verify no type errors**

```bash
npx tsc --noEmit 2>&1 | grep "sign-in" | head -10
```

- [ ] **Step 9: Commit**

```bash
git add src/app/\(onboarding\)/sign-in.tsx
git commit -m "feat: sign-in screen with Apple, Google, Facebook OAuth + guest mode"
```

---

### Task 7: Mobile — Update onboarding.tsx, generating.tsx, settings.tsx

**Files:**
- Modify: `src/app/onboarding.tsx`
- Modify: `src/app/generating.tsx`
- Modify: `src/app/(tabs)/(you)/settings.tsx`

- [ ] **Step 1: Fix onboarding.tsx — remove Firebase imports and early auth**

Read `src/app/onboarding.tsx`. Make these changes:

1. Remove the import (line 36):
```typescript
// DELETE:
import { signInWithApple, signInAnonymously } from '@/lib/appleAuth';
```

2. Add Clerk imports:
```typescript
import { useOAuth } from '@clerk/clerk-expo';
import * as WebBrowser from 'expo-web-browser';
import { continueAsGuest } from '@/lib/clerk';

WebBrowser.maybeCompleteAuthSession();
```

3. Remove the `useEffect` that creates an anonymous Firebase user for backend auth (lines 350-366). The adaptive-question endpoint is now public, so no early auth is needed:
```typescript
// DELETE this entire useEffect:
useEffect(() => {
  const ensureAuth = async () => {
    try {
      const auth = require('@react-native-firebase/auth').default;
      if (!auth().currentUser) {
        await signInAnonymously();
        ...
      }
    } catch { ... }
  };
  ensureAuth();
}, []);
```

4. Replace `handleOnboardingAppleSignIn` (lines 762-831) with a Clerk OAuth handler. Add the OAuth hook at the top of the component:
```typescript
const { startOAuthFlow: startAppleFlow } = useOAuth({ strategy: 'oauth_apple' });
```

Then replace the handler:
```typescript
const handleOnboardingAppleSignIn = useCallback(async () => {
  if (isSigningIn) return;

  setIsSigningIn(true);
  setSignInError(null);
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  Analytics.logEvent(AnalyticsEvents.SIGN_IN_APPLE_TAPPED);

  try {
    const { createdSessionId, setActive } = await startAppleFlow({
      redirectUrl: 'unfold://oauth-callback',
    });

    if (createdSessionId && setActive) {
      await setActive({ session: createdSessionId });

      Analytics.logEvent(AnalyticsEvents.SIGN_IN_SUCCESS, { auth_provider: 'apple' });

      // useAuth hook will sync userId to Zustand, RevenueCat, Sentry automatically.
      // But store auth data in ref so completeOnboarding can pick it up immediately.
      const authData: Partial<UserProfile> = {
        hasSeenSignInPrompt: true,
      };
      pendingAuthDataRef.current = authData;
      updateUser(authData);

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      advanceToNextStep();
    }
  } catch (err: any) {
    // User cancelled — silent
    if (err?.errors?.[0]?.code === 'user_cancelled' || err?.message?.includes('cancelled')) {
      setIsSigningIn(false);
      return;
    }

    Analytics.logEvent(AnalyticsEvents.SIGN_IN_ERROR, {
      auth_provider: 'apple',
      error_type: err?.errors?.[0]?.code || 'unknown',
    });

    setSignInError(
      err?.errors?.[0]?.longMessage ?? 'Unable to sign in. Please try again.'
    );
  } finally {
    setIsSigningIn(false);
  }
}, [isSigningIn, updateUser, advanceToNextStep, startAppleFlow]);
```

5. Replace `handleSkipSignIn` (lines 834-874) with a local-only guest handler:
```typescript
const handleSkipSignIn = useCallback(async () => {
  if (isSigningIn) return;

  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  Analytics.logEvent(AnalyticsEvents.SIGN_IN_SKIPPED);

  // Set up local-only guest mode (no Firebase, no Clerk)
  continueAsGuest(); // sets authUserId = 'local-{timestamp}', authProvider = 'guest'

  const skipData: Partial<UserProfile> = {
    hasSeenSignInPrompt: true,
    signInPromptCount: (existingUser?.signInPromptCount ?? 0) + 1,
  };

  pendingAuthDataRef.current = skipData;
  updateUser(skipData);

  logger.log('[Onboarding] User skipped sign-in during onboarding');
  advanceToNextStep();
}, [isSigningIn, updateUser, existingUser?.signInPromptCount, advanceToNextStep]);
```

- [ ] **Step 2: Fix generating.tsx**

Read `src/app/generating.tsx`. Find and remove:

1. The `require('@react-native-firebase/auth')` usage (~line 867)
2. Replace any Firebase auth state check with the Clerk-based `useAuth()` hook:

```typescript
import { useAuth } from '@/hooks/useAuth';
// Inside component:
const { isAnonymous, shouldShowSignInPrompt } = useAuth();
```

- [ ] **Step 3: Fix settings.tsx**

Read `src/app/(tabs)/(you)/settings.tsx`. Find and replace:

1. Remove `import { getCurrentUser } from '@/lib/appleAuth'` (~line 29)
2. Use Clerk's `useUser()` or the app's `useAuth()` hook instead:

```typescript
import { useAuth } from '@/hooks/useAuth';
// Inside component:
const { email, authDisplayName, authProvider } = useAuth();
```

Replace any `getCurrentUser()` calls with the hook values.

- [ ] **Step 4: Verify no type errors**

```bash
npx tsc --noEmit 2>&1 | grep -E "onboarding|generating|settings" | head -20
```

- [ ] **Step 5: Commit**

```bash
git add src/app/onboarding.tsx src/app/generating.tsx src/app/\(tabs\)/\(you\)/settings.tsx
git commit -m "fix: remove Firebase auth references from onboarding, generating, settings"
```

---

### Task 8: Mobile — Update DeleteAccountSheet for Clerk

**Files:**
- Modify: `src/components/DeleteAccountSheet.tsx`

- [ ] **Step 1: Read the current file**

Read `src/components/DeleteAccountSheet.tsx` (446 lines). Note the two-step confirmation flow and what `deleteAccount()` does.

- [ ] **Step 2: Replace Firebase imports with Clerk**

Remove:
```typescript
import { deleteAccount, getCurrentUser } from '@/lib/appleAuth';
```

Add:
```typescript
import { useUser, useClerk } from '@clerk/clerk-expo';
```

- [ ] **Step 3: Replace the deletion logic**

Inside the component, add Clerk hooks:
```typescript
const { user: clerkUser } = useUser();
const { signOut } = useClerk();
```

Replace the delete handler's auth call:

```typescript
// Before: await deleteAccount();
// After:
if (clerkUser) {
  await clerkUser.delete();
}
await signOut();
```

Keep the existing Zustand/MMKV cleanup and navigation logic.

- [ ] **Step 4: Verify no type errors**

```bash
npx tsc --noEmit 2>&1 | grep "DeleteAccount" | head -10
```

- [ ] **Step 5: Commit**

```bash
git add src/components/DeleteAccountSheet.tsx
git commit -m "feat: DeleteAccountSheet uses Clerk user.delete() instead of Firebase"
```

---

### Task 9: Mobile — Store migration v24

**Files:**
- Modify: `src/lib/store.ts`

- [ ] **Step 1: Read the store migration area**

Read `src/lib/store.ts` around lines 140-157 (UserProfile type) and lines 1590-1830 (persist version and migrations).

- [ ] **Step 2: Update UserProfile type**

Find (around line 146):
```typescript
authProvider?: 'apple' | 'anonymous' | null;
```

Replace with:
```typescript
authProvider?: 'apple' | 'google' | 'facebook' | 'guest' | null;
```

- [ ] **Step 3: Bump persist version**

Find (around line 1592):
```typescript
version: 23,
```

Replace with:
```typescript
version: 24,
```

- [ ] **Step 4: Add v24 migration**

In the `migrate` function, find the last migration block (`if (version < 23)`) and add after it:

```typescript
if (version < 24) {
  // Rename 'anonymous' auth provider to 'guest' for Clerk migration
  if (state.authProvider === 'anonymous') {
    state.authProvider = 'guest';
  }
}
```

- [ ] **Step 5: Verify no type errors**

```bash
npx tsc --noEmit 2>&1 | grep "store" | head -10
```

- [ ] **Step 6: Commit**

```bash
git add src/lib/store.ts
git commit -m "feat: store v24 — migrate authProvider 'anonymous' to 'guest' for Clerk"
```

---

### Task 10: Mobile — Delete appleAuth.ts and clean up Firebase deps

**Files:**
- Delete: `src/lib/appleAuth.ts`
- Modify: `package.json`
- Modify: `app.json` (conditional)

- [ ] **Step 1: Delete appleAuth.ts**

```bash
cd /Users/galangster/clawd/work/unfold/app/mobile
rm src/lib/appleAuth.ts
```

- [ ] **Step 2: Search for any remaining references**

```bash
grep -r "appleAuth" src/ --include="*.ts" --include="*.tsx" -l
```

Expected: No results (all imports should have been updated in Tasks 3-8). If any remain, fix them.

- [ ] **Step 3: Remove Firebase auth dependency**

```bash
bun remove @react-native-firebase/auth
```

- [ ] **Step 4: Check if Firebase app is still needed**

```bash
grep -r "@react-native-firebase" src/ --include="*.ts" --include="*.tsx" -l
```

If only `mockFirebaseAnalytics.ts` remains (or nothing), remove Firebase app too:
```bash
bun remove @react-native-firebase/app
```

If other Firebase services are in use, keep `@react-native-firebase/app`.

- [ ] **Step 5: Update app.json (if removing Firebase)**

If `@react-native-firebase/app` was removed, edit `app.json`:

1. Remove from `plugins` array:
```json
"@react-native-firebase/app"
```

2. Remove from `ios` section:
```json
"googleServicesFile": "./GoogleService-Info.plist"
```

3. Confirm `scheme` is present for OAuth callbacks:
```json
"scheme": "unfold"
```

- [ ] **Step 6: Verify the full project builds**

```bash
npx tsc --noEmit 2>&1 | head -30
```

Expected: No new errors.

- [ ] **Step 7: Commit**

```bash
git add package.json bun.lock app.json
git commit -m "chore: delete appleAuth.ts, remove Firebase auth dependencies

- Delete src/lib/appleAuth.ts (replaced by src/lib/clerk.ts)
- Remove @react-native-firebase/auth from package.json
- Update app.json to remove Firebase plugin (if no other Firebase services)"
```

Note: `src/lib/appleAuth.ts` deletion was staged in Step 1 via `rm` — verify it shows as deleted in `git status` before committing.

---

### Task 11: Integration verification

**Files:** None (verification only)

- [ ] **Step 1: Full type check**

```bash
cd /Users/galangster/clawd/work/unfold/app/mobile
npx tsc --noEmit
```

Expected: No errors in any auth-related files.

- [ ] **Step 2: Build the app**

```bash
npx expo run:ios --device "iPhone 17 Pro"
```

Wait for successful build.

- [ ] **Step 3: Test sign-in screen**

Take a screenshot to verify the three OAuth buttons and guest link appear:

```bash
xcrun simctl io "iPhone 17 Pro" screenshot /tmp/sim_signin.png && sips -Z 1000 /tmp/sim_signin.png
```

Verify:
- Three equal buttons (Apple, Google, Facebook) are visible
- "Continue as Guest" text link is below the buttons
- No Firebase-related crashes on launch

- [ ] **Step 4: Test guest mode**

Tap "Continue as Guest" — verify app navigates to home and core reading works. API calls to protected endpoints should show "Sign in to unlock" prompts.

- [ ] **Step 5: Test Apple Sign In (requires Clerk dashboard setup)**

Only possible after Clerk project is configured with Apple provider. Tap "Sign in with Apple" — verify OAuth flow completes and user is authenticated.

- [ ] **Step 6: Commit verification screenshot**

```bash
git add -A
git commit -m "verify: Clerk auth migration — sign-in screen with 3 providers + guest mode"
```
