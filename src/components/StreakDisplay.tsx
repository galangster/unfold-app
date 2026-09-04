import { useEffect } from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { SunIcon, SnowflakeIcon } from '@/components/icons';
import * as Haptics from 'expo-haptics';
import Animated, {
  FadeIn,
  FadeInUp,
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  Easing,
  useReducedMotion,
  cancelAnimation,
} from 'react-native-reanimated';
import { FontFamily } from '@/constants/fonts';
import { useTheme } from '@/lib/theme';
import { Spacing } from '@/constants/spacing';
import { Ease } from '@/constants/animations';
import { useUnfoldStore } from '@/lib/store';
import { Radius } from '@/constants/radius';

interface StreakDisplayProps {
  size?: 'small' | 'medium' | 'large';
  compact?: boolean;
  showFreeze?: boolean;
  hideDayLabel?: boolean;
  onPress?: () => void;
}

export function StreakDisplay({ size = 'medium', compact, showFreeze = true, hideDayLabel, onPress }: StreakDisplayProps) {
  const { colors, isDark } = useTheme();
  const router = useRouter();
  const reducedMotion = useReducedMotion();
  const streak = useUnfoldStore((s) => s.streakCurrent);
  const freezes = useUnfoldStore((s) => s.streakFreezes);

  const sizeConfig = compact
    ? { flame: 16, number: 14, freeze: 12, padding: 6 }
    : size === 'small'
    ? { flame: 16, number: 14, freeze: 12, padding: 6 }
    : size === 'large'
    ? { flame: 32, number: 28, freeze: 20, padding: 14 }
    : { flame: 24, number: 18, freeze: 16, padding: 10 };

  const config = sizeConfig;

  // Breathing glow for active streaks
  const flamePulse = useSharedValue(1);
  useEffect(() => {
    if (streak > 0 && !reducedMotion) {
      flamePulse.value = withRepeat(
        withTiming(1.15, { duration: 1800, easing: Easing.inOut(Easing.ease) }),
        -1,
        true
      );
    } else {
      cancelAnimation(flamePulse);
      flamePulse.value = 1;
    }
    return () => {
      cancelAnimation(flamePulse);
    };
  }, [streak, reducedMotion, flamePulse]);

  const flamePulseStyle = useAnimatedStyle(() => ({
    transform: [{ scale: flamePulse.value }],
  }));

  const handlePress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (onPress) {
      onPress();
    } else {
      router.push('/streak-settings');
    }
  };

  if (streak === 0) {
    return (
      <TouchableOpacity activeOpacity={0.7} onPress={handlePress}>
        <Animated.View
          entering={reducedMotion ? undefined : FadeIn.easing(Ease.out)}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            backgroundColor: colors.inputBackground,
            paddingHorizontal: config.padding,
            paddingVertical: config.padding * 0.6,
            borderRadius: Radius.xl,
            gap: 6,
          }}
        >
          <SunIcon size={config.flame} color={colors.textMuted} weight="light" />
          <Text
            style={{
              fontFamily: FontFamily.uiSemiBold,
              fontSize: config.number,
              color: colors.textMuted,
            }}
          >
            Start streak
          </Text>
        </Animated.View>
      </TouchableOpacity>
    );
  }

  return (
    <TouchableOpacity
      activeOpacity={0.7}
      onPress={handlePress}
      accessibilityRole="button"
      accessibilityLabel={`${streak} day${streak !== 1 ? 's' : ''} streak`}
    >
      <Animated.View
        entering={reducedMotion ? undefined : FadeInUp.easing(Ease.out)}
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: Spacing['2'],
        }}
      >
        <View
          style={{
          flexDirection: 'row',
          alignItems: 'center',
          backgroundColor: isDark ? `${colors.accent}26` : `${colors.accent}1A`,
          paddingLeft: config.padding,
          paddingRight: config.padding + 2,
          paddingVertical: config.padding * 0.6,
          borderRadius: Radius.xl,
          gap: 6,
        }}
      >
        <Animated.View style={flamePulseStyle}>
          <SunIcon
            size={config.flame}
            color={colors.accent}
            weight={streak >= 7 ? "fill" : "light"}
          />
        </Animated.View>
        <Text
          style={{
            fontFamily: FontFamily.uiSemiBold,
            fontSize: config.number,
            color: colors.text,
            fontVariant: ['tabular-nums'],
          }}
        >
          {streak}
        </Text>
        {!hideDayLabel && (
          <Text
            style={{
              fontFamily: FontFamily.ui,
              fontSize: config.number * 0.7,
              color: colors.textMuted,
            }}
          >
            day{streak !== 1 ? 's' : ''}
          </Text>
        )}
        {hideDayLabel && (
          // Compact spots (e.g. the greeting row) hide the full "days" label
          // to save width, but a bare number reads as an unlabeled count —
          // this short suffix keeps sighted users oriented; the outer
          // TouchableOpacity carries the full "<n> days streak" label for AT.
          <Text
            importantForAccessibility="no-hide-descendants"
            style={{
              fontFamily: FontFamily.ui,
              fontSize: config.number * 0.7,
              color: colors.textMuted,
            }}
          >
            d
          </Text>
        )}
      </View>

      {showFreeze && freezes > 0 && (
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            backgroundColor: colors.inputBackground,
            paddingHorizontal: config.padding * 0.8,
            paddingVertical: config.padding * 0.6,
            borderRadius: Radius.xl,
            gap: 4,
          }}
        >
          <SnowflakeIcon size={config.freeze} color={colors.textSubtle} weight="light" />
          <Text
            style={{
              fontFamily: FontFamily.uiMedium,
              fontSize: config.number * 0.75,
              color: colors.textSubtle,
            }}
          >
            {freezes}
          </Text>
        </View>
      )}
      </Animated.View>
    </TouchableOpacity>
  );
}
