import { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, { FadeIn, FadeInDown, useReducedMotion } from 'react-native-reanimated';
import { Duration, Ease, Stagger } from '@/constants/animations';
import { CheckIcon, LockSimpleIcon } from 'phosphor-react-native';
import * as Haptics from 'expo-haptics';
import { FontFamily, FontSize } from '@/constants/fonts';
import { Radius } from '@/constants/radius';
import { Spacing } from '@/constants/spacing';
import { Typography } from '@/constants/typography';
import { useTheme } from '@/lib/theme';
import { useUnfoldStore } from '@/lib/store';
import {
  getDayMenuPresentation,
  isDevotionalDaySelectable,
  resolveInitialReadingDayNumber,
} from '@/lib/devotional-day-access';

export default function DayMenuScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const reducedMotion = useReducedMotion();
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

  const activeViewingDay = resolveInitialReadingDayNumber(devotional, currentViewingDay);

  const handleSelectDay = (dayNumber: number) => {
    if (!isDevotionalDaySelectable(devotional, dayNumber)) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.replace({
      pathname: '/(tabs)/(today)/reading',
      params: {
        devotionalId: devotional.id,
        dayNumber: dayNumber.toString(),
      },
    });
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['top', 'bottom']}>
      {/* Header */}
      <Animated.View entering={reducedMotion ? undefined : FadeIn.duration(Duration.normal).easing(Ease.out)} style={{ paddingHorizontal: Spacing['8'], paddingTop: Spacing['5'], paddingBottom: Spacing['5'] }}>
        <Text
          style={{
            ...Typography.cardMeta,
            color: colors.textSubtle,
            textAlign: 'left',
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
            fontSize: 21,
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
        {Array.from({ length: Math.max(devotional.totalDays ?? 0, (devotional.days ?? []).length) }, (_, i) => {
          const dayNumber = i + 1;
          const day = (devotional.days ?? []).find((d) => d.dayNumber === dayNumber);
          const isActive = dayNumber === activeViewingDay;
          const isDayRead = day?.isRead ?? false;
          const isLocked = !isDevotionalDaySelectable(devotional, dayNumber);
          const presentation = getDayMenuPresentation(devotional, dayNumber);
          const dayTitle = presentation.title;

          return (
            <Animated.View
              key={dayNumber}
              entering={reducedMotion ? undefined : FadeInDown.duration(Duration.slow).delay(Math.min(i * Stagger.fast, 400)).easing(Ease.out)}
            >
            <TouchableOpacity activeOpacity={isLocked ? 1 : 0.7}
              onPress={() => handleSelectDay(dayNumber)}
              onPressIn={() => { if (!isLocked) setPressedDay(dayNumber); }}
              onPressOut={() => setPressedDay(null)}
              style={{
                opacity: isLocked ? 0.38 : 1,
                backgroundColor: isActive
                  ? colors.buttonBackgroundPressed
                  : pressedDay === dayNumber
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
                      fontFamily: FontFamily.uiMedium,
                      fontSize: FontSize.xs,
                      color: colors.textSubtle,
                    }}
                  >
                    {dayNumber}
                  </Text>
                )}
              </View>

              <View style={{ flex: 1 }}>
                <Text
                  style={{
                    ...Typography.cardMeta,
                    color: colors.textSubtle,
                    marginBottom: 2,
                  }}
                >
                  Day {dayNumber}
                </Text>
                <Text
                  style={{
                    fontFamily: FontFamily.uiMedium,
                    fontSize: FontSize.base,
                    color: isLocked ? colors.textMuted : colors.text,
                  }}
                  numberOfLines={1}
                >
                  {dayTitle}
                </Text>
                {presentation.kind === 'locked-titled' && presentation.unlockLabel ? (
                  <Text
                    style={{
                      fontFamily: FontFamily.body,
                      fontSize: FontSize.xs,
                      color: colors.textSubtle,
                      marginTop: 2,
                    }}
                  >
                    {presentation.unlockLabel}
                  </Text>
                ) : null}
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
