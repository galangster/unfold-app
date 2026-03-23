# Clerk Auth Migration — Design Spec

**Date:** 2026-03-22
**Status:** Draft
**Scope:** Replace Firebase Auth with Clerk across Unfold mobile app and backend

---

## Goal

Migrate Unfold's authentication from Firebase Auth to Clerk. Add Google and Facebook sign-in alongside Apple. Keep local-only guest mode. Use Clerk user IDs as the universal identity — no Firebase UID migration.

## Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Guest/anonymous auth | Local-only mode (no server identity) | Clerk has no anonymous auth; local-only already exists as fallback |
| Firebase UID migration | Fresh start — no mapping | Pre-launch app, minimal production data |
| OAuth providers | Apple + Google + Facebook | Broad coverage; all equal on sign-in screen |
| RevenueCat identity | Clerk user ID | Clean break; Apple receipt restoration handles edge cases |
| Onboarding auth gap | Make adaptive-question endpoint public | Guests in onboarding need AI before signing in |
| Account deletion | Replace with Clerk `user.delete()` | App Store requirement; feature exists today, can't regress |
| Store migration | Bump to v24 (from v23), map `'anonymous'` → `'guest'` | Prevents stale persisted values from causing bugs |

## Architecture

### Auth Flow (Signed In)

```
User taps Apple/Google/Facebook
  → Clerk OAuth flow (expo-web-browser for Google/Facebook, native for Apple)
  → Clerk creates session
  → useAuth() returns { userId, getToken }
  → API calls: Authorization: Bearer <clerk-session-token>
  → Backend verifies token with Clerk secret key
  → req.uid = Clerk user ID
  → Rate limiting, usage tracking unchanged
```

### Auth Flow (Guest)

```
User taps "Continue as Guest"
  → authUserId = "local-{timestamp}"
  → authProvider = "guest"
  → No auth token sent
  → Backend returns 401 on protected endpoints
  → App shows "Sign in to unlock" prompt
  → Core reading experience works from local Zustand store
```

### Onboarding Auth Strategy

The onboarding flow calls the adaptive-question API endpoint before the user has signed in. Since Clerk has no anonymous auth, the adaptive-question endpoint will be made public (no auth required) with IP-based rate limiting only. This is acceptable because:
- The endpoint is low-cost (cheap AI tier)
- It's called a small number of times during onboarding
- IP rate limiting prevents abuse
- No user data is read or written

## Mobile App Changes

### New Dependencies

| Package | Purpose |
|---------|---------|
| `@clerk/clerk-expo` | Clerk SDK for Expo |

### Already Installed (confirm present)

| Package | Purpose |
|---------|---------|
| `expo-web-browser` (v55.0.9) | OAuth redirect flows (Google, Facebook) |
| `expo-secure-store` | Token cache for Clerk |

### Dependencies to Remove

| Package | Reason |
|---------|--------|
| `@react-native-firebase/auth` | Replaced by Clerk |
| `@react-native-firebase/app` | Remove ONLY if no other Firebase services (analytics, crashlytics) are in use |

### Files to Create

**`src/lib/clerk.ts`** — Clerk initialization and token helpers

Responsibilities:
- Export `tokenCache` using `expo-secure-store` for Clerk's token persistence
- Export sign-in helpers: `signInWithApple()`, `signInWithGoogle()`, `signInWithFacebook()` — each triggers Clerk's OAuth flow via `useOAuth()` hook
- Export `signOut()` — calls `clerk.signOut()`, clears Zustand auth state, calls `Purchases.logOut()`
- Export `continueAsGuest()` — sets local-only auth state in Zustand, no Clerk interaction
- Export `deleteAccount()` — calls Clerk `user.delete()`, clears all local state, navigates to sign-in

**Token retrieval pattern:** Since `getToken()` is only available via Clerk's `useAuth()` hook (React context), it cannot be called from non-React service files directly. The pattern is:
1. In `_layout.tsx`, use `useAuth().getToken` and store it in a module-level ref via `src/lib/clerk.ts`
2. `getAuthHeaders()` in `api-config.ts` reads from that ref
3. The ref is updated on every render of the root layout (always fresh)

```typescript
// src/lib/clerk.ts
let _getToken: (() => Promise<string | null>) | null = null;

export function setTokenGetter(fn: () => Promise<string | null>) {
  _getToken = fn;
}

export async function getClerkToken(): Promise<string | null> {
  return _getToken ? _getToken() : null;
}

// src/app/_layout.tsx (inside component)
const { getToken } = useAuth();
useEffect(() => {
  setTokenGetter(getToken);
}, [getToken]);
```

### Files to Modify

**`src/app/_layout.tsx`**
- Wrap app in `<ClerkProvider publishableKey={process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY} tokenCache={tokenCache}>`
- Remove Firebase auth initialization
- Sync Clerk `getToken` ref to `clerk.ts` module (see token pattern above)
- Keep Sentry user context sync (use Clerk userId instead)

