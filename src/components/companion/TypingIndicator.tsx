/**
 * TypingIndicator — three-dot pulse animation.
 * Opacity-only, no vertical bounce (per user rules).
 *
 * ANIMATION: Fade in on entrance (200ms). Dots pulse internally.
 */
import { useEffect } from 'react';
import { View } from 'react-native';
import * as Haptics from 'expo-haptics';
import Animated, {
  FadeIn,
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withSequence,
  withTiming,
  withDelay,
  useReducedMotion,
} from 'react-native-reanimated';
import { Duration, Ease } from '@/constants/animations';
import { useTheme } from '@/lib/theme';
import { Spacing } from '@/constants/spacing';
import { CompanionOrb } from '@/components/CompanionOrb';

const DOT_SIZE = 6;
const DOT_GAP = 6;
const STAGGER = 150;
const HALF_CYCLE = 400;

function Dot({ delay, color }: { delay: number; color: string }) {
  const opacity = useSharedValue(0.3);

  useEffect(() => {
    opacity.value = withDelay(
      delay,
      withRepeat(
        withSequence(
          withTiming(1, { duration: HALF_CYCLE }),
          withTiming(0.3, { duration: HALF_CYCLE })
        ),
        -1
      )
    );
  }, [delay, opacity]);

  const style = useAnimatedStyle(() => ({ opacity: opacity.value }));

  return (
    <Animated.View
      style={[
        {
          width: DOT_SIZE,
          height: DOT_SIZE,
          borderRadius: DOT_SIZE / 2,
          backgroundColor: color,
        },
        style,
      ]}
    />
  );
}

/* ─────────────────────────────────────────────────────────
 * ANIMATION STORYBOARD — Typing Indicator Entrance
 *
 *   0ms   haptic selection + container fade in (200ms)
 *         dots begin pulsing immediately on mount
 * ───────────────────────────────────────────────────────── */

const ENTERING = FadeIn.duration(Duration.normal).easing(Ease.out);

export function TypingIndicator() {
  const { colors } = useTheme();
  const reducedMotion = useReducedMotion();

  useEffect(() => {
    Haptics.selectionAsync();
  }, []);

  return (
    <Animated.View
      entering={reducedMotion ? undefined : ENTERING}
      accessible
      accessibilityLabel="Companion is thinking"
      accessibilityLiveRegion="polite"
      style={{ flexDirection: 'row', alignItems: 'center', paddingLeft: Spacing['4'] }}
    >
      {/* Companion orb — same size as in CompanionMessageContent */}
      <CompanionOrb accentColor={colors.accent} size={28} />
      <View style={{ width: Spacing['3'] }} />

      {/* Three dots */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: DOT_GAP,
        }}
      >
        <Dot delay={0} color={colors.textSubtle} />
        <Dot delay={STAGGER} color={colors.textSubtle} />
        <Dot delay={STAGGER * 2} color={colors.textSubtle} />
      </View>
    </Animated.View>
  );
}
