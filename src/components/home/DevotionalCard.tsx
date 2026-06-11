/**
 * DevotionalCard — 8-state hero card for the home screen.
 *
 * Renders based on a DevotionalCardState discriminated union:
 *   empty | preparing | premium-paused | reveal-ready | unread | complete-today | tomorrow-locked | journey-complete
 *
 * Extracted from (tabs)/(today)/index.tsx for single-responsibility and testability.
 */

import React, { useEffect, useMemo, useCallback } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, useWindowDimensions, Platform } from 'react-native';
import { BlurView } from 'expo-blur';
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
import { CheckIcon, PlusIcon } from 'phosphor-react-native';

import { FontFamily, FontSize } from '@/constants/fonts';
import { Radius } from '@/constants/radius';
import { Spacing } from '@/constants/spacing';
import { Duration, Ease } from '@/constants/animations';
import { BIBLE_STUDY_METHODS } from '@/constants/bible-study-methods';
import { useTheme } from '@/lib/theme';
import { alpha } from '@/components/ui';
import { useAccessibleAnimation } from '@/hooks/useAccessibility';
import { RecommendedSeriesCard } from './RecommendedSeriesCard';
import type { DevotionalCardState } from './compute-devotional-state';
import { smartQuotes } from '@/lib/smart-quotes';
import { stripOuterQuotes } from '@/lib/cn';

// ─── Props ──────────────────────────────────────────────────────

interface Props {
  state: DevotionalCardState;
  scrollY?: SharedValue<number>;
  /** When true, omits root padding/margin (used inside DevotionalCardStack) */
  inStack?: boolean;
  /** When true, shows returning-user warm empty state instead of first-time brand intro */
  isReturningUser?: boolean;
}

// ─── Character reveal for "Unfold" title (empty state) ──────────

const REVEAL_EASE = Easing.bezier(0.25, 0.1, 0.25, 1);
const DISPLAY_TEXT_MAX_SCALE = 1.18;
const BODY_TEXT_MAX_SCALE = 1.28;
const LABEL_TEXT_MAX_SCALE = 1.14;

