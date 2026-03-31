/**
 * DevotionalCard — 6-state hero card for the home screen.
 *
 * Renders based on a DevotionalCardState discriminated union:
 *   empty | preparing | unread | complete-today | tomorrow-locked | journey-complete
 *
 * Extracted from (tabs)/(today)/index.tsx for single-responsibility and testability.
 */

import React, { useEffect, useMemo, useCallback } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator, StyleSheet } from 'react-native';
import Animated, {
  FadeIn,
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withDelay,
  withRepeat,
  interpolate,
  interpolateColor,
  cancelAnimation,
  Easing,
  type SharedValue,
} from 'react-native-reanimated';
import { useFocusEffect } from 'expo-router';
import { PlusIcon, LockSimpleIcon } from 'phosphor-react-native';

import { FontFamily, FontSize } from '@/constants/fonts';
import { Radius } from '@/constants/radius';
import { Spacing } from '@/constants/spacing';
import { Duration } from '@/constants/animations';
import { BIBLE_STUDY_METHODS } from '@/constants/bible-study-methods';
import { useTheme } from '@/lib/theme';
import { AccentGlow } from '@/components/AccentGlow';
import { alpha } from '@/components/ui';
import { useAccessibleAnimation } from '@/hooks/useAccessibility';
import type { DevotionalCardState } from './compute-devotional-state';

// ─── Props ──────────────────────────────────────────────────────

interface Props {
  state: DevotionalCardState;
  scrollY?: SharedValue<number>;
  /** When true, omits root padding/margin (used inside DevotionalCardStack) */
  inStack?: boolean;
}

// ─── Character reveal for "Unfold" title (empty state) ──────────

const REVEAL_EASE = Easing.bezier(0.25, 0.1, 0.25, 1);

const RevealChar = React.memo(({ char, animDelay }: { char: string; animDelay: number }) => {
  const { colors } = useTheme();
  const opacity = useSharedValue(0);
  const colorProgress = useSharedValue(0);

  useEffect(() => {
    opacity.value = withDelay(animDelay, withTiming(1, { duration: 600, easing: REVEAL_EASE }));
    colorProgress.value = withDelay(
      animDelay,
      withTiming(1, { duration: 1200, easing: Easing.out(Easing.cubic) }),
    );
    return () => {
      cancelAnimation(opacity);
      cancelAnimation(colorProgress);
    };
  }, [animDelay, opacity, colorProgress]);

  const containerStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
  }));

  const textColorStyle = useAnimatedStyle(() => ({
    color: interpolateColor(colorProgress.value, [0, 1], ['#FFFFFF', colors.accent]),
  }));

  return (
    <Animated.View style={containerStyle}>
      <Animated.Text
        style={[{ fontFamily: FontFamily.display, fontSize: 56, letterSpacing: -1.5 }, textColorStyle]}
      >
        {char}
      </Animated.Text>
    </Animated.View>
  );
});

/**
 * Deterministic shuffle for staggered character reveal.
 * Uses a seeded sine-hash so the order is stable across renders.
 */
function shuffleRevealOrder(length: number): number[] {
  const indices = Array.from({ length }, (_, i) => i);
  for (let i = length - 1; i > 0; i--) {
    const j = Math.floor((Math.sin(i * 7919 + 104729) * 0.5 + 0.5) * (i + 1));
    [indices[i], indices[j]] = [indices[j], indices[i]];
  }
  return indices;
}

// ─── AnimatedProgressBar ────────────────────────────────────────

