import { getDailyGenerationNotice } from '@/lib/daily-generation-messages';
/**
 * DevotionalCard — 9-state hero card for the home screen.
 *
 * Renders based on a DevotionalCardState discriminated union:
 *   empty | preparing | first-series-failed | pending-initial-resume | premium-paused | reveal-ready | unread | complete-today | tomorrow-locked | journey-complete
 *
 * Extracted from (tabs)/(today)/index.tsx for single-responsibility and testability.
 */

import React, { useEffect, useMemo, useCallback } from 'react';
import { ActivityIndicator, View, Text, TouchableOpacity, StyleSheet, useWindowDimensions, Platform } from 'react-native';
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
import { CheckIcon, PlusIcon } from '@/components/icons';

import { FontFamily, FontSize } from '@/constants/fonts';
import { Radius } from '@/constants/radius';
import { Spacing } from '@/constants/spacing';
import { Duration, Ease } from '@/constants/animations';
import { BIBLE_STUDY_METHODS } from '@/constants/bible-study-methods';
import { useTheme } from '@/lib/theme';
import { alpha } from '@/components/ui';
import { GLASS, HERO_GROUND } from '@/constants/today-surfaces';
import { useAccessibleAnimation } from '@/hooks/useAccessibility';
import { RecommendedSeriesCard } from './RecommendedSeriesCard';
import { InlineReflectComposer } from './InlineReflectComposer';
import {
  PENDING_INITIAL_RESUME_BODY,
  PENDING_INITIAL_RESUME_CTA,
  PENDING_INITIAL_RESUME_TITLE,
} from '@/lib/support-clarity';
import { HeroGround } from './HeroGround';
import { useCompletedDayReflection } from './use-completed-day-reflection';
import type { DevotionalCardState } from './compute-devotional-state';
import type { NextPick } from '@/lib/store';
import { smartQuotes } from '@/lib/smart-quotes';
import { titleWithPeriod } from '@/lib/display-title';
import { stripOuterQuotes } from '@/lib/cn';
import { Typography } from '@/constants/typography';

// ─── Props ──────────────────────────────────────────────────────

interface Props {
  state: DevotionalCardState;
  scrollY?: SharedValue<number>;
  /** When true, omits root padding/margin (used inside DevotionalCardStack) */
  inStack?: boolean;
  /** When true, shows returning-user warm empty state instead of first-time brand intro */
  isReturningUser?: boolean;
  gateCreation?: () => boolean;
  storedPick?: NextPick | null;
  ambienceVisible?: boolean;
  /** Resume a first-series request without replacing a readable current series. */
  nonblockingResume?: { onResume: () => void } | null;
}

// ─── Character reveal for "Unfold" title (empty state) ──────────

const REVEAL_EASE = Easing.bezier(0.25, 0.1, 0.25, 1);
const DISPLAY_TEXT_MAX_SCALE = 1.18;
const BODY_TEXT_MAX_SCALE = 1.28;
const LABEL_TEXT_MAX_SCALE = 1.14;

const HERO_TEXT_CAP = { maxWidth: `${HERO_GROUND.textMaxWidthPct}%` } as const;

function heroCopyCap(active: boolean) {
  return active ? HERO_TEXT_CAP : undefined;
}

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
        style={[{ fontFamily: FontFamily.display, fontSize: 50, letterSpacing: -0.5 }, textColorStyle]}
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

