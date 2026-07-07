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
import MaskedView from '@react-native-masked-view/masked-view';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { useTheme } from '@/lib/theme';
import { alpha } from '@/components/ui';
import { Radius } from '@/constants/radius';
import { FontFamily, FontSize } from '@/constants/fonts';
import { Spacing } from '@/constants/spacing';
import { Duration } from '@/constants/animations';
import { smartQuotes } from '@/lib/smart-quotes';
import { SUGGESTION_CHIP_TEXT_LINE_HEIGHT } from '@/lib/companion-status-slot';

const EASE_OUT = Easing.out(Easing.cubic);

// Edge-fade bands as a fraction of the row width. Leading kept tight so the
// 56pt companion-text alignment stays crisp; trailing carries the bezel softening.
const CHIP_LEADING_FADE = 0.02;
const CHIP_TRAILING_FADE = 0.09;

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
    opacity.value = withDelay(delay, withTiming(1, { duration: Duration.normal, easing: EASE_OUT }));
    translateY.value = withDelay(delay, withTiming(0, { duration: Duration.normal, easing: EASE_OUT }));
  }, [delay, opacity, translateY]);

  const style = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: translateY.value }, { scale: scale.value }],
  }));

  return (
    <Animated.View style={style} exiting={FadeOut.duration(Duration.fast)}>
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
          borderRadius: Radius.xl,
          paddingHorizontal: 14,
          paddingVertical: Spacing['2'],
        }}
      >
        <Text
          style={{
            fontFamily: FontFamily.body,
            fontSize: FontSize.sm,
            // Explicit so chip height stays in lockstep with the reserved
            // status slot (WR-17) — see companion-status-slot.ts.
            lineHeight: SUGGESTION_CHIP_TEXT_LINE_HEIGHT,
            color: colors.text,
          }}
          numberOfLines={1}
        >
          {smartQuotes(text)}
        </Text>
      </TouchableOpacity>
    </Animated.View>
  );
}

export function SuggestionChips({ suggestions, onSelect, visible }: Props) {
  const { colors } = useTheme();

  if (!visible || suggestions.length === 0) return null;

  return (
    <View style={{ paddingVertical: Spacing['2'] }}>
      {/* Horizontal edge fade — chips soften at the screen bezel instead of
          hard-clipping mid-pill. The mask only touches alpha, so it reads
          identically on dark and light. The leading band is kept narrow so the
          56pt companion-text alignment is preserved; the trailing band carries
          the bezel fade. */}
      <MaskedView
        style={{ flexGrow: 0 }}
        maskElement={
          <LinearGradient
            style={{ flex: 1 }}
            colors={['transparent', 'black', 'black', 'transparent']}
            locations={[0, CHIP_LEADING_FADE, 1 - CHIP_TRAILING_FADE, 1]}
            start={{ x: 0, y: 0.5 }}
            end={{ x: 1, y: 0.5 }}
          />
        }
      >
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{
            paddingLeft: 56, // aligned with companion text (16 + 28 + 12)
            paddingRight: Spacing['6'],
            gap: Spacing['2'],
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
      </MaskedView>
    </View>
  );
}
