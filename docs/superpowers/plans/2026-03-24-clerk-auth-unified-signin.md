# Clerk Auth: Unified Sign-In Screen — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Route both sign-in entry points (onboarding step 8 and post-generation) to the existing full sign-in screen, removing duplicate Apple-only OAuth from onboarding.

**Architecture:** Add a `source` route param to `sign-in.tsx` for context-aware exit navigation. Replace onboarding's inline Apple OAuth with a CTA button that pushes to the sign-in screen. Use a ref flag + `useFocusEffect` to auto-advance onboarding when the user returns.

**Tech Stack:** React Native, Expo Router v7, Clerk, TypeScript

**Spec:** `docs/superpowers/specs/2026-03-24-clerk-auth-unified-signin-design.md`

---

## File Map

No new files created. Modifications only.

- **Task 1:** Modify `src/app/(onboarding)/sign-in.tsx` — Add `source` param, context-aware navigation
- **Task 2:** Modify `src/app/onboarding.tsx` — Remove inline OAuth, add CTA + auto-advance
- **Task 3:** Modify `src/app/generating.tsx` — Add `source` param to existing route
- **Task 4:** Verification — TypeScript check + visual regression

---

### Task 1: Add context-aware navigation to sign-in screen

**Files:**
- Modify: `src/app/(onboarding)/sign-in.tsx`

**What:** Read a `source` route param. When `source === 'onboarding'`, use `router.back()` instead of `router.replace('/(tabs)/(today)')` on both success and guest skip.

- [ ] **Step 1: Add `useLocalSearchParams` and `navigateAfterAuth` helper**

In `src/app/(onboarding)/sign-in.tsx`, add `useLocalSearchParams` to the existing `expo-router` import and extract the `source` param. Add a helper function that branches navigation based on source.

At line 3, change:
```typescript
import { useRouter } from 'expo-router';
```
to:
```typescript
import { useRouter, useLocalSearchParams } from 'expo-router';
```

Inside `SignInScreen()`, after `const router = useRouter();` (line 72), add:
```typescript
const { source } = useLocalSearchParams<{ source?: string }>();
```

After the `spinnerStyle` animated style (after line 148), add:
```typescript
const navigateAfterAuth = useCallback(() => {
  if (source === 'onboarding') {
    router.back();
  } else {
    router.replace('/(tabs)/(today)');
  }
}, [source, router]);
```

- [ ] **Step 2: Replace hardcoded navigation in `handleOAuthSignIn`**

In `handleOAuthSignIn` (line 178), replace:
```typescript
          router.replace('/(tabs)/(today)');
```
with:
```typescript
          navigateAfterAuth();
```

Also in the `session_exists` catch block (line 184), replace:
```typescript
          router.replace('/(tabs)/(today)');
```
with:
```typescript
          navigateAfterAuth();
```

Update the dependency array (line 210) from:
```typescript
    [isSigningIn, router, updateUser],
```
to:
```typescript
    [isSigningIn, navigateAfterAuth, updateUser],
```

- [ ] **Step 3: Replace hardcoded navigation in `handleGuestMode`**

In `handleGuestMode` (line 225), replace:
```typescript
    router.replace('/(tabs)/(today)');
```
with:
```typescript
    navigateAfterAuth();
```

Update the dependency array (line 226) from:
```typescript
  }, [router, updateUser, userProfile?.signInPromptCount]);
```
to:
```typescript
  }, [navigateAfterAuth, updateUser, userProfile?.signInPromptCount]);
```

- [ ] **Step 4: Verify TypeScript compiles**

Run: `npx tsc --noEmit 2>&1 | grep "sign-in" | head -5`
Expected: No output (zero errors)

- [ ] **Step 5: Commit**

```bash
git add src/app/\(onboarding\)/sign-in.tsx
git commit -m "feat: add source param for context-aware navigation in sign-in screen"
```

---

### Task 2: Replace inline OAuth in onboarding with CTA button

**Files:**
- Modify: `src/app/onboarding.tsx`

**What:** Remove the `useOAuth` hook, `WebBrowser` import, `handleOnboardingAppleSignIn` callback, `isSigningIn`/`signInError` state, and the entire inline sign-in UI. Replace with a CTA button that pushes to the full sign-in screen. Add `useFocusEffect` + ref flag for auto-advance on return. Update the skip guard to check all providers, not just Apple.

- [ ] **Step 1: Remove OAuth imports and hook**

In `src/app/onboarding.tsx`:

Remove line 35:
```typescript
import * as WebBrowser from 'expo-web-browser';
```

Remove line 36:
```typescript
import { useOAuth } from '@clerk/clerk-expo';
```

Remove line 61:
```typescript
WebBrowser.maybeCompleteAuthSession();
```

