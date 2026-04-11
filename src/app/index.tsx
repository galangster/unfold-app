import { View, Text, TouchableOpacity, Image } from 'react-native';
import { useRouter, useLocalSearchParams, Redirect } from 'expo-router';
import { useAuth as useClerkAuth, useClerk } from '@clerk/clerk-expo';
import * as Sentry from '@sentry/react-native';
import { mmkvStorage } from '@/lib/mmkv-storage';
import { logoutUser as rcLogoutUser, isRevenueCatEnabled } from '@/lib/revenuecatClient';
import { invalidateRevenueCatSession } from '@/lib/revenuecat-session';
import { Analytics } from '@/lib/analytics';
import { logger } from '@/lib/logger';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withDelay,
  Easing,
  cancelAnimation,
  interpolateColor,
  FadeIn,
  FadeOut,
  runOnJS,
} from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import * as Haptics from 'expo-haptics';
import { CaretLeftIcon } from 'phosphor-react-native';
import { FontFamily, FontSize } from '@/constants/fonts';
import { Spacing } from '@/constants/spacing';
import { Radius } from '@/constants/radius';
import { Duration } from '@/constants/animations';
import { useUnfoldStore, useHasHydrated } from '@/lib/store';
import { useCompanionChatStore } from '@/lib/companion-chat-store';
import { useTheme } from '@/lib/theme';
import { EmberParticles } from '@/components/EmberParticles';
import {
  FEATURE_PAGES,
  CardAnimation,
  AnimatedHeadline,
  AnimatedBody,
} from './how-it-works';

const BG = 'transparent';
const EASE = Easing.bezier(0.25, 0.1, 0.25, 1);

// ─── Single character with pre-rendered fade ───────────────────────
const RevealChar = React.memo(({
  char,
  animDelay,
  fontFamily,
  fontSize,
  letterSpacing,
}: {
  char: string;
  animDelay: number;
  fontFamily?: string;
  fontSize?: number;
  letterSpacing?: number;
}) => {
  const { colors } = useTheme();
  const opacity = useSharedValue(0);
  const colorProgress = useSharedValue(0);

  useEffect(() => {
    opacity.value = withDelay(
      animDelay,
      withTiming(1, { duration: 600, easing: EASE }),
    );

    // White → gold transition
    colorProgress.value = withDelay(
      animDelay,
      withTiming(1, { duration: 1200, easing: Easing.out(Easing.cubic) }),
    );

    return () => {
      cancelAnimation(opacity);
      cancelAnimation(colorProgress);
    };
  }, [animDelay]);

  const containerStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
  }));

  const textColorStyle = useAnimatedStyle(() => ({
    color: interpolateColor(
      colorProgress.value,
      [0, 1],
      ['#FFFFFF', colors.accent],
    ),
  }));

  return (
    <Animated.View style={containerStyle}>
      <Animated.Text
        style={[
          {
            fontFamily: fontFamily ?? FontFamily.display,
            fontSize: fontSize ?? 56,
            letterSpacing: letterSpacing ?? -1.5,
          },
          textColorStyle,
        ]}
      >
        {char}
      </Animated.Text>
    </Animated.View>
  );
});

// ─── Shuffled char order ──────────────────────────────────────────
function shuffleOrder(length: number): number[] {
  const indices = Array.from({ length }, (_, i) => i);
  for (let i = length - 1; i > 0; i--) {
    const j = Math.floor((Math.sin(i * 7919 + 104729) * 0.5 + 0.5) * (i + 1));
    [indices[i], indices[j]] = [indices[j], indices[i]];
  }
  return indices;
}