function AnimatedProgressBar({ progress, colors }: { progress: number; colors: { accent: string; border: string } }) {
  const { reducedMotion } = useAccessibleAnimation();
  const animatedProgress = useSharedValue(0);
  const shimmer = useSharedValue(0);

  useFocusEffect(
    useCallback(() => {
      if (reducedMotion) {
        animatedProgress.value = progress;
        return;
      }
      const timer = setTimeout(() => {
        animatedProgress.value = withTiming(progress, {
          duration: 900,
          easing: Easing.out(Easing.cubic),
        });
        shimmer.value = withDelay(
          1200,
          withRepeat(withTiming(1, { duration: 2000, easing: Easing.inOut(Easing.ease) }), -1, false),
        );
      }, 400);
      return () => clearTimeout(timer);
    }, [progress, animatedProgress, shimmer, reducedMotion]),
  );

  const barStyle = useAnimatedStyle(() => ({
    width: `${animatedProgress.value}%`,
  }));

  const shimmerStyle = useAnimatedStyle(() => {
    const opacity = interpolate(shimmer.value, [0, 0.3, 0.5, 0.7, 1], [0, 0, 0.4, 0, 0]);
    const translateX = interpolate(shimmer.value, [0, 1], [-40, 200]);
    return { opacity, transform: [{ translateX }] };
  });

  return (
    <View style={[styles.progressTrack, { backgroundColor: colors.border }]}>
      <Animated.View style={[styles.progressFill, { backgroundColor: colors.accent }, barStyle]}>
        <Animated.View style={[styles.progressShimmer, shimmerStyle]} />
      </Animated.View>
    </View>
  );
}

// ─── Empty state ────────────────────────────────────────────────

function EmptyState({ onCreateNew }: { onCreateNew: () => void }) {
  const { colors } = useTheme();
  const { entering } = useAccessibleAnimation();

  const titleChars = useMemo(() => 'Unfold'.split(''), []);
  const charOrder = useMemo(() => shuffleRevealOrder(titleChars.length), [titleChars.length]);
  const charDelays = useMemo(() => {
    const baseDelay = 500;
    const stagger = 200;
    return titleChars.map((_, i) => baseDelay + charOrder[i] * stagger);
  }, [titleChars, charOrder]);
  const titleEndTime = useMemo(() => Math.max(...charDelays) + 700, [charDelays]);

  return (
    <View style={styles.emptyContainer}>
      {/* Character-by-character "Unfold" reveal */}
      <View style={styles.emptyTitleRow}>
        {titleChars.map((char, i) => (
          <RevealChar key={`c-${i}`} char={char} animDelay={charDelays[i]} />
        ))}
      </View>

      <Animated.Text
        entering={entering(FadeIn.duration(800).delay(titleEndTime))}
        style={[styles.emptySubtitle, { color: 'rgba(200, 165, 92, 0.7)' }]}
      >
        The world's most personal{'\n'}Bible studies.
      </Animated.Text>

      <Animated.View entering={entering(FadeIn.duration(600).delay(titleEndTime + 400))}>
        <TouchableOpacity
          activeOpacity={0.7}
          onPress={onCreateNew}
          accessibilityRole="button"
          accessibilityLabel="Begin your first devotional"
        >
          <View
            style={[
              styles.emptyCta,
              {
                backgroundColor: colors.accent,
                shadowColor: colors.accent,
              },
            ]}
          >
            <Text style={[styles.emptyCtaText, { color: colors.background }]}>
              Begin Your First Devotional
            </Text>
          </View>
        </TouchableOpacity>
      </Animated.View>
    </View>
  );
}

// ─── Preparing state ────────────────────────────────────────────

function PreparingState() {
  const { colors } = useTheme();

  return (
    <View style={[styles.preparingContainer, { backgroundColor: colors.backgroundElevated, borderColor: alpha(colors.accent, 0.09) }]}>
      <View style={styles.preparingInner}>
        <ActivityIndicator color={colors.accent} size="small" style={styles.preparingSpinner} />
        <Text style={[styles.preparingText, { color: colors.textMuted }]}>
          {'Preparing today\u2019s reading\u2026'}
        </Text>
      </View>
    </View>
  );
}

// ─── Journey complete state ─────────────────────────────────────

