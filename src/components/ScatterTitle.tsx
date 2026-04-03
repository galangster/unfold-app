import React, { useEffect, useMemo } from 'react';
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
  /** Override the final text color (defaults to accent) */
  color?: string;
}

export function ScatterTitle({
  text,
  fontSize = 42,
  baseDelay = 500,
  stagger = 80,
  onComplete,
  color,
}: ScatterTitleProps) {
  const { colors } = useTheme();
  const endColor = color ?? colors.accent;
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

  // Split text into words to preserve word-boundary wrapping
  const words = useMemo(() => {
    const result: { word: string; startIndex: number }[] = [];
    let idx = 0;
    for (const word of text.split(' ')) {
      result.push({ word, startIndex: idx });
      idx += word.length + 1; // +1 for the space
    }
    return result;
  }, [text]);

  // Reduced motion: show immediately in accent color
  if (reducedMotion) {
    return (
      <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
        {words.map((w, wi) => (
          <View key={`w-${wi}`} style={{ flexDirection: 'row' }}>
            {w.word.split('').map((char, ci) => (
              <Animated.Text
                key={`c-${w.startIndex + ci}`}
                style={{
                  fontFamily: FontFamily.display,
                  fontSize,
                  lineHeight: 50,
                  color: endColor,
                }}
              >
                {char}
              </Animated.Text>
            ))}
            {/* Add space between words (except last) */}
            {wi < words.length - 1 && (
              <Animated.Text
                style={{
                  fontFamily: FontFamily.display,
                  fontSize,
                  lineHeight: 50,
                  color: endColor,
                }}
              >
                {' '}
              </Animated.Text>
            )}
          </View>
        ))}
      </View>
    );
  }

  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
      {words.map((w, wi) => (
        <View key={`w-${wi}`} style={{ flexDirection: 'row' }}>
          {w.word.split('').map((char, ci) => {
            const globalIndex = w.startIndex + ci;
            return (
              <ScatterChar
                key={`c-${globalIndex}`}
                char={char}
                animDelay={charDelays[globalIndex]}
                startColor={colors.background}
                endColor={endColor}
                fontSize={fontSize}
              />
            );
          })}
          {/* Space between words — animates with the last char of this word */}
          {wi < words.length - 1 && (
            <ScatterChar
              char=" "
              animDelay={charDelays[w.startIndex + w.word.length]}
              startColor={colors.background}
              endColor={colors.accent}
              fontSize={fontSize}
            />
          )}
        </View>
      ))}
    </View>
  );
}
