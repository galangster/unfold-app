import React, { useEffect, useRef } from 'react';
import { View } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  Easing,
  cancelAnimation,
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

interface WordProps {
  word: string;
  wordIndex: number;
  startCharIndex: number;
  charDelay: number;
  baseDelay: number;
  style?: TextStyle;
}

interface CharacterProps {
  char: string;
  globalIndex: number;
  charDelay: number;
  baseDelay: number;
  style?: TextStyle;
  triggerHaptic?: boolean;
}

const AnimatedChar = ({ char, globalIndex, charDelay, baseDelay, style, triggerHaptic }: CharacterProps) => {
  const { colors } = useTheme();
  const opacity = useSharedValue(0);
  const translateY = useSharedValue(4);
  const isMounted = useRef(true);

  useEffect(() => {
    isMounted.current = true;

    // Add slight randomness for organic feel (±10ms)
    const randomOffset = (Math.random() - 0.5) * 20;
    const animDelay = baseDelay + globalIndex * charDelay + randomOffset;

    const timer = setTimeout(() => {
      if (!isMounted.current) return;

      // Trigger haptic for first char of each word
      if (triggerHaptic) {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      }

      opacity.value = withTiming(1, {
        duration: 60,
        easing: Easing.out(Easing.ease),
      });
      translateY.value = withTiming(0, {
        duration: 60,
        easing: Easing.out(Easing.ease),
      });
    }, Math.max(0, animDelay));

    return () => {
      isMounted.current = false;
      clearTimeout(timer);
      cancelAnimation(opacity);
      cancelAnimation(translateY);
    };
  }, [globalIndex, charDelay, baseDelay, triggerHaptic, opacity, translateY]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: translateY.value }],
  }));

  return (
    <Animated.Text
      style={[
        {
          fontFamily: FontFamily.display,
          fontSize: 28,
          color: colors.text,
        },
        style,
        animatedStyle,
      ]}
    >
      {char}
    </Animated.Text>
  );
};

// Render a word as a unit that won't break
const AnimatedWord = ({ word, startCharIndex, charDelay, baseDelay, style }: Omit<WordProps, 'wordIndex'>) => {
  const characters = word.split('');

  return (
    <View style={{ flexDirection: 'row' }}>
      {characters.map((char, charIndex) => (
        <AnimatedChar
          key={`${startCharIndex + charIndex}-${char}`}
          char={char}
          globalIndex={startCharIndex + charIndex}
          charDelay={charDelay}
          baseDelay={baseDelay}
          style={style}
          triggerHaptic={charIndex === 0} // Haptic on first char of word
        />
      ))}
    </View>
  );
};

// Render a space character
const AnimatedSpace = ({ globalIndex, charDelay, baseDelay, style }: Omit<CharacterProps, 'char' | 'triggerHaptic'>) => {
  const { colors } = useTheme();
  const opacity = useSharedValue(0);
  const isMounted = useRef(true);

  useEffect(() => {
    isMounted.current = true;
    const animDelay = baseDelay + globalIndex * charDelay;

    const timer = setTimeout(() => {
      if (!isMounted.current) return;
      opacity.value = withTiming(1, { duration: 30 });
    }, Math.max(0, animDelay));

    return () => {
      isMounted.current = false;
      clearTimeout(timer);
      cancelAnimation(opacity);
    };
  }, [globalIndex, charDelay, baseDelay, opacity]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
  }));

  return (
    <Animated.Text
      style={[
        {
          fontFamily: FontFamily.display,
          fontSize: 28,
          color: colors.text,
        },
        style,
        animatedStyle,
      ]}
    >
      {' '}
    </Animated.Text>
  );
};

export function TypewriterText({
  text,
  onComplete,
  delay = 0,
  charDelay = 35, // Faster: was 60, now 35
  style,
}: TypewriterTextProps) {
  // Normalize whitespace: replace all whitespace sequences (including newlines) with single spaces
  const normalizedText = text.replace(/\s+/g, ' ').trim();

  useEffect(() => {
    const totalDuration = delay + normalizedText.length * charDelay + 150;
    const timer = setTimeout(() => {
      onComplete?.();
    }, totalDuration);

    return () => clearTimeout(timer);
  }, [normalizedText, delay, charDelay, onComplete]);

  // Split text into words, preserving spaces as separate items
  const words = normalizedText.split(/(\s+)/);

  let charIndex = 0;

  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
      {words.map((segment, wordIndex) => {
        const startIndex = charIndex;
        charIndex += segment.length;

        // If it's whitespace, render spaces
        if (/^\s+$/.test(segment)) {
          return segment.split('').map((_, spaceIndex) => (
            <AnimatedSpace
              key={`space-${startIndex + spaceIndex}`}
              globalIndex={startIndex + spaceIndex}
              charDelay={charDelay}
              baseDelay={delay}
              style={style}
            />
          ));
        }

        // Render word as a unit (won't break mid-word)
        return (
          <AnimatedWord
            key={`word-${wordIndex}`}
            word={segment}
            startCharIndex={startIndex}
            charDelay={charDelay}
            baseDelay={delay}
            style={style}
          />
        );
      })}
    </View>
  );
}