Remove line 461:
```typescript
  const { startOAuthFlow: startAppleFlow } = useOAuth({ strategy: 'oauth_apple' });
```

- [ ] **Step 2: Remove sign-in state and add auto-advance ref**

Remove lines 409-410:
```typescript
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [signInError, setSignInError] = useState<string | null>(null);
```

After the `pendingAuthDataRef` declaration (line 416), add:
```typescript
  const awaitingSignInReturn = useRef(false);
```

- [ ] **Step 3: Add useFocusEffect import and auto-advance logic**

At line 18, add `useFocusEffect` to the existing `expo-router` import:
```typescript
import { useRouter, useFocusEffect } from 'expo-router';
```

After the `awaitingSignInReturn` ref, add:
```typescript
  useFocusEffect(
    useCallback(() => {
      if (awaitingSignInReturn.current) {
        awaitingSignInReturn.current = false;
        advanceToNextStep();
      }
    }, [advanceToNextStep])
  );
```

Note: `advanceToNextStep` is defined later in the file (line ~718). This is fine — `useFocusEffect` with `useCallback` captures the latest ref. The callback will only fire when the screen regains focus after being pushed off-screen by the sign-in screen. It won't fire on initial mount because `awaitingSignInReturn.current` starts as `false`.

- [ ] **Step 4: Remove `handleOnboardingAppleSignIn` callback**

Delete the entire `handleOnboardingAppleSignIn` callback (lines 748-794):
```typescript
  // Handle Apple Sign In during onboarding (via Clerk OAuth)
  const handleOnboardingAppleSignIn = useCallback(async () => {
    ...
  }, [isSigningIn, updateUser, advanceToNextStep, startAppleFlow]);
```

- [ ] **Step 5: Update `handleSkipSignIn` — remove `isSigningIn` references**

In `handleSkipSignIn` (line 797), remove the `isSigningIn` guard:
```typescript
    if (isSigningIn) return;
```

Also update the dependency array at line 816, from:
```typescript
  }, [isSigningIn, updateUser, existingUser?.signInPromptCount, advanceToNextStep]);
```
to:
```typescript
  }, [updateUser, existingUser?.signInPromptCount, advanceToNextStep]);
```

The `isSigningIn` state no longer exists after Step 2. The rest of `handleSkipSignIn` (calling `continueAsGuest()`, `updateUser()`, `advanceToNextStep()`) stays exactly as-is — including `pendingAuthDataRef.current = skipData` at line 811, which is intentionally preserved for `saveOnboardingData` compatibility.

- [ ] **Step 6: Update the sign-in skip guard to check all providers**

At line 524, change:
```typescript
      if (step.id === 'signIn' && existingUser?.authProvider === 'apple') {
```
to:
```typescript
      if (step.id === 'signIn' && existingUser?.authProvider && existingUser.authProvider !== 'guest') {
```

- [ ] **Step 7: Update `shouldShowContinue` for sign-in step**

The existing guard at line 648 already hides the Continue button for sign-in steps:
```typescript
    if (step.type === 'signIn') {
      return false;
    }
```

This stays as-is. The sign-in step's own CTA and Skip buttons handle navigation.

- [ ] **Step 8: Replace the sign-in step rendering**

Replace the entire sign-in step rendering block (lines 2322-2503) with a simplified CTA:

