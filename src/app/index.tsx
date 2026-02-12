import { View, Text } from 'react-native';
import { useRouter } from 'expo-router';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withDelay,
  Easing,
  runOnJS,
} from 'react-native-reanimated';
import { useEffect, useCallback } from 'react';
import * as Haptics from 'expo-haptics';
import { useTheme } from '@/lib/theme';
import { FontFamily } from '@/constants/fonts';
import { useUnfoldStore } from '@/lib/store';

export default function WelcomeScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const user = useUnfoldStore((s) => s.user);

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
  const subtitleTranslateY = useSharedValue(8);

  // Whole screen fade-out before navigation
  const screenOpacity = useSharedValue(1);

  const navigate = useCallback(() => {
    if (user?.hasCompletedOnboarding) {
      router.replace('/(main)/home');
    } else if (user?.hasCompletedStyleOnboarding) {
      router.replace('/onboarding');
    } else {
      router.replace('/style-onboarding');
    }
  }, [user, router]);

  const startFadeOut = useCallback(() => {
    screenOpacity.value = withTiming(0, {
      duration: 400,
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

    const letterDelay = 80;
    const baseDelay = 400;

    // Staggered letter reveals: each letter fades + slides up slightly
    letter1.value = withDelay(baseDelay, withTiming(1, { duration: 500, easing: Easing.out(Easing.cubic) }));
    letter2.value = withDelay(baseDelay + letterDelay, withTiming(1, { duration: 500, easing: Easing.out(Easing.cubic) }));
    letter3.value = withDelay(baseDelay + letterDelay * 2, withTiming(1, { duration: 500, easing: Easing.out(Easing.cubic) }));
    letter4.value = withDelay(baseDelay + letterDelay * 3, withTiming(1, { duration: 500, easing: Easing.out(Easing.cubic) }));
    letter5.value = withDelay(baseDelay + letterDelay * 4, withTiming(1, { duration: 500, easing: Easing.out(Easing.cubic) }));
    letter6.value = withDelay(baseDelay + letterDelay * 5, withTiming(1, { duration: 500, easing: Easing.out(Easing.cubic) }));

    // Subtle haptic when the word completes
    setTimeout(() => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }, baseDelay + letterDelay * 5 + 200);

    // Gold line draws in after letters finish
    const lineStart = baseDelay + letterDelay * 6 + 100;
    lineOpacity.value = withDelay(lineStart, withTiming(1, { duration: 300 }));
    lineWidth.value = withDelay(lineStart, withTiming(40, { duration: 600, easing: Easing.out(Easing.cubic) }));

    // Subtitle fades in
    const subtitleStart = lineStart + 300;
    subtitleOpacity.value = withDelay(subtitleStart, withTiming(1, { duration: 700, easing: Easing.out(Easing.ease) }));
    subtitleTranslateY.value = withDelay(subtitleStart, withTiming(0, { duration: 700, easing: Easing.out(Easing.cubic) }));

    // Auto-navigate after animation completes (~2.5s total)
    const autoNavDelay = subtitleStart + 1200;
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

  const letters = ['U', 'n', 'f', 'o', 'l', 'd'];
  const letterStyles = [l1Style, l2Style, l3Style, l4Style, l5Style, l6Style];

  return (
    <Animated.View style={[{ flex: 1, backgroundColor: colors.background }, screenStyle]}>
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        {/* Title: "Unfold" - each letter animated independently */}
        <View style={{ flexDirection: 'row', alignItems: 'baseline' }}>
          {letters.map((char, i) => (
            <Animated.Text
              key={i}
              style={[
                {
                  fontFamily: FontFamily.display,
                  fontSize: 68,
                  color: colors.text,
                  letterSpacing: -1.5,
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
              height: 1.5,
              backgroundColor: colors.accent,
              borderRadius: 1,
              marginTop: 20,
            },
            lineStyle,
          ]}
        />

        {/* Subtitle */}
        <Animated.View style={[{ marginTop: 18 }, subtitleStyle]}>
          <Text
            style={{
              fontFamily: FontFamily.bodyItalic,
              fontSize: 15,
              color: colors.textSubtle,
              textAlign: 'center',
              lineHeight: 22,
            }}
          >
            Devotionals written for{'\n'}where you are
          </Text>
        </Animated.View>
      </View>
    </Animated.View>
  );
}
