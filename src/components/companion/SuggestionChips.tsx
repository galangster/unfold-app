/**
 * SuggestionChips — horizontal scrollable follow-up prompts.
 * 2-3 chips that auto-send when tapped.
 *
 * ANIMATION STORYBOARD — Chip Interactions
 *
 *   0ms   staggered entrance: fade + slide up (250ms, 60ms stagger)
 *   tap   pressed chip: scale 0.95 (spring, critically-damped)
 *   release: scale 1.0 (spring)
 *   unmount: all chips fade out (150ms)
 */
import { useEffect } from 'react';
import { ScrollView, Text, TouchableOpacity, View } from 'react-native';
import Animated, {
  FadeOut,
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withDelay,
  withSpring,
  Easing,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { useTheme } from '@/lib/theme';
import { alpha } from '@/components/ui';
import { FontFamily } from '@/constants/fonts';

const EASE_OUT = Easing.out(Easing.cubic);

interface Props {
  suggestions: string[];
  onSelect: (text: string) => void;
  visible: boolean;
}

const PRESS_SPRING = { damping: 35, stiffness: 300 }; // critically-damped (ratio >= 1.0), no bounce

function AnimatedChip({
  text,
  onPress,
  delay,
  accentColor,
  colors,
}: {
  text: string;
  onPress: () => void;
  delay: number;
  accentColor: string;
  colors: any;
}) {
  const opacity = useSharedValue(0);
  const translateY = useSharedValue(16);
  const scale = useSharedValue(1);

  useEffect(() => {
    opacity.value = withDelay(delay, withTiming(1, { duration: 250, easing: EASE_OUT }));
    translateY.value = withDelay(delay, withTiming(0, { duration: 250, easing: EASE_OUT }));
  }, [delay, opacity, translateY]);

  const style = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: translateY.value }, { scale: scale.value }],
  }));

  return (
    <Animated.View style={style} exiting={FadeOut.duration(150)}>
      <TouchableOpacity
        activeOpacity={0.7}
        onPressIn={() => {
          scale.value = withSpring(0.95, PRESS_SPRING);
        }}
        onPressOut={() => {
          scale.value = withSpring(1, PRESS_SPRING);
        }}
        onPress={() => {
          Haptics.selectionAsync();
          onPress();
        }}
        style={{
          backgroundColor: colors.inputBackground,
          borderWidth: 1,
          borderColor: alpha(accentColor, 0.20),
          borderRadius: 20,
          paddingHorizontal: 14,
          paddingVertical: 8,
        }}
      >
        <Text
          style={{
            fontFamily: FontFamily.body,
            fontSize: 14,
            color: colors.text,
          }}
          numberOfLines={1}
        >
          {text}
        </Text>
      </TouchableOpacity>
    </Animated.View>
  );
}

export function SuggestionChips({ suggestions, onSelect, visible }: Props) {
  const { colors } = useTheme();

  if (!visible || suggestions.length === 0) return null;

  return (
    <View style={{ paddingVertical: 8 }}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{
          paddingLeft: 56, // aligned with companion text (16 + 28 + 12)
          paddingRight: 16,
          gap: 8,
        }}
        style={{ flexGrow: 0 }}
      >
        {suggestions.map((text, i) => (
          <AnimatedChip
            key={text}
            text={text}
            onPress={() => onSelect(text)}
            delay={i * 60}
            accentColor={colors.accent}
            colors={colors}
          />
        ))}
      </ScrollView>
    </View>
  );
}