function JourneyCompleteState({ seriesTitle, onCreateNew }: { seriesTitle: string; onCreateNew: () => void }) {
  const { colors } = useTheme();
  const scale = useSharedValue(1);

  const scaleStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <Animated.View style={scaleStyle}>
      <TouchableOpacity
        activeOpacity={0.7}
        onPress={onCreateNew}
        onPressIn={() => {
          scale.value = withTiming(0.98, { duration: 120 });
        }}
        onPressOut={() => {
          scale.value = withTiming(1, { duration: Duration.fast });
        }}
        accessibilityRole="button"
        accessibilityLabel="Start a new series"
        style={styles.cardTouchable}
      >
        <View
          style={[
            styles.journeyCompleteCard,
            {
              borderColor: alpha(colors.accent, 0.09),
              backgroundColor: colors.backgroundElevated,
              shadowColor: colors.accent,
            },
          ]}
        >
          <View style={[styles.journeyCompleteAccent, { backgroundColor: colors.accent }]} />

          <Text style={[styles.journeyCompleteTitle, { color: colors.text }]}>
            Start a New Series
          </Text>

          <Text style={[styles.journeyCompleteSubtitle, { color: colors.textMuted }]}>
            Continue with a new{'\n'}personalized devotional series.
          </Text>

          <View style={[styles.journeyCompleteCta, { backgroundColor: colors.accent }]}>
            <Text style={[styles.journeyCompleteCtaText, { color: colors.background }]}>
              Create Series
            </Text>
          </View>
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
}

// ─── Main card (shared by unread / complete-today / tomorrow-locked) ──

interface MainCardProps {
  state: Extract<DevotionalCardState, { type: 'unread' | 'complete-today' | 'tomorrow-locked' }>;
}

