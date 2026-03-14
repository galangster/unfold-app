import React, { useEffect, useRef, useMemo, useState } from 'react';
import { View } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSpring,
  withDelay,
  Easing,
  cancelAnimation,
  interpolateColor,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { FontFamily } from '@/constants/fonts';
import { useTheme } from '@/lib/theme';
import type { TextStyle } from 'react-native';

interface TypewriterTextProps {
  text: string;
  onComplete?: () => void;
  delay?: number;
  charDelay?: number;
  style?: TextStyle;
}

// ─── Magical character that animates on mount ──────────────────────
const MagicalChar = React.memo(({
  char,
  accentColor,
  textColor,
  style,
  isWordStart,
}: {
  char: string;
  accentColor: string;
  textColor: string;
  style?: TextStyle;
  isWordStart: boolean;
}) => {
  const opacity = useSharedValue(0);
  const translateY = useSharedValue(6);
  const scale = useSharedValue(0.85);
  const colorProgress = useSharedValue(0);

  useEffect(() => {
    Haptics.selectionAsync();

    // Fade + rise
    opacity.value = withTiming(1, {
      duration: 100,
      easing: Easing.out(Easing.cubic),
    });
    translateY.value = withTiming(0, {
      duration: 180,
      easing: Easing.out(Easing.cubic),
    });

    // Scale spring
    scale.value = withSpring(1, {
      damping: 14,
      stiffness: 220,
      mass: 0.4,
    });

    // Golden glow → normal text color
    colorProgress.value = withDelay(
      50,
      withTiming(1, { duration: 600, easing: Easing.out(Easing.cubic) }),
    );

    return () => {
      cancelAnimation(opacity);
      cancelAnimation(translateY);
      cancelAnimation(scale);
      cancelAnimation(colorProgress);
    };
  }, []);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: translateY.value }, { scale: scale.value }],
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
          fontSize: 28,
        },
        style,
        animatedStyle,
      ]}
    >
      {char}
    </Animated.Text>
  );
});

// ─── Main component ────────────────────────────────────────────────
export function TypewriterText({
  text,
  onComplete,
  delay = 0,
  charDelay = 20,
  style,
}: TypewriterTextProps) {
  const { colors } = useTheme();
  const normalizedText = useMemo(() => text.replace(/\s+/g, ' ').trim(), [text]);
  const totalChars = normalizedText.length;

  const [visibleCount, setVisibleCount] = useState(0);
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  const isComplete = visibleCount >= totalChars;

  // Progressively reveal characters
  useEffect(() => {
    setVisibleCount(0);
    let count = 0;
    let intervalId: ReturnType<typeof setInterval> | null = null;
    let completionTimerId: ReturnType<typeof setTimeout> | null = null;

    const delayId = setTimeout(() => {
      intervalId = setInterval(() => {
        count++;
        setVisibleCount(count);
        if (count >= totalChars) {
          if (intervalId) clearInterval(intervalId);
          // Brief pause before signalling completion
          completionTimerId = setTimeout(() => onCompleteRef.current?.(), 400);
        }
      }, charDelay);
    }, delay);

    return () => {
      clearTimeout(delayId);
      if (intervalId) clearInterval(intervalId);
      if (completionTimerId) clearTimeout(completionTimerId);
    };
  }, [normalizedText, delay, charDelay, totalChars]);

  // Build visible segments
  const visibleText = normalizedText.slice(0, visibleCount);
  const segments = visibleText.split(/(\s+)/);

  // Determine text color from style or theme
  const textColor = (style?.color as string) || colors.text;

  // Track global char index for stable keys
  let globalIdx = 0;

  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'baseline' }}>
      {segments.map((segment, segIndex) => {
        if (!segment) return null;

        // Space segments
        if (/^\s+$/.test(segment)) {
          const idx = globalIdx;
          globalIdx += segment.length;
          return (
            <Animated.Text
              key={`s-${idx}`}
              style={[
                {
                  fontFamily: FontFamily.display,
                  fontSize: 28,
                  color: textColor,
                },
                style,
              ]}
            >
              {segment}
            </Animated.Text>
          );
        }

        // Word segments — each char is a MagicalChar
        const wordStart = globalIdx;
        globalIdx += segment.length;

        return (
          <View key={`w-${wordStart}`} style={{ flexDirection: 'row' }}>
            {segment.split('').map((char, charIdx) => (
              <MagicalChar
                key={`c-${wordStart + charIdx}`}
                char={char}
                accentColor={colors.accent}
                textColor={textColor}
                style={style}
                isWordStart={charIdx === 0}
              />
            ))}
          </View>
        );
      })}

    </View>
  );
}
