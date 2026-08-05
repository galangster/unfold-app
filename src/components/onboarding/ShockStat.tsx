import { useEffect, useState } from 'react';
import { View, Text } from 'react-native';
import Animated, {
  FadeIn,
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withDelay,
  Easing,
  cancelAnimation,
  useReducedMotion,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { FontFamily } from '@/constants/fonts';
import { Spacing } from '@/constants/spacing';
import { Duration, Ease } from '@/constants/animations';
import type { ColorTheme } from '@/constants/colors';

// Single character that animates in with gold → text color fade
function StatChar({ char, delay, fontSize, colors }: {
  char: string;
  delay: number;
  fontSize: number;
  colors: ColorTheme;
}) {
  const opacity = useSharedValue(0);

  useEffect(() => {
    opacity.value = withDelay(delay, withTiming(1, { duration: 300, easing: Easing.out(Easing.cubic) }));
    return () => {
      cancelAnimation(opacity);
    };
  }, []);

  const style = useAnimatedStyle(() => ({
    opacity: opacity.value,
    color: colors.accent,
  }));

  return (
    <Animated.Text style={[{
      fontFamily: FontFamily.display,
      fontSize,
      letterSpacing: -2,
      lineHeight: fontSize * 1.05,
    }, style]}>
      {char}
    </Animated.Text>
  );
}

// Typewriter-style number reveal
function TypewriterNumber({ text, startDelay, fontSize, colors }: {
  text: string;
  startDelay: number;
  fontSize: number;
  colors: ColorTheme;
}) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'baseline' }}>
      {text.split('').map((char, i) => (
        <StatChar
          key={`${char}-${i}`}
          char={char}
          delay={startDelay + i * 180}
          fontSize={fontSize}
          colors={colors}
        />
      ))}
    </View>
  );
}

interface ShockStatProps {
  colors: ColorTheme;
  onReady?: () => void;
}

export function ShockStat({ colors, onReady }: ShockStatProps) {
  const reducedMotion = useReducedMotion();

  useEffect(() => {
    // Haptic when stats land
    const timer1 = setTimeout(() => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }, 800); // after 93% lands
    const timer2 = setTimeout(() => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
      onReady?.();
    }, 4800); // after 11% + description lands (slower animations)
    return () => {
      clearTimeout(timer1);
      clearTimeout(timer2);
    };
  }, []);

  // Sequence:
  // t=0      Screen fades in (340ms)
  // t=200    93% typewriter starts (3 chars + % = ~400ms)
  // t=900    "of Christians..." fades in
  // t=3000   11% typewriter starts (+1s extra pause after first stat)
  // t=3600   "read the Bible daily." fades in
  // t=4800   haptic + onReady

  return (
    <Animated.View entering={reducedMotion ? undefined : FadeIn.duration(Duration.slow).easing(Ease.out)} style={{ flex: 1 }}>
      {/* 93% — top-left, desire */}
      <View style={{
        position: 'absolute',
        top: '25%',
        left: Spacing['6'],
      }}>
        <TypewriterNumber
          text="93%"
          startDelay={200}
          fontSize={72}
          colors={colors}
        />
        <Animated.Text
          entering={reducedMotion ? undefined : FadeIn.delay(900).duration(Duration.slow).easing(Ease.out)}
          style={{
            fontFamily: FontFamily.body,
            fontSize: 16,
            color: colors.textMuted,
            lineHeight: 24,
            marginTop: Spacing['2'],
            maxWidth: 260,
          }}
        >
          of Christians want a deeper{'\n'}relationship with God.
        </Animated.Text>
      </View>

      {/* 11% — bottom-right, reality (extra 1s pause after first stat) */}
      <View style={{
        position: 'absolute',
        bottom: '25%',
        right: Spacing['6'],
        alignItems: 'flex-end',
      }}>
        <TypewriterNumber
          text="11%"
          startDelay={3000}
          fontSize={72}
          colors={colors}
        />
        <Animated.Text
          entering={reducedMotion ? undefined : FadeIn.delay(3600).duration(Duration.slow).easing(Ease.out)}
          style={{
            fontFamily: FontFamily.body,
            fontSize: 16,
            color: colors.textMuted,
            lineHeight: 24,
            marginTop: Spacing['2'],
            textAlign: 'right',
            maxWidth: 260,
          }}
        >
          read the Bible daily.
        </Animated.Text>
      </View>
    </Animated.View>
  );
}
