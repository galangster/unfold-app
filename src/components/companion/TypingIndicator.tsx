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
} from 'react-native-reanimated';
import { Duration } from '@/constants/animations';
import { ChatCircleDotsIcon } from 'phosphor-react-native';
import { useTheme } from '@/lib/theme';
import { alpha } from '@/components/ui';
import { Radius } from '@/constants/radius';
import { Spacing } from '@/constants/spacing';

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

const ENTERING = FadeIn.duration(Duration.normal);

export function TypingIndicator() {
  const { colors } = useTheme();

  useEffect(() => {
    Haptics.selectionAsync();
  }, []);

  return (
    <Animated.View entering={ENTERING} style={{ flexDirection: 'row', alignItems: 'flex-start', paddingLeft: Spacing['4'] }}>
      {/* Companion icon */}
      <View
        style={{
          width: 28,
          height: 28,
          borderRadius: Radius.card,
          backgroundColor: alpha(colors.accent, 0.12),
          alignItems: 'center',
          justifyContent: 'center',
          marginRight: Spacing['3'],
        }}
      >
        <ChatCircleDotsIcon size={14} color={colors.accent} weight="light" />
      </View>

      {/* Three dots */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: DOT_GAP,
          paddingTop: Spacing['2'],
        }}
      >
        <Dot delay={0} color={colors.textSubtle} />
        <Dot delay={STAGGER} color={colors.textSubtle} />
        <Dot delay={STAGGER * 2} color={colors.textSubtle} />
      </View>
    </Animated.View>
  );
}
