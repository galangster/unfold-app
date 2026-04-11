import { View, Text, TouchableOpacity, Image } from 'react-native';
import { useRouter, useLocalSearchParams, Redirect } from 'expo-router';
import { useAuth as useClerkAuth } from '@clerk/clerk-expo';
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
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import * as Haptics from 'expo-haptics';
import { CaretLeftIcon } from 'phosphor-react-native';
import { FontFamily, FontSize } from '@/constants/fonts';
import { Spacing } from '@/constants/spacing';
import { Radius } from '@/constants/radius';
import { Duration } from '@/constants/animations';
import { useUnfoldStore, useHasHydrated } from '@/lib/store';
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
  const authUserId = useUnfoldStore((s) => s.user?.authUserId ?? null);

  if (!hasHydrated || !isClerkLoaded) {
    return <View style={{ flex: 1, backgroundColor: BG }} />;
  }

  // Stale-auth guard: persisted profile claims a Clerk identity but
  // Clerk itself says nobody is signed in → session was revoked or
  // expired. Force the welcome screen so they can re-authenticate
  // instead of routing them into the signed-in app on cached state.
  const hasStaleAuthState = authUserId != null && !isSignedIn;

  if (hasCompletedOnboarding && !signedOut && !hasStaleAuthState) {
    return <Redirect href="/(tabs)/(today)" />;
  }

  return <WelcomeScreen signedOut={!!signedOut} />;
}

function WelcomeScreen({ signedOut = false }: { signedOut?: boolean }) {
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
    // WelcomeScreenWrapper already blocks the same path at its entry — this is
    // defense in depth in case any downstream code re-populates the store
    // before navigation lands here.
    if (!signedOut && user?.hasCompletedOnboarding) {
      router.replace('/(tabs)/(today)');
      return;
    }

    // Go directly to onboarding — cutscene and features carousel are now
    // embedded within the onboarding flow (featureSummary step after mirror-back)
    router.replace('/onboarding');
  }, [user, router, phase, isLastFeaturePage, signedOut]);

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