// ─── Subtitle word that fades in like title chars ─────────────────
const RevealWord = React.memo(({
  word,
  animDelay,
}: {
  word: string;
  animDelay: number;
}) => {
  const { colors } = useTheme();
  const opacity = useSharedValue(0);
  const colorProgress = useSharedValue(0);

  useEffect(() => {
    opacity.value = withDelay(
      animDelay,
      withTiming(1, { duration: 600, easing: EASE }),
    );
    colorProgress.value = withDelay(
      animDelay,
      withTiming(1, { duration: 1200, easing: Easing.out(Easing.cubic) }),
    );

    return () => {
      cancelAnimation(opacity);
      cancelAnimation(colorProgress);
    };
  }, [animDelay]);

  const containerStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
  }));

  const textColorStyle = useAnimatedStyle(() => ({
    color: interpolateColor(
      colorProgress.value,
      [0, 1],
      ['#FFFFFF', colors.accent],
    ),
  }));

  return (
    <Animated.View style={containerStyle}>
      <Animated.Text
        style={[
          {
            fontFamily: FontFamily.display,
            fontSize: FontSize['2xl'],
            letterSpacing: -0.3,
          },
          textColorStyle,
        ]}
      >
        {word}
      </Animated.Text>
    </Animated.View>
  );
});

/**
 * Neutral holding surface rendered while Clerk is still loading for an
 * auth-bound profile and the initial grace period has expired. We keep
 * waiting for Clerk — we do NOT fall through to the tabs, because
 * granting access on unproven auth would leak the previous user's
 * local data on a revoked-session cold start.
 *
 * Escape hatch: after a longer delay we expose a sign-out action so
 * users aren't permanently stranded if Clerk startup is truly stuck
 * (SDK outage, bad init, hard offline). Signing out clears the stored
 * profile, drops them to the welcome screen, and lets them re-auth
 * once they're back online.
 */
const CLERK_ESCAPE_HATCH_DELAY_MS = 10_000;

function ClerkHoldingScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const { signOut } = useClerk();
  const reset = useUnfoldStore((s) => s.reset);
  const [showEscape, setShowEscape] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  useEffect(() => {
    const id = setTimeout(() => setShowEscape(true), CLERK_ESCAPE_HATCH_DELAY_MS);
    return () => clearTimeout(id);
  }, []);

  const handleSignOut = useCallback(async () => {
    if (signingOut) return;
    setSigningOut(true);
    try {
      // Full service teardown inline. The (you) screen sign-out flow
      // relies on useAuth()'s effect to clear RevenueCat + Analytics +
      // Sentry when Clerk resolves signed-out, but useAuth's effect is
      // gated on `isLoaded === true` — which is exactly the condition
      // this escape hatch exists to recover from. If we only cleared
      // local Zustand/MMKV, RevenueCat would stay authenticated as the
      // previous user and the next anonymous/local session would
      // inherit their premium entitlement until Clerk eventually
      // recovers. So we run the same teardown inline: Clerk, local
      // store, companion conversations, inflight MMKV, RevenueCat,
      // Analytics, and Sentry.
      //
      // CRITICAL: this handler MUST NOT block on network I/O. The
      // whole point of the escape hatch is to recover when something
      // in the auth/subscriptions stack is stuck or offline — if we
      // await rcLogoutUser() and RevenueCat happens to be the stalled
      // dependency, the user is trapped on the holding screen with a
      // disabled button. So we:
      //   1. Set the persisted `rc-logout-pending` guard FIRST.
      //   2. Fire Clerk signOut + RC logoutUser in the background.
      //   3. Clear local state and navigate IMMEDIATELY.
      //
      // The persisted guard is what makes fail-closed work: even if
      // neither background call completes before force-quit, the next
      // launch's useRevenueCatSync sees the flag and refuses to sync
      // premium state until it can prove a clean logOut. If the
      // background rcLogoutUser call happens to succeed in this
      // session, it clears the flag so the next launch skips the
      // retry.
      // Capture the Clerk user id BEFORE local reset so we can set the
      // persistent forced-signed-out guard for useAuth. This guard
      // prevents a late positive Clerk sync from silently re-writing
      // the just-cleared authUserId back into the store if Clerk
      // happens to recover after the escape hatch fires. See
      // FORCED_SIGNED_OUT_KEY in src/hooks/useAuth.ts for the full
      // rationale. We use the zustand store's authUserId snapshot
      // because useClerkAuth().userId may be null while Clerk is
      // stuck — the whole reason the escape hatch exists.
      const preSignOutAuthUserId =
        useUnfoldStore.getState().user?.authUserId ?? null;
      if (preSignOutAuthUserId !== null) {
        mmkvStorage.setItem('forced-signed-out-clerk-id', preSignOutAuthUserId);
      }

      if (isRevenueCatEnabled()) {
        mmkvStorage.setItem('rc-logout-pending', '1');
        // Tear down the in-process RevenueCat session synchronously.
        // useRevenueCatSync runs once at root layout mount and flips
        // a bootstrapped flag on success, after which it ignores the
        // MMKV flag entirely. Without this imperative invalidation,
        // the still-attached CustomerInfo listener could restore
        // isPremium=true from a late RevenueCat callback after the
        // user is anonymous. See src/lib/revenuecat-session.ts for
        // the full rationale.
        invalidateRevenueCatSession();
      }

      // Fire Clerk signOut in the background. If Clerk is stuck this
      // promise may never resolve — we don't await it.
      void signOut().catch(() => {});

      // Local teardown — synchronous, never blocks.
      reset();
      useCompanionChatStore.getState().clearAllConversations();
      mmkvStorage.removeItem('inflight-generation-job');
      Analytics.setUserId(null);
      Sentry.setUser(null);

      // Background RC logout. Fire-and-forget — if it completes, clear
      // the pending flag; if it hangs or errors, leave the flag set
      // for the next mount of useRevenueCatSync (or the next launch)
      // to retry.
      if (isRevenueCatEnabled()) {
        void (async () => {
          try {
            const result = await rcLogoutUser();
            if (result.ok) {
              mmkvStorage.removeItem('rc-logout-pending');
            } else {
              logger.warn('[welcome] RevenueCat logoutUser failed:', result.reason);
            }
          } catch {
            // Defensive: rcLogoutUser is guarded and shouldn't throw,
            // but if it does, leave the flag set for retry.
          }
        })();
      }

      router.replace({ pathname: '/', params: { signedOut: '1' } });
    } finally {
      setSigningOut(false);
    }
  }, [signingOut, signOut, reset, router]);

  return (
    <View style={{ flex: 1, backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center', paddingHorizontal: Spacing['8'] }}>
      <Text
        style={{
          fontFamily: FontFamily.display,
          fontSize: FontSize.xl,
          color: colors.text,
          textAlign: 'center',
          marginBottom: Spacing['3'],
        }}
      >
        Connecting to your account
      </Text>
      <Text
        style={{
          fontFamily: FontFamily.body,
          fontSize: FontSize.base,
          color: colors.textMuted,
          textAlign: 'center',
          lineHeight: 22,
        }}
      >
        This is taking a moment. Check your connection — we'll bring you in as soon as we can reach your account.
      </Text>
      {showEscape && (
        <TouchableOpacity
          activeOpacity={0.7}
          onPress={handleSignOut}
          disabled={signingOut}
          style={{
            marginTop: Spacing['8'],
            paddingVertical: Spacing['3'],
            paddingHorizontal: Spacing['6'],
            borderRadius: Radius.md,
            borderWidth: 1,
            borderColor: colors.border,
          }}
        >
          <Text
            style={{
              fontFamily: FontFamily.uiMedium,
              fontSize: FontSize.sm,
              color: colors.textMuted,
            }}
          >
            {signingOut ? 'Signing out…' : 'Still stuck? Sign out'}
          </Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

/**
 * Thin wrapper that redirects onboarded users straight to the Today tab
 * during render, before WelcomeScreen's heavy animation tree ever mounts.
 * This is the navigation-in-render pattern — no useEffect + router.replace.
 * See ~/vault/standards/navigation-in-render-not-effects.md
 *
 * Waits for BOTH Zustand hydration AND Clerk auth resolution before
 * deciding:
 *  - Without hydration, a cold launch would read `user === undefined` on
 *    the first frame and briefly mount the welcome animation even for
 *    onboarded users.
 *  - Without Clerk `isLoaded`, a revoked or expired session combined
 *    with a stale persisted `hasCompletedOnboarding: true` would be
 *    redirected into the tabs before useAuth()'s sign-out effect cleared
 *    the store — routing an unauthenticated user into the signed-in app
 *    on cached state alone.
 *
 * Anonymous-onboarded users (no Clerk sign-in, `authUserId == null`)
 * are still allowed through: anonymous device data is a first-class
 * flow and later migrated by useAuth() on sign-in. Only users whose
 * persisted profile claims a Clerk identity (`authUserId != null`) are
 * held on the welcome screen when Clerk says nobody is signed in —
 * that's the stale-auth case.
 */
export default function WelcomeScreenWrapper() {
  const { signedOut } = useLocalSearchParams<{ signedOut?: string }>();
  const hasHydrated = useHasHydrated();
  const { isLoaded: isClerkLoaded, isSignedIn } = useClerkAuth();
  const hasCompletedOnboarding = useUnfoldStore(
    (s) => s.user?.hasCompletedOnboarding ?? false,
  );

  // CRITICAL: Capture whether the persisted profile is auth-bound at the
  // FIRST post-hydration render, BEFORE useAuth()'s effect can mutate
  // the store. useAuth() clears `authUserId` when Clerk resolves
  // signed-out, so a live selector on `authUserId` would flip to null
  // moments later and reclassify a formerly auth-bound user as
  // anonymous-onboarded — bypassing the stale-auth guard and routing
  // them straight into the signed-in tabs on cached data.
  //
  // A ref captured once from `getState()` is immune to that mutation:
  // the snapshot is taken on the first render where `hasHydrated`
  // becomes true (which runs before useAuth's effect commits), so even
  // after useAuth nulls the store field, `needsClerkConfirmation`
  // remains true and the stale-auth branch correctly fires.
  //
  // On explicit escape-hatch sign-out, `router.replace` re-renders this
  // component with a fresh `signedOut=1` param that bypasses the
  // onboarded shortcut regardless of the ref, so the frozen snapshot
  // doesn't trap a user who deliberately signed out.
  //
  // Anonymous-onboarded users (`authUserId == null` at hydration) do
  // NOT wait on Clerk — they have local content and never completed a
  // Clerk sign-in. Waiting on Clerk for those users would strand them
  // on a blank screen whenever Clerk startup is slow or fails.
  const authUserIdSnapshotRef = useRef<string | null | undefined>(undefined);
  if (hasHydrated && authUserIdSnapshotRef.current === undefined) {
    authUserIdSnapshotRef.current =
      useUnfoldStore.getState().user?.authUserId ?? null;
  }
  const needsClerkConfirmation = authUserIdSnapshotRef.current != null;

  // Clerk-wait is UNBOUNDED for auth-bound profiles — we cannot grant
  // access to the signed-in tabs until Clerk has conclusively resolved
  // the session. useAuth() only clears the store once `isLoaded`
  // becomes true, so an unresolved Clerk + cached `hasCompletedOnboarding`
  // is not a safe redirect target: on a revoked session cold start the
  // previous user's local devotionals/journal would be accessible
  // during the degraded path (tenant-isolation regression).
  //
  // The "infinite blank screen" degraded-dependency concern is real,
  // but the fix is UI, not routing — after a short grace period we
  // swap the blank View for a visible holding surface (spinner +
  // explanatory copy) so the user knows what's happening. When Clerk
  // eventually resolves (either signed-in → redirect, or signed-out →
  // stale-auth welcome CTA) we unblock. Until then we stay on a
  // neutral surface; we never render the tabs with unproven auth.
  const [showClerkHolding, setShowClerkHolding] = useState(false);
  useEffect(() => {
    if (!needsClerkConfirmation || isClerkLoaded) return;
    const id = setTimeout(() => setShowClerkHolding(true), 3000);
    return () => clearTimeout(id);
  }, [needsClerkConfirmation, isClerkLoaded]);

  // Escape-hatch override. `authUserIdSnapshotRef` is intentionally
  // frozen to survive useAuth() mutations, but that also means a user
  // who taps 'Still stuck? Sign out' in ClerkHoldingScreen would be
  // bounced right back to the holding screen on the next render
  // (same frozen snapshot → still auth-bound → still waiting on a
  // Clerk that's still stuck). The `signedOut=1` param is our signal
  // from handleSignOut that local state has been wiped and the user
  // has explicitly opted out of waiting — short-circuit the Clerk
  // wait so they reach the welcome flow even if Clerk never recovers.
  // Local auth teardown already ran (reset + RC logout + Analytics +
  // Sentry), so we're safe to treat this session as anonymous here.
  const waitingOnClerk = needsClerkConfirmation && !isClerkLoaded && !signedOut;

  if (!hasHydrated || (waitingOnClerk && !showClerkHolding)) {
    return <View style={{ flex: 1, backgroundColor: BG }} />;
  }

  if (waitingOnClerk && showClerkHolding) {
    return <ClerkHoldingScreen />;
  }

  // Stale-auth guard: only assert this once Clerk has ACTUALLY loaded
  // and reported no session. By this point `waitingOnClerk === false`,
  // so either Clerk resolved or the profile is anonymous — either way
  // `isSignedIn` is authoritative.
  const hasStaleAuthState = needsClerkConfirmation && !isSignedIn;

  if (hasCompletedOnboarding && !signedOut && !hasStaleAuthState) {
    return <Redirect href="/(tabs)/(today)" />;
  }

  return <WelcomeScreen signedOut={!!signedOut} staleAuth={hasStaleAuthState} />;
}

function WelcomeScreen({ signedOut = false, staleAuth = false }: { signedOut?: boolean; staleAuth?: boolean }) {
  const router = useRouter();
  const user = useUnfoldStore((s) => s.user);
  const { colors } = useTheme();

  // Three phases: welcome → cutscene → features (all on same background)
  const [phase, setPhase] = useState<'welcome' | 'cutscene' | 'features'>('welcome');
  const [featurePage, setFeaturePage] = useState(0);
  const isLastFeaturePage = featurePage === FEATURE_PAGES.length - 1;

  // ─── Shared animation values ────────────────────────────────────
  const iconOpacity = useSharedValue(0);
  const iconScale = useSharedValue(0.92);
  const buttonOpacity = useSharedValue(0);
  const buttonTranslateY = useSharedValue(16);
  const welcomeTextOpacity = useSharedValue(1);
  const cutsceneTextOpacity = useSharedValue(0);
  const cutsceneButtonOpacity = useSharedValue(0);
  const cutsceneButtonTranslateY = useSharedValue(16);
  const featuresOpacity = useSharedValue(0);

  // ─── Welcome title animation ────────────────────────────────────
  const titleChars = useMemo(() => 'Unfold'.split(''), []);
  const charOrder = useMemo(() => shuffleOrder(titleChars.length), [titleChars.length]);
  const charDelays = useMemo(() => {
    const baseDelay = 500;
    const stagger = 200;
    return titleChars.map((_, i) => baseDelay + charOrder[i] * stagger);
  }, [titleChars, charOrder]);
  const titleEndTime = useMemo(() => Math.max(...charDelays) + 600 + 100, [charDelays]);

  const subtitleLine1 = useMemo(() => "The world's most personal".split(' '), []);
  const subtitleLine2 = useMemo(() => 'Bible experience'.split(' '), []);
  const subtitleWords = useMemo(() => [...subtitleLine1, '\n', ...subtitleLine2], []);
  const subtitleWordDelays = useMemo(() => {
    const baseDelay = titleEndTime;
    const stagger = 120;
    return subtitleWords.map((_, i) => baseDelay + i * stagger);
  }, [titleEndTime, subtitleWords]);
  const subtitleEndTime = useMemo(() => Math.max(...subtitleWordDelays) + 600 + 100, [subtitleWordDelays]);

  // ─── Phase handlers ─────────────────────────────────────────────
  const handleContinue = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    // `signedOut` suppresses the onboarded shortcut so a just-signed-out user
    // with stale store/auth state can't bounce straight back into the tabs.
    // `staleAuth` handles the same concern on cold start: the wrapper blocked
    // the render-time redirect because Clerk says no session, but the user
    // could still tap Continue. Both flags must bypass the shortcut and route
    // through /onboarding, which re-runs auth.
    if (!signedOut && !staleAuth && user?.hasCompletedOnboarding) {
      router.replace('/(tabs)/(today)');
      return;
    }

    // Go directly to onboarding — cutscene and features carousel are now
    // embedded within the onboarding flow (featureSummary step after mirror-back)
    router.replace('/onboarding');
  }, [user, router, phase, isLastFeaturePage, signedOut, staleAuth]);

  const handleSkip = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.replace('/onboarding');
  }, [router]);

  const handleFeatureBack = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setFeaturePage((p) => Math.max(p - 1, 0));
  }, []);

  // Swipe gestures for feature carousel
  const handleSwipeLeft = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setFeaturePage((p) => Math.min(p + 1, FEATURE_PAGES.length - 1));
  }, []);

  const handleSwipeRight = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setFeaturePage((p) => Math.max(p - 1, 0));
  }, []);

  const swipeGesture = Gesture.Pan()
    .activeOffsetX([-30, 30])
    .onEnd((e) => {
      'worklet';
      if (e.translationX < -50) {
        runOnJS(handleSwipeLeft)();
      } else if (e.translationX > 50) {
        runOnJS(handleSwipeRight)();
      }
    });

  // ─── Initial mount animations ───────────────────────────────────
  // The onboarded-user redirect lives in WelcomeScreenWrapper above. If
  // we're here, the user is not onboarded (or has explicitly signed out)
  // and should see the welcome animation.
  useEffect(() => {
    iconOpacity.value = withDelay(100, withTiming(1, { duration: 800, easing: EASE }));
    iconScale.value = withDelay(100, withTiming(1, { duration: 800, easing: EASE }));
    buttonOpacity.value = withDelay(subtitleEndTime + 300, withTiming(1, { duration: 600, easing: EASE }));
    buttonTranslateY.value = withDelay(subtitleEndTime + 300, withTiming(0, { duration: 600, easing: EASE }));
  }, [subtitleEndTime]);

  // ─── Animated styles ────────────────────────────────────────────
  const iconStyle = useAnimatedStyle(() => ({
    opacity: iconOpacity.value,
    transform: [{ scale: iconScale.value }],
  }));

  const welcomeTextStyle = useAnimatedStyle(() => ({
    opacity: welcomeTextOpacity.value,
  }));

  const buttonStyle = useAnimatedStyle(() => ({
    opacity: buttonOpacity.value,
    transform: [{ translateY: buttonTranslateY.value }],
  }));

  const cutsceneTextStyle = useAnimatedStyle(() => ({
    opacity: cutsceneTextOpacity.value,
  }));

  const cutsceneButtonStyle = useAnimatedStyle(() => ({
    opacity: cutsceneButtonOpacity.value,
    transform: [{ translateY: cutsceneButtonTranslateY.value }],
  }));

  const featuresStyle = useAnimatedStyle(() => ({
    opacity: featuresOpacity.value,
  }));

  const currentFeature = FEATURE_PAGES[Math.min(featurePage, FEATURE_PAGES.length - 1)];

  // ─── Render ─────────────────────────────────────────────────────
  return (
    <View style={{ flex: 1, backgroundColor: BG }}>
      {/* Ember particles + gradient — always visible */}
      <EmberParticles color={colors.accent} count={22} bidirectional />
      <LinearGradient
        colors={['transparent', `${colors.accent}20`, `${colors.accent}40`]}
        style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 350 }}
        pointerEvents="none"
      />

      <SafeAreaView style={{ flex: 1 }} edges={['top', 'bottom']}>
        {/* Features header — Skip + back arrow (only in features phase) */}
        {phase === 'features' && (
          <Animated.View
            entering={FadeIn.duration(300)}
            style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: Spacing['4'], height: 44 }}
          >
            {featurePage > 0 ? (
              <TouchableOpacity
                activeOpacity={0.7}
                onPress={handleFeatureBack}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                style={{ width: 40, height: 40, justifyContent: 'center', alignItems: 'center' }}
              >
                <CaretLeftIcon size={24} color={colors.textMuted} weight="light" />
              </TouchableOpacity>
            ) : (
              <View style={{ width: 40, height: 40 }} />
            )}
            <TouchableOpacity activeOpacity={0.7} onPress={handleSkip} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Text style={{ fontFamily: FontFamily.uiMedium, fontSize: 15, color: colors.textMuted }}>Skip</Text>
            </TouchableOpacity>
          </Animated.View>
        )}

        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: Spacing['8'] }}>
          {/* Welcome + cutscene: icon + text (unmounts entirely in features phase) */}
          {phase !== 'features' && (
            <>
              <Animated.View style={[{ marginBottom: Spacing['7'] }, iconStyle]}>
                <Image
                  source={require('../../assets/icon-paywall.png')}
                  style={{ width: 56, height: 56 }}
                  resizeMode="contain"
                />
              </Animated.View>

              <View style={{ alignSelf: 'stretch', alignItems: 'center' }}>
                {/* Welcome text — stays mounted at opacity 0 during cutscene to prevent layout shift */}
                <Animated.View style={[{ alignSelf: 'stretch', alignItems: 'center' }, welcomeTextStyle]} pointerEvents={phase === 'welcome' ? 'auto' : 'none'}>
                  <View style={{ flexDirection: 'row', justifyContent: 'center', marginBottom: Spacing['5'] }}>
                    {titleChars.map((char, i) => (
                      <RevealChar key={`c-${i}`} char={char} animDelay={charDelays[i]} />
                    ))}
                  </View>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 5 }}>
                    {subtitleWords.map((word, i) => {
                      if (word === '\n') return <View key={`br-${i}`} style={{ width: '100%', height: 0 }} />;
                      return <RevealWord key={`sw-${i}`} word={word} animDelay={subtitleWordDelays[i]} />;
                    })}
                  </View>
                </Animated.View>

                {/* Cutscene text — absolutely positioned over welcome text */}
                {phase === 'cutscene' && (
                  <Animated.View style={[{ position: 'absolute', top: 0, left: 0, right: 0 }, cutsceneTextStyle]}>
                    <Text
                      style={{
                        fontFamily: FontFamily.display,
                        fontSize: 30,
                        color: colors.text,
                        textAlign: 'left',
                        lineHeight: 40,
                        letterSpacing: -0.3,
                      }}
                    >
                      Every spiritual journey{'\n'}is unique.
                    </Text>
                    <Text
                      style={{
                        fontFamily: FontFamily.body,
                        fontSize: 16,
                        color: colors.textMuted,
                        textAlign: 'left',
                        lineHeight: 26,
                        marginTop: Spacing['5'],
                      }}
                    >
                      Unfold was built with yours in mind. It meets you where you are, grows alongside you, and walks with you — one day at a time.{'\n\n'}A partner for the road ahead.
                    </Text>
                  </Animated.View>
                )}
              </View>
            </>
          )}

          {/* Features carousel — normal flex layout, no icon above */}
          {phase === 'features' && (
            <Animated.View style={[{ flex: 1, alignSelf: 'stretch' }, featuresStyle]}>
              <GestureDetector gesture={swipeGesture}>
                <View style={{ flex: 1 }}>
                  <Animated.View
                    key={featurePage}
                    entering={FadeIn.duration(Duration.normal)}
                    exiting={FadeOut.duration(Duration.fast)}
                    style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}
                  >
                    <View style={{ alignItems: 'center', gap: 36, alignSelf: 'stretch' }}>
                      <View style={{ transform: [{ scale: 1.2 }] }}>
                        <CardAnimation type={currentFeature.animation} accent={colors.accent} />
                      </View>
                      <View style={{ gap: 12, alignSelf: 'stretch' }}>
                        <AnimatedHeadline text={currentFeature.headline} color={colors.text} pageKey={featurePage} />
                        <AnimatedBody text={currentFeature.body} color={colors.textMuted} pageKey={featurePage} />
                      </View>
                    </View>
                  </Animated.View>
                </View>
              </GestureDetector>
            </Animated.View>
          )}
        </View>

        {/* Bottom section — buttons + dots */}
        <View style={{ paddingHorizontal: Spacing['6'], paddingBottom: Spacing['4'] }}>
          {/* Welcome button */}
          {phase === 'welcome' && (
            <Animated.View style={buttonStyle}>
              <TouchableOpacity
                activeOpacity={0.7}
                onPress={handleContinue}
                style={{ backgroundColor: colors.accent, paddingVertical: 18, borderRadius: 28, alignItems: 'center' }}
              >
                <Text style={{ fontFamily: FontFamily.uiMedium, fontSize: 17, color: '#1C1710', letterSpacing: 0.3 }}>
                  Let's get started.
                </Text>
              </TouchableOpacity>
            </Animated.View>
          )}

          {/* Cutscene button */}
          {phase === 'cutscene' && (
            <Animated.View style={cutsceneButtonStyle}>
              <TouchableOpacity
                activeOpacity={0.7}
                onPress={handleContinue}
                style={{ backgroundColor: colors.accent, paddingVertical: 18, borderRadius: 28, alignItems: 'center' }}
              >
                <Text style={{ fontFamily: FontFamily.uiMedium, fontSize: 17, color: '#1C1710', letterSpacing: 0.3 }}>
                  Continue
                </Text>
              </TouchableOpacity>
            </Animated.View>
          )}

          {/* Features: page dots + continue */}
          {phase === 'features' && (
            <Animated.View entering={FadeIn.delay(200).duration(300)}>
              {/* Page dots */}
              <View style={{ flexDirection: 'row', justifyContent: 'flex-start', alignItems: 'center', gap: 6, marginBottom: Spacing['6'] }}>
                {FEATURE_PAGES.map((_, index) => (
                  <View
                    key={index}
                    style={{
                      width: index === featurePage ? 20 : 6,
                      height: 6,
                      borderRadius: 3,
                      backgroundColor: index <= featurePage ? colors.accent : colors.border,
                    }}
                  />
                ))}
              </View>
              <TouchableOpacity
                activeOpacity={0.7}
                onPress={handleContinue}
                style={{ backgroundColor: colors.accent, paddingVertical: Spacing['4'], borderRadius: Radius.md, alignItems: 'center' }}
              >
                <Text style={{ fontFamily: FontFamily.uiMedium, fontSize: FontSize.base, color: colors.background, letterSpacing: 0.3 }}>
                  {isLastFeaturePage ? 'Get started' : 'Continue'}
                </Text>
              </TouchableOpacity>
            </Animated.View>
          )}
        </View>
      </SafeAreaView>
    </View>
  );
}
