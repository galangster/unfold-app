import { useEffect, useRef, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, {
  FadeIn,
  FadeInDown,
  useReducedMotion,
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSequence,
  withDelay,
} from 'react-native-reanimated';
import { Duration, Ease, Stagger } from '@/constants/animations';
import { CheckIcon, LockSimpleIcon } from '@/components/icons';
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
  type DayMenuPresentation,
} from '@/lib/devotional-day-access';

// Generic fallback shown under any locked day that doesn't carry its own
// unlock date (e.g. content still being written).
const GENERIC_UNLOCK_LABEL = 'Unlocks as you continue your reading';

// How long the tap-triggered emphasis on the unlock caption stays before it
// settles back to its resting opacity.
const TAP_EMPHASIS_MS = 900;

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

  // Tapping a locked day fires a visible response (opacity pulse + emphasized
  // caption) in addition to the haptic, so the tap always reads as
  // "acknowledged" even when haptics are disabled. `tapToken` changes on
  // every tap so re-tapping the same locked day re-triggers the animation.
  // (Declared before the `!devotional` early return below so hook order
  // stays stable across renders.)
  const [tappedLockedDay, setTappedLockedDay] = useState<number | null>(null);
  const [tapToken, setTapToken] = useState(0);
  const tappedTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (tappedTimeoutRef.current) clearTimeout(tappedTimeoutRef.current);
    };
  }, []);

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
      setTappedLockedDay(dayNumber);
      setTapToken((n) => n + 1);
      if (tappedTimeoutRef.current) clearTimeout(tappedTimeoutRef.current);
      tappedTimeoutRef.current = setTimeout(() => setTappedLockedDay(null), TAP_EMPHASIS_MS + 400);
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

          return (
            <Animated.View
              key={dayNumber}
              entering={reducedMotion ? undefined : FadeInDown.duration(Duration.slow).delay(Math.min(i * Stagger.fast, 400)).easing(Ease.out)}
            >
              <DayRow
                dayNumber={dayNumber}
                isActive={isActive}
                isDayRead={isDayRead}
                isLocked={isLocked}
                presentation={presentation}
                isPressed={pressedDay === dayNumber}
                isPulsing={isLocked && tappedLockedDay === dayNumber}
                tapToken={tapToken}
                onPress={() => handleSelectDay(dayNumber)}
                onPressIn={() => { if (!isLocked) setPressedDay(dayNumber); }}
                onPressOut={() => setPressedDay(null)}
                colors={colors}
                reducedMotion={reducedMotion}
              />
            </Animated.View>
          );
        })}
      </ScrollView>
    </SafeAreaView>
  );
}

/** A single selectable/locked day row. Owns its own tap-emphasis animation
 * so a locked-day tap always produces a visible response (pulse + a briefly
 * emphasized unlock caption), independent of whether haptics are enabled. */
function DayRow({
  dayNumber,
  isActive,
  isDayRead,
  isLocked,
  presentation,
  isPressed,
  isPulsing,
  tapToken,
  onPress,
  onPressIn,
  onPressOut,
  colors,
  reducedMotion,
}: {
  dayNumber: number;
  isActive: boolean;
  isDayRead: boolean;
  isLocked: boolean;
  presentation: DayMenuPresentation;
  isPressed: boolean;
  isPulsing: boolean;
  tapToken: number;
  onPress: () => void;
  onPressIn: () => void;
  onPressOut: () => void;
  colors: ReturnType<typeof useTheme>['colors'];
  reducedMotion: boolean;
}) {
  const dayTitle = presentation.title;
  const unlockCaption = isLocked ? presentation.unlockLabel ?? GENERIC_UNLOCK_LABEL : undefined;

  const pulse = useSharedValue(1);
  const captionEmphasis = useSharedValue(0.75);

  useEffect(() => {
    if (!isPulsing) return;
    if (reducedMotion) {
      // Still acknowledge the tap without motion: hold the caption at full
      // emphasis briefly instead of animating opacity.
      captionEmphasis.value = 1;
      captionEmphasis.value = withDelay(TAP_EMPHASIS_MS, withTiming(0.75, { duration: 1 }));
      return;
    }
    pulse.value = withSequence(withTiming(0.45, { duration: 110 }), withTiming(1, { duration: 260 }));
    captionEmphasis.value = withTiming(1, { duration: 120 });
    captionEmphasis.value = withDelay(TAP_EMPHASIS_MS, withTiming(0.75, { duration: 450 }));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- retrigger on every tap via tapToken
  }, [tapToken]);

  const pulseStyle = useAnimatedStyle(() => ({
    opacity: (isLocked ? 0.38 : 1) * pulse.value,
  }));
  const captionStyle = useAnimatedStyle(() => ({
    opacity: captionEmphasis.value,
  }));

  return (
    <Animated.View
      style={[
        {
          backgroundColor: isActive
            ? colors.buttonBackgroundPressed
            : isPressed
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
        },
        pulseStyle,
      ]}
    >
      <TouchableOpacity activeOpacity={isLocked ? 1 : 0.7}
        onPress={onPress}
        onPressIn={onPressIn}
        onPressOut={onPressOut}
        style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}
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
          {unlockCaption ? (
            <Animated.Text
              style={[
                {
                  fontFamily: FontFamily.body,
                  fontSize: FontSize.xs,
                  color: colors.textSubtle,
                  marginTop: 2,
                },
                captionStyle,
              ]}
            >
              {unlockCaption}
            </Animated.Text>
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
}
