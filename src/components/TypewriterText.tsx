import React, { useEffect, useRef, useMemo, useState } from 'react';
import { View } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSpring,
  withDelay,
  withRepeat,
  withSequence,
  Easing,
  cancelAnimation,
  interpolateColor,
  useReducedMotion,
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
  /** Highlight a specific word with this color (stays colored, doesn't fade) */
  highlightWord?: string;
  /** Color for the highlighted word */
  highlightColor?: string;
}

// ─── Magical character that animates on mount ──────────────────────
const MagicalChar = React.memo(function MagicalChar({
  char,
  accentColor,
  textColor,
  style,
  isWordStart,
  shimmer,
}: {
  char: string;
  accentColor: string;
  textColor: string;
  style?: TextStyle;
  isWordStart: boolean;
  shimmer?: boolean;
}) {
  const reducedMotion = useReducedMotion();
  const opacity = useSharedValue(0);
  const translateY = useSharedValue(6);
  const scale = useSharedValue(0.85);
  const colorProgress = useSharedValue(0);
  const shimmerOpacity = useSharedValue(1);

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

    // Shimmer — gentle brightness pulse after appearing
    if (shimmer && !reducedMotion) {
      shimmerOpacity.value = withDelay(
        800,
        withRepeat(
          withSequence(
            withTiming(0.6, { duration: 1200, easing: Easing.inOut(Easing.ease) }),
            withTiming(1, { duration: 1200, easing: Easing.inOut(Easing.ease) }),
          ),
          -1,
          false,
        ),
      );
    }

    return () => {
      cancelAnimation(opacity);
      cancelAnimation(translateY);
      cancelAnimation(scale);
      cancelAnimation(colorProgress);
      cancelAnimation(shimmerOpacity);
    };
  }, []);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: shimmer ? opacity.value * shimmerOpacity.value : opacity.value,
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
          fontSize: 25,
          letterSpacing: -0.15,
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
  highlightWord,
  highlightColor,
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

  // Split full text into word/space segments once
  const segments = normalizedText.split(/(\s+)/);

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
      {/* Text wrapper handles line-breaking and space collapsing natively.
          Unrevealed chars are invisible placeholders that reserve width,
          preventing words from reflowing as characters appear. */}
      <Animated.Text style={[{ fontFamily: FontFamily.display, fontSize: 25, letterSpacing: -0.15 }, style]}>
      {segments.map((segment, segIndex) => {
        if (!segment) return null;

        // Space segments
        if (/^\s+$/.test(segment)) {
          const idx = globalIdx;
          globalIdx += segment.length;
          return (
            <Animated.Text
              key={`s-${idx}`}
              style={{ color: idx < visibleCount ? textColor : 'transparent' }}
            >
              {segment}
            </Animated.Text>
          );
        }

        // Word segments — render all chars to reserve full word width
        const wordStart = globalIdx;
        globalIdx += segment.length;

        // Check if this word is the last word (stays gold)
        const isLastWord = lastWordColor && lastWordStart >= 0 && wordStart >= lastWordStart;
        // Check if this word matches the highlight word
        const isHighlighted = highlightWord && highlightColor && segment.toLowerCase().includes(highlightWord.toLowerCase());

        const wordColor = isHighlighted ? highlightColor : isLastWord ? lastWordColor : textColor;

        return segment.split('').map((char, charIdx) => {
          const charGlobalIdx = wordStart + charIdx;
          if (charGlobalIdx < visibleCount) {
            // Revealed — animate in
            return (
              <MagicalChar
                key={`c-${charGlobalIdx}`}
                char={char}
                accentColor={colors.accent}
                textColor={wordColor || textColor}
                style={style}
                isWordStart={charIdx === 0}
                shimmer={!!isHighlighted}
              />
            );
          }
          // Unrevealed — invisible placeholder reserving width
          return (
            <Animated.Text
              key={`c-${charGlobalIdx}`}
              style={{ color: 'transparent' }}
            >
              {char}
            </Animated.Text>
          );
        });
      })}

      </Animated.Text>
    </View>
  );
}
