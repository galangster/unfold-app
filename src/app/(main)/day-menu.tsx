import { View, Text, ScrollView, Pressable } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Check } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { FontFamily } from '@/constants/fonts';
import { useTheme } from '@/lib/theme';
import { useUnfoldStore } from '@/lib/store';

export default function DayMenuScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const params = useLocalSearchParams<{
    devotionalId: string;
    currentDay: string;
  }>();

  const devotionals = useUnfoldStore((s) => s.devotionals);
  const devotional = devotionals.find((d) => d.id === params.devotionalId);
  const currentViewingDay = parseInt(params.currentDay ?? '1', 10);

  if (!devotional) {
    return (
      <SafeAreaView style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <Text style={{ fontFamily: FontFamily.body, color: colors.textMuted }}>
          Journey not found
        </Text>
      </SafeAreaView>
    );
  }

  const handleSelectDay = (dayNumber: number) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    
    // Navigate back with the selected day as a param
    // The reading screen will pick this up via params or we navigate directly
    router.replace({
      pathname: '/(main)/reading',
      params: { dayNumber: dayNumber.toString() },
    });
  };

  return (
    <SafeAreaView style={{ flex: 1 }} edges={['top', 'bottom']}>
      {/* Header */}
      <View style={{ paddingHorizontal: 20, paddingTop: 8, paddingBottom: 16 }}>
        <Text
          style={{
            fontFamily: FontFamily.uiMedium,
            fontSize: 13,
            color: colors.textSubtle,
            textTransform: 'uppercase',
            letterSpacing: 1.5,
            textAlign: 'center',
          }}
        >
          {devotional.title}
        </Text>
        <Text
          style={{
            fontFamily: FontFamily.display,
            fontSize: 24,
            color: colors.text,
            textAlign: 'center',
            marginTop: 8,
          }}
        >
          Select a Day
        </Text>
      </View>

      {/* Day List */}
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 20 }}
        showsVerticalScrollIndicator={false}
      >
        {devotional.days.map((day) => {
          const isActive = day.dayNumber === currentViewingDay;
          const isDayRead = day.isRead;

          return (
            <Pressable
              key={day.dayNumber}
              onPress={() => handleSelectDay(day.dayNumber)}
              style={({ pressed }) => ({
                backgroundColor: isActive
                  ? colors.buttonBackgroundPressed
                  : pressed
                  ? colors.glassBackground
                  : 'transparent',
                paddingVertical: 16,
                paddingHorizontal: 16,
                borderRadius: 14,
                flexDirection: 'row',
                alignItems: 'center',
                marginBottom: 6,
                borderWidth: 1,
                borderColor: isActive ? colors.border : 'transparent',
              })}
            >
              {/* Completion indicator */}
              <View
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: 14,
                  backgroundColor: isDayRead ? colors.text : colors.inputBackground,
                  justifyContent: 'center',
                  alignItems: 'center',
                  marginRight: 14,
                }}
              >
                {isDayRead ? (
                  <Check size={16} color={colors.background} strokeWidth={2.5} />
                ) : (
                  <Text
                    style={{
                      fontFamily: FontFamily.mono,
                      fontSize: 12,
                      color: colors.textSubtle,
                    }}
                  >
                    {day.dayNumber}
                  </Text>
                )}
              </View>

              <View style={{ flex: 1 }}>
                <Text
                  style={{
                    fontFamily: FontFamily.ui,
                    fontSize: 12,
                    color: colors.textSubtle,
                    marginBottom: 2,
                    textTransform: 'uppercase',
                    letterSpacing: 0.5,
                  }}
                >
                  Day {day.dayNumber}
                </Text>
                <Text
                  style={{
                    fontFamily: FontFamily.uiMedium,
                    fontSize: 16,
                    color: colors.text,
                  }}
                  numberOfLines={1}
                >
                  {day.title}
                </Text>
              </View>

              {isActive && (
                <View
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: 4,
                    backgroundColor: colors.accent,
                  }}
                />
              )}
            </Pressable>
          );
        })}
      </ScrollView>
    </SafeAreaView>
  );
}