**`src/hooks/useAuth.ts`**
- Replace Firebase `onAuthStateChanged` listener with Clerk's `useAuth()` and `useUser()` hooks
- Full return interface:
  ```typescript
  {
    userId: string | null,           // Clerk user ID or local-{timestamp}
    email: string | null,            // From Clerk user
    authProvider: 'apple' | 'google' | 'facebook' | 'guest' | null,
    authDisplayName: string | null,  // From Clerk user profile
    isAuthenticated: boolean,        // !!userId
    isAnonymous: boolean,            // authProvider === 'guest'
    isLoading: boolean,              // Maps to Clerk's !isLoaded — prevents content flash during auth init
    shouldShowSignInPrompt: boolean, // Kept as-is (prompt guest users to sign in)
    recordSignInPrompt: () => void,  // Kept as-is
    signInPromptCount: number,       // Kept as-is
  }
  ```
- `authProvider` derived from Clerk user's primary external account provider, or `'guest'` for local-only
- On auth state change: sync to Zustand store, call `Purchases.logIn(clerkUserId)` or `Purchases.logOut()`

**`src/lib/api-config.ts`**
- `getAuthHeaders()` calls `getClerkToken()` from `clerk.ts` instead of Firebase's `getIdToken()`
- Same return type: `{ Authorization: string, 'Content-Type': string }`
- Same fallback: if no token (guest mode), return headers without Authorization
- `sanitizeForPrompt()` — unchanged

**`src/app/(onboarding)/sign-in.tsx`**
- Remove imports of `signInWithApple`, `signInAnonymously` from `@/lib/appleAuth`
- Replace single Apple Sign In button with three equal OAuth buttons:
  1. "Sign in with Apple" — uses `useOAuth({ strategy: 'oauth_apple' })`
  2. "Sign in with Google" — uses `useOAuth({ strategy: 'oauth_google' })`
  3. "Sign in with Facebook" — uses `useOAuth({ strategy: 'oauth_facebook' })`
- Keep "Continue as Guest" text link below
- Each button triggers Clerk's OAuth flow, handles success/error
- On success: navigate to `(tabs)/(today)`
- Error handling: show user-friendly messages for network issues, cancelled flow, account conflicts

**`src/app/onboarding.tsx`**
- Remove `require('@react-native-firebase/auth').default` (line 356)
- Remove imports of `signInWithApple`, `signInAnonymously` from `@/lib/appleAuth`
- The anonymous-user-creation step is no longer needed — the adaptive-question endpoint will be public
- Remove the Firebase auth sign-in logic during onboarding
- API calls to adaptive-question will work without auth (endpoint made public on backend)

**`src/app/generating.tsx`**
- Remove `require('@react-native-firebase/auth')` usage (line 867)
- Replace Firebase auth state check with Clerk's `useAuth()` to determine if user should see sign-in prompt after generation

**`src/app/(tabs)/(you)/settings.tsx`**
- Replace `getCurrentUser` import from `@/lib/appleAuth` with Clerk's `useUser()` hook
- Display user info (email, name) from Clerk user object instead of Firebase user

**`src/components/DeleteAccountSheet.tsx`**
- Replace `deleteAccount` and `getCurrentUser` imports from `@/lib/appleAuth`
- Use Clerk's `user.delete()` method to delete the account
- Clear Zustand store, RevenueCat, and navigate to sign-in screen after deletion
- Keep confirmation UX as-is

**`src/lib/store.ts` (Zustand)**
- Bump persist version from **v23** to **v24**
- Add migration in `version < 24` block: map `authProvider: 'anonymous'` → `'guest'`
- Update `UserProfile` type: `authProvider?: 'apple' | 'google' | 'facebook' | 'guest' | null` (was `'apple' | 'anonymous' | null`)
- Support new provider values throughout any conditional logic

**`.env` / EAS secrets**
- Add `EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY`

**`app.json`**
- Remove `@react-native-firebase/app` from plugins array (if removing Firebase entirely)
- Remove `googleServicesFile` from ios config (if removing Firebase entirely)
- Confirm existing `scheme: "unfold"` handles Clerk OAuth callbacks

### Files to Delete

**`src/lib/appleAuth.ts`** — fully replaced by Clerk's OAuth flow. All functions (`signInWithApple`, `signInAnonymously`, `getCurrentUser`, `signOut`, `linkAnonymousToApple`, `initializeAuth`, `deleteAccount`) are replaced by Clerk equivalents in `src/lib/clerk.ts` and Clerk hooks.

### Unchanged Files

All API service files (`devotional-service.ts`, `companion-service.ts`, `cartesia.ts`, `story-service.ts`, etc.) call `getAuthHeaders()` and don't need changes — the function signature and return type stay the same.

## Backend Changes