```typescript
    // Sign-in step: CTA button to full sign-in screen
    if (step.type === 'signIn') {
      return (
        <View style={{ gap: 32, marginTop: 8 }}>
          {/* Benefits list */}
          <View style={{ gap: 20, paddingHorizontal: 4 }}>
            {[
              {
                icon: <CloudIcon size={20} color={colors.accent} weight="light" />,
                title: 'Sync across devices',
                description: 'Pick up where you left off on any device',
              },
              {
                icon: <ShieldIcon size={20} color={colors.accent} weight="light" />,
                title: 'Secure backup',
                description: 'Never lose your devotionals or journal',
              },
              {
                icon: <SparkleIcon size={20} color={colors.accent} weight="light" />,
                title: 'Personalized experience',
                description: 'Unlock features tailored to where you are',
              },
            ].map((benefit, index) => (
              <Animated.View
                key={benefit.title}
                entering={FadeIn.delay(200 + index * 150).duration(500)}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 16,
                }}
              >
                <View style={{
                  width: 44,
                  height: 44,
                  borderRadius: Radius.md,
                  backgroundColor: colors.inputBackground,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}>
                  {benefit.icon}
                </View>
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={{
                    fontFamily: FontFamily.uiSemiBold,
                    fontSize: 15,
                    color: colors.text,
                    letterSpacing: -0.2,
                  }}>
                    {benefit.title}
                  </Text>
                  <Text style={{
                    fontFamily: FontFamily.ui,
                    fontSize: 13,
                    color: colors.textMuted,
                    lineHeight: 18,
                  }}>
                    {benefit.description}
                  </Text>
                </View>
              </Animated.View>
            ))}
          </View>

          {/* Sign in CTA — navigates to full sign-in screen */}
          <Animated.View entering={FadeIn.delay(650).duration(400)}>
            <TouchableOpacity activeOpacity={0.7}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                awaitingSignInReturn.current = true;
                router.push({
                  pathname: '/(onboarding)/sign-in',
                  params: { source: 'onboarding' },
                });
              }}
              accessibilityRole="button"
              accessibilityLabel="Sign in to keep your progress"
              style={{
                width: Dimensions.get('window').width - 48,
                height: 54,
                borderRadius: Radius.card,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: colors.text,
              }}
            >
              <Text style={{
                fontFamily: FontFamily.uiSemiBold,
                fontSize: 16,
                color: colors.background,
              }}>
                Sign in to keep your progress
              </Text>
            </TouchableOpacity>
          </Animated.View>

          {/* Skip option */}
          <Animated.View entering={FadeIn.delay(800).duration(400)}>
            <TouchableOpacity activeOpacity={0.7}
              onPress={handleSkipSignIn}
              accessibilityRole="button"
              accessibilityLabel="Continue without signing in"
              style={{
                alignItems: 'center',
                justifyContent: 'center',
                paddingVertical: 12,
              }}
            >
              <Text style={{
                fontFamily: FontFamily.ui,
                fontSize: 15,
                color: colors.textMuted,
              }}>
                Continue without signing in
              </Text>
            </TouchableOpacity>
          </Animated.View>

          {/* Privacy note */}
          <Animated.View entering={FadeIn.delay(900).duration(400)}>
            <Text style={{
              fontFamily: FontFamily.ui,
              fontSize: 12,
              color: colors.textSubtle,
              textAlign: 'center',
            }}>
              Your privacy matters. We never share your information.
            </Text>
          </Animated.View>
        </View>
      );
    }
```

This keeps the benefits list and privacy note identical. The Apple button becomes a generic "Sign in to keep your progress" CTA. The error UI and loading overlay are removed (handled by the sign-in screen). The Skip button now calls `handleSkipSignIn` directly (same behavior as before).

- [ ] **Step 9: Verify TypeScript compiles**

Run: `npx tsc --noEmit 2>&1 | grep "onboarding" | head -5`
Expected: No output (zero errors)

- [ ] **Step 10: Commit**

```bash
git add src/app/onboarding.tsx
git commit -m "refactor: replace inline Apple OAuth with CTA to full sign-in screen in onboarding"
```

---

### Task 3: Add source param to generating.tsx route

**Files:**
- Modify: `src/app/generating.tsx:872`

**What:** Add `source=generating` query param to the existing `router.replace` call so the sign-in screen knows to navigate home after completion.

- [ ] **Step 1: Add source param**

In `src/app/generating.tsx`, at line 872, change:
```typescript
      router.replace('/(onboarding)/sign-in');
```
to:
```typescript
      router.replace('/(onboarding)/sign-in?source=generating');
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit 2>&1 | grep "generating" | head -5`
Expected: No output (zero errors)

- [ ] **Step 3: Commit**

```bash
git add src/app/generating.tsx
git commit -m "feat: pass source=generating param when routing to sign-in after generation"
```

---

### Task 4: Final verification

**Files:** None modified. Verification only.

- [ ] **Step 1: Full TypeScript check**

Run: `npx tsc --noEmit 2>&1 | grep "^src/" | head -10`
Expected: No output (zero errors in src/)

- [ ] **Step 2: Verify no remaining `useOAuth` in onboarding**

Run: `grep -n "useOAuth\|startAppleFlow\|startOAuthFlow\|WebBrowser" src/app/onboarding.tsx`
Expected: No output (all OAuth references removed)

- [ ] **Step 3: Verify sign-in screen reads source param**

Run: `grep -n "useLocalSearchParams\|source.*onboarding\|router\.back" src/app/\(onboarding\)/sign-in.tsx`
Expected: 3+ matches showing param reading and back navigation

- [ ] **Step 4: Verify generating passes source param**

Run: `grep -n "source=generating" src/app/generating.tsx`
Expected: 1 match at line ~872

- [ ] **Step 5: Build the app**

Run: `npx expo start --clear --port 8081` (verify Metro bundler starts without errors)
Expected: Bundle compiles successfully

- [ ] **Step 6: Take simulator screenshot for visual regression check**

Run: `xcrun simctl io "iPhone 17 Pro" screenshot /tmp/sim.png && sips -Z 1000 /tmp/sim.png`
Expected: App renders correctly, no visual regressions
