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
import { Duration } from '@/constants/animations';
import { useTheme } from '@/lib/theme';
import type { TextStyle } from 'react-native';

interface TypewriterTextProps {
  text: string;
  onComplete?: () => void;
  /** Called when the last word begins revealing */
  onLastWordStart?: () => void;
  delay?: number;
  charDelay?: number;
  style?: TextStyle;
  /** If set, the last word stays this color instead of fading to textColor */
  lastWordColor?: string;
  /** Extra pause in ms before the last word (default 0) */
  lastWordPause?: number;
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
      duration: Duration.instant,
      easing: Easing.out(Easing.cubic),
    });
    translateY.value = withTiming(0, {
      duration: 180,
      easing: Easing.out(Easing.cubic),
    });

    // Scale spring
    scale.value = withSpring(1, {
      damping: 19,
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
  onLastWordStart,
  delay = 0,
  charDelay = 20,
  style,
  lastWordColor,
  lastWordPause = 0,
}: TypewriterTextProps) {
  const { colors } = useTheme();
  const normalizedText = useMemo(() => text.replace(/\s+/g, ' ').trim(), [text]);
  const totalChars = normalizedText.length;

  const [visibleCount, setVisibleCount] = useState(0);
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;
  const onLastWordStartRef = useRef(onLastWordStart);
  onLastWordStartRef.current = onLastWordStart;

  // Find where the last word starts (for pause + callback)
  const lastWordIdx = useMemo(() => {
    const trimmed = normalizedText.trimEnd();
    const lastSpace = trimmed.lastIndexOf(' ');
    return lastSpace >= 0 ? lastSpace + 1 : 0;
  }, [normalizedText]);

  const isComplete = visibleCount >= totalChars;

  // Progressively reveal characters
  useEffect(() => {
    setVisibleCount(0);
    let count = 0;
    let intervalId: ReturnType<typeof setInterval> | null = null;
    let completionTimerId: ReturnType<typeof setTimeout> | null = null;
    let lastWordFired = false;

    const delayId = setTimeout(() => {
      intervalId = setInterval(() => {
        count++;
        setVisibleCount(count);

        // Pause + callback when reaching the last word
        if (count === lastWordIdx && !lastWordFired && (lastWordPause > 0 || onLastWordStartRef.current)) {
          lastWordFired = true;
          if (intervalId) clearInterval(intervalId);
          // Fire the callback
          onLastWordStartRef.current?.();
          // Resume after pause
          setTimeout(() => {
            intervalId = setInterval(() => {
              count++;
              setVisibleCount(count);
              if (count >= totalChars) {
                if (intervalId) clearInterval(intervalId);
                completionTimerId = setTimeout(() => onCompleteRef.current?.(), 400);
              }
            }, charDelay);
          }, lastWordPause);
          return;
        }

        if (count >= totalChars) {
          if (intervalId) clearInterval(intervalId);
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

  // Find the last word for special coloring
  const words = normalizedText.split(/\s+/);
  const lastWord = lastWordColor ? words[words.length - 1]?.replace(/[^a-zA-Z]/g, '') : null;
  // Position where the last word starts in the full text
  const lastWordStart = lastWord ? normalizedText.lastIndexOf(lastWord) : -1;

  // Track global char index for stable keys
  let globalIdx = 0;

  return (
    <View>
      {/* Invisible full text in normal flow to reserve layout height */}
      <Animated.Text
        style={[
          {
            fontFamily: FontFamily.display,
            fontSize: 28,
            color: 'transparent',
          },
          style,
          { color: 'transparent' },
        ]}
      >
        {normalizedText}
      </Animated.Text>

      {/* Visible animated characters — overlaid on the reserved space */}
      <View style={{ position: 'absolute', top: 0, left: 0, right: 0, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'baseline' }}>
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

        // Check if this word is the last word (stays gold)
        const isLastWord = lastWordColor && lastWordStart >= 0 && wordStart >= lastWordStart;

        return (
          <View key={`w-${wordStart}`} style={{ flexDirection: 'row' }}>
            {segment.split('').map((char, charIdx) => (
              <MagicalChar
                key={`c-${wordStart + charIdx}`}
                char={char}
                accentColor={colors.accent}
                textColor={isLastWord ? lastWordColor : textColor}
                style={style}
                isWordStart={charIdx === 0}
              />
            ))}
          </View>
        );
      })}

      </View>
    </View>
  );
}
