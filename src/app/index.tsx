import { View, Text, Dimensions } from 'react-native';
import { useRouter } from 'expo-router';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withDelay,
  withRepeat,
  withSequence,
  Easing,
  runOnJS,
} from 'react-native-reanimated';
import { useEffect, useCallback, useState } from 'react';
import * as Haptics from 'expo-haptics';
import { useTheme } from '@/lib/theme';
import { FontFamily } from '@/constants/fonts';
import { useUnfoldStore } from '@/lib/store';
import { GoldEmberField } from '@/components/GoldEmberField';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

export default function WelcomeScreen() {
  const router = useRouter();
  const { colors, isDark } = useTheme();
  const user = useUnfoldStore((s) => s.user);
  const [emberPhase, setEmberPhase] = useState<'intense' | 'gentle' | 'minimal'>('intense');

  // Letter-by-letter staggered fade for "Unfold"
  const letter1 = useSharedValue(0);
  const letter2 = useSharedValue(0);
  const letter3 = useSharedValue(0);
  const letter4 = useSharedValue(0);
  const letter5 = useSharedValue(0);
  const letter6 = useSharedValue(0);

  // Small gold line that draws in below the title
  const lineWidth = useSharedValue(0);
  const lineOpacity = useSharedValue(0);

  // Subtitle fade
  const subtitleOpacity = useSharedValue(0);
  const subtitleTranslateY = useSharedValue(12);

  // Whole screen fade-out before navigation
  const screenOpacity = useSharedValue(1);

  // Glow pulse behind title
  const glowOpacity = useSharedValue(0);
  const glowScale = useSharedValue(0.8);

  const navigate = useCallback(() => {
    if (user?.hasCompletedOnboarding) {
      router.replace('/(main)/home');
    } else {
      // New users go through how-it-works first
      router.replace('/how-it-works');
    }
  }, [user, router]);

  const startFadeOut = useCallback(() => {
    screenOpacity.value = withTiming(0, {
      duration: 600,
      easing: Easing.in(Easing.ease),
    }, () => {
      runOnJS(navigate)();
    });
  }, [navigate, screenOpacity]);

  useEffect(() => {
    // Skip animation for returning users - go straight to home
    if (user?.hasCompletedOnboarding) {
      router.replace('/(main)/home');
      return;
    }

    const letterDelay = 100;
    const baseDelay = 600;

    // Glow pulse begins immediately
    glowOpacity.value = withTiming(0.6, { duration: 800, easing: Easing.out(Easing.ease) });
    glowScale.value = withRepeat(
      withSequence(
        withTiming(1.1, { duration: 2000, easing: Easing.inOut(Easing.ease) }),
        withTiming(0.95, { duration: 2000, easing: Easing.inOut(Easing.ease) })
      ),
      -1,
      true
    );

    // Staggered letter reveals: each letter fades + slides up slightly
    letter1.value = withDelay(baseDelay, withTiming(1, { duration: 600, easing: Easing.out(Easing.cubic) }));
    letter2.value = withDelay(baseDelay + letterDelay, withTiming(1, { duration: 600, easing: Easing.out(Easing.cubic) }));
    letter3.value = withDelay(baseDelay + letterDelay * 2, withTiming(1, { duration: 600, easing: Easing.out(Easing.cubic) }));
    letter4.value = withDelay(baseDelay + letterDelay * 3, withTiming(1, { duration: 600, easing: Easing.out(Easing.cubic) }));
    letter5.value = withDelay(baseDelay + letterDelay * 4, withTiming(1, { duration: 600, easing: Easing.out(Easing.cubic) }));
    letter6.value = withDelay(baseDelay + letterDelay * 5, withTiming(1, { duration: 600, easing: Easing.out(Easing.cubic) }));

    // Haptic cascade during letter reveal
    [0, 1, 2].forEach((i) => {
      setTimeout(() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      }, baseDelay + letterDelay * (i * 2 + 1) + 300);
    });

    // Gold line draws in after letters finish
    const lineStart = baseDelay + letterDelay * 6 + 200;
    lineOpacity.value = withDelay(lineStart, withTiming(1, { duration: 300 }));
    lineWidth.value = withDelay(lineStart, withTiming(60, { duration: 700, easing: Easing.out(Easing.cubic) }));

    // Subtitle fades in
    const subtitleStart = lineStart + 400;
    subtitleOpacity.value = withDelay(subtitleStart, withTiming(1, { duration: 800, easing: Easing.out(Easing.ease) }));
    subtitleTranslateY.value = withDelay(subtitleStart, withTiming(0, { duration: 800, easing: Easing.out(Easing.cubic) }));

    // Transition ember phase to gentle after splash completes
    setTimeout(() => {
      setEmberPhase('gentle');
    }, subtitleStart + 500);

    // Auto-navigate after animation completes (~3.5s total)
    const autoNavDelay = subtitleStart + 2000;
    setTimeout(() => {
      startFadeOut();
    }, autoNavDelay);
  }, [user]);

  // --- Letter animated styles ---
  const l1Style = useAnimatedStyle(() => ({
    opacity: letter1.value,
    transform: [{ translateY: (1 - letter1.value) * 12 }],
  }));
  const l2Style = useAnimatedStyle(() => ({
    opacity: letter2.value,
    transform: [{ translateY: (1 - letter2.value) * 12 }],
  }));
  const l3Style = useAnimatedStyle(() => ({
    opacity: letter3.value,
    transform: [{ translateY: (1 - letter3.value) * 12 }],
  }));
  const l4Style = useAnimatedStyle(() => ({
    opacity: letter4.value,
    transform: [{ translateY: (1 - letter4.value) * 12 }],
  }));
  const l5Style = useAnimatedStyle(() => ({
    opacity: letter5.value,
    transform: [{ translateY: (1 - letter5.value) * 12 }],
  }));
  const l6Style = useAnimatedStyle(() => ({
    opacity: letter6.value,
    transform: [{ translateY: (1 - letter6.value) * 12 }],
  }));

  const lineStyle = useAnimatedStyle(() => ({
    opacity: lineOpacity.value,
    width: lineWidth.value,
  }));

  const subtitleStyle = useAnimatedStyle(() => ({
    opacity: subtitleOpacity.value,
    transform: [{ translateY: subtitleTranslateY.value }],
  }));

  const screenStyle = useAnimatedStyle(() => ({
    opacity: screenOpacity.value,
  }));

  const glowStyle = useAnimatedStyle(() => ({
    opacity: glowOpacity.value,
    transform: [{ scale: glowScale.value }],
  }));

  const letters = ['U', 'n', 'f', 'o', 'l', 'd'];
  const letterStyles = [l1Style, l2Style, l3Style, l4Style, l5Style, l6Style];

  return (
    <Animated.View style={[{ flex: 1, backgroundColor: colors.background }, screenStyle]}>
      {/* Gold embers floating upward */}
      <GoldEmberField 
        density={emberPhase === 'intense' ? 'high' : 'medium'} 
        active={true} 
      />

      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        {/* Warm glow behind title */}
        <Animated.View
          style={[
            {
              position: 'absolute',
              width: 200,
              height: 200,
              borderRadius: 100,
              backgroundColor: isDark 
                ? 'rgba(200, 165, 92, 0.15)' 
                : 'rgba(154, 123, 60, 0.1)',
            },
            glowStyle,
          ]}
        />

        {/* Title: "Unfold" - each letter animated independently */}
        <View style={{ flexDirection: 'row', alignItems: 'baseline' }}>
          {letters.map((char, i) => (
            <Animated.Text
              key={i}
              style={[
                {
                  fontFamily: FontFamily.display,
                  fontSize: 72,
                  color: colors.text,
                  letterSpacing: -2,
                },
                letterStyles[i],
              ]}
            >
              {char}
            </Animated.Text>
          ))}
        </View>

        {/* Thin gold accent line */}
        <Animated.View
          style={[
            {
              height: 2,
              backgroundColor: colors.accent,
              borderRadius: 1,
              marginTop: 20,
            },
            lineStyle,
          ]}
        />

        {/* Subtitle */}
        <Animated.View style={[{ marginTop: 24 }, subtitleStyle]}>
          <Text
            style={{
              fontFamily: FontFamily.bodyItalic,
              fontSize: 16,
              color: colors.textMuted,
              textAlign: 'center',
              lineHeight: 24,
            }}
          >
            The world's most personalized{'\n'}Bible devotionals
          </Text>
        </Animated.View>
      </View>
    </Animated.View>
  );
}
