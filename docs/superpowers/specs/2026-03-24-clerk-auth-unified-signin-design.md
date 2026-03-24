# Clerk Auth: Unified Sign-In Screen

## Problem

The onboarding flow's sign-in step (`onboarding.tsx`, step 8) only offers Apple OAuth. A dedicated sign-in screen (`(onboarding)/sign-in.tsx`) already exists with all 3 providers (Apple, Google, Facebook), benefit messaging, error handling, loading states, and "Continue as Guest." This means:

1. Users who prefer Google or Facebook cannot sign in during onboarding
2. Two separate sign-in UIs exist — one complete, one incomplete
3. The incomplete one is the first sign-in experience most users see

## Solution

Route both sign-in entry points to the existing `(onboarding)/sign-in.tsx` screen. Remove the inline Apple-only OAuth from `onboarding.tsx`. Add a `source` route parameter so the sign-in screen knows where to navigate after success or skip.

## Architecture

### Entry Points

| Entry | When | Navigation Method | Source Param |
|-------|------|-------------------|-------------|
| Onboarding step 8 | During first-run onboarding flow | `router.push` (creates back-stack entry) | `source="onboarding"` |
| Post-generation | After devotional generates, if `shouldShowSignInPrompt` is true | `router.replace` (no back to generating screen) | `source="generating"` |

### Navigation Context

Both `onboarding.tsx` (top-level route) and `(onboarding)/sign-in.tsx` (route group) live in the root `<Stack>`. There is no `(onboarding)/_layout.tsx` — it uses the default root stack. This means:

- `router.push` from `onboarding.tsx` to `/(onboarding)/sign-in` pushes onto the root stack. `router.back()` from sign-in pops back to onboarding correctly.
- `router.replace` from `generating.tsx` replaces the generating screen in the stack. Sign-in must then use `router.replace` to exit (no back-stack entry to pop).

### Exit Behavior (Context-Aware)

| Source | On Success | On Skip/Guest |
|--------|-----------|---------------|
| `"onboarding"` | `router.back()` → returns to onboarding, which auto-advances | `router.back()` → returns to onboarding, which auto-advances |
| `"generating"` | `router.replace('/(tabs)/(today)')` | `router.replace('/(tabs)/(today)')` |
| Default (no source) | `router.replace('/(tabs)/(today)')` | `router.replace('/(tabs)/(today)')` |

Both success and skip return to onboarding the same way — the user made a choice either way.

### Data Flow

```
onboarding.tsx (step 8)
  ├─ Sets awaitingSignInReturn.current = true
  └─ router.push('/(onboarding)/sign-in', { source: 'onboarding' })

generating.tsx (post-generation)
  └─ router.replace('/(onboarding)/sign-in?source=generating')
      (keeps router.replace — user should never return to generating screen)

sign-in.tsx
  ├─ useLocalSearchParams() → reads `source`
  ├─ handleOAuthSignIn() success → navigateAfterAuth()
  └─ handleGuestMode() → navigateAfterAuth()

navigateAfterAuth():
  if source === 'onboarding':
    router.back()  // pops back to onboarding.tsx in root stack
  else:
    router.replace('/(tabs)/(today)')

onboarding.tsx (on return)
  └─ useFocusEffect checks awaitingSignInReturn.current
     ├─ if true → advanceToNextStep(), reset flag
     └─ if false → no-op (normal focus events)
```

### Auto-Advance Mechanism

The onboarding screen needs to detect when the user returns from the sign-in screen and advance to the next step. The mechanism:

1. Before navigating to sign-in, set a ref flag: `awaitingSignInReturn.current = true`
2. Add a `useFocusEffect` that checks this flag when the screen regains focus
3. If flag is true: call `advanceToNextStep()` and reset flag to false
4. If flag is false: no-op (prevents double-advance on normal focus events like app backgrounding)

