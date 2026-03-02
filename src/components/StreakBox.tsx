import { useEffect } from 'react';
import { View, Text, Pressable } from 'react-native';
import { Flame } from 'lucide-react-native';
import Animated, {
  FadeInDown,
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import { FontFamily } from '@/constants/fonts';
import { useTheme } from '@/lib/theme';

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
  const { colors, isDark } = useTheme();

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
                color: isDark ? '#1C1710' : '#FFFFFF',
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
                <Flame
                  size={32}
                  color={colors.accent}
                  fill={streakCount >= 7 ? colors.accent : 'transparent'}
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
        </View>
      </Pressable>
    </Animated.View>
  );
}
