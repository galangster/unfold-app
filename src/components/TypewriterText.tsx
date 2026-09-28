import React, { useEffect, useRef, useMemo, useState } from 'react';
import { Text, View } from 'react-native';
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

const CHAR_STYLE: TextStyle = { fontFamily: FontFamily.display, fontSize: 25, letterSpacing: -0.15 };

const COLOR_FADE_DELAY_MS = 50;
const COLOR_FADE_MS = 600;
/** The entrance ends with its delayed color fade. */
const ENTRANCE_SETTLE_MS = COLOR_FADE_DELAY_MS + COLOR_FADE_MS;

type CharProps = {
  char: string;
  accentColor: string;
  textColor: string;
  style?: TextStyle;
  shimmer?: boolean;
};

// ─── Magical character that animates on mount ──────────────────────
// React props keep Reanimated's first style (opacity 0), so a settled character
// re-renders as plain text in its final style that no later commit can hide.
const MagicalChar = React.memo(function MagicalChar({ char, accentColor, textColor, style, shimmer }: CharProps) {
  const reducedMotion = useReducedMotion();
  // Reduce Motion has no entrance to wait for.
  const [settled, setSettled] = useState(reducedMotion);

  useEffect(() => {
    Haptics.selectionAsync();
  }, []);

  useEffect(() => {
    // A shimmering word loops and never settles.
    if (settled || shimmer) return;
    const settleId = setTimeout(() => setSettled(true), ENTRANCE_SETTLE_MS);
    return () => clearTimeout(settleId);
  }, [settled, shimmer]);

  if (settled) {
    return <Text style={[CHAR_STYLE, style, { color: textColor }]}>{char}</Text>;
  }
  return <EnteringChar char={char} accentColor={accentColor} textColor={textColor} style={style} shimmer={shimmer} />;
});

/** Mounted only without Reduce Motion (see MagicalChar). */
function EnteringChar({ char, accentColor, textColor, style, shimmer }: CharProps) {
  const opacity = useSharedValue(0);
  const translateY = useSharedValue(6);
  const scale = useSharedValue(0.85);
  const colorProgress = useSharedValue(0);
  const shimmerOpacity = useSharedValue(1);

  useEffect(() => {
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
      COLOR_FADE_DELAY_MS,
      withTiming(1, { duration: COLOR_FADE_MS, easing: Easing.out(Easing.cubic) }),
    );

    // Shimmer — gentle brightness pulse after appearing
    if (shimmer) {
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

  return <Animated.Text style={[CHAR_STYLE, style, animatedStyle]}>{char}</Animated.Text>;
}

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
      <Text style={[CHAR_STYLE, style]}>
      {segments.map((segment, segIndex) => {
        if (!segment) return null;

        // Space segments
        if (/^\s+$/.test(segment)) {
          const idx = globalIdx;
          globalIdx += segment.length;
          return (
            <Text
              key={`s-${idx}`}
              style={{ color: idx < visibleCount ? textColor : 'transparent' }}
            >
              {segment}
            </Text>
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
                shimmer={!!isHighlighted}
              />
            );
          }
          // Unrevealed — invisible placeholder reserving width
          return (
            <Text
              key={`c-${charGlobalIdx}`}
              style={{ color: 'transparent' }}
            >
              {char}
            </Text>
          );
        });
      })}

      </Text>
    </View>
  );
}
