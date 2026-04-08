import { useEffect, useMemo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { BlurView } from 'expo-blur';
import { SunIcon, SnowflakeIcon } from 'phosphor-react-native';
import Animated, {
  FadeInDown,
  FadeIn,
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import { FontFamily, FontSize } from '@/constants/fonts';
import { useTheme } from '@/lib/theme';
import { Spacing } from '@/constants/spacing';
import { alpha } from '@/components/ui';
import { Radius } from '@/constants/radius';

/** Returns motivational micro-copy based on streak length */
function getStreakMotivation(streak: number): string {
  if (streak === 0) return 'Start today';
  if (streak <= 2) return "You're building momentum!";
  if (streak <= 6) return 'Keep going \u2014 a freeze awaits at day 7!';
  if (streak <= 13) return 'A full week. Keep the light shining';
  if (streak <= 29) return `Two weeks strong! ${streak} days and counting`;
  return `${streak} days and counting. That's serious`;
}

interface DayData {
  day: string; // 'S', 'M', 'T', 'W', 'T', 'F', 'S'
  completed: boolean;
  isToday: boolean;
}

interface StreakBoxProps {
  streakCount: number;
  onPress?: () => void;
}

// Generate days data based on streak count
// Shows last N days filled based on streak, with today on the right
function generateDaysData(streakCount: number): DayData[] {
  const days = ['M', 'T', 'W', 'T', 'F', 'S', 'S']; // Mon-Sun
  const today = new Date().getDay(); // 0 = Sunday, 1 = Monday, etc.
  
  // Convert to 0-6 index where 0 = Monday, 6 = Sunday
  const todayIndex = today === 0 ? 6 : today - 1;
  
  // Reorder days so today is at the end
  const reorderedDays = [
    ...days.slice(todayIndex + 1),
    ...days.slice(0, todayIndex + 1),
  ];
  
  // Generate day data - fill the last N days based on streak
  return reorderedDays.map((day, index) => {
    const isToday = index === 6; // Last position is today
    // Fill the last `streakCount` days (excluding today if streak doesn't include today yet)
    // If streak is 0, nothing is filled
    // If streak is 2, the 2 days before today are filled
    const daysFromEnd = 6 - index;
    const completed = streakCount > 0 && daysFromEnd > 0 && daysFromEnd <= streakCount;
    
    return {
      day,
      completed,
      isToday,
    };
  });
}

export function StreakBox({ streakCount, onPress }: StreakBoxProps) {
  const { colors } = useTheme();

  // Breathing pulse for active flame
  const flamePulse = useSharedValue(1);
  useEffect(() => {
    if (streakCount > 0) {
      flamePulse.value = withRepeat(
        withTiming(1.12, { duration: 1800, easing: Easing.inOut(Easing.ease) }),
        -1,
        true
      );
    }
  }, [streakCount, flamePulse]);

  const flamePulseStyle = useAnimatedStyle(() => ({
    transform: [{ scale: flamePulse.value }],
  }));

  const daysData = generateDaysData(streakCount);
  const streakLabel = streakCount === 1 ? 'day' : 'days';
  const motivation = useMemo(() => getStreakMotivation(streakCount), [streakCount]);

  // Freeze progress: how many days into the current 7-day cycle
  const freezeProgress = streakCount > 0 ? streakCount % 7 : 0;
  // If freezeProgress is 0 and streak > 0, they just earned a freeze (show full)
  const freezeDots = streakCount > 0 && freezeProgress === 0 ? 7 : freezeProgress;

  const weekDays = daysData.map((day, index) => {
    const isCompleted = day.completed;
    const isToday = day.isToday;

    return (
      <View key={`${day.day}-${index}`} style={styles.dayColumn}>
        <View
          style={[
            styles.dayCircle,
            {
              backgroundColor: isCompleted ? colors.accent : 'transparent',
              borderWidth: isCompleted ? 0 : 1.5,
              borderColor: isToday ? colors.accent : colors.border,
            },
          ]}
        >
          {isCompleted && (
            <Text style={[styles.dayCircleText, { color: colors.background }]}>
              {day.day}
            </Text>
          )}
          {!isCompleted && isToday && (
            <View style={[styles.todayDot, { backgroundColor: colors.accent }]} />
          )}
        </View>
        <Text
          style={[styles.dayLabel, { color: isToday ? colors.text : colors.textMuted }]}
        >
          {day.day}
        </Text>
      </View>
    );
  });

  return (
    <Animated.View entering={FadeInDown.duration(600).delay(400)}>
      <TouchableOpacity activeOpacity={0.7} onPress={onPress}>
        <View
          style={[
            styles.card,
            {
              backgroundColor: 'transparent',
              borderColor: streakCount > 0 ? alpha(colors.accent, 0.08) : colors.border,
              overflow: 'hidden',
            },
          ]}
        >
          <BlurView
            intensity={40}
            tint="dark"
            style={StyleSheet.absoluteFill}
          />
          {/* Header row - Current Streak label on left, streak count on right */}
          <View style={styles.headerRow}>
            <View style={styles.headerLeft}>
              <Animated.View style={flamePulseStyle}>
                <SunIcon
                  size={32}
                  color={colors.accent}
                  weight={streakCount >= 7 ? "fill" : "light"}
                />
              </Animated.View>
              <Text style={[styles.streakLabel, { color: colors.textMuted }]}>
                Current Streak
              </Text>
            </View>

            {/* Streak count - number and label horizontally aligned with consistent font */}
            <View style={styles.streakCountRow}>
              <Text
                style={[
                  styles.streakNumber,
                  { color: streakCount > 0 ? colors.accent : colors.text },
                ]}
              >
                {streakCount}
              </Text>
              <Text style={[styles.streakUnit, { color: colors.textMuted }]}>
                {streakLabel}
              </Text>
            </View>
          </View>

          {/* 7-day mini calendar strip */}
          <View style={[styles.calendarStrip, { borderTopColor: colors.border }]}>
            {weekDays}
          </View>

          {/* Motivational micro-copy */}
          <Animated.Text
            entering={FadeIn.delay(600).duration(400)}
            style={[styles.motivationText, { color: colors.textMuted }]}
          >
            {motivation}
          </Animated.Text>

          {/* Freeze progress dots */}
          {streakCount > 0 && (
            <Animated.View
              entering={FadeIn.delay(700).duration(400)}
              style={styles.freezeRow}
            >
              <SnowflakeIcon size={12} color={colors.textSubtle} weight="light" />
              <View style={styles.freezeDotsRow}>
                {Array.from({ length: 7 }).map((_, i) => (
                  <View
                    key={i}
                    style={[
                      styles.freezeDot,
                      { backgroundColor: i < freezeDots ? colors.accent : colors.border },
                    ]}
                  />
                ))}
              </View>
              <Text style={[styles.freezeLabel, { color: colors.textSubtle }]}>
                {freezeDots === 7 ? 'Freeze earned!' : `${freezeDots}/7`}
              </Text>
            </Animated.View>
          )}
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  dayColumn: {
    alignItems: 'center',
  },
  dayCircle: {
    width: 24,
    height: 24,
    borderRadius: Radius.md,
    justifyContent: 'center',
    alignItems: 'center',
  },
  dayCircleText: {
    fontFamily: FontFamily.uiSemiBold,
    fontSize: 10,
  },
  todayDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  dayLabel: {
    fontFamily: FontFamily.ui,
    fontSize: 10,
    marginTop: 4,
  },
  card: {
    borderRadius: Radius.lg,
    borderWidth: 1,
    padding: Spacing['5'],
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing['4'],
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing['3'],
  },
  streakLabel: {
    fontFamily: FontFamily.uiMedium,
    fontSize: FontSize.sm,
  },
  streakCountRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  streakNumber: {
    fontFamily: FontFamily.uiSemiBold,
    fontSize: 32,
    letterSpacing: -1,
  },
  streakUnit: {
    fontFamily: FontFamily.uiSemiBold,
    fontSize: FontSize.sm,
    marginLeft: 4,
  },
  calendarStrip: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingTop: Spacing['2'],
    borderTopWidth: 1,
  },
  motivationText: {
    fontFamily: FontFamily.ui,
    fontSize: 13,
    textAlign: 'center',
    marginTop: 14,
  },
  freezeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 10,
    gap: 6,
  },
  freezeDotsRow: {
    flexDirection: 'row',
    gap: 4,
  },
  freezeDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  freezeLabel: {
    fontFamily: FontFamily.ui,
    fontSize: 10,
    marginLeft: 2,
  },
});