function formatHeroSeriesTitle(title: string): string {
  const trimmed = title.trim();
  if (!trimmed || /[a-z]/.test(trimmed) || trimmed !== trimmed.toUpperCase()) return title;

  return trimmed.replace(/[\p{L}\p{N}]+(?:['’][\p{L}\p{N}]+)*/gu, (word) => (
    word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
  ));
}

const RevealChar = React.memo(function RevealChar({ char, animDelay }: { char: string; animDelay: number }) {
  const { colors } = useTheme();
  const { reducedMotion } = useAccessibleAnimation();
  const opacity = useSharedValue(0);
  const colorProgress = useSharedValue(0);

  useEffect(() => {
    if (reducedMotion) {
      opacity.value = 1;
      colorProgress.value = 1;
      return () => {
        cancelAnimation(opacity);
        cancelAnimation(colorProgress);
      };
    }

    opacity.value = withDelay(animDelay, withTiming(1, { duration: 600, easing: REVEAL_EASE }));
    colorProgress.value = withDelay(
      animDelay,
      withTiming(1, { duration: 1200, easing: Easing.out(Easing.cubic) }),
    );
    return () => {
      cancelAnimation(opacity);
      cancelAnimation(colorProgress);
    };
  }, [animDelay, opacity, colorProgress, reducedMotion]);

  const containerStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
  }));

  const textColorStyle = useAnimatedStyle(() => ({
    color: interpolateColor(colorProgress.value, [0, 1], [colors.text, colors.accent]),
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

function FirstTimeEmptyState({ onCreateNew }: { onCreateNew: () => void }) {
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
        entering={entering(FadeIn.duration(Duration.normal).delay(titleEndTime).easing(Ease.out))}
        style={[styles.emptySubtitle, { color: alpha(colors.accent, 0.72) }]}
      >
        The world's most personal{'\n'}Bible studies.
      </Animated.Text>

      <Animated.View entering={entering(FadeIn.duration(Duration.normal).delay(titleEndTime + 400).easing(Ease.out))}>
        <TouchableOpacity
          activeOpacity={0.7}
          onPress={onCreateNew}
          accessibilityRole="button"
          accessibilityLabel="Start a new devotional series"
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
              Start a New Series
            </Text>
          </View>
        </TouchableOpacity>
      </Animated.View>
    </View>
  );
}

// ─── EmptyState router — branches on isReturningUser ────────────

function EmptyState({ onCreateNew, isReturningUser }: { onCreateNew: () => void; isReturningUser?: boolean }) {
  if (isReturningUser) {
    return <ReturningEmptyState onCreateNew={onCreateNew} />;
  }
  return <FirstTimeEmptyState onCreateNew={onCreateNew} />;
}

// ─── Returning user empty state ─────────────────────────────────

function ReturningEmptyStateFallback({ onCreateNew }: { onCreateNew: () => void }) {
  const { colors } = useTheme();
  const { entering } = useAccessibleAnimation();

  return (
    <Animated.View
      entering={entering(FadeIn.duration(Duration.normal).delay(80).easing(Ease.out))}
      style={[
        styles.returningCard,
        {
          backgroundColor: alpha(colors.backgroundElevated, 0.72),
          borderColor: alpha(colors.accent, 0.14),
          shadowColor: colors.accent,
        },
      ]}
    >
      <View style={styles.returningContent}>
        <Text style={[styles.returningKicker, { color: colors.accent }]}>New study</Text>
        <Text style={[styles.returningTitle, { color: colors.text }]}>Begin the next quiet chapter.</Text>
        <Text style={[styles.returningSubtitle, { color: colors.textMuted }]}>Choose a new devotional thread for the season you’re in now.</Text>

        <TouchableOpacity
          activeOpacity={0.72}
          onPress={onCreateNew}
          accessibilityRole="button"
          accessibilityLabel="Start a new study"
          style={[styles.returningCta, { borderColor: alpha(colors.accent, 0.28), backgroundColor: alpha(colors.accent, 0.08) }]}
        >
          <Text style={[styles.returningCtaText, { color: colors.text }]}>Start a New Study</Text>
          <Text style={[styles.returningCtaArrow, { color: colors.accent }]}>→</Text>
        </TouchableOpacity>
      </View>
    </Animated.View>
  );
}

function ReturningEmptyState({ onCreateNew }: { onCreateNew: () => void }) {
  return (
    <RecommendedSeriesCard
      variant="empty"
      onChooseOther={onCreateNew}
      renderFallback={() => <ReturningEmptyStateFallback onCreateNew={onCreateNew} />}
    />
  );
}

// ─── Reveal-ready teaser card ──────────────────────────────────

function RevealReadyState({ state }: { state: Extract<DevotionalCardState, { type: 'reveal-ready' }> }) {
  const { colors, isDark } = useTheme();
  const { width, fontScale } = useWindowDimensions();
  const { entering } = useAccessibleAnimation();
  const isYesterday = state.dayLabel === 'Overdue';
  const isLargeTextHero = fontScale >= 1.18;
  const isCompactHero = width < 400 || isLargeTextHero;
  const isVeryCompactHero = width < 370 || fontScale >= 1.32;
  const scriptureReference = state.dayData.scriptureReference || 'Today’s reading';
  const statusLabel = isYesterday ? 'Still waiting' : 'Ready to reveal';
  const displaySeriesTitle = formatHeroSeriesTitle(state.seriesTitle);
  const revealMessage = isYesterday
    ? 'This thread is still sealed for you. Open it gently before moving on.'
    : 'A new thread is ready, but the words stay quiet until you choose to open them.';

  return (
    <Animated.View entering={entering(FadeIn.duration(Duration.normal).easing(Ease.out))}>
      <View style={[styles.revealOpenHero, isCompactHero && styles.revealOpenHeroCompact, isVeryCompactHero && styles.revealOpenHeroVeryCompact]}>
        <View style={[styles.openHeroContent, isCompactHero && styles.openHeroContentCompact, isVeryCompactHero && styles.openHeroContentVeryCompact]}>
          <Text
            style={[styles.heroSeriesEyebrow, { color: colors.textSubtle }]}
            numberOfLines={1}
            maxFontSizeMultiplier={LABEL_TEXT_MAX_SCALE}
          >
            {displaySeriesTitle}
          </Text>

          <Text style={[styles.heroDayMeta, { color: colors.accent }]} maxFontSizeMultiplier={LABEL_TEXT_MAX_SCALE}>
            {statusLabel} · Day {state.dayNumber} of {state.totalDays}
          </Text>

          <Text
            style={[styles.heroDayTitle, isCompactHero && styles.heroDayTitleCompact, isVeryCompactHero && styles.heroDayTitleVeryCompact, { color: colors.text }]}
            numberOfLines={3}
            maxFontSizeMultiplier={DISPLAY_TEXT_MAX_SCALE}
          >
            {smartQuotes(state.dayData.title)}
          </Text>

          <View style={styles.heroQuoteBlock}>
            <Text style={[styles.heroQuoteMark, { color: colors.accent }]}>“</Text>
            <Text
              style={[styles.heroQuoteText, isCompactHero && styles.heroQuoteTextCompact, isVeryCompactHero && styles.heroQuoteTextVeryCompact, { color: colors.text }]}
              numberOfLines={4}
              maxFontSizeMultiplier={DISPLAY_TEXT_MAX_SCALE}
            >
              {revealMessage}
            </Text>
            <Text style={[styles.revealOpenScripture, { color: colors.textMuted }]} numberOfLines={1} maxFontSizeMultiplier={BODY_TEXT_MAX_SCALE}>
              {scriptureReference}
            </Text>
          </View>

          <TouchableOpacity
            activeOpacity={0.74}
            onPress={state.onReveal}
            accessibilityRole="button"
            accessibilityLabel={isYesterday ? `Catch up on ${state.seriesTitle}, day ${state.dayNumber}` : `Reveal ${state.seriesTitle}, day ${state.dayNumber}`}
            accessibilityHint="Opens the reveal screen for this devotional reading"
            style={[
              styles.heroActions,
              {
                borderColor: alpha(colors.accent, 0.24),
                backgroundColor: Platform.OS === 'ios'
                  ? alpha(colors.backgroundElevated, isDark ? 0.56 : 0.8)
                  : alpha(colors.backgroundElevated, 0.9),
              },
            ]}
          >
            {Platform.OS === 'ios' && (
              <BlurView
                intensity={isDark ? 28 : 18}
                tint={isDark ? 'dark' : 'light'}
                style={StyleSheet.absoluteFill}
              />
            )}
            <View style={styles.heroActionContent}>
              <Text style={[styles.heroActionText, { color: colors.text }]} maxFontSizeMultiplier={BODY_TEXT_MAX_SCALE}>
                {isYesterday ? 'Catch Up on Yesterday’s Reading' : 'Reveal Today’s Devotional'}
              </Text>
              <Text style={[styles.heroActionArrow, { color: colors.accent }]}>→</Text>
            </View>
          </TouchableOpacity>
        </View>
      </View>
    </Animated.View>
  );
}

// ─── Preparing progress bar ─────────────────────────────────────

function PreparingProgressBar({ progress, colors }: { progress: number; colors: { accent: string; border: string } }) {
  const { reducedMotion } = useAccessibleAnimation();
  const animatedProgress = useSharedValue(0.05);

  useEffect(() => {
    // Map 0-1 progress to percentage; default to 5% so the bar is always visible
    const target = Math.max(5, progress * 100);
    if (reducedMotion) {
      animatedProgress.value = target;
      return;
    }
    animatedProgress.value = withTiming(target, {
      duration: 900,
      easing: Easing.out(Easing.cubic),
    });
  }, [progress, animatedProgress, reducedMotion]);

  const barStyle = useAnimatedStyle(() => ({
    width: `${animatedProgress.value}%`,
  }));

  return (
    <View style={[styles.preparingProgressTrack, { backgroundColor: colors.border }]}>
      <Animated.View
        style={[styles.preparingProgressFill, { backgroundColor: colors.accent }, barStyle]}
      />
    </View>
  );
}

// ─── Preparing state ────────────────────────────────────────────

function PreparingState({
  progress,
  seriesTitle,
  dayNumber,
}: {
  progress: number;
  seriesTitle: string;
  dayNumber: number;
}) {
  const { colors } = useTheme();
  const { reducedMotion } = useAccessibleAnimation();
  const shimmerOpacity = useSharedValue(0.55);

  useEffect(() => {
    if (reducedMotion) {
      shimmerOpacity.value = 0.78;
      return;
    }
    shimmerOpacity.value = withRepeat(
      withTiming(0.92, { duration: 2200, easing: Easing.inOut(Easing.ease) }),
      -1,
      true,
    );
    return () => cancelAnimation(shimmerOpacity);
  }, [shimmerOpacity, reducedMotion]);

  const shimmerStyle = useAnimatedStyle(() => ({ opacity: shimmerOpacity.value }));

  return (
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={`Preparing day ${dayNumber} of ${seriesTitle}`}
      accessibilityValue={{ text: 'Your next reading will appear here automatically' }}
      style={styles.preparingContainer}
    >
      <View style={styles.preparingContent}>
        <View style={styles.preparingKickerRow}>
          <View style={[styles.preparingAccentBar, { backgroundColor: alpha(colors.accent, 0.65) }]} />
          <Text style={[styles.preparingKicker, { color: colors.textMuted }]}>Preparing today</Text>
        </View>

        <Animated.Text style={[styles.preparingTitle, { color: colors.text }, shimmerStyle]}>
          Day {dayNumber} is almost ready.
        </Animated.Text>

        <Text style={[styles.preparingSubtitle, { color: colors.textMuted }]}>
          We’re getting your next reading for {seriesTitle}. It’ll appear here automatically.
        </Text>

        <PreparingProgressBar progress={progress} colors={{ accent: alpha(colors.accent, 0.58), border: alpha(colors.border, 0.45) }} />
      </View>
    </View>
  );
}

// ─── Premium paused state ───────────────────────────────────────

function PremiumPausedState({ state }: { state: Extract<DevotionalCardState, { type: 'premium-paused' }> }) {
  const { colors } = useTheme();
  const { entering } = useAccessibleAnimation();
  const progressLabel = state.totalDays > 0
    ? `${state.daysCompleted} of ${state.totalDays} days complete`
    : 'Your series is saved';

  return (
    <Animated.View
      entering={entering(FadeIn.duration(Duration.normal).delay(80).easing(Ease.out))}
      accessible
      accessibilityRole="summary"
      accessibilityLabel="Premium paused. Your personal series is saved."
      style={[
        styles.returningCard,
        {
          backgroundColor: alpha(colors.backgroundElevated, 0.72),
          borderColor: alpha(colors.accent, 0.14),
          shadowColor: colors.accent,
        },
      ]}
    >
      <View style={styles.returningContent}>
        <Text style={[styles.returningKicker, { color: colors.accent }]}>Premium paused</Text>
        <Text style={[styles.returningTitle, { color: colors.text }]}>Your series is waiting.</Text>
        <Text style={[styles.returningSubtitle, { color: colors.textMuted }]}>New personal readings pause while Premium is inactive. You can still read scripture today, or renew Premium when you’re ready.</Text>
        <Text style={[styles.premiumPausedProgress, { color: colors.textSubtle }]}>{progressLabel}</Text>

        <View style={styles.premiumPausedActions}>
          <TouchableOpacity
            activeOpacity={0.74}
            onPress={state.onOpenBible}
            accessibilityRole="button"
            accessibilityLabel="Open the Bible tab"
            style={[styles.returningCta, styles.premiumPausedPrimaryCta, { borderColor: alpha(colors.accent, 0.28), backgroundColor: alpha(colors.accent, 0.12) }]}
          >
            <Text style={[styles.returningCtaText, { color: colors.text }]}>Open Bible</Text>
            <Text style={[styles.returningCtaArrow, { color: colors.accent }]}>→</Text>
          </TouchableOpacity>

          <TouchableOpacity
            activeOpacity={0.74}
            onPress={state.onRenewPremium}
            accessibilityRole="button"
            accessibilityLabel="Renew Premium"
            style={[styles.returningCta, styles.premiumPausedSecondaryCta, { borderColor: alpha(colors.accent, 0.18), backgroundColor: alpha(colors.accent, 0.045) }]}
          >
            <Text style={[styles.returningCtaText, { color: colors.accent }]}>Renew Premium</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Animated.View>
  );
}

// ─── Journey complete state ─────────────────────────────────────

function JourneyCompleteStateFallback({
  seriesTitle,
  onCreateNew,
}: {
  seriesTitle: string;
  onCreateNew: () => void;
}) {
  const { colors } = useTheme();

  return (
    <View
      style={[
        styles.journeyCompleteCard,
        {
          backgroundColor: alpha(colors.backgroundElevated, 0.72),
          borderColor: alpha(colors.accent, 0.14),
          shadowColor: colors.accent,
        },
      ]}
    >
      <View style={styles.journeyCompleteContent}>
        <View style={[styles.journeyCompleteAccent, { backgroundColor: colors.accent }]} />
        <Text style={[styles.journeyCompleteKicker, { color: colors.accent }]}>Series complete</Text>
        <Text style={[styles.journeyCompleteTitle, { color: colors.text }]}>Carry the thread forward.</Text>

        <Text style={[styles.journeyCompleteSubtitle, { color: colors.textMuted }]}>
          {seriesTitle} is complete. Rest with what God surfaced here, then begin another study when you’re ready.
        </Text>

        <TouchableOpacity
          activeOpacity={0.72}
          onPress={onCreateNew}
          accessibilityRole="button"
          accessibilityLabel="Create a new devotional series"
          accessibilityHint="Opens the new series setup"
          style={[styles.journeyCompleteCta, { borderColor: alpha(colors.accent, 0.28), backgroundColor: alpha(colors.accent, 0.08) }]}
        >
          <Text style={[styles.journeyCompleteCtaText, { color: colors.text }]}>Create Series</Text>
          <Text style={[styles.journeyCompleteCtaArrow, { color: colors.accent }]}>→</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

function JourneyCompleteState({ seriesTitle, onCreateNew }: { seriesTitle: string; onCreateNew: () => void }) {
  return (
    <RecommendedSeriesCard
      variant="completion"
      completedSeriesTitle={seriesTitle}
      onChooseOther={onCreateNew}
      renderFallback={() => <JourneyCompleteStateFallback seriesTitle={seriesTitle} onCreateNew={onCreateNew} />}
    />
  );
}

// ─── Main card (shared by unread / complete-today / tomorrow-locked) ──

interface MainCardProps {
  state: Extract<DevotionalCardState, { type: 'unread' | 'complete-today' | 'tomorrow-locked' }>;
}

function MainCard({ state }: MainCardProps) {
  const { colors, isDark } = useTheme();
  const { width, fontScale } = useWindowDimensions();
  const isLargeTextHero = fontScale >= 1.18;
  const isCompactHero = width < 400 || isLargeTextHero;
  const isVeryCompactHero = width < 370 || fontScale >= 1.32;
  const scale = useSharedValue(1);

  const scaleStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const hasCompletedToday = state.type === 'complete-today';
  const isTomorrowLocked = state.type === 'tomorrow-locked';
  const usesEmberState = hasCompletedToday || isTomorrowLocked;
  const dayData = state.dayData;
  const dayLabel = state.dayLabel;
  const isYesterday = dayLabel === 'Overdue';

  const progress = state.progress;
  const daysCompleted = state.daysCompleted;
  const showProgress = daysCompleted > 0;
  const totalDays = state.totalDays;
  const seriesTitle = state.seriesTitle;
  const statusLabel = hasCompletedToday ? 'Completed' : isTomorrowLocked ? 'Tomorrow' : isYesterday ? 'Still waiting' : dayLabel;
  const studyMethodName = dayData.studyMethod && BIBLE_STUDY_METHODS[dayData.studyMethod]
    ? BIBLE_STUDY_METHODS[dayData.studyMethod].name
    : null;

  const scripturePreview = dayData.scriptureText
    ? dayData.scriptureText.replace(/\s+/g, ' ').trim().slice(0, 104)
    : '';
  const quotable = stripOuterQuotes(dayData.quotableLine || '');
  const devotionalLine = usesEmberState
    ? (quotable || 'Today’s reading is tucked into your rhythm.')
    : (quotable || (scripturePreview ? `${scripturePreview}…` : 'A personalized reading is ready for this part of your story.'));

  const ctaText = hasCompletedToday
    ? 'Read Again'
    : isTomorrowLocked
      ? 'Return to Today’s Reading'
      : isYesterday
        ? 'Finish Yesterday’s Devotional'
        : state.type === 'unread'
          ? state.ctaText
          : 'Continue Reading';
  const continueDayNumber = isTomorrowLocked ? Math.max(1, daysCompleted) : dayData.dayNumber;
  const onPress = 'onContinue' in state ? () => state.onContinue(continueDayNumber) : undefined;
  const onCreateNew = 'onCreateNew' in state ? state.onCreateNew : undefined;

  const accessibilityLabel = hasCompletedToday
    ? `Read ${seriesTitle}, day ${dayData.dayNumber} of ${totalDays} again`
    : isTomorrowLocked
      ? `Tomorrow's reading is locked. Return to ${seriesTitle}, day ${continueDayNumber} of ${totalDays}`
      : `Continue ${seriesTitle}, day ${dayData.dayNumber} of ${totalDays}`;

  return (
    <Animated.View style={scaleStyle}>
      <View style={styles.heroTouchable}>
        <View style={[styles.openHero, isCompactHero && styles.openHeroCompact, isVeryCompactHero && styles.openHeroVeryCompact]}>
          <View style={[styles.openHeroContent, isCompactHero && styles.openHeroContentCompact, isVeryCompactHero && styles.openHeroContentVeryCompact]}>
            <Text
              style={[styles.heroSeriesEyebrow, { color: colors.textSubtle }]}
              numberOfLines={1}
              maxFontSizeMultiplier={LABEL_TEXT_MAX_SCALE}
            >
              {seriesTitle}
            </Text>

            {hasCompletedToday ? (
              <View
                style={styles.heroDayMetaRow}
                accessible
                accessibilityLabel={`Completed. Day ${dayData.dayNumber} of ${totalDays}`}
              >
                <View
                  style={[
                    styles.completedStatusPill,
                    {
                      backgroundColor: Platform.OS === 'ios'
                        ? alpha(colors.backgroundElevated, isDark ? 0.56 : 0.8)
                        : alpha(colors.backgroundElevated, 0.9),
                      borderColor: alpha(colors.accent, 0.25),
                    },
                  ]}
                >
                  {Platform.OS === 'ios' && (
                    <BlurView
                      intensity={isDark ? 28 : 18}
                      tint={isDark ? 'dark' : 'light'}
                      style={StyleSheet.absoluteFill}
                    />
                  )}
                  <CheckIcon size={12} color={colors.accent} weight="bold" />
                  <Text style={[styles.completedStatusText, { color: colors.accent }]} maxFontSizeMultiplier={LABEL_TEXT_MAX_SCALE}>
                    Completed
                  </Text>
                </View>
                <Text style={[styles.heroDayMetaDayText, { color: colors.textSubtle }]} maxFontSizeMultiplier={LABEL_TEXT_MAX_SCALE}>
                  Day {dayData.dayNumber} of {totalDays}
                </Text>
              </View>
            ) : (
              <Text style={[styles.heroDayMeta, { color: colors.accent }]} maxFontSizeMultiplier={LABEL_TEXT_MAX_SCALE}>
                {statusLabel} · Day {dayData.dayNumber} of {totalDays}
              </Text>
            )}

            <Text
              style={[styles.heroDayTitle, isCompactHero && styles.heroDayTitleCompact, isVeryCompactHero && styles.heroDayTitleVeryCompact, { color: colors.text }]}
              numberOfLines={3}
              maxFontSizeMultiplier={DISPLAY_TEXT_MAX_SCALE}
            >
              {smartQuotes(dayData.title)}
            </Text>

            <View style={styles.heroQuoteBlock}>
              <Text style={[styles.heroQuoteMark, { color: colors.accent }]}>“</Text>
              <Text
                style={[styles.heroQuoteText, isCompactHero && styles.heroQuoteTextCompact, isVeryCompactHero && styles.heroQuoteTextVeryCompact, { color: colors.text }]}
                numberOfLines={4}
                maxFontSizeMultiplier={DISPLAY_TEXT_MAX_SCALE}
              >
                {smartQuotes(devotionalLine)}
              </Text>
              {state.type === 'tomorrow-locked' && state.tomorrowTeaser ? (
                <Text style={[styles.heroTomorrowTeaser, { color: colors.textMuted }]} numberOfLines={3} maxFontSizeMultiplier={BODY_TEXT_MAX_SCALE}>
                  Tomorrow’s thread: {smartQuotes(state.tomorrowTeaser)}
                </Text>
              ) : null}
            </View>

            {studyMethodName ? (
              <View style={styles.heroMethodRow}>
                <Text style={[styles.heroMethodText, { color: colors.textMuted }]} maxFontSizeMultiplier={LABEL_TEXT_MAX_SCALE}>
                  {studyMethodName}
                </Text>
              </View>
            ) : null}

            {showProgress && (
              <View style={styles.heroProgressSection}>
                <View style={styles.heroProgressHeader}>
                  <Text style={[styles.mainCardProgressLeft, { color: colors.textSubtle }]} maxFontSizeMultiplier={LABEL_TEXT_MAX_SCALE}>
                    {daysCompleted} of {totalDays} completed
                  </Text>
                  <Text style={[styles.mainCardProgressRight, { color: colors.accent }]} maxFontSizeMultiplier={LABEL_TEXT_MAX_SCALE}>
                    {Math.round(progress)}%
                  </Text>
                </View>
                <AnimatedProgressBar progress={progress} colors={colors} />
              </View>
            )}

            <TouchableOpacity
              activeOpacity={0.74}
              onPress={onPress}
              onPressIn={() => {
                scale.value = withTiming(0.99, { duration: 120 });
              }}
              onPressOut={() => {
                scale.value = withTiming(1, { duration: Duration.fast });
              }}
              accessibilityRole="button"
              accessibilityLabel={accessibilityLabel}
              accessibilityHint={hasCompletedToday ? "Opens the completed reading again" : isTomorrowLocked ? "Opens today's completed reading instead of the locked tomorrow reading" : undefined}
              style={[
                styles.heroActions,
                hasCompletedToday && styles.heroActionsSecondary,
                {
                  borderColor: alpha(colors.accent, hasCompletedToday ? 0.25 : 0.24),
                  backgroundColor: Platform.OS === 'ios'
                    ? alpha(colors.backgroundElevated, isDark ? 0.56 : 0.8)
                    : alpha(colors.backgroundElevated, 0.9),
                },
              ]}
            >
              {Platform.OS === 'ios' && (
                <BlurView
                  intensity={isDark ? 28 : 18}
                  tint={isDark ? 'dark' : 'light'}
                  style={StyleSheet.absoluteFill}
                />
              )}
              <View style={styles.heroActionContent}>
                <Text style={[styles.heroActionText, { color: colors.text }]} maxFontSizeMultiplier={BODY_TEXT_MAX_SCALE}>
                  {ctaText}
                </Text>
                <Text style={[styles.heroActionArrow, { color: colors.accent }]}>→</Text>
              </View>
            </TouchableOpacity>

            {onCreateNew && (
              <TouchableOpacity
                activeOpacity={0.7}
                onPress={onCreateNew}
                accessibilityRole="button"
                accessibilityLabel="Start a new devotional series"
                accessibilityHint="Opens the series creation flow"
                style={styles.heroNewSeriesButton}
              >
                <View style={styles.heroNewSeriesInner}>
                  <PlusIcon size={14} color={colors.textMuted} weight="light" />
                  <Text style={[styles.newSeriesText, { color: colors.textMuted }]} maxFontSizeMultiplier={LABEL_TEXT_MAX_SCALE}>New Series</Text>
                </View>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </View>
    </Animated.View>
  );
}

// ─── DevotionalCard (root) ──────────────────────────────────────

export function DevotionalCard({ state, scrollY, inStack, isReturningUser }: Props) {
  const { entering } = useAccessibleAnimation();

  // Subtle parallax when scrollY is provided
  const parallaxStyle = useAnimatedStyle(() => {
    if (!scrollY) return {};
    return { transform: [{ translateY: scrollY.value * 0.05 }] };
  });

  return (
    <Animated.View
      entering={entering(FadeIn.delay(100).duration(Duration.normal).easing(Ease.out))}
      style={[inStack ? styles.rootInStack : styles.root, parallaxStyle]}
    >
      {state.type === 'empty' && <EmptyState onCreateNew={state.onCreateNew} isReturningUser={isReturningUser} />}
      {state.type === 'preparing' && (
        <PreparingState
          progress={state.progress}
          seriesTitle={state.seriesTitle}
          dayNumber={state.dayNumber}
        />
      )}
      {state.type === 'premium-paused' && <PremiumPausedState state={state} />}
      {state.type === 'journey-complete' && (
        <JourneyCompleteState seriesTitle={state.seriesTitle} onCreateNew={state.onCreateNew} />
      )}
      {state.type === 'reveal-ready' && <RevealReadyState state={state} />}
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

  // Open editorial hero
  heroTouchable: {
    borderRadius: Radius.xl,
  },
  openHero: {
    minHeight: 416,
    paddingTop: Spacing['3'],
    paddingBottom: Spacing['7'],
    overflow: 'visible',
    position: 'relative',
  },
  openHeroCompact: {
    minHeight: 380,
    paddingBottom: Spacing['6'],
  },
  openHeroVeryCompact: {
    minHeight: 360,
    paddingBottom: Spacing['5'],
  },
  openHeroContent: {
    width: '100%',
    maxWidth: 356,
    zIndex: 2,
  },
  openHeroContentCompact: {
    width: '100%',
    maxWidth: 340,
  },
  openHeroContentVeryCompact: {
    width: '100%',
    maxWidth: 320,
  },
  heroSeriesEyebrow: {
    fontFamily: FontFamily.uiMedium,
    fontSize: 12,
    letterSpacing: 0.45,
    lineHeight: 17,
    marginBottom: Spacing['5'],
  },
  heroDayMeta: {
    fontFamily: FontFamily.uiMedium,
    fontSize: 12,
    letterSpacing: 0.35,
    lineHeight: 18,
    marginBottom: Spacing['3'],
  },
  heroDayMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    flexWrap: 'wrap',
    gap: Spacing['2'],
    marginBottom: Spacing['3'],
  },
  completedStatusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing['1.5'],
    paddingHorizontal: Spacing['2.5'],
    paddingVertical: Spacing['1'],
    borderRadius: Radius.full,
    borderWidth: 1,
    overflow: 'hidden',
  },
  completedStatusText: {
    fontFamily: FontFamily.uiMedium,
    fontSize: 11,
    letterSpacing: 1.2,
    lineHeight: 15,
    textTransform: 'uppercase',
  },
  heroDayMetaDayText: {
    fontFamily: FontFamily.uiMedium,
    fontSize: 11,
    letterSpacing: 1.35,
    lineHeight: 16,
    textTransform: 'uppercase',
  },
  heroDayTitle: {
    fontFamily: FontFamily.display,
    fontSize: 42,
    lineHeight: 48,
    letterSpacing: -0.8,
    marginBottom: Spacing['5'],
  },
  heroDayTitleCompact: {
    fontSize: 36,
    lineHeight: 41,
    letterSpacing: -0.6,
    marginBottom: Spacing['4'],
  },
  heroDayTitleVeryCompact: {
    fontSize: 32,
    lineHeight: 38,
  },
  heroQuoteBlock: {
    position: 'relative',
    paddingLeft: 24,
    marginBottom: Spacing['6'],
  },
  heroQuoteMark: {
    position: 'absolute',
    left: 0,
    top: -2,
    fontFamily: FontFamily.display,
    fontSize: 28,
    lineHeight: 28,
  },
  heroQuoteText: {
    fontFamily: FontFamily.displayItalic,
    fontSize: 20,
    lineHeight: 30,
    letterSpacing: -0.1,
  },
  heroQuoteTextCompact: {
    fontSize: 18,
    lineHeight: 27,
  },
  heroQuoteTextVeryCompact: {
    fontSize: 17,
    lineHeight: 26,
  },
  heroTomorrowTeaser: {
    fontFamily: FontFamily.body,
    fontSize: 13,
    lineHeight: 20,
    marginTop: Spacing['3'],
  },
  heroMethodRow: {
    alignSelf: 'flex-start',
    marginBottom: Spacing['5'],
  },
  heroMethodText: {
    fontFamily: FontFamily.uiMedium,
    fontSize: 11,
    letterSpacing: 1.3,
    textTransform: 'uppercase',
  },
  heroProgressSection: {
    marginBottom: Spacing['6'],
  },
  heroProgressHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing['2'],
  },
  heroActions: {
    alignSelf: 'flex-start',
    minHeight: 48,
    paddingVertical: Spacing['3'],
    paddingHorizontal: Spacing['5'],
    borderRadius: 999,
    borderWidth: 1,
    marginTop: Spacing['1'],
    overflow: 'hidden',
  },
  heroActionsSecondary: {
    minHeight: 42,
    paddingVertical: Spacing['2.5'],
    paddingHorizontal: Spacing['4'],
  },
  heroActionContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing['2'],
  },
  heroActionArrow: {
    fontFamily: FontFamily.uiMedium,
    fontSize: 17,
    lineHeight: 20,
    marginTop: -1,
  },
  heroActionText: {
    fontFamily: FontFamily.uiMedium,
    fontSize: 15,
    lineHeight: 20,
    letterSpacing: 0.35,
  },
  heroNewSeriesButton: {
    alignSelf: 'flex-start',
    marginTop: Spacing['3'],
    minHeight: 44,
    justifyContent: 'center',
  },
  heroNewSeriesInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
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
    marginBottom: 32,
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

  // Returning user empty state
  returningCard: {
    borderRadius: Radius.xl,
    borderWidth: 1,
    overflow: 'hidden',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.12,
    shadowRadius: 20,
    elevation: 5,
  },
  returningGlow: {
    borderRadius: Radius.xl,
  },
  returningContent: {
    padding: Spacing['7'],
  },
  returningKicker: {
    fontFamily: FontFamily.uiMedium,
    fontSize: 11,
    letterSpacing: 1.5,
    lineHeight: 16,
    textTransform: 'uppercase',
    marginBottom: Spacing['3'],
  },
  returningTitle: {
    fontFamily: FontFamily.display,
    fontSize: 32,
    lineHeight: 40,
    letterSpacing: -0.5,
    textAlign: 'left',
    marginBottom: Spacing['3'],
  },
  returningSubtitle: {
    fontFamily: FontFamily.body,
    fontSize: 15,
    lineHeight: 23,
    textAlign: 'left',
    marginBottom: Spacing['7'],
  },
  returningCta: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing['2'],
    paddingVertical: 13,
    paddingHorizontal: 24,
    borderRadius: 999,
    borderWidth: 1,
  },
  returningCtaText: {
    fontFamily: FontFamily.uiMedium,
    fontSize: 15,
    lineHeight: 20,
    letterSpacing: 0.3,
  },
  returningCtaArrow: {
    fontFamily: FontFamily.uiMedium,
    fontSize: 17,
    lineHeight: 20,
    marginTop: -1,
  },
  premiumPausedProgress: {
    fontFamily: FontFamily.uiMedium,
    fontSize: 12,
    lineHeight: 18,
    letterSpacing: 1.1,
    textTransform: 'uppercase',
    marginTop: -Spacing['4'],
    marginBottom: Spacing['5'],
  },
  premiumPausedActions: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: Spacing['3'],
  },
  premiumPausedPrimaryCta: {
    alignSelf: 'auto',
  },
  premiumPausedSecondaryCta: {
    alignSelf: 'auto',
    paddingHorizontal: 20,
  },

  // Reveal-ready open hero
  revealOpenHero: {
    minHeight: 352,
    paddingTop: Spacing['3'],
    paddingBottom: Spacing['6'],
    overflow: 'visible',
    position: 'relative',
  },
  revealOpenHeroCompact: {
    minHeight: 326,
    paddingBottom: Spacing['5'],
  },
  revealOpenHeroVeryCompact: {
    minHeight: 304,
    paddingBottom: Spacing['4'],
  },
  revealOpenScripture: {
    fontFamily: FontFamily.body,
    fontSize: 13,
    lineHeight: 20,
    marginTop: Spacing['3'],
  },

  // Preparing state
  preparingContainer: {
    overflow: 'visible',
    position: 'relative',
  },
  preparingGlow: {
    borderRadius: Radius.xl,
  },
  preparingContent: {
    paddingVertical: Spacing['7'],
    paddingHorizontal: Spacing['4'],
    alignItems: 'center',
    zIndex: 2,
  },
  preparingAccentBar: {
    width: 24,
    height: 1,
    borderRadius: 1,
  },
  preparingKickerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing['2'],
    marginBottom: Spacing['3'],
  },
  preparingKicker: {
    fontFamily: FontFamily.uiMedium,
    fontSize: 10,
    lineHeight: 14,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  preparingTitle: {
    fontFamily: FontFamily.display,
    fontSize: 24,
    lineHeight: 31,
    letterSpacing: -0.35,
    textAlign: 'center',
    marginBottom: Spacing['2'],
  },
  preparingSubtitle: {
    fontFamily: FontFamily.body,
    fontSize: 15,
    lineHeight: 23,
    textAlign: 'center',
    marginBottom: Spacing['4'],
    maxWidth: 310,
  },
  preparingStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    flexWrap: 'wrap',
    gap: Spacing['2'],
    marginBottom: Spacing['6'],
  },
  preparingStatusPill: {
    borderWidth: 1,
    borderRadius: 999,
    paddingVertical: Spacing['1.5'],
    paddingHorizontal: Spacing['3'],
  },
  preparingStatusText: {
    fontFamily: FontFamily.uiMedium,
    fontSize: 11,
    lineHeight: 15,
    letterSpacing: 0.2,
  },
  preparingCta: {
    width: '100%',
    minHeight: 54,
    borderRadius: Radius.lg,
    borderWidth: 1,
    paddingHorizontal: Spacing['4'],
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing['2'],
    marginBottom: Spacing['6'],
  },
  preparingCtaText: {
    fontFamily: FontFamily.uiSemiBold,
    fontSize: 15,
    lineHeight: 20,
  },
  preparingCtaArrow: {
    fontFamily: FontFamily.uiMedium,
    fontSize: 18,
    lineHeight: 20,
    marginLeft: Spacing['1'],
  },
  preparingProgressTrack: {
    height: 2,
    borderRadius: 1,
    width: 112,
    maxWidth: '42%',
  },
  preparingProgressFill: {
    height: '100%',
    borderRadius: 1,
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
    borderRadius: Radius.xl,
    borderWidth: 1,
    padding: Spacing['7'],
    overflow: 'hidden',
    position: 'relative',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.1,
    shadowRadius: 24,
    elevation: 5,
  },
  journeyCompleteContent: {
    alignItems: 'center',
    zIndex: 2,
  },
  journeyCompleteAccent: {
    width: 32,
    height: 1.5,
    marginBottom: Spacing['5'],
    borderRadius: 1,
  },
  journeyCompleteKicker: {
    fontFamily: FontFamily.uiMedium,
    fontSize: 11,
    letterSpacing: 1.5,
    lineHeight: 16,
    textTransform: 'uppercase',
    marginBottom: Spacing['3'],
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
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing['2'],
    paddingVertical: 13,
    paddingHorizontal: 28,
    borderRadius: 999,
    borderWidth: 1,
  },
  journeyCompleteCtaText: {
    fontFamily: FontFamily.uiMedium,
    fontSize: 15,
    lineHeight: 20,
    letterSpacing: 0.3,
  },
  journeyCompleteCtaArrow: {
    fontFamily: FontFamily.uiMedium,
    fontSize: 17,
    lineHeight: 20,
    marginTop: -1,
  },

  // Main card
  mainCard: {
    borderRadius: Radius.xl,
    borderWidth: 1,
    padding: Spacing['6'],
    overflow: 'hidden',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 16,
    elevation: 4,
  },
  sacredHeroCard: {
    padding: Spacing['6'],
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.1,
    shadowRadius: 28,
  },
  mainCardWash: {
    ...StyleSheet.absoluteFill,
    opacity: 0.92,
  },
  mainCardHalo: {
    position: 'absolute',
    right: -54,
    top: -46,
    width: 156,
    height: 156,
    borderRadius: 78,
  },
  sacredMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing['3'],
    marginBottom: Spacing['5'],
  },
  sacredEyebrow: {
    flex: 1,
    fontFamily: FontFamily.uiMedium,
    fontSize: 12,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  sacredStatusPill: {
    borderWidth: 1,
    borderRadius: Radius.full,
    paddingHorizontal: Spacing['2.5'],
    paddingVertical: Spacing['1.5'],
    flexDirection: 'row',
    alignItems: 'center',
  },
  sacredStatusText: {
    fontFamily: FontFamily.uiMedium,
    fontSize: 11,
    letterSpacing: 0.2,
  },
  sacredTitleBlock: {
    marginBottom: Spacing['3'],
  },
  sacredDayMeta: {
    fontFamily: FontFamily.uiMedium,
    fontSize: 12,
    letterSpacing: 1.4,
    textTransform: 'uppercase',
    marginBottom: Spacing['2'],
  },
  sacredDayTitle: {
    fontSize: 34,
    lineHeight: 40,
    marginBottom: 0,
  },
  sacredScripture: {
    fontFamily: FontFamily.bodyItalic,
    fontSize: 15,
    lineHeight: 23,
    marginBottom: Spacing['4'],
  },
  sacredQuotePanel: {
    borderRadius: Radius.lg,
    borderWidth: 1,
    paddingVertical: Spacing['4'],
    paddingHorizontal: Spacing['4'],
    marginBottom: Spacing['5'],
  },
  sacredQuoteText: {
    marginBottom: 0,
    paddingHorizontal: 0,
  },
  tomorrowTeaserText: {
    fontFamily: FontFamily.body,
    fontSize: 13,
    lineHeight: 20,
    marginTop: Spacing['3'],
  },
  sacredMethodChip: {
    borderRadius: Radius.full,
    paddingHorizontal: Spacing['3'],
  },
  sacredProgressHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing['2'],
  },
  sacredActions: {
    gap: Spacing['2'],
  },
  sacredPrimaryButton: {
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
  },
  sacredSecondaryButton: {
    marginTop: 0,
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
    fontFamily: FontFamily.uiMedium,
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

  // Completed state (complete-today / tomorrow-locked)
  completedQuoteLine: {
    fontFamily: FontFamily.displayItalic,
    fontSize: FontSize.xl,
    lineHeight: 30,
    textAlign: 'left',
    marginBottom: Spacing['4'],
    paddingHorizontal: Spacing['2'],
  },
  completedTomorrowNote: {
    fontFamily: FontFamily.body,
    fontSize: 13,
    lineHeight: 20,
    textAlign: 'left',
    marginBottom: Spacing['5'],
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