This is necessary because `router.back()` from sign-in simply pops the stack — it doesn't pass data back. The ref flag is the handshake.

### pendingAuthDataRef Compatibility

Currently, `onboarding.tsx` writes auth state to `pendingAuthDataRef.current` before advancing, and `saveOnboardingData()` spreads it into the final user profile (`...pendingAuth`).

After this change, auth state is written by `sign-in.tsx` directly via `updateUser()` (for success) or `continueAsGuest()` + `updateUser()` (for skip). Since `updateUser` is a Zustand shallow merge, auth fields (`hasSeenSignInPrompt`, etc.) persist in the store when `saveOnboardingData` later runs. The `pendingAuthDataRef` will be null (never set by onboarding since it no longer handles auth), so `...pendingAuth` spreads `...{}` — no conflict, no data loss.

The `pendingAuthDataRef` and its usage in `saveOnboardingData` can remain as-is. No changes needed.

## File Changes

### 1. `src/app/(onboarding)/sign-in.tsx` (modify)

- Add `useLocalSearchParams` to read `source` param
- Extract a `navigateAfterAuth` helper that branches on `source`:
  - `source === 'onboarding'`: `router.back()`
  - All other cases: `router.replace('/(tabs)/(today)')` (current behavior)
- Replace the hardcoded `router.replace('/(tabs)/(today)')` in `handleOAuthSignIn` success handler with `navigateAfterAuth()`
- Replace the hardcoded `router.replace('/(tabs)/(today)')` in `handleGuestMode` with `navigateAfterAuth()`
- ~15 lines changed

### 2. `src/app/onboarding.tsx` (modify)

- **Remove** `useOAuth` import and `startAppleFlow` hook
- **Remove** `handleOnboardingAppleSignIn` callback (~30 lines)
- **Remove** the inline Apple sign-in button and error UI in the sign-in step rendering
- **Add** `awaitingSignInReturn` ref (`useRef(false)`)
- **Add** `useFocusEffect` that checks `awaitingSignInReturn.current` — if true, calls `advanceToNextStep()` and resets flag
- **Replace** sign-in step rendering with a CTA button: "Sign in to keep your progress" that sets `awaitingSignInReturn.current = true` then calls `router.push({ pathname: '/(onboarding)/sign-in', params: { source: 'onboarding' } })`
- **Add** a "Skip for now" button below the CTA that calls the existing `handleSkipSignIn` (which calls `continueAsGuest()`, `updateUser()`, and `advanceToNextStep()`)
- **Update** the sign-in skip guard (line 524): change `existingUser?.authProvider === 'apple'` to `existingUser?.authProvider && existingUser.authProvider !== 'guest'` — skip the sign-in step if user is authenticated via ANY provider, not just Apple
- ~50 lines removed, ~25 added

### 3. `src/app/generating.tsx` (modify)

- Keep `router.replace` (not `router.push`) — user should never navigate back to the generating screen
- Add `source: 'generating'` as a query param: `router.replace('/(onboarding)/sign-in?source=generating')`
- ~1 line changed

## Known Pre-Existing Issues (Not In Scope)

- `sign-in.tsx` line 161: `AnalyticsEvents.SIGN_IN_APPLE_TAPPED` fires for all providers, not just Apple. Pre-existing bug, not caused by this change.

## Constraints

- No new files created
- No visual changes to the sign-in screen itself
- No changes to the Clerk OAuth configuration or hooks
- No changes to `useAuth.ts` or the sign-in prompt backoff logic
- `generating.tsx` keeps `router.replace` (not `push`) — no behavior change for that entry point
- Net reduction in code (removing ~30 lines of duplicate OAuth logic from onboarding)

## Out of Scope

- Redesigning the sign-in screen UI
- Adding new OAuth providers
- Changing the sign-in prompt frequency/backoff logic
- Settings screen sign-in integration (already works via separate flow)
- Fixing the analytics event name bug in sign-in.tsx
