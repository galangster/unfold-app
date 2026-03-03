import React, { useEffect, useRef, useMemo } from 'react';
import { View } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withDelay,
  Easing,
  cancelAnimation,
  interpolateColor,
  runOnJS,
} from 'react-native-reanimated';
import { FontFamily } from '@/constants/fonts';
import { useTheme } from '@/lib/theme';
import type { TextStyle } from 'react-native';

interface WordRevealTextProps {
  text: string;
  onComplete?: () => void;
  delay?: number;
  wordDelay?: number;
  style?: TextStyle;
  shuffle?: boolean;
}

const EASE = Easing.bezier(0.25, 0.1, 0.25, 1); // smooth cubic-bezier
const FADE_DURATION = 500;

// ─── Single word, pre-rendered invisible, animated via delay ────────
const RevealWord = React.memo(({
  word,
  accentColor,
  textColor,
  style,
  animDelay,
}: {
  word: string;
  accentColor: string;
  textColor: string;
  style?: TextStyle;
  animDelay: number;
}) => {
  const opacity = useSharedValue(0);
  const colorProgress = useSharedValue(0);

  useEffect(() => {
    // Smooth fade-in after delay
    opacity.value = withDelay(
      animDelay,
      withTiming(1, { duration: FADE_DURATION, easing: EASE }),
    );

    // Gold shimmer → normal text color
    colorProgress.value = withDelay(
      animDelay,
      withTiming(1, { duration: 900, easing: Easing.out(Easing.cubic) }),
    );

    return () => {
      cancelAnimation(opacity);
      cancelAnimation(colorProgress);
    };
  }, [animDelay]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    color: interpolateColor(
      colorProgress.value,
      [0, 1],
      [accentColor, textColor],
    ),
  }));

  return (
    <Animated.Text
      style={[
        {
          fontFamily: FontFamily.display,
          fontSize: 32,
        },
        style,
        animatedStyle,
      ]}
    >
      {word}
    </Animated.Text>
  );
});

// ─── Fisher-Yates shuffle (deterministic per text) ─────────────────
function shuffleIndices(length: number): number[] {
  const indices = Array.from({ length }, (_, i) => i);
  // Simple seeded shuffle — reverse iterate
  for (let i = length - 1; i > 0; i--) {
    const j = Math.floor((Math.sin(i * 9301 + 49297) * 0.5 + 0.5) * (i + 1));
    [indices[i], indices[j]] = [indices[j], indices[i]];
  }
  return indices;
}

// ─── Main component ────────────────────────────────────────────────
export function WordRevealText({
  text,
  onComplete,
  delay = 0,
  wordDelay = 100,
  style,
  shuffle = true,
}: WordRevealTextProps) {
  const { colors } = useTheme();
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  // Split on regular spaces only — keep \u00A0 groups as single segments to prevent orphans
  const segments = useMemo(() => text.split(/( +)/), [text]);

  // Only count non-space segments for animation ordering
  const wordSegments = useMemo(() => {
    const words: { index: number }[] = [];
    segments.forEach((seg, i) => {
      if (seg && !/^ +$/.test(seg)) {
        words.push({ index: i });
      }
    });
    return words;
  }, [segments]);

  // Build delay map: segment index → animation delay
  const delayMap = useMemo(() => {
    const map = new Map<number, number>();
    const count = wordSegments.length;

    if (shuffle && count > 1) {
      const order = shuffleIndices(count);
      wordSegments.forEach((ws, i) => {
        map.set(ws.index, delay + order[i] * wordDelay);
      });
    } else {
      wordSegments.forEach((ws, i) => {
        map.set(ws.index, delay + i * wordDelay);
      });
    }

    return map;
  }, [wordSegments, delay, wordDelay, shuffle]);

  // Trigger onComplete after all animations finish
  const totalDuration = useMemo(() => {
    const maxDelay = Math.max(...Array.from(delayMap.values()));
    return maxDelay + FADE_DURATION + 200; // +200 buffer
  }, [delayMap]);

  useEffect(() => {
    const timer = setTimeout(() => {
      onCompleteRef.current?.();
    }, totalDuration);
    return () => clearTimeout(timer);
  }, [totalDuration]);

  const textColor = (style?.color as string) || colors.text;

  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center' }}>
      {segments.map((segment, idx) => {
        if (!segment) return null;

        // Space segments — render immediately visible
        if (/^ +$/.test(segment)) {
          return (
            <Animated.Text
              key={`s-${idx}`}
              style={[
                {
                  fontFamily: FontFamily.display,
                  fontSize: 32,
                  color: textColor,
                },
                style,
              ]}
            >
              {segment}
            </Animated.Text>
          );
        }

        const animDelay = delayMap.get(idx) ?? delay;

        return (
          <RevealWord
            key={`w-${idx}-${segment}`}
            word={segment}
            accentColor={colors.accent}
            textColor={textColor}
            style={style}
            animDelay={animDelay}
          />
        );
      })}
    </View>
  );
}
