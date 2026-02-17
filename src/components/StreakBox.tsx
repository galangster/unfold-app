import { View, Text, Pressable } from 'react-native';
import { Flame } from 'lucide-react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
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
            backgroundColor: isCompleted ? '#C8A55C' : 'transparent',
            borderWidth: isCompleted ? 0 : 1.5,
            borderColor: isToday ? '#C8A55C' : colors.border,
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
                backgroundColor: '#C8A55C',
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
          {/* Header with flame and streak count */}
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 16 }}>
            <View style={{ marginRight: 12 }}>
              <Flame
                size={32}
                color="#C8A55C"
                fill={streakCount >= 7 ? '#C8A55C' : 'transparent'}
              />
            </View>

            <View style={{ flex: 1 }}>
              <Text
                style={{
                  fontFamily: FontFamily.uiMedium,
                  fontSize: 14,
                  color: colors.textMuted,
                }}
              >
                Current Streak
              </Text>
              <View style={{ flexDirection: 'row', alignItems: 'baseline' }}>
                <Text
                  style={{
                    fontFamily: FontFamily.display,
                    fontSize: 28,
                    color: colors.text,
                    letterSpacing: -0.5,
                  }}
                >
                  {streakCount}
                </Text>
                <Text
                  style={{
                    fontFamily: FontFamily.ui,
                    fontSize: 14,
                    color: colors.textMuted,
                    marginLeft: 6,
                  }}
                >
                  {streakLabel}
                </Text>
              </View>
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
