import { useCallback, useMemo, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useCrossTabBack } from '@/hooks/useCrossTabBack';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, {
  FadeIn,
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  withDelay,
  interpolate,
  Easing,
  useReducedMotion,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import {
  CaretLeftIcon,
  CheckCircleIcon,
  LockSimpleIcon,
  CircleIcon,
} from 'phosphor-react-native';
import { format } from 'date-fns';
import { FontFamily, FontSize } from '@/constants/fonts';
import { Radius } from '@/constants/radius';
import { Spacing } from '@/constants/spacing';
import { Duration, Ease } from '@/constants/animations';
import { Typography } from '@/constants/typography';
import { useTheme } from '@/lib/theme';
import { useUnfoldStore } from '@/lib/store';
import {
  getTodayReaderDayNumber,
  isDevotionalDaySelectable,
} from '@/lib/devotional-day-access';
import { selectRenderableDevotionalDay } from '@/lib/devotional-canonical-days';
import { alpha } from '@/components/ui';

// ── Sealed letter tease lines for locked days ──────────────────
const SEALED_LINES = [
  'Your next chapter is being written\u2026',
  'Something is being prepared for you\u2026',
  'A new word awaits\u2026',
  'This day is still unfolding\u2026',
  'What comes next may surprise you\u2026',
];

function getSealedLine(dayNumber: number): string {
  return SEALED_LINES[dayNumber % SEALED_LINES.length];
}

// ── Bottom glow for locked rows ────────────────────────────────
// Accent-colored gradient that pulses from the bottom of the card,
// matching the home screen's EmberSystem ambient glow style.
function BottomGlow({
  accentColor,
  stagger,
}: {
  accentColor: string;
  stagger: number;
}) {
  const pulse = useSharedValue(0);
  const reducedMotion = useReducedMotion();

  useEffect(() => {
    if (reducedMotion) {
      // Designed still: hold the glow at its midpoint instead of pulsing —
      // this was the ember-glow loop that kept drifting under reduce motion.
      pulse.value = 0.5;
      return;
    }
    pulse.value = withDelay(
      stagger,
      withRepeat(
        withTiming(1, { duration: 3000, easing: Easing.inOut(Easing.ease) }),
        -1,
        true,
      ),
    );
  }, [pulse, stagger, reducedMotion]);

  const glowStyle = useAnimatedStyle(() => {
    const opacity = interpolate(pulse.value, [0, 1], [0.08, 0.5]);
    return { opacity };
  });

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        StyleSheet.absoluteFill,
        { borderRadius: Radius.lg, overflow: 'hidden' },
        glowStyle,
      ]}
    >
      <LinearGradient
        colors={[
          'transparent',
          alpha(accentColor, 0.7),
        ]}
        start={{ x: 0.5, y: 0.3 }}
        end={{ x: 0.5, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
    </Animated.View>
  );
}

// ── Main screen ────────────────────────────────────────────────

