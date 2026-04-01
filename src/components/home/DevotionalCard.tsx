/**
 * DevotionalCard — 6-state hero card for the home screen.
 *
 * Renders based on a DevotionalCardState discriminated union:
 *   empty | preparing | unread | complete-today | tomorrow-locked | journey-complete
 *
 * Extracted from (tabs)/(today)/index.tsx for single-responsibility and testability.
 */

import React, { useEffect, useMemo, useCallback } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
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
import { PlusIcon, CheckIcon } from 'phosphor-react-native';

import { FontFamily, FontSize } from '@/constants/fonts';
import { Radius } from '@/constants/radius';
import { Spacing } from '@/constants/spacing';
import { Duration } from '@/constants/animations';
import { BIBLE_STUDY_METHODS } from '@/constants/bible-study-methods';
import { useTheme } from '@/lib/theme';
import { AccentGlow } from '@/components/AccentGlow';
import { alpha } from '@/components/ui';
import { useAccessibleAnimation } from '@/hooks/useAccessibility';
import { EmberParticles } from '@/components/EmberParticles';
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

// ─── EmptyState router — branches on isReturningUser ────────────

function EmptyState({ onCreateNew, isReturningUser }: { onCreateNew: () => void; isReturningUser?: boolean }) {
  if (isReturningUser) {
    return <ReturningEmptyState onCreateNew={onCreateNew} />;
  }
  return <FirstTimeEmptyState onCreateNew={onCreateNew} />;
}

// ─── Returning user empty state ─────────────────────────────────

