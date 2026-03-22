import { View, Text, TouchableOpacity, Image } from 'react-native';
import { useRouter } from 'expo-router';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withDelay,
  Easing,
  cancelAnimation,
  interpolateColor,
} from 'react-native-reanimated';
import React, { useEffect, useCallback, useMemo } from 'react';
import * as Haptics from 'expo-haptics';
import { FontFamily } from '@/constants/fonts';
import { useUnfoldStore } from '@/lib/store';

const GOLD = '#C8A55C';
const BG = 'transparent';
const EASE = Easing.bezier(0.25, 0.1, 0.25, 1);

// ─── Single character with pre-rendered fade ───────────────────────
const RevealChar = React.memo(({
  char,
  animDelay,
}: {
  char: string;
  animDelay: number;
}) => {
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
      ['#FFFFFF', GOLD],
    ),
  }));

  return (
    <Animated.View style={containerStyle}>
      <Animated.Text
        style={[
          {
            fontFamily: FontFamily.display,
            fontSize: 56,
            letterSpacing: -1.5,
          },
          textColorStyle,
        ]}
      >
        {char}
      </Animated.Text>
    </Animated.View>
  );
});

// ─── Shuffled char order for "Unfold" ──────────────────────────────
function shuffleOrder(length: number): number[] {
  const indices = Array.from({ length }, (_, i) => i);
  for (let i = length - 1; i > 0; i--) {
    const j = Math.floor((Math.sin(i * 7919 + 104729) * 0.5 + 0.5) * (i + 1));
    [indices[i], indices[j]] = [indices[j], indices[i]];
  }
  return indices;
}

export default function WelcomeScreen() {
  const router = useRouter();
  const user = useUnfoldStore((s) => s.user);

  const iconOpacity = useSharedValue(0);
  const iconScale = useSharedValue(0.92);
  const subtitleOpacity = useSharedValue(0);
  const buttonOpacity = useSharedValue(0);
  const buttonTranslateY = useSharedValue(16);
  const titleChars = useMemo(() => 'Unfold'.split(''), []);
  const charOrder = useMemo(() => shuffleOrder(titleChars.length), [titleChars.length]);

  // Each char gets a staggered delay based on shuffled order
  const charDelays = useMemo(() => {
    const baseDelay = 500; // initial wait
    const stagger = 200;   // between each char reveal
    return titleChars.map((_, i) => baseDelay + charOrder[i] * stagger);
  }, [titleChars, charOrder]);

  // Total title animation duration
  const titleEndTime = useMemo(() => {
    return Math.max(...charDelays) + 600 + 100; // max delay + fade duration + buffer
  }, [charDelays]);

  const handleContinue = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (user?.hasCompletedOnboarding) {
      router.replace('/(tabs)/(today)');
    } else {
      router.replace('/how-it-works');
    }
  }, [user, router]);

  useEffect(() => {
    // Returning users skip the welcome animation
    if (user?.hasCompletedOnboarding) {
      router.replace('/(tabs)/(today)');
      return;
    }

    // Icon fades in first, before title chars
    iconOpacity.value = withDelay(
      100,
      withTiming(1, { duration: 800, easing: EASE })
    );
    iconScale.value = withDelay(
      100,
      withTiming(1, { duration: 800, easing: EASE })
    );

    // Subtitle fade in after title finishes
    subtitleOpacity.value = withDelay(
      titleEndTime,
      withTiming(1, { duration: 600, easing: EASE })
    );

    // Continue button fade in after subtitle
    buttonOpacity.value = withDelay(
      titleEndTime + 500,
      withTiming(1, { duration: 600, easing: EASE })
    );
    buttonTranslateY.value = withDelay(
      titleEndTime + 500,
      withTiming(0, { duration: 600, easing: EASE })
    );
  }, [user, titleEndTime]);

  const iconStyle = useAnimatedStyle(() => ({
    opacity: iconOpacity.value,
    transform: [{ scale: iconScale.value }],
  }));

  const subtitleStyle = useAnimatedStyle(() => ({
    opacity: subtitleOpacity.value,
  }));

  const buttonStyle = useAnimatedStyle(() => ({
    opacity: buttonOpacity.value,
    transform: [{ translateY: buttonTranslateY.value }],
  }));

  return (
    <View style={{ flex: 1, backgroundColor: BG }}>
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 32 }}>
        {/* Icon — fades in before title */}
        <Animated.View style={[{ marginBottom: 28 }, iconStyle]}>
          <Image
            source={require('../../assets/icon-paywall.png')}
            style={{ width: 56, height: 56 }}
            resizeMode="contain"
          />
        </Animated.View>

        {/* Title — each character pre-rendered, fades in shuffled order */}
        <View style={{ flexDirection: 'row', marginBottom: 20 }}>
          {titleChars.map((char, i) => (
            <RevealChar
              key={`c-${i}`}
              char={char}
              animDelay={charDelays[i]}
            />
          ))}
        </View>

        <Animated.Text
          style={[
            {
              fontFamily: FontFamily.bodyItalic,
              fontSize: 16,
              color: 'rgba(200, 165, 92, 0.7)',
              textAlign: 'center',
              lineHeight: 24,
            },
            subtitleStyle,
          ]}
        >
          The world's most personal{'\n'}Bible studies
        </Animated.Text>
      </View>

      {/* Continue button — fades in after the text */}
      <Animated.View
        style={[
          { paddingHorizontal: 24, paddingBottom: 64 },
          buttonStyle,
        ]}
      >
        <TouchableOpacity activeOpacity={0.7}
          onPress={handleContinue}
          style={{
            backgroundColor: GOLD,
            paddingVertical: 18,
            borderRadius: 28,
            alignItems: 'center',
          }}
        >
          <Text
            style={{
              fontFamily: FontFamily.uiMedium,
              fontSize: 17,
              color: '#1C1710',
              letterSpacing: 0.3,
            }}
          >
            Begin Your Journey
          </Text>
        </TouchableOpacity>
      </Animated.View>
    </View>
  );
}