function MainCard({ state }: MainCardProps) {
  const { colors } = useTheme();
  const { entering } = useAccessibleAnimation();
  const scale = useSharedValue(1);
  const [showTomorrowInfo, setShowTomorrowInfo] = React.useState(false);

  const scaleStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const isTomorrow = state.type === 'tomorrow-locked';
  const isDisabled = state.type === 'tomorrow-locked';
  const dayData = state.dayData;

  // Progress data — show progress bar when days have been completed
  const progress = state.progress;
  const daysCompleted = state.daysCompleted;
  const showProgress = daysCompleted > 0;
  const totalDays = state.totalDays;
  const seriesTitle = state.seriesTitle;

  // CTA handling
  const hasCta = state.type === 'unread' || state.type === 'complete-today';
  const ctaText =
    state.type === 'complete-today' ? "Today's Reading"
    : state.type === 'unread' ? state.ctaText
    : 'Continue Reading';
  const onPress = isTomorrow
    ? () => setShowTomorrowInfo((v) => !v)
    : 'onContinue' in state
      ? state.onContinue
      : undefined;

  // New series secondary CTA — always show when available
  const showNewSeries = true;
  const onCreateNew = 'onCreateNew' in state ? state.onCreateNew : undefined;

  // Day label
  const dayLabel = isTomorrow ? 'Tomorrow' : 'Today';

  return (
    <Animated.View style={scaleStyle}>
      <TouchableOpacity
        activeOpacity={0.7}
        onPress={isDisabled ? () => setShowTomorrowInfo((v) => !v) : onPress}
        disabled={false}
        onPressIn={() => {
          scale.value = withTiming(0.98, { duration: 120 });
        }}
        onPressOut={() => {
          scale.value = withTiming(1, { duration: Duration.fast });
        }}
        accessibilityRole="button"
        accessibilityLabel={
          isDisabled
            ? 'Preparing your reading, please wait'
            : `Continue ${seriesTitle}, day ${dayData.dayNumber} of ${totalDays}`
        }
        style={styles.cardTouchable}
      >
        <View
          style={[
            styles.mainCard,
            {
              borderColor: alpha(colors.accent, 0.09),
              backgroundColor: colors.backgroundElevated,
              shadowColor: colors.accent,
            },
          ]}
        >
          {/* Series label + day pill */}
          <View style={styles.mainCardHeader}>
            <Text style={[styles.mainCardSeriesTitle, { color: colors.textSubtle }]} numberOfLines={1}>
              {seriesTitle}
            </Text>

            <View style={[styles.mainCardDayPill, { backgroundColor: colors.buttonBackground }]}>
              <Text style={[styles.mainCardDayPillText, { color: colors.textMuted }]}>
                {dayLabel} · Day {dayData.dayNumber}/{totalDays}
              </Text>
            </View>
          </View>

          {/* Day title */}
          <Text
            style={[styles.mainCardDayTitle, { color: colors.text }]}
          >
            {dayData.title}
          </Text>

          {/* Scripture teaser */}
          {dayData.scriptureReference && (
            <Text
              style={[
                styles.mainCardScripture,
                {
                  color: colors.textMuted,
                  marginBottom: dayData.studyMethod ? 12 : 20,
                },
              ]}
              numberOfLines={2}
            >
              {dayData.scriptureReference}
              {dayData.scriptureText ? ` — "${dayData.scriptureText.slice(0, 80).trim()}..."` : ''}
            </Text>
          )}

          {/* Tomorrow teaser */}
          {isTomorrow && state.tomorrowTeaser && (
            <Text style={[styles.mainCardTomorrowTeaser, { color: colors.textMuted }]} numberOfLines={3}>
              {state.tomorrowTeaser}
            </Text>
          )}

          {/* Study method chip */}
          {dayData.studyMethod && BIBLE_STUDY_METHODS[dayData.studyMethod] && (
            <View style={styles.mainCardMethodRow}>
              <View style={[styles.mainCardMethodChip, { backgroundColor: alpha(colors.accent, 0.07) }]}>
                <Text style={[styles.mainCardMethodText, { color: colors.accent }]}>
                  {BIBLE_STUDY_METHODS[dayData.studyMethod].name}
                </Text>
              </View>
            </View>
          )}

          {/* Progress section */}
          {showProgress && (
            <View style={styles.mainCardProgressSection}>
              <AnimatedProgressBar progress={progress} colors={colors} />
              <View style={styles.mainCardProgressLabels}>
                <Text style={[styles.mainCardProgressLeft, { color: colors.textSubtle }]}>
                  {daysCompleted} of {totalDays} completed
                </Text>
                <Text style={[styles.mainCardProgressRight, { color: colors.accent }]}>
                  {Math.round(progress)}%
                </Text>
              </View>
            </View>
          )}

          {/* CTA Button */}
          {isTomorrow ? (
            <>
              <View
                style={[
                  styles.tomorrowLockedCta,
                  {
                    backgroundColor: colors.buttonBackground,
                    borderColor: colors.border,
                  },
                ]}
              >
                <LockSimpleIcon size={15} color={colors.textMuted} weight="light" />
                <Text style={[styles.tomorrowLockedCtaText, { color: colors.textMuted }]}>
                  Unlocks Tomorrow
                </Text>
              </View>
              {showTomorrowInfo && (
                <Animated.View entering={FadeIn.duration(Duration.normal)} style={styles.tomorrowInfoContainer}>
                  <Text style={[styles.tomorrowInfoText, { color: colors.textSubtle }]}>
                    Give today a chance to sink in.{'\n'}Come back tomorrow — it'll be worth it.
                  </Text>
                </Animated.View>
              )}
            </>
          ) : hasCta ? (
            <AccentGlow color={colors.accent} intensity="medium" active style={{ borderRadius: Radius.md }}>
              <View style={[styles.ctaButton, { backgroundColor: colors.accent }]}>
                <Text style={[styles.ctaButtonText, { color: colors.background }]}>
                  {ctaText}
                </Text>
              </View>
            </AccentGlow>
          ) : null}

          {/* New Series — secondary action */}
          {showNewSeries && onCreateNew && (
            <TouchableOpacity
              activeOpacity={0.7}
              onPress={onCreateNew}
              accessibilityRole="button"
              accessibilityLabel="Start a new series"
              style={styles.newSeriesButton}
            >
              <View style={styles.newSeriesInner}>
                <PlusIcon size={14} color={colors.textSubtle} weight="light" />
                <Text style={[styles.newSeriesText, { color: colors.textSubtle }]}>New Series</Text>
              </View>
            </TouchableOpacity>
          )}
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
}

// ─── DevotionalCard (root) ──────────────────────────────────────

export function DevotionalCard({ state, scrollY, inStack }: Props) {
  const { entering } = useAccessibleAnimation();

  // Subtle parallax when scrollY is provided
  const parallaxStyle = useAnimatedStyle(() => {
    if (!scrollY) return {};
    return { transform: [{ translateY: scrollY.value * 0.05 }] };
  });

  return (
    <Animated.View
      entering={entering(FadeIn.delay(100).duration(400))}
      style={[inStack ? styles.rootInStack : styles.root, parallaxStyle]}
    >
      {state.type === 'empty' && <EmptyState onCreateNew={state.onCreateNew} />}
      {state.type === 'preparing' && <PreparingState />}
      {state.type === 'journey-complete' && (
        <JourneyCompleteState seriesTitle={state.seriesTitle} onCreateNew={state.onCreateNew} />
      )}
      {(state.type === 'unread' ||
        state.type === 'complete-today' ||
        state.type === 'tomorrow-locked') && <MainCard state={state} />}
    </Animated.View>
  );
}

// ─── Styles ─────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: {
    paddingHorizontal: Spacing['6'],
    marginTop: Spacing['5'],
  },
  rootInStack: {
    // No padding/margin — the stack handles layout
    flex: 1,
  },

  // Progress bar
  progressTrack: {
    height: 3,
    borderRadius: 1.5,
  },
  progressFill: {
    height: '100%',
    borderRadius: 1.5,
    overflow: 'hidden',
  },
  progressShimmer: {
    position: 'absolute',
    top: -1,
    width: 40,
    height: 5,
    borderRadius: 3,
    backgroundColor: 'rgba(255, 255, 255, 0.5)',
  },

  // Empty state
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: Spacing['8'],
  },
  emptyTitleRow: {
    flexDirection: 'row',
    marginBottom: Spacing['5'],
  },
  emptySubtitle: {
    fontFamily: FontFamily.bodyItalic,
    fontSize: FontSize.lg,
    textAlign: 'center',
    lineHeight: 28,
    marginBottom: 56,
  },
  emptyCta: {
    paddingVertical: 18,
    paddingHorizontal: Spacing['12'],
    borderRadius: 28,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
  },
  emptyCtaText: {
    fontFamily: FontFamily.uiMedium,
    fontSize: 17,
    letterSpacing: 0.3,
  },

  // Preparing state
  preparingContainer: {
    borderRadius: Radius.xl,
    borderWidth: 1,
    padding: Spacing['6'],
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 16,
    elevation: 4,
  },
  preparingInner: {
    alignItems: 'center',
    paddingVertical: Spacing['3'],
  },
  preparingSpinner: {
    marginBottom: 10,
  },
  preparingText: {
    fontFamily: FontFamily.bodyItalic,
    fontSize: 15,
    textAlign: 'center',
    lineHeight: 22,
  },

  // Journey complete
  cardTouchable: {
    borderRadius: Radius.xl,
    overflow: 'hidden',
  },
  cardDisabled: {
    opacity: 0.5,
  },
  journeyCompleteCard: {
    borderRadius: Radius.lg,
    borderWidth: 1,
    padding: Spacing['7'],
    alignItems: 'center',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 16,
    elevation: 4,
  },
  journeyCompleteAccent: {
    width: 32,
    height: 1.5,
    marginBottom: Spacing['6'],
    borderRadius: 1,
  },
  journeyCompleteTitle: {
    fontFamily: FontFamily.display,
    fontSize: 28,
    textAlign: 'center',
    marginBottom: Spacing['2'],
  },
  journeyCompleteSubtitle: {
    fontFamily: FontFamily.body,
    fontSize: 15,
    textAlign: 'center',
    lineHeight: 23,
    marginBottom: Spacing['7'],
    paddingHorizontal: Spacing['2'],
  },
  journeyCompleteCta: {
    paddingVertical: 15,
    paddingHorizontal: 36,
    borderRadius: Radius.md,
  },
  journeyCompleteCtaText: {
    fontFamily: FontFamily.uiMedium,
    fontSize: 15,
    letterSpacing: 0.3,
  },

  // Main card
  mainCard: {
    borderRadius: Radius.xl,
    borderWidth: 1,
    padding: Spacing['6'],
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 16,
    elevation: 4,
  },
  mainCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing['3'],
  },
  mainCardSeriesTitle: {
    fontFamily: FontFamily.ui,
    fontSize: 13,
    flex: 1,
  },
  mainCardDayPill: {
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: Radius.xl,
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: Spacing['3'],
  },
  mainCardDayPillText: {
    fontFamily: FontFamily.uiMedium,
    fontSize: 11,
    letterSpacing: 0.3,
  },
  mainCardDayTitle: {
    fontFamily: FontFamily.display,
    fontSize: FontSize['3xl'],
    lineHeight: 38,
    marginBottom: Spacing['2'],
    letterSpacing: -0.3,
  },
  mainCardScripture: {
    fontFamily: FontFamily.bodyItalic,
    fontSize: FontSize.sm,
    lineHeight: 22,
    opacity: 0.8,
  },
  mainCardTomorrowTeaser: {
    fontFamily: FontFamily.body,
    fontSize: 13,
    lineHeight: 20,
    marginBottom: 14,
    opacity: 0.72,
  },
  mainCardMethodRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing['5'],
  },
  mainCardMethodChip: {
    paddingHorizontal: 10,
    paddingVertical: Spacing['1'],
    borderRadius: 6,
  },
  mainCardMethodText: {
    fontFamily: FontFamily.mono,
    fontSize: 10,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  mainCardProgressSection: {
    marginBottom: Spacing['6'],
  },
  mainCardProgressLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 10,
  },
  mainCardProgressLeft: {
    fontFamily: FontFamily.ui,
    fontSize: FontSize.xs,
  },
  mainCardProgressRight: {
    fontFamily: FontFamily.uiSemiBold,
    fontSize: FontSize.xs,
    opacity: 0.9,
  },

  // CTA
  ctaButton: {
    paddingVertical: 15,
    borderRadius: Radius.md,
    alignItems: 'center',
  },
  ctaButtonText: {
    fontFamily: FontFamily.uiMedium,
    fontSize: 15,
    letterSpacing: 0.3,
  },

  // Tomorrow locked
  tomorrowLockedCta: {
    paddingVertical: 15,
    borderRadius: Radius.md,
    alignItems: 'center',
    borderWidth: 1,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: Spacing['2'],
  },
  tomorrowLockedCtaText: {
    fontFamily: FontFamily.uiMedium,
    fontSize: 15,
    letterSpacing: 0.3,
  },
  tomorrowInfoContainer: {
    marginTop: 10,
    paddingHorizontal: Spacing['1'],
  },
  tomorrowInfoText: {
    fontFamily: FontFamily.body,
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 20,
  },

  // New series secondary CTA
  newSeriesButton: {
    marginTop: Spacing['3'],
    opacity: 1,
  },
  newSeriesInner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
  },
  newSeriesText: {
    fontFamily: FontFamily.uiMedium,
    fontSize: 13,
  },
});
