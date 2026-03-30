import React, { useEffect, useMemo, useCallback } from 'react';
import { View } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withDelay,
  withTiming,
  Easing,
  cancelAnimation,
  interpolateColor,
  useReducedMotion,
} from 'react-native-reanimated';
import { FontFamily } from '@/constants/fonts';
import { useTheme } from '@/lib/theme';

// ─── Deterministic pseudo-random shuffle ─────────────────────────
function shuffleOrder(length: number): number[] {
  const indices = Array.from({ length }, (_, i) => i);
  for (let i = length - 1; i > 0; i--) {
    const j = Math.floor(
      (Math.sin(i * 7919 + 104729) * 0.5 + 0.5) * (i + 1),
    );
    [indices[i], indices[j]] = [indices[j], indices[i]];
  }
  return indices;
}

const EASE = Easing.bezier(0.25, 0.1, 0.25, 1);

// ─── Single character with fade + color transition ───────────────
const ScatterChar = React.memo(({
  char,
  animDelay,
  startColor,
  endColor,
  fontSize,
}: {
  char: string;
  animDelay: number;
  startColor: string;
  endColor: string;
  fontSize: number;
}) => {
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
      [startColor, endColor],
    ),
  }));

  return (
    <Animated.View style={containerStyle}>
      <Animated.Text
        style={[
          {
            fontFamily: FontFamily.display,
            fontSize,
            lineHeight: 50,
          },
          textColorStyle,
        ]}
      >
        {char}
      </Animated.Text>
    </Animated.View>
  );
});

// ─── Main component ──────────────────────────────────────────────

interface ScatterTitleProps {
  text: string;
  fontSize?: number;
  baseDelay?: number;
  stagger?: number;
  onComplete?: () => void;
}

export function ScatterTitle({
  text,
  fontSize = 42,
  baseDelay = 500,
  stagger = 80,
  onComplete,
}: ScatterTitleProps) {
  const { colors } = useTheme();
  const reducedMotion = useReducedMotion();

  const chars = useMemo(() => text.split(''), [text]);
  const charOrder = useMemo(() => shuffleOrder(chars.length), [chars.length]);

  const charDelays = useMemo(
    () => chars.map((_, i) => baseDelay + charOrder[i] * stagger),
    [chars.length, baseDelay, stagger, charOrder],
  );

  // Calculate when the last character finishes appearing (for onComplete)
  const maxDelay = useMemo(
    () => Math.max(...charDelays) + 600, // 600ms is the fade duration
    [charDelays],
  );

  // Fire onComplete after all characters have appeared
  useEffect(() => {
    if (!onComplete || reducedMotion) {
      onComplete?.();
      return;
    }
    const timer = setTimeout(onComplete, maxDelay);
    return () => clearTimeout(timer);
  }, [maxDelay, onComplete, reducedMotion]);

  // Reduced motion: show immediately in accent color
  if (reducedMotion) {
    return (
      <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
        {chars.map((char, i) => (
          <Animated.Text
            key={`c-${i}`}
            style={{
              fontFamily: FontFamily.display,
              fontSize,
              lineHeight: fontSize * 1.2,
              color: colors.accent,
            }}
          >
            {char}
          </Animated.Text>
        ))}
      </View>
    );
  }

  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
      {chars.map((char, i) => (
        <ScatterChar
          key={`c-${i}`}
          char={char}
          animDelay={charDelays[i]}
          startColor={colors.background}
          endColor={colors.accent}
          fontSize={fontSize}
        />
      ))}
    </View>
  );
}
