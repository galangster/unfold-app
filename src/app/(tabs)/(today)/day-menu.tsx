import { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { CheckIcon, LockSimpleIcon } from 'phosphor-react-native';
import * as Haptics from 'expo-haptics';
import { FontFamily, FontSize } from '@/constants/fonts';
import { Radius } from '@/constants/radius';
import { Spacing } from '@/constants/spacing';
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
  const [pressedDay, setPressedDay] = useState<number | null>(null);

  if (!devotional) {
    return (
      <SafeAreaView style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <Text style={{ fontFamily: FontFamily.body, color: colors.textMuted }}>
          Series not found
        </Text>
      </SafeAreaView>
    );
  }

  const handleSelectDay = (dayNumber: number) => {
    if (dayNumber > devotional.currentDay) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.replace({
      pathname: '/(tabs)/(today)/reading',
      params: { dayNumber: dayNumber.toString() },
    });
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['top', 'bottom']}>
      {/* Header */}
      <Animated.View entering={FadeIn.duration(400)} style={{ paddingHorizontal: Spacing['8'], paddingTop: Spacing['5'], paddingBottom: Spacing['5'] }}>
        <Text
          style={{
            fontFamily: FontFamily.uiMedium,
            fontSize: FontSize.xs,
            color: colors.textSubtle,
            textTransform: 'uppercase',
            letterSpacing: 1.2,
            textAlign: 'left',
            lineHeight: 18,
          }}
          numberOfLines={2}
          adjustsFontSizeToFit
          minimumFontScale={0.85}
        >
          {devotional.title}
        </Text>
        <Text
          style={{
            fontFamily: FontFamily.display,
            fontSize: FontSize['2xl'],
            color: colors.text,
            textAlign: 'left',
            marginTop: Spacing['3'],
          }}
        >
          Select a Day
        </Text>
      </Animated.View>

      {/* Day List */}
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingHorizontal: Spacing['5'], paddingBottom: Spacing['5'] }}
        showsVerticalScrollIndicator={false}
      >
        {devotional.days.map((day, index) => {
          const isActive = day.dayNumber === currentViewingDay;
          const isDayRead = day.isRead;
          const isLocked = day.dayNumber > devotional.currentDay;

          return (
            <Animated.View
              key={day.dayNumber}
              entering={FadeInDown.duration(350).delay(Math.min(index * 40, 400))}
            >
            <TouchableOpacity activeOpacity={isLocked ? 1 : 0.7}
              onPress={() => handleSelectDay(day.dayNumber)}
              onPressIn={() => { if (!isLocked) setPressedDay(day.dayNumber); }}
              onPressOut={() => setPressedDay(null)}
              style={{
                opacity: isLocked ? 0.38 : 1,
                backgroundColor: isActive
                  ? colors.buttonBackgroundPressed
                  : pressedDay === day.dayNumber
                  ? colors.glassBackground
                  : 'transparent',
                paddingVertical: Spacing['4'],
                paddingHorizontal: Spacing['4'],
                borderRadius: Radius.card,
                flexDirection: 'row',
                alignItems: 'center',
                marginBottom: 6,
                borderWidth: 1,
                borderColor: isActive ? colors.border : 'transparent',
              }}
            >
              {/* Completion / lock indicator */}
              <View
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: Radius.card,
                  backgroundColor: isDayRead ? colors.text : colors.inputBackground,
                  justifyContent: 'center',
                  alignItems: 'center',
                  marginRight: 14,
                }}
              >
                {isLocked ? (
                  <LockSimpleIcon size={13} color={colors.textMuted} weight="light" />
                ) : isDayRead ? (
                  <CheckIcon size={16} color={colors.background} weight="bold" />
                ) : (
                  <Text
                    style={{
                      fontFamily: FontFamily.mono,
                      fontSize: FontSize.xs,
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
                    fontSize: FontSize.xs,
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
                    fontSize: FontSize.base,
                    color: isLocked ? colors.textMuted : colors.text,
                  }}
                  numberOfLines={1}
                >
                  {day.title}
                </Text>
              </View>

              {isActive && !isLocked && (
                <View
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: 4,
                    backgroundColor: colors.accent,
                  }}
                />
              )}
            </TouchableOpacity>
            </Animated.View>
          );
        })}
      </ScrollView>
    </SafeAreaView>
  );
}
