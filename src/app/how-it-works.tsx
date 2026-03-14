import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  Dimensions,
  TouchableOpacity,
  NativeSyntheticEvent,
  NativeScrollEvent,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withRepeat,
  withDelay,
  withSequence,
  Easing,
  FadeIn,
  interpolate,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { FontFamily } from '@/constants/fonts';
import { DarkColors, createThemedColors } from '@/constants/colors';
import { useUnfoldStore, ACCENT_THEMES } from '@/lib/store';
import { CompanionOrb } from '@/components/CompanionOrb';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

// ─── Page data ───────────────────────────────────────────────────

interface FeatureCard {
  headline: string;
  body: string;
  animation: 'dots' | 'orb' | 'waveform' | 'pulse' | 'stack' | 'lines' | 'glow' | 'rings';
}

type Page =
  | { type: 'companion' }
  | { type: 'feature'; card: FeatureCard };

const PAGES: Page[] = [
  { type: 'companion' },
  {
    type: 'feature',
    card: {
      headline: 'Written\nfor you',
      body: 'Every word shaped by your story, your struggles, where you are right now.',
      animation: 'dots',
    },
  },
  {
    type: 'feature',
    card: {
      headline: 'A companion\nthat remembers',
      body: 'It checks in each day. Notices what resonates. Shapes tomorrow based on today.',
      animation: 'orb',
    },
  },
  {
    type: 'feature',
    card: {
      headline: "Listen, don't\njust read",
      body: 'Full audio narration in voices that feel like someone sitting across from you.',
      animation: 'waveform',
    },
  },
  {
    type: 'feature',
    card: {
      headline: 'Build\na rhythm',
      body: 'Streaks that matter. A gentle push to show up, even when it\u2019s hard.',
      animation: 'pulse',
    },
  },
  {
    type: 'feature',
    card: {
      headline: '32 ways to\ngo deeper',
      body: 'Character studies. Psalms. Parables. The Beatitudes. Pick what calls to you.',
      animation: 'stack',
    },
  },
  {
    type: 'feature',
    card: {
      headline: 'Your Bible.\nYour way.',
      body: 'ESV, NIV, NLT, KJV, and more. Read in the version that feels like home.',
      animation: 'lines',
    },
  },
  {
    type: 'feature',
    card: {
      headline: 'Fresh every\nmorning',
      body: 'Never the same devotional twice. New content generated daily, just for you.',
      animation: 'glow',
    },
  },
  {
    type: 'feature',
    card: {
      headline: 'Day 30 \u2260\nDay 1',
      body: 'The longer you stay, the more personal it gets.',
      animation: 'rings',
    },
  },
];

// ─── Ambient animation components ────────────────────────────────

function FloatingDots({ accent }: { accent: string }) {
  const a1 = useSharedValue(0);
  const a2 = useSharedValue(0);
  const a3 = useSharedValue(0);
  const a4 = useSharedValue(0);
  const a5 = useSharedValue(0);

  useEffect(() => {
    a1.value = withRepeat(withTiming(1, { duration: 2800, easing: Easing.inOut(Easing.ease) }), -1, true);
    a2.value = withDelay(400, withRepeat(withTiming(1, { duration: 3200, easing: Easing.inOut(Easing.ease) }), -1, true));
    a3.value = withDelay(800, withRepeat(withTiming(1, { duration: 2500, easing: Easing.inOut(Easing.ease) }), -1, true));
    a4.value = withDelay(200, withRepeat(withTiming(1, { duration: 3000, easing: Easing.inOut(Easing.ease) }), -1, true));
    a5.value = withDelay(600, withRepeat(withTiming(1, { duration: 2700, easing: Easing.inOut(Easing.ease) }), -1, true));
  }, []);

  const s1 = useAnimatedStyle(() => ({
    opacity: interpolate(a1.value, [0, 1], [0.15, 0.5]),
    transform: [{ translateY: interpolate(a1.value, [0, 1], [8, -12]) }],
  }));
  const s2 = useAnimatedStyle(() => ({
    opacity: interpolate(a2.value, [0, 1], [0.2, 0.55]),
    transform: [{ translateY: interpolate(a2.value, [0, 1], [12, -8]) }],
  }));
  const s3 = useAnimatedStyle(() => ({
    opacity: interpolate(a3.value, [0, 1], [0.1, 0.4]),
    transform: [{ translateY: interpolate(a3.value, [0, 1], [6, -14]) }],
  }));
  const s4 = useAnimatedStyle(() => ({
    opacity: interpolate(a4.value, [0, 1], [0.15, 0.45]),
    transform: [
      { translateY: interpolate(a4.value, [0, 1], [10, -6]) },
      { translateX: interpolate(a4.value, [0, 1], [-4, 4]) },
    ],
  }));
  const s5 = useAnimatedStyle(() => ({
    opacity: interpolate(a5.value, [0, 1], [0.2, 0.5]),
    transform: [{ translateY: interpolate(a5.value, [0, 1], [5, -10]) }],
  }));

  return (
    <View style={{ width: 180, height: 180, alignItems: 'center', justifyContent: 'center' }}>
      <Animated.View style={[{ position: 'absolute', width: 14, height: 14, borderRadius: 7, backgroundColor: accent, left: 30, top: 50 }, s1]} />
      <Animated.View style={[{ position: 'absolute', width: 10, height: 10, borderRadius: 5, backgroundColor: accent, left: 95, top: 25 }, s2]} />
      <Animated.View style={[{ position: 'absolute', width: 18, height: 18, borderRadius: 9, backgroundColor: accent, left: 70, top: 105 }, s3]} />
      <Animated.View style={[{ position: 'absolute', width: 8, height: 8, borderRadius: 4, backgroundColor: accent, left: 135, top: 70 }, s4]} />
      <Animated.View style={[{ position: 'absolute', width: 12, height: 12, borderRadius: 6, backgroundColor: accent, left: 45, top: 135 }, s5]} />
    </View>
  );
}