function FirstTimeEmptyState({ onCreateNew, ambienceVisible }: { onCreateNew: () => void; ambienceVisible: boolean }) {
  const { colors } = useTheme();
  const { entering } = useAccessibleAnimation();
  const textCap = heroCopyCap(ambienceVisible);

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
      <HeroGround active={ambienceVisible}>
        {/* Character-by-character "Unfold" reveal */}
        <View style={styles.emptyTitleRow}>
          {titleChars.map((char, i) => (
            <RevealChar key={`c-${i}`} char={char} animDelay={charDelays[i]} />
          ))}
        </View>

        <Animated.Text
          entering={entering(FadeIn.duration(Duration.normal).delay(titleEndTime).easing(Ease.out))}
          style={[styles.emptySubtitle, { color: alpha(colors.accent, 0.72) }, textCap]}
        >
          Tell us what you’re walking{'\n'}through, and we’ll shape a study{'\n'}around it.
        </Animated.Text>
      </HeroGround>

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

function EmptyState({
  onCreateNew,
  isReturningUser,
  gateCreation,
  storedPick,
  ambienceVisible,
}: {
  onCreateNew: () => void;
  isReturningUser?: boolean;
  gateCreation?: () => boolean;
  storedPick?: NextPick | null;
  ambienceVisible: boolean;
}) {
  if (isReturningUser) {
    return (
      <ReturningEmptyState
        onCreateNew={onCreateNew}
        gateCreation={gateCreation}
        storedPick={storedPick}
        ambienceVisible={ambienceVisible}
      />
    );
  }
  return <FirstTimeEmptyState onCreateNew={onCreateNew} ambienceVisible={ambienceVisible} />;
}

// ─── Returning user empty state ─────────────────────────────────

function ReturningEmptyStateFallback({ onCreateNew, ambienceVisible }: { onCreateNew: () => void; ambienceVisible: boolean }) {
  const { colors } = useTheme();
  const { entering } = useAccessibleAnimation();
  const textCap = heroCopyCap(ambienceVisible);

  return (
    <Animated.View
      entering={entering(FadeIn.duration(Duration.normal).delay(80).easing(Ease.out))}
      style={styles.heroStateBlock}
    >
      <HeroGround active={ambienceVisible}>
        <Text style={[styles.returningTitle, { color: colors.text, textAlign: 'left' }, textCap]}>Begin the next quiet chapter.</Text>
        <Text style={[styles.returningSubtitle, { color: colors.textMuted, textAlign: 'left' }, textCap]}>Choose a new devotional thread for the season you’re in now.</Text>
      </HeroGround>

      <View style={styles.heroCtaRow}>
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

function ReturningEmptyState({
  onCreateNew,
  gateCreation,
  storedPick,
  ambienceVisible,
}: {
  onCreateNew: () => void;
  gateCreation?: () => boolean;
  storedPick?: NextPick | null;
  ambienceVisible: boolean;
}) {
  return (
    <View>
      <ReturningEmptyStateFallback onCreateNew={onCreateNew} ambienceVisible={ambienceVisible} />
      <View style={styles.heroFollowCard}>
        <RecommendedSeriesCard
          variant="empty"
          onChooseOther={onCreateNew}
          gateCreation={gateCreation}
          storedPick={storedPick}
        />
      </View>
    </View>
  );
}

// ─── First series failed ────────────────────────────────────────

/**
 * The first series failed after the reader chose "Go home — we'll keep
 * writing" (Jordan, 1.1.0). Same card shell as the returning empty state so
 * the failure reads as a state of the same surface, not an alert.
 */
function FirstSeriesFailedState({
  state,
  ambienceVisible,
}: {
  state: Extract<DevotionalCardState, { type: 'first-series-failed' }>;
  ambienceVisible: boolean;
}) {
  const { colors } = useTheme();
  const { entering } = useAccessibleAnimation();
  const textCap = heroCopyCap(ambienceVisible);

  return (
    <Animated.View
      entering={entering(FadeIn.duration(Duration.normal).delay(80).easing(Ease.out))}
      testID="home-first-series-failed"
      style={styles.heroStateBlock}
    >
      <HeroGround active={ambienceVisible}>
        <Text style={[styles.heroSeriesEyebrow, { color: colors.textSubtle, textAlign: 'left' }]}>
          Needs attention
        </Text>
        <Text style={[styles.returningTitle, { color: colors.text, textAlign: 'left' }, textCap]}>We couldn’t finish your devotional.</Text>
        <Text style={[styles.returningSubtitle, { color: colors.textMuted, textAlign: 'left' }, textCap]}>{state.message}</Text>
      </HeroGround>

      <View style={styles.heroCtaRow}>
        <TouchableOpacity
          activeOpacity={0.72}
          onPress={state.onTryAgain}
          accessibilityRole="button"
          accessibilityLabel="Try again"
          style={[styles.returningCta, { borderColor: alpha(colors.accent, 0.28), backgroundColor: alpha(colors.accent, 0.08) }]}
        >
          <Text style={[styles.returningCtaText, { color: colors.text }]}>Try again</Text>
          <Text style={[styles.returningCtaArrow, { color: colors.accent }]}>→</Text>
        </TouchableOpacity>

        <TouchableOpacity
          activeOpacity={0.72}
          onPress={state.onDismiss}
          accessibilityRole="button"
          accessibilityLabel="Not now"
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          style={styles.failedDismiss}
        >
          <Text style={[styles.failedDismissText, { color: colors.textSubtle }]}>Not now</Text>
        </TouchableOpacity>
      </View>
    </Animated.View>
  );
}

function NonblockingInitialResume({
  onResume,
}: {
  onResume: () => void;
}) {
  const { colors } = useTheme();

  return (
    <TouchableOpacity
      activeOpacity={0.72}
      onPress={onResume}
      accessibilityRole="button"
      accessibilityLabel={PENDING_INITIAL_RESUME_CTA}
      testID="home-pending-initial-resume-inline"
      style={[styles.nonblockingResume, { borderColor: alpha(colors.accent, 0.28) }]}
    >
      <Text style={[styles.nonblockingResumeTitle, { color: colors.text }]}>
        {PENDING_INITIAL_RESUME_TITLE}
      </Text>
      <Text style={[styles.nonblockingResumeCta, { color: colors.accent }]}>
        {PENDING_INITIAL_RESUME_CTA} →
      </Text>
    </TouchableOpacity>
  );
}

function PendingInitialResumeState({
  state,
  ambienceVisible,
}: {
  state: Extract<DevotionalCardState, { type: 'pending-initial-resume' }>;
  ambienceVisible: boolean;
}) {
  const { colors } = useTheme();
  const { entering } = useAccessibleAnimation();
  const textCap = heroCopyCap(ambienceVisible);

  return (
    <Animated.View
      entering={entering(FadeIn.duration(Duration.normal).delay(80).easing(Ease.out))}
      testID="home-pending-initial-resume"
      style={styles.heroStateBlock}
    >
      <HeroGround active={ambienceVisible}>
        <Text style={[styles.heroSeriesEyebrow, { color: colors.textSubtle, textAlign: 'left' }]}>
          Still with you
        </Text>
        <Text style={[styles.returningTitle, { color: colors.text, textAlign: 'left' }, textCap]}>
          {PENDING_INITIAL_RESUME_TITLE}
        </Text>
        <Text style={[styles.returningSubtitle, { color: colors.textMuted, textAlign: 'left' }, textCap]}>
          {PENDING_INITIAL_RESUME_BODY}
        </Text>
      </HeroGround>

      <View style={styles.heroCtaRow}>
        <TouchableOpacity
          activeOpacity={0.72}
          onPress={state.onResume}
          accessibilityRole="button"
          accessibilityLabel={PENDING_INITIAL_RESUME_CTA}
          style={[styles.returningCta, { borderColor: alpha(colors.accent, 0.28), backgroundColor: alpha(colors.accent, 0.08) }]}
        >
          <Text style={[styles.returningCtaText, { color: colors.text }]}>{PENDING_INITIAL_RESUME_CTA}</Text>
          <Text style={[styles.returningCtaArrow, { color: colors.accent }]}>→</Text>
        </TouchableOpacity>
      </View>
    </Animated.View>
  );
}

// ─── Reveal-ready teaser card ──────────────────────────────────

function RevealReadyState({
  state,
  ambienceVisible,
}: {
  state: Extract<DevotionalCardState, { type: 'reveal-ready' }>;
  ambienceVisible: boolean;
}) {
  const { colors, isDark } = useTheme();
  const { width, fontScale } = useWindowDimensions();
  const { entering } = useAccessibleAnimation();
  const glassMode = isDark ? 'dark' : 'light';
  const textCap = heroCopyCap(ambienceVisible);
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
          <HeroGround active={ambienceVisible}>
            <Text
              style={[styles.heroSeriesEyebrow, { color: colors.textSubtle, textAlign: 'left' }]}
              numberOfLines={1}
              maxFontSizeMultiplier={LABEL_TEXT_MAX_SCALE}
            >
              {displaySeriesTitle}
            </Text>

            <Text style={[styles.heroDayMeta, { color: colors.accent, textAlign: 'left' }]} maxFontSizeMultiplier={LABEL_TEXT_MAX_SCALE}>
              {statusLabel} · Day {state.dayNumber} of {state.totalDays}
            </Text>

            <Text
              style={[styles.heroDayTitle, isCompactHero && styles.heroDayTitleCompact, isVeryCompactHero && styles.heroDayTitleVeryCompact, { color: colors.text, textAlign: 'left' }, textCap]}
              numberOfLines={3}
              maxFontSizeMultiplier={DISPLAY_TEXT_MAX_SCALE}
            >
              {titleWithPeriod(smartQuotes(state.dayData.title))}
            </Text>

            <View style={styles.heroQuoteBlock}>
              <Text style={[styles.heroQuoteMark, { color: colors.accent }]}>“</Text>
              <Text
                style={[styles.heroQuoteText, isCompactHero && styles.heroQuoteTextCompact, isVeryCompactHero && styles.heroQuoteTextVeryCompact, { color: colors.text, textAlign: 'left' }, textCap]}
                numberOfLines={4}
                maxFontSizeMultiplier={DISPLAY_TEXT_MAX_SCALE}
              >
                {revealMessage}
              </Text>
              <Text style={[styles.revealOpenScripture, { color: colors.textMuted, textAlign: 'left' }, textCap]} numberOfLines={1} maxFontSizeMultiplier={BODY_TEXT_MAX_SCALE}>
                {scriptureReference}
              </Text>
            </View>
          </HeroGround>
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
                  ? alpha(colors.backgroundElevated, GLASS.tintAlpha[glassMode])
                  : alpha(colors.backgroundElevated, GLASS.androidTintAlpha),
              },
            ]}
          >
            {Platform.OS === 'ios' && (
              <BlurView
                intensity={GLASS.blurIntensity[glassMode]}
                tint={glassMode}
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
  state,
  ambienceVisible,
}: {
  state: Extract<DevotionalCardState, { type: 'preparing' }>;
  ambienceVisible: boolean;
}) {
  const { colors } = useTheme();
  const textCap = heroCopyCap(ambienceVisible);
  const { reducedMotion } = useAccessibleAnimation();
  const shimmerOpacity = useSharedValue(0.55);
  const isRecoveryBlocked = state.recovery?.status === 'failed'
    || state.recovery?.status === 'offline'
    || state.recovery?.status === 'blocked'
    || state.recovery?.status === 'service-error';

  useEffect(() => {
    if (isRecoveryBlocked) {
      shimmerOpacity.value = 1;
      return;
    }
    if (reducedMotion) {
      shimmerOpacity.value = 0.78;
      return;
    }
    // Six gentle cycles (~26s) then settle — decorative motion shouldn't run
    // forever on a static value (audit #11).
    shimmerOpacity.value = withRepeat(
      withTiming(0.92, { duration: 2200, easing: Easing.inOut(Easing.ease) }),
      6,
      true,
    );
    return () => cancelAnimation(shimmerOpacity);
  }, [shimmerOpacity, reducedMotion, isRecoveryBlocked]);

  const shimmerStyle = useAnimatedStyle(() => ({ opacity: shimmerOpacity.value }));
  const recovery = state.recovery;
  const notice = getDailyGenerationNotice(recovery, state.dayNumber);
  const isChecking = recovery?.status === 'checking';
  const isFailed = recovery?.status === 'failed';
  const canRetry = isFailed && recovery.canRetry && recovery.failureKind === 'job';
  const action = recovery && (
    recovery.status === 'checking'
    || recovery.status === 'slow'
    || recovery.status === 'offline'
    || recovery.status === 'blocked'
    || recovery.status === 'service-error'
    || recovery.status === 'failed'
  ) ? {
      label: isChecking ? 'Checking...' : canRetry ? 'Try Again' : 'Check Again',
      onPress: canRetry ? recovery.onRetry : recovery.onCheckAgain,
    } : null;
  const title = notice
    ? `${notice.title}.`
    : isFailed
      ? recovery.failureKind === 'job'
        ? `We couldn’t prepare Day ${state.dayNumber}.`
        : `We couldn’t match Day ${state.dayNumber}.`
      : recovery?.status === 'slow'
        ? `Day ${state.dayNumber} is still being prepared.`
        : recovery?.status === 'checking'
          ? `Looking for Day ${state.dayNumber}.`
          : recovery?.status === 'running'
            ? `Preparing Day ${state.dayNumber}.`
            : `Day ${state.dayNumber} is almost ready.`;
  const subtitle = notice
    ? notice.body
    : isFailed
      ? recovery.failureKind === 'job'
        ? canRetry
          ? 'Your series is safe. Try this reading again when you’re ready.'
          : 'Your series is safe. Check again for the latest reading status.'
        : 'Check again so we can find the right reading for your series.'
      : recovery?.status === 'slow'
        ? `This is taking longer than usual. You can leave ${state.seriesTitle} here and come back later.`
        : `We’re getting your next reading for ${state.seriesTitle}. It’ll appear here automatically.`;

  return (
    <View
      accessible={!action}
      accessibilityRole={action ? undefined : 'text'}
      accessibilityLabel={action ? undefined : title}
      style={[styles.preparingContainer, styles.heroStateBlock]}
    >
      <View style={styles.preparingContent}>
        <HeroGround active={ambienceVisible}>
          <Text style={[styles.heroSeriesEyebrow, { color: colors.textSubtle, textAlign: 'left' }]}>
            {state.seriesTitle} · Preparing
          </Text>

          <Animated.Text style={[styles.preparingTitle, { color: colors.text }, textCap, shimmerStyle]}>
            {title}
          </Animated.Text>

          <Text style={[styles.preparingSubtitle, { color: colors.textMuted }, textCap]}>
            {subtitle}
          </Text>

          {action ? null : (
            <PreparingProgressBar progress={state.progress} colors={{ accent: alpha(colors.accent, 0.58), border: alpha(colors.border, 0.45) }} />
          )}
        </HeroGround>

        {action ? (
          <View style={styles.heroCtaRow}>
            <TouchableOpacity
              activeOpacity={0.74}
              onPress={() => void action.onPress()}
              disabled={isChecking}
              accessibilityRole="button"
              accessibilityLabel={action.label}
              accessibilityHint={canRetry ? 'Retries this failed reading job' : 'Checks the server for this reading'}
              accessibilityState={{ disabled: isChecking, busy: isChecking }}
              style={[
                styles.preparingRecoveryButton,
                {
                  backgroundColor: alpha(colors.accent, 0.1),
                  borderColor: alpha(colors.accent, 0.28),
                  opacity: isChecking ? 0.65 : 1,
                },
              ]}
            >
              {isChecking ? <ActivityIndicator size="small" color={colors.accent} /> : null}
              <Text style={[styles.preparingRecoveryButtonText, { color: colors.text }]}>{action.label}</Text>
            </TouchableOpacity>
          </View>
        ) : null}
      </View>
    </View>
  );
}

// ─── Premium paused state ───────────────────────────────────────

function PremiumPausedState({
  state,
  ambienceVisible,
}: {
  state: Extract<DevotionalCardState, { type: 'premium-paused' }>;
  ambienceVisible: boolean;
}) {
  const { colors } = useTheme();
  const { entering } = useAccessibleAnimation();
  const textCap = heroCopyCap(ambienceVisible);
  const progressLabel = state.totalDays > 0
    ? `${state.daysCompleted} of ${state.totalDays} days complete`
    : 'Your series is saved';

  return (
    <Animated.View
      entering={entering(FadeIn.duration(Duration.normal).delay(80).easing(Ease.out))}
      accessible
      accessibilityRole="summary"
      accessibilityLabel="Premium paused. Your personal series is saved."
      style={styles.heroStateBlock}
    >
      <HeroGround active={ambienceVisible}>
        <Text style={[styles.heroSeriesEyebrow, { color: colors.textSubtle, textAlign: 'left' }]}>
          {state.seriesTitle} · Paused
        </Text>
        <Text style={[styles.returningTitle, { color: colors.text, textAlign: 'left' }, textCap]}>Your series is waiting.</Text>
        <Text style={[styles.returningSubtitle, { color: colors.textMuted, textAlign: 'left' }, textCap]}>New personal readings pause while Premium is inactive. You can still read scripture today, or renew Premium when you’re ready.</Text>
        <Text style={[styles.premiumPausedProgress, { color: colors.textSubtle, textAlign: 'left' }]}>{progressLabel}</Text>
      </HeroGround>

      <View style={styles.heroCtaRow}>
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
    </Animated.View>
  );
}

// ─── Journey complete state ─────────────────────────────────────

function JourneyCompleteStateFallback({
  seriesTitle,
  onCreateNew,
  ambienceVisible,
}: {
  seriesTitle: string;
  onCreateNew: () => void;
  ambienceVisible: boolean;
}) {
  const { colors } = useTheme();
  const textCap = heroCopyCap(ambienceVisible);

  return (
    <View style={styles.heroStateBlock}>
      <HeroGround active={ambienceVisible}>
        <Text style={[styles.heroSeriesEyebrow, { color: colors.textSubtle, textAlign: 'left' }]}>
          {seriesTitle} · Complete
        </Text>
        <Text style={[styles.journeyCompleteTitle, { color: colors.text }, textCap]}>Carry the thread forward.</Text>

        <Text style={[styles.journeyCompleteSubtitle, { color: colors.textMuted }, textCap]}>
          {seriesTitle} is complete. Rest with what God surfaced here, then begin another study when you’re ready.
        </Text>
      </HeroGround>

      <View style={styles.heroCtaRow}>
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

function JourneyCompleteState({
  seriesTitle,
  onCreateNew,
  gateCreation,
  storedPick,
  ambienceVisible,
}: {
  seriesTitle: string;
  onCreateNew: () => void;
  gateCreation?: () => boolean;
  storedPick?: NextPick | null;
  ambienceVisible: boolean;
}) {
  return (
    <View>
      <JourneyCompleteStateFallback
        seriesTitle={seriesTitle}
        onCreateNew={onCreateNew}
        ambienceVisible={ambienceVisible}
      />
      <View style={styles.heroFollowCard}>
        <RecommendedSeriesCard
          variant="completion"
          completedSeriesTitle={seriesTitle}
          onChooseOther={onCreateNew}
          gateCreation={gateCreation}
          storedPick={storedPick}
        />
      </View>
    </View>
  );
}

// ─── Main card (shared by unread / complete-today / tomorrow-locked) ──

interface MainCardProps {
  state: Extract<DevotionalCardState, { type: 'unread' | 'complete-today' | 'tomorrow-locked' }>;
  ambienceVisible: boolean;
}

function MainCard({ state, ambienceVisible }: MainCardProps) {
  const { colors, isDark } = useTheme();
  const textCap = heroCopyCap(ambienceVisible);
  const glassMode = isDark ? 'dark' : 'light';
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
  const lockedState = state.type === 'tomorrow-locked' ? state : null;
  const lockedCompletedDay = lockedState?.completedDayData ?? null;
  const continueDayNumber = isTomorrowLocked
    ? (lockedCompletedDay?.dayNumber ?? Math.max(1, daysCompleted))
    : dayData.dayNumber;
  const onPress = 'onContinue' in state ? () => state.onContinue(continueDayNumber) : undefined;
  // "Start a new series" only appears once today's reading is done (complete-today).
  // Surfacing it on unread/tomorrow-locked competed with the single reading action
  // this hero exists to drive; the You tab already offers new-series creation.
  const onCreateNew = state.type === 'complete-today' ? state.onCreateNew : undefined;

  // Post-read, reflection not yet complete: the inline composer IS the primary
  // action — writing beats re-reading (see Dino feedback 2026-08-02). "Read
  // Again" demotes to a quiet link inside the composer block.
  //
  // complete-today carries the reflect payload for its own day. tomorrow-locked
  // previews tomorrow, so its composer targets the day completed today and
  // reads that day's journal state itself (Jordan, 2026-09-04: "I completed
  // the first day, but there's nothing that prompts me").
  const completedState = state.type === 'complete-today' ? state : null;
  const lockedCompletedReflection = useCompletedDayReflection(lockedState?.devotionalId ?? '', lockedCompletedDay);
  const composer = completedState
    ? {
        dayNumber: dayData.dayNumber,
        draft: completedState.freeWriteDraft,
        status: completedState.reflectionStatus,
        onSave: completedState.onSaveFreeWrite,
        onOpenFull: completedState.onReflect,
      }
    : lockedState && lockedCompletedDay
      ? {
          dayNumber: lockedCompletedDay.dayNumber,
          draft: lockedCompletedReflection.freeWriteDraft,
          status: lockedCompletedReflection.reflectionStatus,
          onSave: lockedState.onSaveFreeWrite,
          onOpenFull: lockedState.onReflect,
        }
      : null;
  const showInlineComposer = composer !== null && composer.status !== 'complete';

  const accessibilityLabel = hasCompletedToday
    ? `Read ${seriesTitle}, day ${dayData.dayNumber} of ${totalDays} again`
    : isTomorrowLocked
      ? `Tomorrow's reading is locked. Return to ${seriesTitle}, day ${continueDayNumber} of ${totalDays}`
      : `Continue ${seriesTitle}, day ${dayData.dayNumber} of ${totalDays}`;

  return (
    <Animated.View style={scaleStyle}>
      <View style={styles.heroTouchable}>
        <View style={[styles.openHero, isCompactHero && styles.openHeroCompact, isVeryCompactHero && styles.openHeroVeryCompact]}>
          <View style={[styles.openHeroContent, isCompactHero && styles.openHeroContentCompact, isVeryCompactHero && styles.openHeroContentVeryCompact, { alignItems: 'flex-start' }]}>
            <HeroGround active={ambienceVisible}>
            <Text
              style={[styles.heroSeriesEyebrow, { color: colors.textSubtle, textAlign: 'left' }]}
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
                        ? alpha(colors.backgroundElevated, GLASS.tintAlpha[glassMode])
                        : alpha(colors.backgroundElevated, GLASS.androidTintAlpha),
                      borderColor: alpha(colors.accent, 0.25),
                    },
                  ]}
                >
                  {Platform.OS === 'ios' && (
                    <BlurView
                      intensity={GLASS.blurIntensity[glassMode]}
                      tint={glassMode}
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
              style={[styles.heroDayTitle, isCompactHero && styles.heroDayTitleCompact, isVeryCompactHero && styles.heroDayTitleVeryCompact, { color: colors.text, textAlign: 'left' }, textCap]}
              numberOfLines={3}
              maxFontSizeMultiplier={DISPLAY_TEXT_MAX_SCALE}
            >
              {titleWithPeriod(smartQuotes(dayData.title))}
            </Text>

            <View style={styles.heroQuoteBlock}>
              <Text style={[styles.heroQuoteMark, { color: colors.accent }]}>“</Text>
              <Text
                style={[styles.heroQuoteText, isCompactHero && styles.heroQuoteTextCompact, isVeryCompactHero && styles.heroQuoteTextVeryCompact, { color: colors.text, textAlign: 'left' }, textCap]}
                numberOfLines={4}
                maxFontSizeMultiplier={DISPLAY_TEXT_MAX_SCALE}
              >
                {smartQuotes(devotionalLine)}
              </Text>
              {state.type === 'tomorrow-locked' && state.tomorrowTeaser ? (
                <Text style={[styles.heroTomorrowTeaser, { color: colors.textMuted, textAlign: 'left' }, textCap]} numberOfLines={3} maxFontSizeMultiplier={BODY_TEXT_MAX_SCALE}>
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
            </HeroGround>

            {showInlineComposer && composer ? (
              <View style={styles.heroComposerBlock}>
                <InlineReflectComposer
                  key={`reflect-${composer.dayNumber}`}
                  initialDraft={composer.draft}
                  reflectionStatus={composer.status}
                  onSaveDraft={(text) => composer.onSave(composer.dayNumber, text)}
                  onOpenFull={() => composer.onOpenFull(composer.dayNumber)}
                  onReadAgain={onPress}
                />
              </View>
            ) : (
            <TouchableOpacity
              activeOpacity={0.74}
              onPress={onPress}
              onPressIn={() => {
                scale.value = withTiming(0.96, { duration: 120 });
              }}
              onPressOut={() => {
                scale.value = withTiming(1, { duration: Duration.fast });
              }}
              testID="home-devotional-cta"
              accessibilityRole="button"
              accessibilityLabel={accessibilityLabel}
              accessibilityHint={hasCompletedToday ? "Opens the completed reading again" : isTomorrowLocked ? "Opens today's completed reading instead of the locked tomorrow reading" : undefined}
              style={[
                styles.heroActions,
                hasCompletedToday && styles.heroActionsSecondary,
                {
                  borderColor: alpha(colors.accent, hasCompletedToday ? 0.25 : 0.24),
                  backgroundColor: Platform.OS === 'ios'
                    ? alpha(colors.backgroundElevated, GLASS.tintAlpha[glassMode])
                    : alpha(colors.backgroundElevated, GLASS.androidTintAlpha),
                },
              ]}
            >
              {Platform.OS === 'ios' && (
                <BlurView
                  intensity={GLASS.blurIntensity[glassMode]}
                  tint={glassMode}
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
            )}

            {lockedState && !showInlineComposer && (
              <TouchableOpacity
                activeOpacity={0.7}
                onPress={() => lockedState.onReflect(continueDayNumber)}
                accessibilityRole="button"
                accessibilityLabel="Reflect on today's reading"
                accessibilityHint="Opens the journal for the day you completed"
                style={styles.heroReflectLink}
              >
                <Text style={[styles.heroReflectLinkText, { color: colors.accent }]} maxFontSizeMultiplier={LABEL_TEXT_MAX_SCALE}>
                  Reflect on today →
                </Text>
              </TouchableOpacity>
            )}

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

export function DevotionalCard({
  state,
  scrollY,
  inStack,
  isReturningUser,
  gateCreation,
  storedPick,
  ambienceVisible = false,
  nonblockingResume = null,
}: Props) {
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
      {nonblockingResume && state.type !== 'pending-initial-resume' ? (
        <NonblockingInitialResume onResume={nonblockingResume.onResume} />
      ) : null}
      {state.type === 'empty' && (
        <EmptyState
          onCreateNew={state.onCreateNew}
          isReturningUser={isReturningUser}
          gateCreation={gateCreation}
          storedPick={storedPick}
          ambienceVisible={ambienceVisible}
        />
      )}
      {state.type === 'preparing' && (
        <PreparingState state={state} ambienceVisible={ambienceVisible} />
      )}
      {state.type === 'first-series-failed' && (
        <FirstSeriesFailedState state={state} ambienceVisible={ambienceVisible} />
      )}
      {state.type === 'pending-initial-resume' && (
        <PendingInitialResumeState state={state} ambienceVisible={ambienceVisible} />
      )}
      {state.type === 'premium-paused' && (
        <PremiumPausedState state={state} ambienceVisible={ambienceVisible} />
      )}
      {state.type === 'journey-complete' && (
        <JourneyCompleteState
          seriesTitle={state.seriesTitle}
          onCreateNew={state.onCreateNew}
          gateCreation={gateCreation}
          storedPick={storedPick}
          ambienceVisible={ambienceVisible}
        />
      )}
      {state.type === 'reveal-ready' && (
        <RevealReadyState state={state} ambienceVisible={ambienceVisible} />
      )}
      {(state.type === 'unread' ||
        state.type === 'complete-today' ||
        state.type === 'tomorrow-locked') && (
        <MainCard state={state} ambienceVisible={ambienceVisible} />
      )}
    </Animated.View>
  );
}

// ─── Styles ─────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: {
    paddingHorizontal: Spacing['6'],
    marginTop: Spacing['5'],
  },
  nonblockingResume: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: Radius.lg,
    paddingHorizontal: Spacing['4'],
    paddingVertical: Spacing['3'],
    marginBottom: Spacing['4'],
    gap: Spacing['1'],
  },
  nonblockingResumeTitle: {
    fontFamily: FontFamily.ui,
    fontSize: FontSize.sm,
    lineHeight: 20,
  },
  nonblockingResumeCta: {
    fontFamily: FontFamily.uiMedium,
    fontSize: FontSize.sm,
    lineHeight: 20,
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
    ...Typography.cardMeta,
    fontFamily: FontFamily.uiMedium,
  },
  heroDayMetaDayText: {
    ...Typography.cardMeta,
  },
  heroDayTitle: {
    fontFamily: FontFamily.display,
    fontSize: 37,
    lineHeight: 42,
    letterSpacing: -0.35,
    marginBottom: Spacing['5'],
  },
  heroDayTitleCompact: {
    fontSize: 32,
    lineHeight: 36,
    letterSpacing: -0.15,
    marginBottom: Spacing['4'],
  },
  heroDayTitleVeryCompact: {
    fontSize: 28,
    lineHeight: 33,
    letterSpacing: -0.15,
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
    fontSize: 25,
    lineHeight: 25,
    letterSpacing: -0.15,
  },
  heroQuoteText: {
    fontFamily: FontFamily.displayItalic,
    fontSize: 18,
    lineHeight: 27,
  },
  heroQuoteTextCompact: {
    fontSize: 16,
    lineHeight: 24,
  },
  heroQuoteTextVeryCompact: {
    fontSize: 15,
    lineHeight: 23,
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
    ...Typography.cardMeta,
  },
  heroProgressSection: {
    marginBottom: Spacing['6'],
    // Keep the progress cluster in the left "calm" zone: every Today ambient
    // scene concentrates its art on the right ~40-55%, so capping the width
    // keeps the track off the animation and pulls the % off the busy edge.
    alignSelf: 'flex-start',
    width: '54%',
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
    borderRadius: Radius.full,
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
  heroComposerBlock: {
    alignSelf: 'stretch',
    marginTop: Spacing['1'],
  },
  heroReflectLink: {
    alignSelf: 'flex-start',
    marginTop: Spacing['3'],
    minHeight: 40,
    justifyContent: 'center',
  },
  heroReflectLinkText: {
    fontFamily: FontFamily.uiMedium,
    fontSize: FontSize.sm,
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
  returningGlow: {
    borderRadius: Radius.xl,
  },
  heroStateBlock: {
    width: '100%',
    alignItems: 'flex-start',
  },
  heroCtaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'flex-start',
    gap: Spacing['3'],
  },
  heroFollowCard: {
    width: '100%',
    marginTop: Spacing['5'],
  },
  returningTitle: {
    fontFamily: FontFamily.display,
    fontSize: 28,
    lineHeight: 35,
    letterSpacing: -0.15,
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
    borderRadius: Radius.full,
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
  failedDismiss: {
    alignSelf: 'flex-start',
    marginTop: Spacing['4'],
    paddingVertical: Spacing['1'],
  },
  failedDismissText: {
    fontFamily: FontFamily.body,
    fontSize: 14,
    lineHeight: 20,
  },
  premiumPausedProgress: {
    ...Typography.cardMeta,
    marginTop: 0,
    marginBottom: Spacing['4'],
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
    paddingHorizontal: 0,
    alignItems: 'flex-start',
    zIndex: 2,
  },
  preparingTitle: {
    fontFamily: FontFamily.display,
    fontSize: 21,
    lineHeight: 27,
    textAlign: 'left',
    marginBottom: Spacing['2'],
  },
  preparingSubtitle: {
    fontFamily: FontFamily.body,
    fontSize: 15,
    lineHeight: 23,
    textAlign: 'left',
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
    borderRadius: Radius.full,
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
  preparingRecoveryButton: {
    alignItems: 'center',
    borderRadius: Radius.full,
    borderWidth: 1,
    flexDirection: 'row',
    gap: Spacing['2'],
    justifyContent: 'center',
    minHeight: 44,
    paddingHorizontal: Spacing['5'],
    paddingVertical: Spacing['2'],
  },
  preparingRecoveryButtonText: {
    fontFamily: FontFamily.uiSemiBold,
    fontSize: 14,
    lineHeight: 20,
  },

  // Journey complete
  cardTouchable: {
    borderRadius: Radius.xl,
    overflow: 'hidden',
  },
  cardDisabled: {
    opacity: 0.5,
  },
  journeyCompleteTitle: {
    fontFamily: FontFamily.display,
    fontSize: 25,
    letterSpacing: -0.15,
    textAlign: 'left',
    marginBottom: Spacing['2'],
  },
  journeyCompleteSubtitle: {
    fontFamily: FontFamily.body,
    fontSize: 15,
    textAlign: 'left',
    lineHeight: 23,
    marginBottom: Spacing['7'],
    paddingHorizontal: 0,
  },
  journeyCompleteCta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing['2'],
    paddingVertical: 13,
    paddingHorizontal: 28,
    borderRadius: Radius.full,
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
    fontSize: 27,
    lineHeight: 34,
    marginBottom: Spacing['2'],
    letterSpacing: -0.15,
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
    fontVariant: ['tabular-nums'],
  },

  // Completed state (complete-today / tomorrow-locked)
  completedQuoteLine: {
    fontFamily: FontFamily.displayItalic,
    fontSize: 18,
    lineHeight: 27,
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
