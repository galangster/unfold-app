import { useMemo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { BlurView } from 'expo-blur';
import { SunIcon } from 'phosphor-react-native';
import Animated, { FadeIn, useReducedMotion } from 'react-native-reanimated';
import { FontFamily, FontSize } from '@/constants/fonts';
import { useTheme } from '@/lib/theme';
import { Spacing } from '@/constants/spacing';
import { Radius } from '@/constants/radius';
import { Duration, Ease } from '@/constants/animations';
import { Typography } from '@/constants/typography';
import { alpha } from '@/components/ui';

interface DayData {
  day: string;
  completed: boolean;
  isToday: boolean;
}

interface StreakBoxProps {
  streakCount: number;
  hasReadToday?: boolean;
  onPress?: () => void;
}

const DISPLAY_TEXT_MAX_SCALE = 1.16;
const BODY_TEXT_MAX_SCALE = 1.24;
const LABEL_TEXT_MAX_SCALE = 1.14;

function getRhythmCopy(streak: number): string {
  if (streak === 0) return 'Begin with today’s reading.';
  if (streak === 1) return 'One faithful day at a time.';
  if (streak < 7) return 'Your rhythm is taking root.';
  if (streak < 30) return 'A steady devotional rhythm.';
  return 'A long obedience, one morning at a time.';
}

function generateDaysData(streakCount: number, hasReadToday: boolean): DayData[] {
  const days = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
  const today = new Date().getDay();
  const todayIndex = today === 0 ? 6 : today - 1;
  const reorderedDays = [
    ...days.slice(todayIndex + 1),
    ...days.slice(0, todayIndex + 1),
  ];

  return reorderedDays.map((day, index) => {
    const isToday = index === 6;
    const daysFromToday = 6 - index;
    const completed = hasReadToday
      ? streakCount > 0 && daysFromToday < streakCount
      : streakCount > 0 && daysFromToday > 0 && daysFromToday <= streakCount;
    return {
      day,
      completed,
      isToday,
    };
  });
}

export function StreakBox({ streakCount, hasReadToday = false, onPress }: StreakBoxProps) {
  const { colors, isDark } = useTheme();
  const reducedMotion = useReducedMotion();
  const daysData = useMemo(() => generateDaysData(streakCount, hasReadToday), [streakCount, hasReadToday]);
  const rhythmCopy = useMemo(() => getRhythmCopy(streakCount), [streakCount]);
  const streakLabel = streakCount === 1 ? 'day' : 'days';

  return (
    <Animated.View entering={reducedMotion ? undefined : FadeIn.duration(Duration.normal).delay(260).easing(Ease.out)}>
      <TouchableOpacity
        activeOpacity={0.74}
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={`${streakCount} ${streakLabel} devotional rhythm. ${hasReadToday ? 'Today is complete.' : 'Today is not complete yet.'} Open streak settings`}
      >
        <View
          style={[
            styles.card,
            {
              backgroundColor: Platform.OS === 'ios'
                ? alpha(colors.backgroundElevated, isDark ? 0.56 : 0.8)
                : alpha(colors.backgroundElevated, 0.9),
              borderColor: alpha(colors.accent, 0.25),
            },
          ]}
        >
          {Platform.OS === 'ios' && (
            <BlurView
              intensity={isDark ? 28 : 18}
              tint={isDark ? 'dark' : 'light'}
              style={StyleSheet.absoluteFill}
            />
          )}

          <View style={styles.headerRow}>
            <View style={styles.headerLeft}>
              <View style={[styles.iconShell, { backgroundColor: alpha(colors.accent, streakCount > 0 ? 0.16 : 0.08) }]}>
                <SunIcon
                  size={18}
                  color={streakCount > 0 ? colors.accent : colors.textMuted}
                  weight={streakCount >= 7 ? 'fill' : 'light'}
                />
              </View>
              <View style={styles.copyColumn}>
                <Text style={[styles.kicker, { color: colors.accent }]} maxFontSizeMultiplier={LABEL_TEXT_MAX_SCALE}>Daily rhythm</Text>
                <Text style={[styles.motivationText, { color: colors.textMuted }]} numberOfLines={2} maxFontSizeMultiplier={BODY_TEXT_MAX_SCALE}>
                  {rhythmCopy}
                </Text>
              </View>
            </View>

            <View style={styles.streakCountRow}>
              <Text style={[styles.streakNumber, { color: streakCount > 0 ? colors.accent : colors.text }]} maxFontSizeMultiplier={DISPLAY_TEXT_MAX_SCALE}>
                {streakCount}
              </Text>
              <Text style={[styles.streakUnit, { color: colors.textMuted }]} maxFontSizeMultiplier={LABEL_TEXT_MAX_SCALE}>{streakLabel}</Text>
            </View>
          </View>

          <View style={styles.calendarStrip}>
            {daysData.map((day, index) => {
              const filled = day.completed;
              return (
                <View key={`${day.day}-${index}`} style={styles.dayColumn}>
                  <View
                    style={[
                      styles.dayDot,
                      {
                        backgroundColor: filled ? colors.accent : alpha(colors.text, 0.08),
                        borderColor: day.isToday ? alpha(colors.accent, 0.55) : 'transparent',
                      },
                    ]}
                  />
                  <Text style={[styles.dayLabel, { color: day.isToday ? colors.text : colors.textSubtle }]} maxFontSizeMultiplier={LABEL_TEXT_MAX_SCALE}>
                    {day.day}
                  </Text>
                </View>
              );
            })}
          </View>
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: Radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    paddingVertical: Spacing['4'],
    paddingHorizontal: Spacing['4'],
    overflow: 'hidden',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing['4'],
  },
  headerLeft: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing['3'],
  },
  iconShell: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  copyColumn: {
    flex: 1,
  },
  kicker: {
    ...Typography.cardMeta,
    marginBottom: 3,
  },
  motivationText: {
    fontFamily: FontFamily.body,
    fontSize: 13,
    lineHeight: 18,
  },
  streakCountRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 4,
  },
  streakNumber: {
    fontFamily: FontFamily.display,
    fontSize: 30,
    lineHeight: 34,
    letterSpacing: -0.15,
  },
  streakUnit: {
    fontFamily: FontFamily.ui,
    fontSize: FontSize.xs,
  },
  calendarStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: Spacing['4'],
    paddingTop: Spacing['3'],
  },
  dayColumn: {
    alignItems: 'center',
    gap: 5,
  },
  dayDot: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 1,
  },
  dayLabel: {
    fontFamily: FontFamily.ui,
    fontSize: FontSize.xs,
  },
});