function ReturningEmptyState({ onCreateNew }: { onCreateNew: () => void }) {
  const { colors } = useTheme();
  const { entering, reducedMotion } = useAccessibleAnimation();
  const glowOpacity = useSharedValue(0.18);

  useEffect(() => {
    if (reducedMotion) return;
    glowOpacity.value = withRepeat(
      withTiming(0.38, { duration: 2800, easing: Easing.inOut(Easing.sin) }),
      -1,
      true,
    );
    return () => cancelAnimation(glowOpacity);
  }, [glowOpacity, reducedMotion]);

  const glowStyle = useAnimatedStyle(() => ({
    opacity: glowOpacity.value,
  }));

  return (
    <View
      style={[
        styles.returningCard,
        {
          backgroundColor: colors.backgroundElevated,
          borderColor: alpha(colors.accent, 0.12),
          shadowColor: colors.accent,
        },
      ]}
    >
      {/* Pulsing glow overlay */}
      <Animated.View
        style={[StyleSheet.absoluteFill, styles.returningGlow, glowStyle]}
        pointerEvents="none"
      >
        <View
          style={[
            StyleSheet.absoluteFill,
            {
              borderRadius: Radius.xl,
              backgroundColor: alpha(colors.accent, 0.07),
            },
          ]}
        />
      </Animated.View>

      {/* Ember particles — non-interactive layer */}
      <EmberParticles color={colors.accent} count={8} />

      {/* Content */}
      <Animated.View
        entering={entering(FadeIn.duration(500).delay(80))}
        style={styles.returningContent}
      >
        <View style={[styles.returningAccentBar, { backgroundColor: colors.accent }]} />

        <Text style={[styles.returningTitle, { color: colors.text }]}>
          Ready for your{'\n'}next study?
        </Text>

        <Text style={[styles.returningSubtitle, { color: colors.textMuted }]}>
          Continue growing with a new{'\n'}personalized devotional series.
        </Text>

        <TouchableOpacity
          activeOpacity={0.7}
          onPress={onCreateNew}
          accessibilityRole="button"
          accessibilityLabel="Start a new study"
        >
          <AccentGlow color={colors.accent} intensity="medium" active style={{ borderRadius: Radius.md }}>
            <View style={[styles.returningCta, { backgroundColor: colors.accent }]}>
              <Text style={[styles.returningCtaText, { color: colors.background }]}>
                Start a New Study
              </Text>
            </View>
          </AccentGlow>
        </TouchableOpacity>
      </Animated.View>
    </View>
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
    <View style={styles.preparingProgressTrack}>
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

  // Shimmer text — looping opacity between 0.4 and 1.0
  const shimmerOpacity = useSharedValue(0.4);
  // Pulsing glow — looping opacity between 0.15 and 0.35
  const glowOpacity = useSharedValue(0.15);

  useEffect(() => {
    if (reducedMotion) {
      shimmerOpacity.value = 1;
      glowOpacity.value = 0.25;
      return;
    }
    shimmerOpacity.value = withRepeat(
      withTiming(1, { duration: 2000, easing: Easing.inOut(Easing.ease) }),
      -1,
      true,
    );
    glowOpacity.value = withRepeat(
      withTiming(0.35, { duration: 3000, easing: Easing.inOut(Easing.ease) }),
      -1,
      true,
    );
    return () => {
      cancelAnimation(shimmerOpacity);
      cancelAnimation(glowOpacity);
    };
  }, [shimmerOpacity, glowOpacity, reducedMotion]);

  const shimmerStyle = useAnimatedStyle(() => ({
    opacity: shimmerOpacity.value,
  }));

  const glowStyle = useAnimatedStyle(() => ({
    opacity: glowOpacity.value,
  }));

  return (
    <View
      style={[
        styles.preparingContainer,
        {
          backgroundColor: colors.backgroundElevated,
          borderColor: alpha(colors.accent, 0.12),
          shadowColor: colors.accent,
        },
      ]}
    >
      {/* Pulsing glow overlay */}
      <Animated.View
        style={[StyleSheet.absoluteFill, styles.preparingGlow, glowStyle]}
        pointerEvents="none"
      >
        <View
          style={[
            StyleSheet.absoluteFill,
            {
              borderRadius: Radius.xl,
              backgroundColor: alpha(colors.accent, 0.07),
            },
          ]}
        />
      </Animated.View>

      {/* Ember particles — non-interactive layer */}
      <EmberParticles color={colors.accent} count={6} />

      {/* Content */}
      <View style={styles.preparingContent}>
        <View style={[styles.preparingAccentBar, { backgroundColor: colors.accent }]} />

        <Animated.Text
          style={[
            styles.preparingTitle,
            { color: colors.text },
            shimmerStyle,
          ]}
        >
          Preparing your{'\n'}reading{'\u2026'}
        </Animated.Text>

        <Text style={[styles.preparingSubtitle, { color: colors.textMuted }]}>
          Crafting a personalized study{'\n'}just for you.
        </Text>

        {/* Progress bar */}
        <PreparingProgressBar progress={progress} colors={colors} />
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

  const scaleStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const isTomorrow = state.type === 'tomorrow-locked';
  const isCompleted = state.type === 'complete-today' || state.type === 'tomorrow-locked';
  const dayData = state.dayData;

  // Progress data — show progress bar when days have been completed
  const progress = state.progress;
  const daysCompleted = state.daysCompleted;
  const showProgress = daysCompleted > 0;
  const totalDays = state.totalDays;
  const seriesTitle = state.seriesTitle;

  // CTA handling
  const hasCta = state.type === 'unread' || state.type === 'complete-today' || state.type === 'tomorrow-locked';
  const ctaText =
    isCompleted ? 'Return to Reading'
    : state.type === 'unread' ? state.ctaText
    : 'Continue Reading';
  const onPress = 'onContinue' in state ? state.onContinue : undefined;

  // New series secondary CTA — always show when available
  const showNewSeries = true;
  const onCreateNew = 'onCreateNew' in state ? state.onCreateNew : undefined;

  // Day label
  const dayLabel = isTomorrow ? 'Tomorrow' : 'Today';

  return (
    <Animated.View style={scaleStyle}>
      <TouchableOpacity
        activeOpacity={0.7}
        onPress={onPress}
        disabled={false}
        onPressIn={() => {
          scale.value = withTiming(0.98, { duration: 120 });
        }}
        onPressOut={() => {
          scale.value = withTiming(1, { duration: Duration.fast });
        }}
        accessibilityRole="button"
        accessibilityLabel={
          isCompleted
            ? `Return to ${seriesTitle}, day ${dayData.dayNumber} of ${totalDays}`
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

            <View style={[styles.mainCardDayPill, { backgroundColor: isCompleted ? colors.accent : colors.buttonBackground }]}>
              {isCompleted && (
                <CheckIcon size={11} color={colors.background} weight="bold" style={{ marginRight: 4 }} />
              )}
              <Text style={[styles.mainCardDayPillText, { color: isCompleted ? colors.background : colors.textMuted }]}>
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

          {/* Completed state: quotable line recall + tomorrow note */}
          {isCompleted ? (
            <>
              {dayData.quotableLine ? (
                <Text style={[styles.completedQuoteLine, { color: colors.text }]}>
                  {'\u201C'}{dayData.quotableLine}{'\u201D'}
                </Text>
              ) : null}
              <Text style={[styles.completedTomorrowNote, { color: colors.textMuted }]}>
                Your next reading will be ready tomorrow.
              </Text>
            </>
          ) : (
            <>
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
            </>
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
          {hasCta ? (
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

export function DevotionalCard({ state, scrollY, inStack, isReturningUser }: Props) {
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
      {state.type === 'empty' && <EmptyState onCreateNew={state.onCreateNew} isReturningUser={isReturningUser} />}
      {state.type === 'preparing' && <PreparingState progress={state.progress} />}
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
    alignItems: 'center',
  },
  returningAccentBar: {
    width: 28,
    height: 1.5,
    borderRadius: 1,
    marginBottom: Spacing['6'],
  },
  returningTitle: {
    fontFamily: FontFamily.display,
    fontSize: 32,
    lineHeight: 40,
    letterSpacing: -0.5,
    textAlign: 'center',
    marginBottom: Spacing['3'],
  },
  returningSubtitle: {
    fontFamily: FontFamily.body,
    fontSize: 15,
    lineHeight: 23,
    textAlign: 'center',
    marginBottom: Spacing['7'],
  },
  returningCta: {
    paddingVertical: 15,
    paddingHorizontal: 40,
    borderRadius: Radius.md,
    alignItems: 'center',
  },
  returningCtaText: {
    fontFamily: FontFamily.uiMedium,
    fontSize: 15,
    letterSpacing: 0.3,
  },

  // Preparing state
  preparingContainer: {
    borderRadius: Radius.xl,
    borderWidth: 1,
    overflow: 'hidden',
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
  },
  preparingAccentBar: {
    width: 28,
    height: 1.5,
    borderRadius: 1,
    marginBottom: Spacing['6'],
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
    marginBottom: Spacing['7'],
  },
  preparingProgressTrack: {
    height: 2,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
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
