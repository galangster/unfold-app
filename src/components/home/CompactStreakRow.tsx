import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { BlurView } from 'expo-blur';
import Animated, { FadeIn } from 'react-native-reanimated';
import { SunIcon, SnowflakeIcon } from 'phosphor-react-native';
import { FontFamily, FontSize } from '@/constants/fonts';
import { Spacing } from '@/constants/spacing';
import { Radius } from '@/constants/radius';
import { Duration, Ease } from '@/constants/animations';
import { useTheme } from '@/lib/theme';
import { alpha } from '@/components/ui';
import { useAccessibleAnimation } from '@/hooks/useAccessibility';

interface Props {
  streakCount: number;
  onPress: () => void;
}

export function CompactStreakRow({ streakCount, onPress }: Props) {
  const { colors, isDark } = useTheme();
  const { entering } = useAccessibleAnimation();

  const streakLabel = streakCount === 1 ? 'day' : 'days';

  // Freeze progress: how many days into the current 7-day cycle
  const freezeProgress = streakCount > 0 ? streakCount % 7 : 0;
  // If freezeProgress is 0 and streak > 0, they just earned a freeze (show full)
  const freezeDots = streakCount > 0 && freezeProgress === 0 ? 7 : freezeProgress;

  return (
    <Animated.View entering={entering(FadeIn.duration(Duration.normal).delay(400).easing(Ease.out))}>
      <TouchableOpacity
        activeOpacity={0.7}
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={`${streakCount} day streak. Open streak settings`}
      >
        <View
          style={[
            styles.container,
            {
              backgroundColor: Platform.OS === 'ios'
                ? alpha(colors.inputBackground, 0.6)
                : alpha(colors.inputBackground, 0.85),
              borderColor:
                streakCount > 0
                  ? alpha(colors.accent, 0.08)
                  : colors.border,
            },
          ]}
        >
          {/* Frosted glass blur (iOS only) */}
          {Platform.OS === 'ios' && (
            <BlurView
              intensity={80}
              tint={isDark ? 'dark' : 'light'}
              style={StyleSheet.absoluteFill}
            />
          )}

          {/* Sun icon */}
          <SunIcon
            size={20}
            color={colors.accent}
            weight={streakCount >= 7 ? 'fill' : 'light'}
          />

          {/* Streak count */}
          <Text
            style={[
              styles.countText,
              { color: streakCount > 0 ? colors.accent : colors.text },
            ]}
          >
            {streakCount}
          </Text>

          {/* Day/days label */}
          <Text style={[styles.labelText, { color: colors.textMuted }]}>
            {streakLabel}
          </Text>

          {/* Freeze dots section — right-aligned */}
          {streakCount > 0 && (
            <View style={styles.freezeSection}>
              <SnowflakeIcon
                size={10}
                color={colors.textSubtle}
                weight="light"
              />
              <View style={styles.freezeDotsRow}>
                {Array.from({ length: 7 }).map((_, i) => (
                  <View
                    key={i}
                    style={[
                      styles.freezeDot,
                      {
                        backgroundColor:
                          i < freezeDots ? colors.accent : colors.border,
                      },
                    ]}
                  />
                ))}
              </View>
            </View>
          )}
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing['3'],
    paddingHorizontal: Spacing['4'],
    borderRadius: Radius.lg,
    borderWidth: 1,
    overflow: 'hidden',
    gap: 6,
  },
  countText: {
    fontFamily: FontFamily.uiSemiBold,
    fontSize: FontSize.lg,
  },
  labelText: {
    fontFamily: FontFamily.ui,
    fontSize: FontSize.sm,
  },
  freezeSection: {
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: 'auto',
    gap: 4,
  },
  freezeDotsRow: {
    flexDirection: 'row',
    gap: 3,
  },
  freezeDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
  },
});