### New Dependency

| Package | Purpose |
|---------|---------|
| `@clerk/express` | Clerk middleware for Express (token verification) |

### Dependencies to Remove

| Package | Reason |
|---------|--------|
| `firebase-admin` | Replaced by Clerk |

### Files to Modify

**`src/index.ts`**

1. **Initialization** (lines 26-67): Replace Firebase Admin SDK init with Clerk
   ```typescript
   import { clerkMiddleware, requireAuth, getAuth } from '@clerk/express';

   // Apply Clerk middleware globally (reads CLERK_SECRET_KEY from env)
   app.use(clerkMiddleware());
   ```

2. **Auth middleware** (lines 131-182): Replace with Clerk-based middleware
   ```typescript
   function authMiddleware(req, res, next) {
     // Dev mode fallback
     if (process.env.NODE_ENV !== 'production' && !req.headers.authorization) {
       req.uid = 'dev-user';
       return next();
     }

     const auth = getAuth(req);
     if (!auth?.userId) {
       return res.status(401).json({
         error: { code: 'UNAUTHENTICATED', message: 'Missing authorization token' }
       });
     }

     req.uid = auth.userId;
     next();
   }
   ```

3. **Adaptive-question endpoint**: Remove `authMiddleware` from this route (make public, keep IP rate limiting)

4. **Request type extension**: `req.uid` stays as `string` — just holds Clerk user ID now

### Environment Variables

| Variable | Action | Where |
|----------|--------|-------|
| `CLERK_SECRET_KEY` | Add | Railway env vars |
| `CLERK_PUBLISHABLE_KEY` | Add | Railway env vars (needed by `@clerk/express`) |
| `FIREBASE_SERVICE_ACCOUNT_JSON` | Remove | Railway env vars (only if no other Firebase services) |

### Unchanged

- Rate limiting — uses `req.uid` (interface unchanged)
- AI usage tracking — stores Clerk user IDs in `uid` column (same schema)
- Error response format — 401/429 status codes unchanged
- All endpoint routes — unchanged
- Database schema — no migrations needed

## Sign-In Screen Design

```
┌─────────────────────────────┐
│                             │
│       [Unfold logo]         │
│                             │
│  ┌───────────────────────┐  │
│  │  Sign in with Apple  │  │
│  └───────────────────────┘  │
│                             │
│  ┌───────────────────────┐  │
│  │  Sign in with Google  │  │
│  └───────────────────────┘  │
│                             │
│  ┌───────────────────────┐  │
│  │ Sign in with Facebook │  │
│  └───────────────────────┘  │
│                             │
│      Continue as Guest      │
│                             │
└─────────────────────────────┘
```

- All three buttons equal size, stacked vertically
- Apple button follows Apple HIG (dark/light variant based on theme)
- Google and Facebook use respective brand colors/logos
- "Continue as Guest" is a text link, not a button
- Spacing and typography follow existing app patterns (FontFamily.display for heading, FontFamily.ui for buttons)

## Error Handling

### Sign-In Errors

| Error | User Message |
|-------|-------------|
| Network unavailable | "We couldn't reach our servers. Please check your connection." |
| OAuth cancelled by user | (silent — return to sign-in screen) |
| Account already exists with different provider | "An account with this email already exists. Try signing in with [other provider]." |
| Clerk service unavailable | "Sign in is temporarily unavailable. You can continue as a guest." |

### API Errors (Guest Mode)

| Error | User Message |
|-------|-------------|
| 401 on AI endpoint | "Sign in to unlock this feature" (with sign-in button) |
| 401 on TTS endpoint | "Sign in to listen to devotionals" |

## Security

- Clerk session tokens are short-lived JWTs verified server-side with `CLERK_SECRET_KEY`
- No secrets in client-side env vars (`EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY` is public by design)
- OAuth nonce/PKCE handled by Clerk SDK — no manual nonce generation needed
- Token refresh handled automatically by Clerk SDK
- `sanitizeForPrompt()` input validation unchanged
- Adaptive-question endpoint (public) protected by IP rate limiting only

## Migration Sequence

1. Set up Clerk project (dashboard): enable Apple, Google, Facebook providers
2. Add Clerk env vars to Railway (backend) and `.env` / EAS secrets (mobile)
3. Backend: swap Firebase Admin → Clerk Express middleware, make adaptive-question public (deploy)
4. Mobile: swap Firebase Auth → Clerk SDK (all auth files listed above)
5. Remove Firebase Auth dependencies from both repos
6. Remove `@react-native-firebase/app` plugin from `app.json` and `googleServicesFile` (if no other Firebase services)
7. Test all three sign-in flows + guest mode + API calls + account deletion
8. Submit TestFlight build

## Out of Scope

- Email/password auth
- Firebase UID to Clerk ID data migration
- Multi-device session management
- Social profile data sync (avatar, name from social providers)
