/**
 * DevotionalCard — 6-state hero card for the home screen.
 *
 * Renders based on a DevotionalCardState discriminated union:
 *   empty | preparing | reveal-ready | unread | complete-today | tomorrow-locked | journey-complete
 *
 * Extracted from (tabs)/(today)/index.tsx for single-responsibility and testability.
 */

import React, { useEffect, useMemo, useCallback } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, useWindowDimensions } from 'react-native';
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
import { PlusIcon } from 'phosphor-react-native';

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

const RevealChar = React.memo(function RevealChar({ char, animDelay }: { char: string; animDelay: number }) {
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
  const { entering, reducedMotion } = useAccessibleAnimation();
  const pulse = useSharedValue(0.4);

  useEffect(() => {
    if (reducedMotion) {
      pulse.value = 0.58;
      return;
    }
    pulse.value = withRepeat(
      withTiming(0.82, { duration: 3200, easing: Easing.inOut(Easing.sin) }),
      -1,
      true,
    );
    return () => cancelAnimation(pulse);
  }, [pulse, reducedMotion]);

  const pulseStyle = useAnimatedStyle(() => ({
    opacity: pulse.value,
    transform: [{ scaleY: interpolate(pulse.value, [0.4, 0.82], [0.86, 1.08]) }],
  }));

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
      <View pointerEvents="none" style={styles.editorialStateArt}>
        <Animated.View style={[styles.editorialStateLine, { backgroundColor: alpha(colors.accent, 0.38) }, pulseStyle]} />
        <View style={[styles.editorialStateDot, { backgroundColor: colors.accent, shadowColor: colors.accent }]} />
      </View>

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
  const { colors } = useTheme();
  const { width } = useWindowDimensions();
  const { entering } = useAccessibleAnimation();
  const isYesterday = state.dayLabel === 'Overdue';
  const isCompactHero = width < 400;
  const scriptureReference = state.dayData.scriptureReference || 'Today’s reading';

  return (
    <Animated.View entering={entering(FadeIn.duration(Duration.normal).easing(Ease.out))}>
      <View
        style={[
          styles.revealCard,
          isCompactHero && styles.revealCardCompact,
          {
            backgroundColor: alpha(colors.backgroundElevated, 0.74),
            borderColor: alpha(colors.accent, 0.16),
            shadowColor: colors.accent,
          },
        ]}
      >
        <View pointerEvents="none" style={styles.revealSealArt}>
          <View style={[styles.revealSealOuter, { borderColor: alpha(colors.accent, 0.2) }]} />
          <View style={[styles.revealSealInner, { borderColor: alpha(colors.accent, 0.42) }]} />
          <View style={[styles.revealSealEmber, { backgroundColor: colors.accent, shadowColor: colors.accent }]} />
        </View>

        <View style={[styles.revealHeaderRow, isCompactHero && styles.revealHeaderRowCompact]}>
          <View style={[styles.revealRule, { backgroundColor: alpha(colors.accent, 0.64) }]} />
          <Text style={[styles.revealStatusPill, { color: colors.accent, borderColor: alpha(colors.accent, 0.22) }]}>
            {isYesterday ? 'Still waiting' : 'Ready to reveal'}
          </Text>
        </View>

        <Text style={[styles.revealSeriesInfo, { color: colors.textMuted }]} numberOfLines={1}>
          {state.seriesTitle} · Day {state.dayNumber} of {state.totalDays}
        </Text>

        <Text style={[styles.revealDayTitle, isCompactHero && styles.revealDayTitleCompact, { color: colors.text }]}>
          {state.dayData.title}
        </Text>

        <View style={styles.revealScriptureRow}>
          <Text style={[styles.revealScripture, { color: colors.textMuted }]} numberOfLines={1}>
            {scriptureReference}
          </Text>
        </View>

        <Text style={[styles.revealMessage, isCompactHero && styles.revealMessageCompact, { color: colors.text }]}>
          {isYesterday
            ? 'This thread is still sealed for you. Open it gently before moving on.'
            : 'A new thread is ready, but the words stay quiet until you choose to open them.'}
        </Text>

        <TouchableOpacity
          activeOpacity={0.72}
          onPress={state.onReveal}
          accessibilityRole="button"
          accessibilityLabel={isYesterday ? `Catch up on ${state.seriesTitle}, day ${state.dayNumber}` : `Reveal ${state.seriesTitle}, day ${state.dayNumber}`}
          accessibilityHint="Opens the reveal screen for this devotional reading"
          style={[styles.revealCta, { borderColor: alpha(colors.accent, 0.3), backgroundColor: alpha(colors.accent, 0.085) }]}
        >
          <Text style={[styles.revealCtaText, { color: colors.text }]}>
            {isYesterday ? 'Catch Up on Yesterday’s Reading' : 'Reveal Today’s Devotional'}
          </Text>
          <Text style={[styles.revealCtaArrow, { color: colors.accent }]}>→</Text>
        </TouchableOpacity>
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

function PreparingState({ progress }: { progress: number }) {
  const { colors } = useTheme();
  const { reducedMotion } = useAccessibleAnimation();

  const shimmerOpacity = useSharedValue(0.45);
  const threadDrift = useSharedValue(0);

  useEffect(() => {
    if (reducedMotion) {
      shimmerOpacity.value = 0.72;
      threadDrift.value = 0.35;
      return;
    }
    shimmerOpacity.value = withRepeat(
      withTiming(0.9, { duration: 2200, easing: Easing.inOut(Easing.ease) }),
      -1,
      true,
    );
    threadDrift.value = withRepeat(
      withTiming(1, { duration: 5200, easing: Easing.inOut(Easing.sin) }),
      -1,
      true,
    );
    return () => {
      cancelAnimation(shimmerOpacity);
      cancelAnimation(threadDrift);
    };
  }, [shimmerOpacity, threadDrift, reducedMotion]);

  const shimmerStyle = useAnimatedStyle(() => ({ opacity: shimmerOpacity.value }));
  const threadStyle = useAnimatedStyle(() => ({
    opacity: interpolate(threadDrift.value, [0, 1], [0.28, 0.58]),
    transform: [{ translateX: interpolate(threadDrift.value, [0, 1], [-8, 10]) }],
  }));

  return (
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel="Preparing today's devotional reading"
      accessibilityValue={{ text: 'Checking the series and shaping today’s reading' }}
      style={[
        styles.preparingContainer,
        {
          backgroundColor: alpha(colors.backgroundElevated, 0.72),
          borderColor: alpha(colors.accent, 0.12),
          shadowColor: colors.accent,
        },
      ]}
    >
      <View pointerEvents="none" style={styles.preparingOrbitalArt}>
        <View style={[styles.preparingOrbitOuter, { borderColor: alpha(colors.accent, 0.18) }]} />
        <View style={[styles.preparingOrbitInner, { borderColor: alpha(colors.accent, 0.32) }]} />
        <Animated.View style={[styles.preparingOrbitEmber, { backgroundColor: colors.accent, shadowColor: colors.accent }, shimmerStyle]} />
      </View>

      <View pointerEvents="none" style={styles.preparingThreads}>
        <Animated.View style={[styles.preparingThread, { backgroundColor: alpha(colors.accent, 0.24) }, threadStyle]} />
        <Animated.View style={[styles.preparingThreadSmall, { backgroundColor: alpha(colors.accent, 0.16) }, threadStyle]} />
      </View>

      <View style={styles.preparingContent}>
        <View style={styles.preparingKickerRow}>
          <View style={[styles.preparingAccentBar, { backgroundColor: colors.accent }]} />
          <Text style={[styles.preparingKicker, { color: colors.accent }]}>Preparing today</Text>
        </View>

        <Animated.Text style={[styles.preparingTitle, { color: colors.text }, shimmerStyle]}>
          We’re gathering the thread.
        </Animated.Text>

        <Text style={[styles.preparingSubtitle, { color: colors.textMuted }]}>Unfold is checking your series, recovering any finished content, and shaping the next reading if it still needs to be made.</Text>

        <View style={styles.preparingStatusRow}>
          {['Series', 'Scripture', 'Devotional'].map((step, index) => (
            <View
              key={step}
              style={[
                styles.preparingStatusPill,
                {
                  backgroundColor: alpha(colors.accent, index === 0 ? 0.12 : 0.065),
                  borderColor: alpha(colors.accent, index === 0 ? 0.22 : 0.12),
                },
              ]}
            >
              <Text style={[styles.preparingStatusText, { color: index === 0 ? colors.accent : colors.textMuted }]}>
                {step}
              </Text>
            </View>
          ))}
        </View>

        <PreparingProgressBar progress={progress} colors={colors} />
      </View>
    </View>
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
      <View pointerEvents="none" style={styles.journeyCompleteArt}>
        <View style={[styles.journeyCompleteHalo, { borderColor: alpha(colors.accent, 0.16) }]} />
        <View style={[styles.journeyCompleteThread, { backgroundColor: alpha(colors.accent, 0.28) }]} />
        <View style={[styles.journeyCompleteEmber, { backgroundColor: colors.accent, shadowColor: colors.accent }]} />
      </View>

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

const HERO_THREAD_OFFSETS = [-42, -26, -11, 6, 23, 40];
const HERO_SPARKS = [
  { top: 24, right: 48, size: 4, opacity: 0.95 },
  { top: 72, right: 88, size: 2, opacity: 0.55 },
  { top: 112, right: 38, size: 3, opacity: 0.7 },
  { top: 158, right: 76, size: 2, opacity: 0.48 },
  { top: 214, right: 28, size: 3, opacity: 0.62 },
];

function HeroMotionGlyph({ emberActive }: { emberActive: boolean }) {
  const { colors } = useTheme();
  const { width, fontScale } = useWindowDimensions();
  const { reducedMotion } = useAccessibleAnimation();
  const isCompactGlyph = width < 400 || fontScale >= 1.2;
  const drift = useSharedValue(0);
  const pulse = useSharedValue(emberActive ? 0.72 : 0.48);

  useEffect(() => {
    if (reducedMotion) {
      drift.value = 0.45;
      pulse.value = emberActive ? 0.78 : 0.55;
      return;
    }

    drift.value = withRepeat(
      withTiming(1, { duration: 9600, easing: Easing.inOut(Easing.sin) }),
      -1,
      true,
    );
    pulse.value = withRepeat(
      withTiming(emberActive ? 0.95 : 0.68, { duration: 4200, easing: Easing.inOut(Easing.sin) }),
      -1,
      true,
    );

    return () => {
      cancelAnimation(drift);
      cancelAnimation(pulse);
    };
  }, [drift, emberActive, pulse, reducedMotion]);

  const ribbonStyle = useAnimatedStyle(() => ({
    opacity: interpolate(drift.value, [0, 1], [0.42, 0.76]),
    transform: [
      { translateY: interpolate(drift.value, [0, 1], [12, -10]) },
      { rotate: `${interpolate(drift.value, [0, 1], [-19, -8])}deg` },
    ],
  }));

  const arcStyle = useAnimatedStyle(() => ({
    opacity: pulse.value,
    transform: [
      { scale: interpolate(pulse.value, [0.45, 0.95], [0.96, 1.03]) },
      { rotate: `${interpolate(drift.value, [0, 1], [5, -4])}deg` },
    ],
  }));

  const emberStyle = useAnimatedStyle(() => ({
    opacity: interpolate(pulse.value, [0.45, 0.95], [0.46, 0.9]),
    transform: [{ scale: interpolate(pulse.value, [0.45, 0.95], [0.9, 1.14]) }],
  }));

  return (
    <View pointerEvents="none" style={[styles.heroMotionGlyph, isCompactGlyph && styles.heroMotionGlyphCompact]}>
      <Animated.View
        style={[
          styles.heroRibbon,
          {
            borderColor: alpha(colors.accent, emberActive ? 0.58 : 0.36),
            shadowColor: colors.accent,
          },
          ribbonStyle,
        ]}
      />

      {HERO_THREAD_OFFSETS.map((offset, index) => (
        <View
          key={`thread-${offset}`}
          style={[
            styles.heroThread,
            {
              right: 74 + offset,
              backgroundColor: alpha(colors.accent, 0.1 + index * 0.028),
              transform: [{ rotate: `${-34 + index * 7}deg` }],
            },
          ]}
        />
      ))}

      <Animated.View
        style={[
          styles.heroOrbit,
          {
            borderColor: alpha(colors.accent, emberActive ? 0.68 : 0.44),
            shadowColor: colors.accent,
          },
          arcStyle,
        ]}
      >
        <Animated.View
          style={[
            styles.heroOrbitEmber,
            {
              backgroundColor: colors.accent,
              shadowColor: colors.accent,
            },
            emberStyle,
          ]}
        />
      </Animated.View>

      {HERO_SPARKS.map((spark, index) => (
        <View
          key={`spark-${index}`}
          style={[
            styles.heroSpark,
            {
              top: spark.top,
              right: spark.right,
              width: spark.size,
              height: spark.size,
              borderRadius: spark.size / 2,
              opacity: spark.opacity,
              backgroundColor: colors.accent,
              shadowColor: colors.accent,
            },
          ]}
        />
      ))}
    </View>
  );
}

function MainCard({ state }: MainCardProps) {
  const { colors } = useTheme();
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
  const statusLabel = hasCompletedToday ? 'Completed' : isTomorrowLocked ? 'Tomorrow' : isYesterday ? 'Overdue' : dayLabel;
  const studyMethodName = dayData.studyMethod && BIBLE_STUDY_METHODS[dayData.studyMethod]
    ? BIBLE_STUDY_METHODS[dayData.studyMethod].name
    : null;

  const scripturePreview = dayData.scriptureText
    ? dayData.scriptureText.replace(/\s+/g, ' ').trim().slice(0, 104)
    : '';
  const devotionalLine = usesEmberState
    ? (dayData.quotableLine || 'Today’s reading is tucked into your rhythm.')
    : (dayData.quotableLine || (scripturePreview ? `${scripturePreview}…` : 'A personalized reading is ready for this part of your story.'));

  const ctaText = hasCompletedToday
    ? 'Return to Reading'
    : isTomorrowLocked
      ? "Return to Today's Reading"
      : isYesterday
        ? "Finish Yesterday's Devotional"
        : state.type === 'unread'
          ? state.ctaText
          : 'Continue Reading';
  const continueDayNumber = isTomorrowLocked ? Math.max(1, daysCompleted) : dayData.dayNumber;
  const onPress = 'onContinue' in state ? () => state.onContinue(continueDayNumber) : undefined;
  const onCreateNew = 'onCreateNew' in state ? state.onCreateNew : undefined;

  const accessibilityLabel = hasCompletedToday
    ? `Return to ${seriesTitle}, day ${dayData.dayNumber} of ${totalDays}`
    : isTomorrowLocked
      ? `Tomorrow's reading is locked. Return to ${seriesTitle}, day ${continueDayNumber} of ${totalDays}`
      : `Continue ${seriesTitle}, day ${dayData.dayNumber} of ${totalDays}`;

  return (
    <Animated.View style={scaleStyle}>
      <View style={styles.heroTouchable}>
        <View style={[styles.openHero, isCompactHero && styles.openHeroCompact, isVeryCompactHero && styles.openHeroVeryCompact]}>
          <HeroMotionGlyph emberActive={usesEmberState} />

          <View style={[styles.openHeroContent, isCompactHero && styles.openHeroContentCompact, isVeryCompactHero && styles.openHeroContentVeryCompact]}>
            <Text
              style={[styles.heroSeriesEyebrow, { color: colors.textSubtle }]}
              numberOfLines={1}
              maxFontSizeMultiplier={LABEL_TEXT_MAX_SCALE}
            >
              {seriesTitle}
            </Text>

            <Text style={[styles.heroDayMeta, { color: colors.accent }]} maxFontSizeMultiplier={LABEL_TEXT_MAX_SCALE}>
              {statusLabel} · Day {dayData.dayNumber} of {totalDays}
            </Text>

            <Text
              style={[styles.heroDayTitle, isCompactHero && styles.heroDayTitleCompact, isVeryCompactHero && styles.heroDayTitleVeryCompact, { color: colors.text }]}
              numberOfLines={3}
              maxFontSizeMultiplier={DISPLAY_TEXT_MAX_SCALE}
            >
              {dayData.title}
            </Text>

            <View style={styles.heroScriptureRow}>
              <View style={[styles.heroScriptureRule, { backgroundColor: colors.accent }]} />
              <Text style={[styles.heroScripture, { color: colors.textMuted }]} numberOfLines={1} maxFontSizeMultiplier={BODY_TEXT_MAX_SCALE}>
                {dayData.scriptureReference || 'Today’s reading'}
              </Text>
            </View>

            <View style={styles.heroQuoteBlock}>
              <Text style={[styles.heroQuoteMark, { color: colors.accent }]}>“</Text>
              <Text
                style={[styles.heroQuoteText, isCompactHero && styles.heroQuoteTextCompact, isVeryCompactHero && styles.heroQuoteTextVeryCompact, { color: colors.text }]}
                numberOfLines={4}
                maxFontSizeMultiplier={DISPLAY_TEXT_MAX_SCALE}
              >
                {devotionalLine}
              </Text>
              {state.type === 'tomorrow-locked' && state.tomorrowTeaser ? (
                <Text style={[styles.heroTomorrowTeaser, { color: colors.textMuted }]} numberOfLines={3} maxFontSizeMultiplier={BODY_TEXT_MAX_SCALE}>
                  Tomorrow’s thread: {state.tomorrowTeaser}
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
              accessibilityHint={isTomorrowLocked ? "Opens today's completed reading instead of the locked tomorrow reading" : undefined}
              style={[
                styles.heroActions,
                {
                  borderColor: alpha(colors.accent, 0.24),
                  backgroundColor: alpha(colors.accent, 0.075),
                },
              ]}
            >
              <Text style={[styles.heroActionText, { color: colors.text }]} maxFontSizeMultiplier={BODY_TEXT_MAX_SCALE}>
                {ctaText}
              </Text>
              <Text style={[styles.heroActionArrow, { color: colors.accent }]}>→</Text>
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
      {state.type === 'preparing' && <PreparingState progress={state.progress} />}
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
    width: '70%',
    maxWidth: 292,
    zIndex: 2,
  },
  openHeroContentCompact: {
    width: '82%',
    maxWidth: 282,
  },
  openHeroContentVeryCompact: {
    width: '88%',
    maxWidth: 292,
  },
  heroSeriesEyebrow: {
    fontFamily: FontFamily.uiMedium,
    fontSize: 12,
    letterSpacing: 2.2,
    lineHeight: 17,
    textTransform: 'uppercase',
    marginBottom: Spacing['5'],
  },
  heroDayMeta: {
    fontFamily: FontFamily.uiMedium,
    fontSize: 12,
    letterSpacing: 1.8,
    lineHeight: 18,
    textTransform: 'uppercase',
    marginBottom: Spacing['3'],
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
  heroScriptureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing['3'],
    marginBottom: Spacing['5'],
  },
  heroScriptureRule: {
    width: 36,
    height: 1.5,
    borderRadius: 1,
  },
  heroScripture: {
    flex: 1,
    fontFamily: FontFamily.ui,
    fontSize: 14,
    lineHeight: 20,
    letterSpacing: 0.3,
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
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    minHeight: 48,
    paddingVertical: Spacing['3'],
    paddingHorizontal: Spacing['5'],
    borderRadius: 999,
    borderWidth: 1,
    marginTop: Spacing['1'],
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
  heroMotionGlyph: {
    position: 'absolute',
    top: 24,
    right: -58,
    width: 184,
    height: 324,
    zIndex: 1,
  },
  heroMotionGlyphCompact: {
    right: -86,
    width: 152,
    opacity: 0.66,
  },
  heroRibbon: {
    position: 'absolute',
    top: 60,
    right: -24,
    width: 138,
    height: 252,
    borderRightWidth: 1.2,
    borderRadius: 148,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 18,
  },
  heroThread: {
    position: 'absolute',
    top: 76,
    width: 1,
    height: 248,
    borderRadius: 1,
    opacity: 0.72,
  },
  heroOrbit: {
    position: 'absolute',
    top: 18,
    right: 42,
    width: 74,
    height: 74,
    borderRadius: 37,
    borderWidth: 1,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.42,
    shadowRadius: 16,
  },
  heroOrbitEmber: {
    position: 'absolute',
    top: -3,
    right: 10,
    width: 8,
    height: 8,
    borderRadius: 4,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.85,
    shadowRadius: 12,
  },
  heroSpark: {
    position: 'absolute',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 8,
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
    paddingRight: 92,
  },
  returningKicker: {
    fontFamily: FontFamily.uiMedium,
    fontSize: 11,
    letterSpacing: 1.5,
    lineHeight: 16,
    textTransform: 'uppercase',
    marginBottom: Spacing['3'],
  },
  editorialStateArt: {
    position: 'absolute',
    right: 22,
    top: 22,
    bottom: 22,
    width: 52,
    alignItems: 'center',
    justifyContent: 'center',
  },
  editorialStateLine: {
    width: 1.5,
    height: '74%',
    borderRadius: 1,
  },
  editorialStateDot: {
    position: 'absolute',
    top: '42%',
    width: 8,
    height: 8,
    borderRadius: 4,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.82,
    shadowRadius: 10,
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

  // Reveal-ready hero card
  revealCard: {
    borderRadius: Radius.xl,
    borderWidth: 1,
    minHeight: 318,
    paddingTop: Spacing['6'],
    paddingBottom: Spacing['6'],
    paddingHorizontal: Spacing['5'],
    overflow: 'hidden',
    position: 'relative',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.1,
    shadowRadius: 24,
    elevation: 5,
  },
  revealCardCompact: {
    minHeight: 292,
    paddingTop: Spacing['5'],
    paddingBottom: Spacing['5'],
  },
  revealSealArt: {
    position: 'absolute',
    right: -42,
    top: 18,
    width: 188,
    height: 188,
    opacity: 0.78,
  },
  revealSealOuter: {
    position: 'absolute',
    right: 0,
    top: 0,
    width: 178,
    height: 178,
    borderRadius: 89,
    borderWidth: 1,
  },
  revealSealInner: {
    position: 'absolute',
    right: 34,
    top: 34,
    width: 110,
    height: 110,
    borderRadius: 55,
    borderWidth: 1,
  },
  revealSealEmber: {
    position: 'absolute',
    right: 82,
    top: 82,
    width: 10,
    height: 10,
    borderRadius: 5,
    shadowOpacity: 0.35,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 0 },
  },
  revealHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing['3'],
    marginBottom: Spacing['5'],
    zIndex: 2,
  },
  revealHeaderRowCompact: {
    marginBottom: Spacing['4'],
  },
  revealRule: {
    width: 34,
    height: 1.5,
    borderRadius: 1,
  },
  revealStatusPill: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: Spacing['3'],
    paddingVertical: Spacing['1.5'],
    fontFamily: FontFamily.uiMedium,
    fontSize: 10,
    lineHeight: 14,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    overflow: 'hidden',
  },
  revealSeriesInfo: {
    width: '76%',
    fontFamily: FontFamily.uiMedium,
    fontSize: 12,
    lineHeight: 17,
    letterSpacing: 1.7,
    textTransform: 'uppercase',
    marginBottom: Spacing['3'],
    zIndex: 2,
  },
  revealDayTitle: {
    width: '74%',
    fontFamily: FontFamily.display,
    fontSize: 34,
    lineHeight: 40,
    letterSpacing: -0.6,
    marginBottom: Spacing['4'],
    zIndex: 2,
  },
  revealDayTitleCompact: {
    width: '78%',
    fontSize: 30,
    lineHeight: 36,
  },
  revealScriptureRow: {
    width: '70%',
    marginBottom: Spacing['5'],
    zIndex: 2,
  },
  revealScripture: {
    fontFamily: FontFamily.bodyItalic,
    fontSize: 15,
    lineHeight: 22,
    letterSpacing: 0.1,
  },
  revealMessage: {
    width: '72%',
    fontFamily: FontFamily.body,
    fontSize: 15,
    lineHeight: 23,
    marginBottom: Spacing['6'],
    zIndex: 2,
  },
  revealMessageCompact: {
    width: '78%',
    fontSize: 14,
    lineHeight: 21,
    marginBottom: Spacing['5'],
  },
  revealCta: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    gap: Spacing['2'],
    minHeight: 48,
    paddingVertical: Spacing['3'],
    paddingHorizontal: Spacing['5'],
    borderRadius: 999,
    borderWidth: 1,
    zIndex: 2,
  },
  revealCtaText: {
    fontFamily: FontFamily.ui,
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '600' as const,
  },
  revealCtaArrow: {
    fontFamily: FontFamily.uiMedium,
    fontSize: 17,
    lineHeight: 20,
    marginTop: -1,
  },

  // Preparing state
  preparingContainer: {
    borderRadius: Radius.xl,
    borderWidth: 1,
    overflow: 'hidden',
    position: 'relative',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.12,
    shadowRadius: 20,
    elevation: 5,
  },
  preparingGlow: {
    borderRadius: Radius.xl,
  },
  preparingContent: {
    padding: Spacing['7'],
    alignItems: 'center',
    zIndex: 2,
  },
  preparingOrbitalArt: {
    position: 'absolute',
    right: -52,
    top: -30,
    width: 190,
    height: 190,
    opacity: 0.72,
  },
  preparingOrbitOuter: {
    position: 'absolute',
    right: 0,
    top: 0,
    width: 180,
    height: 180,
    borderRadius: 90,
    borderWidth: 1,
  },
  preparingOrbitInner: {
    position: 'absolute',
    right: 42,
    top: 42,
    width: 96,
    height: 96,
    borderRadius: 48,
    borderWidth: 1,
  },
  preparingOrbitEmber: {
    position: 'absolute',
    right: 86,
    top: 86,
    width: 9,
    height: 9,
    borderRadius: 4.5,
    shadowOpacity: 0.35,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 0 },
  },
  preparingThreads: {
    position: 'absolute',
    top: -20,
    right: -18,
    width: 142,
    height: 190,
    opacity: 0.85,
  },
  preparingThread: {
    position: 'absolute',
    top: 8,
    right: 46,
    width: 1,
    height: 172,
    borderRadius: 1,
    transform: [{ rotate: '-24deg' }],
  },
  preparingThreadSmall: {
    position: 'absolute',
    top: 30,
    right: 82,
    width: 1,
    height: 126,
    borderRadius: 1,
    transform: [{ rotate: '-24deg' }],
  },
  preparingAccentBar: {
    width: 28,
    height: 1.5,
    borderRadius: 1,
  },
  preparingKickerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing['3'],
    marginBottom: Spacing['5'],
  },
  preparingKicker: {
    fontFamily: FontFamily.uiMedium,
    fontSize: 11,
    lineHeight: 16,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },
  preparingTitle: {
    fontFamily: FontFamily.display,
    fontSize: 28,
    lineHeight: 36,
    letterSpacing: -0.5,
    textAlign: 'center',
    marginBottom: Spacing['3'],
  },
  preparingSubtitle: {
    fontFamily: FontFamily.body,
    fontSize: 15,
    lineHeight: 23,
    textAlign: 'center',
    marginBottom: Spacing['5'],
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
  preparingProgressTrack: {
    height: 2,
    borderRadius: 1,
    width: '100%',
    marginHorizontal: Spacing['4'],
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
  journeyCompleteArt: {
    position: 'absolute',
    right: -48,
    top: -42,
    width: 176,
    height: 204,
    opacity: 0.76,
  },
  journeyCompleteHalo: {
    position: 'absolute',
    right: 0,
    top: 0,
    width: 162,
    height: 162,
    borderRadius: 81,
    borderWidth: 1,
  },
  journeyCompleteThread: {
    position: 'absolute',
    right: 92,
    top: 28,
    width: 1.5,
    height: 150,
    borderRadius: 1,
    transform: [{ rotate: '13deg' }],
  },
  journeyCompleteEmber: {
    position: 'absolute',
    right: 78,
    top: 78,
    width: 9,
    height: 9,
    borderRadius: 4.5,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.45,
    shadowRadius: 16,
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
    ...StyleSheet.absoluteFillObject,
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
