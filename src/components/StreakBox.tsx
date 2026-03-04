import { useEffect, useMemo } from 'react';
import { View, Text, Pressable } from 'react-native';
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
import { FontFamily } from '@/constants/fonts';
import { useTheme } from '@/lib/theme';

/** Returns motivational micro-copy based on streak length */
function getStreakMotivation(streak: number): string {
  if (streak === 0) return 'Start your journey today';
  if (streak <= 2) return "You're building momentum!";
  if (streak <= 6) return 'Keep going \u2014 a freeze awaits at day 7!';
  if (streak <= 13) return 'Amazing week! Keep the light shining';
  if (streak <= 29) return "Two weeks strong! You're glowing";
  return `Incredible dedication! ${streak} days and counting`;
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
      <View key={index} style={{ alignItems: 'center' }}>
        <View
          style={{
            width: 24,
            height: 24,
            borderRadius: 12,
            justifyContent: 'center',
            alignItems: 'center',
            backgroundColor: isCompleted ? colors.accent : 'transparent',
            borderWidth: isCompleted ? 0 : 1.5,
            borderColor: isToday ? colors.accent : colors.border,
          }}
        >
          {isCompleted && (
            <Text
              style={{
                fontFamily: FontFamily.uiSemiBold,
                fontSize: 10,
                color: colors.background,
              }}
            >
              {day.day}
            </Text>
          )}
          {!isCompleted && isToday && (
            <View
              style={{
                width: 8,
                height: 8,
                borderRadius: 4,
                backgroundColor: colors.accent,
              }}
            />
          )}
        </View>
        <Text
          style={{
            fontFamily: FontFamily.ui,
            fontSize: 10,
            color: isToday ? colors.text : colors.textMuted,
            marginTop: 4,
          }}
        >
          {day.day}
        </Text>
      </View>
    );
  });

  return (
    <Animated.View entering={FadeInDown.duration(600).delay(400)}>
      <Pressable onPress={onPress}>
        <View
          style={{
            backgroundColor: colors.inputBackground,
            borderRadius: 16,
            borderWidth: 1,
            borderColor: colors.border,
            padding: 20,
          }}
        >
          {/* Header row - Current Streak label on left, streak count on right */}
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <Animated.View style={flamePulseStyle}>
                <SunIcon
                  size={32}
                  color={colors.accent}
                  weight={streakCount >= 7 ? "fill" : "light"}
                />
              </Animated.View>
              <Text
                style={{
                  fontFamily: FontFamily.uiMedium,
                  fontSize: 14,
                  color: colors.textMuted,
                }}
              >
                Current Streak
              </Text>
            </View>

            {/* Streak count - number and label horizontally aligned with consistent font */}
            <View style={{ flexDirection: 'row', alignItems: 'baseline' }}>
              <Text
                style={{
                  fontFamily: FontFamily.uiSemiBold,
                  fontSize: 28,
                  color: colors.text,
                  letterSpacing: -0.5,
                }}
              >
                {streakCount}
              </Text>
              <Text
                style={{
                  fontFamily: FontFamily.uiSemiBold,
                  fontSize: 14,
                  color: colors.textMuted,
                  marginLeft: 4,
                }}
              >
                {streakLabel}
              </Text>
            </View>
          </View>

          {/* 7-day mini calendar strip */}
          <View
            style={{
              flexDirection: 'row',
              justifyContent: 'space-between',
              paddingTop: 8,
              borderTopWidth: 1,
              borderTopColor: colors.border,
            }}
          >
            {weekDays}
          </View>

          {/* Motivational micro-copy */}
          <Animated.Text
            entering={FadeIn.delay(600).duration(400)}
            style={{
              fontFamily: FontFamily.ui,
              fontSize: 13,
              color: colors.textMuted,
              textAlign: 'center',
              marginTop: 14,
            }}
          >
            {motivation}
          </Animated.Text>

          {/* Freeze progress dots */}
          {streakCount > 0 && (
            <Animated.View
              entering={FadeIn.delay(700).duration(400)}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                marginTop: 10,
                gap: 6,
              }}
            >
              <SnowflakeIcon size={12} color={colors.textSubtle} weight="light" />
              <View style={{ flexDirection: 'row', gap: 4 }}>
                {Array.from({ length: 7 }).map((_, i) => (
                  <View
                    key={i}
                    style={{
                      width: 6,
                      height: 6,
                      borderRadius: 3,
                      backgroundColor: i < freezeDots
                        ? colors.accent
                        : colors.border,
                    }}
                  />
                ))}
              </View>
              <Text
                style={{
                  fontFamily: FontFamily.ui,
                  fontSize: 10,
                  color: colors.textSubtle,
                  marginLeft: 2,
                }}
              >
                {freezeDots === 7 ? 'Freeze earned!' : `${freezeDots}/7`}
              </Text>
            </Animated.View>
          )}
        </View>
      </Pressable>
    </Animated.View>
  );
}
