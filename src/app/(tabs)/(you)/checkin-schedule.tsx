import { useState, useCallback, useMemo } from 'react';
import { View, Text, TouchableOpacity, ScrollView, Platform } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import DateTimePicker from '@react-native-community/datetimepicker';
import * as Haptics from 'expo-haptics';
import { CaretLeftIcon, CheckIcon } from 'phosphor-react-native';
import { FontFamily, FontSize } from '@/constants/fonts';
import { Radius } from '@/constants/radius';
import { Spacing } from '@/constants/spacing';
import { useTheme } from '@/lib/theme';
import { useUnfoldStore } from '@/lib/store';
import {
  scheduleMiddayCheckIn,
  scheduleEveningWindDown,
} from '@/lib/notifications';

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;
type DayKey = (typeof DAYS)[number];

function timeStringToDate(time: string): Date {
  const [h, m] = time.split(':').map(Number);
  const d = new Date();
  d.setHours(h, m, 0, 0);
  return d;
}

function dateToTimeString(d: Date): string {
  return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
}

function formatTime(time: string): string {
  const [h, m] = time.split(':').map(Number);
  const period = h >= 12 ? 'PM' : 'AM';
  const hour12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${hour12}:${m.toString().padStart(2, '0')} ${period}`;
}

type CheckInType = 'midday' | 'evening';

export default function CheckInScheduleScreen() {
  const router = useRouter();
  const { type } = useLocalSearchParams<{ type: CheckInType }>();
  const { colors } = useTheme();

  const isPremium = useUnfoldStore((s) => s.user?.isPremium ?? false);

  const checkInType: CheckInType = type === 'evening' ? 'evening' : 'midday';
  const isMidday = checkInType === 'midday';

  // Gate to premium
  if (!isPremium) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['top', 'bottom']}>
        <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: Spacing['4'], paddingVertical: Spacing['3'] }}>
          <TouchableOpacity activeOpacity={0.7} onPress={() => router.back()} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} style={{ padding: Spacing['2'] }}>
            <CaretLeftIcon size={24} color={colors.textMuted} weight="light" />
          </TouchableOpacity>
        </View>
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: Spacing['8'] }}>
          <Text style={{ fontFamily: FontFamily.display, fontSize: 24, color: colors.text, textAlign: 'center', marginBottom: Spacing['3'] }}>
            Custom Schedules
          </Text>
          <Text style={{ fontFamily: FontFamily.body, fontSize: 15, color: colors.textMuted, textAlign: 'center', lineHeight: 22, marginBottom: Spacing['6'] }}>
            Customize your check-in times with Premium.
          </Text>
          <TouchableOpacity
            activeOpacity={0.8}
            onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); router.push('/paywall'); }}
            style={{ backgroundColor: colors.accent, paddingVertical: 16, paddingHorizontal: Spacing['8'], borderRadius: 28 }}
          >
            <Text style={{ fontFamily: FontFamily.uiSemiBold, fontSize: 16, color: colors.background }}>
              Unlock Premium
            </Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const defaultTime = useUnfoldStore((s) =>
    isMidday ? s.middayCheckInTime : s.eveningWindDownTime
  );
  const byDay = useUnfoldStore((s) =>
    isMidday ? s.middayCheckInByDay : s.eveningWindDownByDay
  );
  const setDefaultTime = useUnfoldStore((s) =>
    isMidday ? s.setMiddayCheckInTime : s.setEveningWindDownTime
  );
  const setByDay = useUnfoldStore((s) =>
    isMidday ? s.setMiddayCheckInByDay : s.setEveningWindDownByDay
  );

  const [customizeByDay, setCustomizeByDay] = useState(byDay !== null);
  const [localDefaultTime, setLocalDefaultTime] = useState(defaultTime);
  const [localByDay, setLocalByDay] = useState<Record<string, string | null>>(
    () => {
      if (byDay) return { ...byDay };
      const initial: Record<string, string | null> = {};
      DAYS.forEach((d) => { initial[d] = defaultTime; });
      return initial;
    }
  );

  // Which picker is open: 'default' or a day key
  const [activePicker, setActivePicker] = useState<string | null>(null);

  const handleBack = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.back();
  }, [router]);

  const handleSave = useCallback(async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    setDefaultTime(localDefaultTime);

    if (customizeByDay) {
      setByDay(localByDay);
    } else {
      setByDay(null);
    }

    // Reschedule notifications with new times
    if (isMidday) {
      await scheduleMiddayCheckIn();
    } else {
      await scheduleEveningWindDown();
    }

    router.back();
  }, [localDefaultTime, customizeByDay, localByDay, setDefaultTime, setByDay, isMidday, router]);

  const handleToggleCustomize = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const next = !customizeByDay;
    setCustomizeByDay(next);
    if (next && !byDay) {
      // Initialize per-day with the default time
      const initial: Record<string, string | null> = {};
      DAYS.forEach((d) => { initial[d] = localDefaultTime; });
      setLocalByDay(initial);
    }
    setActivePicker(null);
  }, [customizeByDay, byDay, localDefaultTime]);

  const handleDayTimeChange = useCallback((day: string, date: Date) => {
    setLocalByDay((prev) => ({ ...prev, [day]: dateToTimeString(date) }));
  }, []);

  const handleToggleDaySkip = useCallback((day: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setLocalByDay((prev) => ({
      ...prev,
      [day]: prev[day] === null ? localDefaultTime : null,
    }));
  }, [localDefaultTime]);

  const hasChanges = useMemo(() => {
    if (localDefaultTime !== defaultTime) return true;
    if (customizeByDay !== (byDay !== null)) return true;
    if (customizeByDay && byDay) {
      return DAYS.some((d) => localByDay[d] !== byDay[d]);
    }
    return false;
  }, [localDefaultTime, defaultTime, customizeByDay, byDay, localByDay]);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['top', 'bottom']}>
      {/* Header */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingHorizontal: Spacing['4'],
          paddingVertical: Spacing['3'],
          borderBottomWidth: 1,
          borderBottomColor: colors.border,
        }}
      >
        <TouchableOpacity
          activeOpacity={0.7}
          onPress={handleBack}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          style={{ padding: Spacing['2'] }}
        >
          <CaretLeftIcon size={24} color={colors.text} weight="light" />
        </TouchableOpacity>

        <Text
          style={{
            fontFamily: FontFamily.uiMedium,
            fontSize: FontSize.base,
            color: colors.text,
          }}
        >
          {isMidday ? 'Midday Check-In' : 'Evening Wind-Down'}
        </Text>

        <TouchableOpacity
          activeOpacity={0.7}
          onPress={handleSave}
          disabled={!hasChanges}
          style={{ padding: Spacing['2'], opacity: hasChanges ? 1 : 0.3 }}
        >
          <Text
            style={{
              fontFamily: FontFamily.uiSemiBold,
              fontSize: FontSize.sm,
              color: colors.accent,
            }}
          >
            Save
          </Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: Spacing['5'] }}
      >
        {/* Default time */}
        <Animated.View entering={FadeIn.duration(300)}>
          <Text
            style={{
              fontFamily: FontFamily.ui,
              fontSize: FontSize.xs,
              color: colors.textMuted,
              letterSpacing: 0.5,
              textTransform: 'uppercase',
              marginBottom: Spacing['3'],
            }}
          >
            {customizeByDay ? 'Default Time' : 'Notification Time'}
          </Text>

          <TouchableOpacity
            activeOpacity={0.7}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              setActivePicker(activePicker === 'default' ? null : 'default');
            }}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              backgroundColor: colors.inputBackground,
              borderRadius: Radius.lg,
              paddingVertical: Spacing['4'],
              paddingHorizontal: Spacing['5'],
            }}
          >
            <Text
              style={{
                fontFamily: FontFamily.ui,
                fontSize: 15,
                color: colors.text,
              }}
            >
              {isMidday ? 'Check-in time' : 'Wind-down time'}
            </Text>
            <Text
              style={{
                fontFamily: FontFamily.uiMedium,
                fontSize: 15,
                color: colors.accent,
              }}
            >
              {formatTime(localDefaultTime)}
            </Text>
          </TouchableOpacity>

          {activePicker === 'default' && (
            <Animated.View entering={FadeIn.duration(200)}>
              <DateTimePicker
                value={timeStringToDate(localDefaultTime)}
                mode="time"
                display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                onChange={(_, date) => {
                  if (date) {
                    setLocalDefaultTime(dateToTimeString(date));
                    // Also update all non-customized days
                    if (!customizeByDay) return;
                    setLocalByDay((prev) => {
                      const next = { ...prev };
                      DAYS.forEach((d) => {
                        if (next[d] !== null && next[d] === defaultTime) {
                          next[d] = dateToTimeString(date);
                        }
                      });
                      return next;
                    });
                  }
                }}
                themeVariant="dark"
                style={{ marginTop: Spacing['2'] }}
              />
            </Animated.View>
          )}
        </Animated.View>

        {/* Divider */}
        <View
          style={{
            height: 1,
            backgroundColor: colors.border,
            marginVertical: Spacing['6'],
          }}
        />

        {/* Customize by day toggle */}
        <Animated.View entering={FadeInDown.duration(300).delay(100)}>
          <TouchableOpacity
            activeOpacity={0.7}
            onPress={handleToggleCustomize}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              paddingVertical: Spacing['2'],
            }}
          >
            <View>
              <Text
                style={{
                  fontFamily: FontFamily.uiMedium,
                  fontSize: 15,
                  color: colors.text,
                }}
              >
                Customize by day
              </Text>
              <Text
                style={{
                  fontFamily: FontFamily.ui,
                  fontSize: FontSize.xs,
                  color: colors.textMuted,
                  marginTop: 2,
                }}
              >
                Set different times or skip days
              </Text>
            </View>
            <View
              style={{
                width: 24,
                height: 24,
                borderRadius: 6,
                borderWidth: 1.5,
                borderColor: customizeByDay ? colors.accent : colors.border,
                backgroundColor: customizeByDay ? colors.accent : 'transparent',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              {customizeByDay && <CheckIcon size={14} color={colors.background} weight="bold" />}
            </View>
          </TouchableOpacity>
        </Animated.View>

        {/* Per-day schedule */}
        {customizeByDay && (
          <Animated.View
            entering={FadeInDown.duration(300)}
            style={{ marginTop: Spacing['5'] }}
          >
            {DAYS.map((day, i) => {
              const isSkipped = localByDay[day] === null;
              const dayTime = localByDay[day] ?? localDefaultTime;

              return (
                <Animated.View
                  key={day}
                  entering={FadeInDown.duration(250).delay(i * 40)}
                >
                  <View
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      paddingVertical: 14,
                      borderBottomWidth: i < DAYS.length - 1 ? 1 : 0,
                      borderBottomColor: colors.border,
                    }}
                  >
                    <Text
                      style={{
                        fontFamily: FontFamily.uiMedium,
                        fontSize: 15,
                        color: isSkipped ? colors.textMuted : colors.text,
                        width: 40,
                      }}
                    >
                      {day}
                    </Text>

                    {isSkipped ? (
                      <TouchableOpacity
                        activeOpacity={0.7}
                        onPress={() => handleToggleDaySkip(day)}
                        style={{
                          flex: 1,
                          alignItems: 'center',
                        }}
                      >
                        <Text
                          style={{
                            fontFamily: FontFamily.ui,
                            fontSize: FontSize.sm,
                            color: colors.textMuted,
                            fontStyle: 'italic',
                          }}
                        >
                          Skipped
                        </Text>
                      </TouchableOpacity>
                    ) : (
                      <TouchableOpacity
                        activeOpacity={0.7}
                        onPress={() => {
                          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                          setActivePicker(activePicker === day ? null : day);
                        }}
                        style={{
                          flex: 1,
                          alignItems: 'center',
                        }}
                      >
                        <Text
                          style={{
                            fontFamily: FontFamily.uiMedium,
                            fontSize: 15,
                            color: activePicker === day ? colors.accent : colors.text,
                          }}
                        >
                          {formatTime(dayTime)}
                        </Text>
                      </TouchableOpacity>
                    )}

                    <TouchableOpacity
                      activeOpacity={0.7}
                      onPress={() => handleToggleDaySkip(day)}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      style={{ padding: 4 }}
                    >
                      <Text
                        style={{
                          fontFamily: FontFamily.ui,
                          fontSize: FontSize.xs,
                          color: isSkipped ? colors.accent : colors.textMuted,
                        }}
                      >
                        {isSkipped ? 'Enable' : 'Skip'}
                      </Text>
                    </TouchableOpacity>
                  </View>

                  {activePicker === day && !isSkipped && (
                    <Animated.View entering={FadeIn.duration(200)}>
                      <DateTimePicker
                        value={timeStringToDate(dayTime)}
                        mode="time"
                        display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                        onChange={(_, date) => {
                          if (date) handleDayTimeChange(day, date);
                        }}
                        themeVariant="dark"
                      />
                    </Animated.View>
                  )}
                </Animated.View>
              );
            })}
          </Animated.View>
        )}

        {/* Explanation text */}
        <Animated.View entering={FadeIn.duration(300).delay(200)} style={{ marginTop: Spacing['6'] }}>
          <Text
            style={{
              fontFamily: FontFamily.ui,
              fontSize: FontSize.xs,
              color: colors.textMuted,
              lineHeight: 18,
            }}
          >
            {isMidday
              ? 'Your midday check-in helps shape tomorrow\'s devotional based on how you\'re feeling today.'
              : 'The evening wind-down is a moment of reflection to close your day with scripture and prayer.'}
          </Text>
        </Animated.View>
      </ScrollView>
    </SafeAreaView>
  );
}