function WaveBar({ accent, delay, minH, maxH }: { accent: string; delay: number; minH: number; maxH: number }) {
  const h = useSharedValue(minH);

  useEffect(() => {
    h.value = withDelay(
      delay,
      withRepeat(
        withSequence(
          withTiming(maxH, { duration: 800, easing: Easing.inOut(Easing.ease) }),
          withTiming(minH, { duration: 800, easing: Easing.inOut(Easing.ease) }),
        ),
        -1,
      ),
    );
  }, []);

  const style = useAnimatedStyle(() => ({ height: h.value }));

  return <Animated.View style={[{ width: 8, borderRadius: 4, backgroundColor: accent, opacity: 0.5 }, style]} />;
}

function WaveformBars({ accent }: { accent: string }) {
  const bars = [
    { delay: 0, min: 20, max: 55 },
    { delay: 200, min: 30, max: 75 },
    { delay: 100, min: 15, max: 45 },
    { delay: 300, min: 25, max: 65 },
    { delay: 150, min: 20, max: 50 },
  ];

  return (
    <View style={{ width: 120, height: 120, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
      {bars.map((bar, i) => (
        <WaveBar key={i} accent={accent} delay={bar.delay} minH={bar.min} maxH={bar.max} />
      ))}
    </View>
  );
}

function PulseCircle({ accent }: { accent: string }) {
  const breathe = useSharedValue(0);

  useEffect(() => {
    breathe.value = withRepeat(
      withTiming(1, { duration: 2000, easing: Easing.inOut(Easing.ease) }),
      -1,
      true,
    );
  }, []);

  const outerStyle = useAnimatedStyle(() => ({
    opacity: interpolate(breathe.value, [0, 1], [0.12, 0.3]),
    transform: [{ scale: interpolate(breathe.value, [0, 1], [0.85, 1.15]) }],
  }));
  const innerStyle = useAnimatedStyle(() => ({
    opacity: interpolate(breathe.value, [0, 1], [0.3, 0.6]),
    transform: [{ scale: interpolate(breathe.value, [0, 1], [1.05, 0.9]) }],
  }));

  return (
    <View style={{ width: 160, height: 160, alignItems: 'center', justifyContent: 'center' }}>
      <Animated.View style={[{ width: 100, height: 100, borderRadius: 50, backgroundColor: accent }, outerStyle]} />
      <Animated.View style={[{ position: 'absolute', width: 44, height: 44, borderRadius: 22, backgroundColor: accent }, innerStyle]} />
    </View>
  );
}

function StackedCards({ accent }: { accent: string }) {
  const shift = useSharedValue(0);

  useEffect(() => {
    shift.value = withRepeat(
      withTiming(1, { duration: 3000, easing: Easing.inOut(Easing.ease) }),
      -1,
      true,
    );
  }, []);

  const s1 = useAnimatedStyle(() => ({
    transform: [
      { translateX: interpolate(shift.value, [0, 1], [-8, 8]) },
      { translateY: interpolate(shift.value, [0, 1], [4, -4]) },
      { rotate: `${interpolate(shift.value, [0, 1], [-2, 2])}deg` },
    ],
  }));
  const s2 = useAnimatedStyle(() => ({
    transform: [
      { translateX: interpolate(shift.value, [0, 1], [4, -4]) },
      { translateY: interpolate(shift.value, [0, 1], [-3, 3]) },
      { rotate: `${interpolate(shift.value, [0, 1], [1, -1])}deg` },
    ],
  }));
  const s3 = useAnimatedStyle(() => ({
    transform: [
      { translateX: interpolate(shift.value, [0, 1], [-2, 2]) },
      { translateY: interpolate(shift.value, [0, 1], [2, -2]) },
    ],
  }));

  const card = {
    width: 80,
    height: 100,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: accent,
    position: 'absolute' as const,
  };

  return (
    <View style={{ width: 160, height: 160, alignItems: 'center', justifyContent: 'center' }}>
      <Animated.View style={[card, { opacity: 0.15 }, s1]} />
      <Animated.View style={[card, { opacity: 0.3 }, s2]} />
      <Animated.View style={[card, { opacity: 0.45, backgroundColor: accent + '0D' }, s3]} />
    </View>
  );
}

function SlidingLines({ accent }: { accent: string }) {
  const a1 = useSharedValue(0);
  const a2 = useSharedValue(0);
  const a3 = useSharedValue(0);

  useEffect(() => {
    a1.value = withRepeat(withTiming(1, { duration: 2500, easing: Easing.inOut(Easing.ease) }), -1, true);
    a2.value = withDelay(300, withRepeat(withTiming(1, { duration: 2800, easing: Easing.inOut(Easing.ease) }), -1, true));
    a3.value = withDelay(600, withRepeat(withTiming(1, { duration: 2300, easing: Easing.inOut(Easing.ease) }), -1, true));
  }, []);

  const s1 = useAnimatedStyle(() => ({
    opacity: interpolate(a1.value, [0, 0.5, 1], [0.15, 0.5, 0.15]),
    transform: [{ translateX: interpolate(a1.value, [0, 1], [-20, 20]) }],
  }));
  const s2 = useAnimatedStyle(() => ({
    opacity: interpolate(a2.value, [0, 0.5, 1], [0.2, 0.55, 0.2]),
    transform: [{ translateX: interpolate(a2.value, [0, 1], [15, -15]) }],
  }));
  const s3 = useAnimatedStyle(() => ({
    opacity: interpolate(a3.value, [0, 0.5, 1], [0.1, 0.4, 0.1]),
    transform: [{ translateX: interpolate(a3.value, [0, 1], [-10, 25]) }],
  }));

  const line = { height: 3, borderRadius: 2, backgroundColor: accent };

  return (
    <View style={{ width: 160, height: 120, justifyContent: 'center', gap: 16 }}>
      <Animated.View style={[line, { width: 100 }, s1]} />
      <Animated.View style={[line, { width: 130 }, s2]} />
      <Animated.View style={[line, { width: 80 }, s3]} />
    </View>
  );
}

function GlowCircle({ accent }: { accent: string }) {
  const glow = useSharedValue(0);

  useEffect(() => {
    glow.value = withRepeat(
      withTiming(1, { duration: 3000, easing: Easing.inOut(Easing.ease) }),
      -1,
      true,
    );
  }, []);

  const style = useAnimatedStyle(() => ({
    opacity: interpolate(glow.value, [0, 1], [0.08, 0.3]),
    transform: [{ scale: interpolate(glow.value, [0, 1], [0.7, 1.1]) }],
  }));

  return (
    <View style={{ width: 180, height: 180, alignItems: 'center', justifyContent: 'center' }}>
      <Animated.View style={[{ width: 140, height: 140, borderRadius: 70, backgroundColor: accent }, style]} />
    </View>
  );
}

function ExpandingRings({ accent }: { accent: string }) {
  const r1 = useSharedValue(0);
  const r2 = useSharedValue(0);
  const r3 = useSharedValue(0);

  useEffect(() => {
    r1.value = withRepeat(withTiming(1, { duration: 3000, easing: Easing.out(Easing.ease) }), -1, false);
    r2.value = withDelay(1000, withRepeat(withTiming(1, { duration: 3000, easing: Easing.out(Easing.ease) }), -1, false));
    r3.value = withDelay(2000, withRepeat(withTiming(1, { duration: 3000, easing: Easing.out(Easing.ease) }), -1, false));
  }, []);

  const ring = { position: 'absolute' as const, borderWidth: 1.5, borderColor: accent };

  const s1 = useAnimatedStyle(() => ({
    width: interpolate(r1.value, [0, 1], [20, 140]),
    height: interpolate(r1.value, [0, 1], [20, 140]),
    borderRadius: interpolate(r1.value, [0, 1], [10, 70]),
    opacity: interpolate(r1.value, [0, 0.7, 1], [0.5, 0.15, 0]),
  }));
  const s2 = useAnimatedStyle(() => ({
    width: interpolate(r2.value, [0, 1], [20, 140]),
    height: interpolate(r2.value, [0, 1], [20, 140]),
    borderRadius: interpolate(r2.value, [0, 1], [10, 70]),
    opacity: interpolate(r2.value, [0, 0.7, 1], [0.5, 0.15, 0]),
  }));
  const s3 = useAnimatedStyle(() => ({
    width: interpolate(r3.value, [0, 1], [20, 140]),
    height: interpolate(r3.value, [0, 1], [20, 140]),
    borderRadius: interpolate(r3.value, [0, 1], [10, 70]),
    opacity: interpolate(r3.value, [0, 0.7, 1], [0.5, 0.15, 0]),
  }));

  return (
    <View style={{ width: 160, height: 160, alignItems: 'center', justifyContent: 'center' }}>
      <Animated.View style={[ring, s1]} />
      <Animated.View style={[ring, s2]} />
      <Animated.View style={[ring, s3]} />
    </View>
  );
}

function CardAnimation({ type, accent }: { type: string; accent: string }) {
  switch (type) {
    case 'dots': return <FloatingDots accent={accent} />;
    case 'orb': return <CompanionOrb accentColor={accent} size={96} isActive />;
    case 'waveform': return <WaveformBars accent={accent} />;
    case 'pulse': return <PulseCircle accent={accent} />;
    case 'stack': return <StackedCards accent={accent} />;
    case 'lines': return <SlidingLines accent={accent} />;
    case 'glow': return <GlowCircle accent={accent} />;
    case 'rings': return <ExpandingRings accent={accent} />;
    default: return null;
  }
}

// ─── Main screen ─────────────────────────────────────────────────

export default function HowItWorksScreen() {
  const router = useRouter();
  const accentThemeId = useUnfoldStore((s) => s.user?.accentTheme ?? 'gold');

  const colors = useMemo(() => {
    const accentTheme = ACCENT_THEMES.find((t) => t.id === accentThemeId);
    const accent = accentTheme ? accentTheme.dark : DarkColors.accent;
    return createThemedColors(DarkColors, accent);
  }, [accentThemeId]);

  const [currentPage, setCurrentPage] = useState(0);
  const scrollRef = useRef<ScrollView>(null);
  const lastHapticPage = useRef(0);

  const isLastPage = currentPage === PAGES.length - 1;

  const navigateToOnboarding = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    router.replace('/onboarding');
  }, [router]);

  // Auto-advance 1.5s after reaching the last page
  useEffect(() => {
    if (!isLastPage) return;

    const timer = setTimeout(navigateToOnboarding, 1500);
    return () => clearTimeout(timer);
  }, [isLastPage, navigateToOnboarding]);

  // Track page from scroll position (smooth dot updates)
  const handleScroll = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const x = e.nativeEvent.contentOffset.x;
    const page = Math.round(x / SCREEN_WIDTH);
    if (page >= 0 && page < PAGES.length) {
      setCurrentPage(page);
    }
  }, []);

  // Haptic feedback when settling on a new page
  const handleMomentumEnd = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const x = e.nativeEvent.contentOffset.x;
    const page = Math.round(x / SCREEN_WIDTH);
    if (page !== lastHapticPage.current) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      lastHapticPage.current = page;
    }
  }, []);

  const handleSkip = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.replace('/onboarding');
  }, [router]);

  const handleContinue = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (isLastPage) {
      navigateToOnboarding();
    } else {
      scrollRef.current?.scrollTo({ x: (currentPage + 1) * SCREEN_WIDTH, animated: true });
    }
  }, [isLastPage, currentPage, navigateToOnboarding]);

  return (
    <View style={{ flex: 1, backgroundColor: 'transparent' }}>
      <SafeAreaView style={{ flex: 1 }} edges={['top', 'bottom']}>
        {/* Header */}
        <View style={{ flexDirection: 'row', justifyContent: 'flex-end', paddingHorizontal: 24, paddingTop: 8, height: 44 }}>
          <TouchableOpacity activeOpacity={0.7} onPress={handleSkip} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Text style={{ fontFamily: FontFamily.uiMedium, fontSize: 15, color: colors.textMuted }}>
              Skip
            </Text>
          </TouchableOpacity>
        </View>

        {/* Swipeable pages */}
        <ScrollView
          ref={scrollRef}
          horizontal
          pagingEnabled
          bounces={false}
          showsHorizontalScrollIndicator={false}
          onScroll={handleScroll}
          onMomentumScrollEnd={handleMomentumEnd}
          scrollEventThrottle={16}
          style={{ flex: 1 }}
        >
          {PAGES.map((page, index) => (
            <View
              key={index}
              style={{
                width: SCREEN_WIDTH,
                justifyContent: 'center',
                alignItems: 'center',
                paddingHorizontal: 40,
              }}
            >
              {page.type === 'companion' ? (
                <View style={{ alignItems: 'center', gap: 36 }}>
                  <Animated.View entering={FadeIn.delay(300).duration(800)}>
                    <CompanionOrb accentColor={colors.accent} size={120} isActive />
                  </Animated.View>

                  <View style={{ gap: 14 }}>
                    <Animated.Text
                      entering={FadeIn.delay(700).duration(600)}
                      style={{
                        fontFamily: FontFamily.display,
                        fontSize: 32,
                        color: colors.text,
                        textAlign: 'center',
                        letterSpacing: -0.5,
                      }}
                    >
                      Something stays{'\n'}with you.
                    </Animated.Text>

                    <Animated.Text
                      entering={FadeIn.delay(1000).duration(600)}
                      style={{
                        fontFamily: FontFamily.body,
                        fontSize: 16,
                        color: colors.textMuted,
                        textAlign: 'center',
                        lineHeight: 24,
                      }}
                    >
                      Your companion shows up daily. Learns what matters to you. Makes each devotional feel more like yours.
                    </Animated.Text>
                  </View>
                </View>
              ) : (
                <View style={{ alignItems: 'center', gap: 36 }}>
                  <CardAnimation type={page.card.animation} accent={colors.accent} />

                  <View style={{ gap: 12 }}>
                    <Text
                      style={{
                        fontFamily: FontFamily.display,
                        fontSize: 32,
                        color: colors.text,
                        textAlign: 'center',
                        letterSpacing: -0.5,
                        lineHeight: 40,
                      }}
                    >
                      {page.card.headline}
                    </Text>

                    <Text
                      style={{
                        fontFamily: FontFamily.body,
                        fontSize: 16,
                        color: colors.textMuted,
                        textAlign: 'center',
                        lineHeight: 24,
                      }}
                    >
                      {page.card.body}
                    </Text>
                  </View>
                </View>
              )}
            </View>
          ))}
        </ScrollView>

        {/* Bottom: page dots + continue button */}
        <View style={{ paddingHorizontal: 24, paddingBottom: 24 }}>
          {/* Page dots */}
          <View style={{ flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 6, marginBottom: 24 }}>
            {PAGES.map((_, index) => (
              <View
                key={index}
                style={{
                  width: index === currentPage ? 20 : 6,
                  height: 6,
                  borderRadius: 3,
                  backgroundColor: index <= currentPage ? colors.accent : colors.border,
                }}
              />
            ))}
          </View>

          {/* Continue button */}
          <TouchableOpacity activeOpacity={0.7} onPress={handleContinue}>
            <View
              style={{
                paddingVertical: 16,
                borderRadius: 12,
                alignItems: 'center',
                backgroundColor: colors.accent,
              }}
            >
              <Text
                style={{
                  fontFamily: FontFamily.uiMedium,
                  fontSize: 16,
                  color: colors.background,
                  letterSpacing: 0.3,
                }}
              >
                {isLastPage ? 'Get started' : 'Continue'}
              </Text>
            </View>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    </View>
  );
}