export default function SeriesDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors } = useTheme();
  const reducedMotion = useReducedMotion();
  const { handleBack } = useCrossTabBack();
  const devotionals = useUnfoldStore((s) => s.devotionals);
  const setCurrentDevotional = useUnfoldStore((s) => s.setCurrentDevotional);

  const devotional = useMemo(
    () => devotionals.find((d) => d.id === id) ?? null,
    [devotionals, id],
  );

  const completedDays = useMemo(
    () => (devotional ? (devotional.days ?? []).filter((d) => d.isRead).length : 0),
    [devotional],
  );

  const progress =
    devotional && devotional.totalDays > 0
      ? (completedDays / devotional.totalDays) * 100
      : 0;

  const isComplete = devotional ? completedDays >= devotional.totalDays : false;

  // One timestamp for every day-gating decision on this render. Deriving each
  // row from its own `new Date()` lets the "Current" badge and the tap gate
  // disagree if a re-render straddles midnight.
  const now = useMemo(() => new Date(), [devotional]); // eslint-disable-line react-hooks/exhaustive-deps

  // The day the reader will actually open right now. `devotional.currentDay` is
  // NOT this: it is bumped to N+1 the moment day N is completed (advanceDay in
  // reading.tsx), but that day stays calendar-gated until tomorrow. Using
  // currentDay here made the list advertise a "Current" day that the reader
  // then silently swapped back to the previous one
  // (resolveInitialReadingDayNumber).
  const todayReaderDayNumber = useMemo(
    () => (devotional ? getTodayReaderDayNumber(devotional, now) : 1),
    [devotional, now],
  );

  const handleDayPress = useCallback(
    (dayNumber: number) => {
      if (!devotional) return;
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      setCurrentDevotional(devotional.id);
      router.push({
        pathname: '/(tabs)/(today)/reading',
        // Pass the id explicitly rather than relying on the store write above —
        // the reader honours ?devotionalId and the user may hold several series.
        params: { devotionalId: devotional.id, dayNumber: String(dayNumber) },
      });
    },
    [devotional, setCurrentDevotional, router],
  );

  if (!devotional) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <SafeAreaView style={{ flex: 1 }} edges={['top']}>
          <View style={styles.header}>
            <TouchableOpacity
              activeOpacity={0.7}
              onPress={() => router.back()}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              style={styles.backButton}
            >
              <CaretLeftIcon size={24} color={colors.textMuted} weight="light" />
            </TouchableOpacity>
            <Text style={[styles.headerTitle, { color: colors.text }]}>
              Not Found
            </Text>
          </View>
        </SafeAreaView>
      </View>
    );
  }

  const createdDate = format(new Date(devotional.createdAt), 'MMM d, yyyy');

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <SafeAreaView style={{ flex: 1 }} edges={['top']}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity
            activeOpacity={0.7}
            onPress={handleBack}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            style={styles.backButton}
          >
            <CaretLeftIcon size={24} color={colors.textMuted} weight="light" />
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: colors.text }]}>
            Devotional Details
          </Text>
        </View>

        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
        >
          {/* Series info */}
          <Animated.View entering={reducedMotion ? undefined : FadeIn.duration(Duration.normal).easing(Ease.out)}>
            <Text style={[styles.dateLabel, { color: colors.textHint }]}>
              {createdDate}
            </Text>
            <Text style={[styles.seriesTitle, { color: colors.text }]}>
              {devotional.title}
            </Text>

            {/* Progress summary */}
            <View style={styles.progressRow}>
              <View
                style={[styles.progressTrack, { backgroundColor: colors.border }]}
              >
                <View
                  style={[
                    styles.progressFill,
                    { backgroundColor: colors.accent, width: `${progress}%` },
                  ]}
                />
              </View>
              <Text style={[styles.progressLabel, { color: colors.textSubtle }]}>
                {isComplete
                  ? `${devotional.totalDays} days completed`
                  : `${completedDays} of ${devotional.totalDays} completed`}
              </Text>
            </View>
          </Animated.View>

          {/* Day list — grouped under named movements when the arc has them */}
          <View style={styles.dayList}>
            {(devotional.days ?? [])
              .sort((a, b) => a.dayNumber - b.dayNumber)
              .map((day) => {
                // A movement header renders above the first day of each act.
                const act = devotional.seriesArc?.acts?.find(
                  (a) => day.dayNumber === a.fromDay,
                );
                const isRead = day.isRead;
                const isOpenable =
                  isRead || isDevotionalDaySelectable(devotional, day.dayNumber, now);
                const isCurrent =
                  !isComplete &&
                  !isRead &&
                  isOpenable &&
                  day.dayNumber === todayReaderDayNumber;
                // "Tomorrow" is claimed ONLY when the content genuinely exists
                // and the calendar is the sole thing withholding it. A day whose
                // canonical content is missing or corrupt is NOT tomorrow's
                // reading — calling it that would hide a real generation failure
                // behind reassuring copy, so it falls through to the sealed
                // "still being prepared" state instead.
                const contentIsReady =
                  selectRenderableDevotionalDay(devotional, day.dayNumber).status === 'ready';
                const isTomorrow =
                  !isComplete &&
                  !isOpenable &&
                  contentIsReady &&
                  day.dayNumber === devotional.currentDay;
                const isLocked = !isRead && !isCurrent && !isTomorrow;

                return (
                  <Animated.View
                    key={day.dayNumber}
                    entering={reducedMotion ? undefined : FadeIn.duration(Duration.normal).delay(day.dayNumber * 40).easing(Ease.out)}
                  >
                    {act && (
                      <View style={styles.movementHeader}>
                        <Text
                          style={[styles.movementName, { color: colors.accent }]}
                        >
                          {act.name}
                        </Text>
                        <Text
                          style={[styles.movementFunction, { color: colors.textMuted }]}
                          numberOfLines={2}
                        >
                          {act.function}
                        </Text>
                      </View>
                    )}
                    <TouchableOpacity
                      activeOpacity={isOpenable ? 0.7 : 1}
                      disabled={!isOpenable}
                      onPress={() => {
                        if (isOpenable) handleDayPress(day.dayNumber);
                      }}
                      style={[
                        styles.dayRow,
                        {
                          backgroundColor: isCurrent
                            ? alpha(colors.accent, 0.06)
                            : colors.inputBackground,
                          borderColor: isCurrent
                            ? alpha(colors.accent, 0.2)
                            : colors.border,
                        },
                      ]}
                    >
                      {/* Bottom glow for locked rows */}
                      {isLocked && (
                        <BottomGlow
                          accentColor={colors.accent}
                          stagger={day.dayNumber * 800}
                        />
                      )}

                      {/* Left: status icon */}
                      <View style={styles.dayStatusIcon}>
                        {isRead ? (
                          <CheckCircleIcon
                            size={22}
                            color={colors.accent}
                            weight="fill"
                          />
                        ) : isCurrent ? (
                          <CircleIcon
                            size={22}
                            color={colors.accent}
                            weight="regular"
                          />
                        ) : (
                          <LockSimpleIcon
                            size={18}
                            color={colors.textHint}
                            weight="light"
                          />
                        )}
                      </View>

                      {/* Center: day info */}
                      <View style={styles.dayInfo}>
                        <Text
                          style={[
                            styles.dayNumber,
                            {
                              color: isLocked
                                ? colors.textHint
                                : isCurrent
                                  ? colors.accent
                                  : colors.textSubtle,
                            },
                          ]}
                        >
                          Day {day.dayNumber}
                        </Text>

                        {isLocked || (isTomorrow && !day.title) ? (
                          <Text
                            style={[
                              styles.sealedText,
                              { color: colors.textHint },
                            ]}
                            numberOfLines={1}
                          >
                            {getSealedLine(day.dayNumber)}
                          </Text>
                        ) : (
                          <>
                            <Text
                              style={[styles.dayTitle, { color: colors.text }]}
                              numberOfLines={1}
                            >
                              {day.title}
                            </Text>
                            {day.scriptureReference ? (
                              <Text
                                style={[
                                  styles.dayScripture,
                                  { color: colors.textMuted },
                                ]}
                                numberOfLines={1}
                              >
                                {day.scriptureReference}
                              </Text>
                            ) : null}
                          </>
                        )}
                      </View>

                      {/* Right: read date or current badge */}
                      <View style={styles.dayRight}>
                        {isRead && day.readAt ? (
                          <Text
                            style={[
                              styles.dayReadDate,
                              { color: colors.textHint },
                            ]}
                          >
                            {format(new Date(day.readAt), 'MMM d')}
                          </Text>
                        ) : isCurrent ? (
                          <View
                            style={[
                              styles.currentBadge,
                              { backgroundColor: alpha(colors.accent, 0.12) },
                            ]}
                          >
                            <Text
                              style={[
                                styles.currentBadgeText,
                                { color: colors.accent },
                              ]}
                            >
                              Current
                            </Text>
                          </View>
                        ) : isTomorrow ? (
                          <View
                            style={[
                              styles.currentBadge,
                              { backgroundColor: alpha(colors.textHint, 0.12) },
                            ]}
                          >
                            <Text
                              style={[
                                styles.currentBadgeText,
                                { color: colors.textMuted },
                              ]}
                            >
                              Tomorrow
                            </Text>
                          </View>
                        ) : null}
                      </View>
                    </TouchableOpacity>
                  </Animated.View>
                );
              })}
          </View>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing['4'],
    paddingVertical: Spacing['3'],
  },
  backButton: {
    padding: Spacing['2'],
  },
  headerTitle: {
    fontFamily: FontFamily.uiMedium,
    fontSize: FontSize.base,
    marginLeft: Spacing['2'],
  },
  scrollContent: {
    paddingHorizontal: Spacing['6'],
    paddingBottom: 100,
  },
  dateLabel: {
    ...Typography.cardMeta,
    marginBottom: Spacing['2'],
  },
  seriesTitle: {
    fontFamily: FontFamily.display,
    fontSize: 32,
    lineHeight: 38,
    marginBottom: Spacing['4'],
  },
  progressRow: {
    marginBottom: Spacing['6'],
  },
  progressTrack: {
    height: 3,
    borderRadius: 1.5,
    marginBottom: Spacing['2'],
  },
  progressFill: {
    height: '100%',
    borderRadius: 1.5,
  },
  progressLabel: {
    fontFamily: FontFamily.ui,
    fontSize: FontSize.xs,
  },
  dayList: {
    gap: Spacing['2'],
  },
  movementHeader: {
    paddingTop: Spacing['5'],
    paddingBottom: Spacing['2'],
    paddingHorizontal: Spacing['1'],
    gap: 2,
  },
  movementName: {
    fontFamily: FontFamily.bodyMedium,
    fontSize: FontSize.xs,
    letterSpacing: 1.4,
    textTransform: 'uppercase',
  },
  movementFunction: {
    fontFamily: FontFamily.bodyItalic,
    fontSize: FontSize.sm,
    lineHeight: FontSize.sm * 1.5,
  },
  dayRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: Radius.lg,
    borderWidth: 1,
    paddingVertical: Spacing['4'],
    paddingHorizontal: Spacing['4'],
    minHeight: 84,
  },
  dayStatusIcon: {
    width: 28,
    alignItems: 'center',
    marginRight: Spacing['3'],
  },
  dayInfo: {
    flex: 1,
  },
  dayNumber: {
    ...Typography.cardMeta,
    marginBottom: 2,
  },
  dayTitle: {
    fontFamily: FontFamily.display,
    fontSize: 17,
    lineHeight: 22,
  },
  dayScripture: {
    fontFamily: FontFamily.bodyItalic,
    fontSize: 13,
    marginTop: 2,
  },
  sealedText: {
    fontFamily: FontFamily.bodyItalic,
    fontSize: 14,
    lineHeight: 20,
  },
  dayRight: {
    marginLeft: Spacing['3'],
    alignItems: 'flex-end',
  },
  dayReadDate: {
    fontFamily: FontFamily.ui,
    fontSize: 11,
  },
  currentBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  currentBadgeText: {
    fontFamily: FontFamily.uiMedium,
    fontSize: 11,
    letterSpacing: 0.3,
  },
});
