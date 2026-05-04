import { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
  type SharedValue,
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withDelay,
  withRepeat,
  withSequence,
  Easing,
  FadeIn,
  FadeOut,
  cancelAnimation,
  useReducedMotion,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { FontFamily, FontSize } from '@/constants/fonts';
import { Spacing } from '@/constants/spacing';
import { Radius } from '@/constants/radius';
import { Duration, Ease } from '@/constants/animations';
import { pollJobStatus, retryJob } from '@/lib/generation-api';
import {
  normalizeOnboardingGenerationJobResult,
  normalizeOnboardingSubmitResult,
  type OnboardingGenerationResult,
  type OnboardingSubmitResult,
} from '@/lib/onboarding-generation-result';
import type { ColorTheme } from '@/constants/colors';

/* ── Types ─────────────────────────────────────────────────────────── */

interface Props {
  name: string;
  colors: ColorTheme;
  jobId: string | null;
  /** Backend-owned devotional id returned when the onboarding job was submitted. */
  devotionalId?: string | null;
  /** If no jobId was provided, call this to submit the generation job and get one. */
  submitFallback?: () => Promise<OnboardingSubmitResult>;
  onDevotionalReady: (result: OnboardingGenerationResult) => void;
  onContinue: () => void;
}

type GenerationIssueKind = 'submit' | 'poll' | 'failed' | 'timeout' | 'invalid';

type GenerationIssue = {
  kind: GenerationIssueKind;
  title: string;
  message: string;
  actionLabel: string;
  canRetry: boolean;
};

/* ── Constants ─────────────────────────────────────────────────────── */

const OPENING_LINE =
  'While you were sharing your story, we were already writing something for you.';

const STATUS_LINES = [
  'Reading your story...',
  'Choosing scripture for where you are...',
  'Shaping the voice to match yours...',
  'Weaving in what you\u2019re reaching for...',
];

/** Duration each status line is visible (ms). */
const STATUS_HOLD_MS = 1500;
/** Fade in/out duration for each status line (ms). */
const STATUS_FADE_MS = 300;
/** Total cycle per status line: fade-in + hold + fade-out */
const STATUS_CYCLE_MS = STATUS_FADE_MS + STATUS_HOLD_MS + STATUS_FADE_MS;

/** Delay before first status line appears (after typewriter). */
const STATUS_START_DELAY_MS = 2800;

/** Minimum theatrical duration before allowing the ready reveal. */
const MIN_THEATRICAL_MS =
  STATUS_START_DELAY_MS + STATUS_LINES.length * STATUS_CYCLE_MS;

/** Duration of the typewriter effect (ms). */
const TYPEWRITER_DURATION_MS = 2200;

/** Orbital animation: number of dots. */
const ORBIT_DOT_COUNT = 4;
/** Orbital radius (px). */
const ORBIT_RADIUS = 28;
/** Dot size (px). */
const DOT_SIZE = 5;
/** Full orbital rotation period (ms). */
const ORBIT_PERIOD_MS = 3000;

const POLL_INTERVAL_MS = 3000;
const POLL_TIMEOUT_MS = 90_000;
const MAX_CONSECUTIVE_POLL_ERRORS = 4;

/* ── Orbital Dot ───────────────────────────────────────────────────── */

function OrbitalDot({
  index,
  rotation,
  accent,
}: {
  index: number;
  rotation: SharedValue<number>;
  accent: string;
}) {
  const baseAngle = (index / ORBIT_DOT_COUNT) * 2 * Math.PI;
  // Stagger opacity so dots feel organic
  const opacityBase = 0.5 + (index / ORBIT_DOT_COUNT) * 0.5;

  const style = useAnimatedStyle(() => {
    const angle = rotation.value + baseAngle;
    const x = Math.cos(angle) * ORBIT_RADIUS;
    const y = Math.sin(angle) * ORBIT_RADIUS;
    return {
      transform: [{ translateX: x }, { translateY: y }],
      opacity: opacityBase,
    };
  });

  return (
    <Animated.View
      style={[
        {
          position: 'absolute',
          width: DOT_SIZE,
          height: DOT_SIZE,
          borderRadius: DOT_SIZE / 2,
          backgroundColor: accent,
        },
        style,
      ]}
    />
  );
}

/* ── Orbital Loader ────────────────────────────────────────────────── */

function OrbitalLoader({
  accent,
  isSettled,
}: {
  accent: string;
  isSettled: boolean;
}) {
  const rotation = useSharedValue(0);

  useEffect(() => {
    if (isSettled) {
      // Let current rotation finish gracefully, then stop
      cancelAnimation(rotation);
      return;
    }
    rotation.value = 0;
    rotation.value = withRepeat(
      withTiming(2 * Math.PI, {
        duration: ORBIT_PERIOD_MS,
        easing: Easing.linear,
      }),
      -1,
      false,
    );
    return () => cancelAnimation(rotation);
  }, [isSettled, rotation]);

  const containerOpacity = useSharedValue(1);
  useEffect(() => {
    if (isSettled) {
      containerOpacity.value = withTiming(0, { duration: 300, easing: Easing.out(Easing.cubic) });
    }
  }, [isSettled, containerOpacity]);

  const containerStyle = useAnimatedStyle(() => ({
    opacity: containerOpacity.value,
  }));

  return (
    <Animated.View
      style={[
        {
          width: ORBIT_RADIUS * 2 + DOT_SIZE,
          height: ORBIT_RADIUS * 2 + DOT_SIZE,
          alignItems: 'center',
          justifyContent: 'center',
          alignSelf: 'center',
          marginBottom: Spacing['8'],
        },
        containerStyle,
      ]}
    >
      {Array.from({ length: ORBIT_DOT_COUNT }).map((_, i) => (
        <OrbitalDot key={i} index={i} rotation={rotation} accent={accent} />
      ))}
    </Animated.View>
  );
}

/* ── Typewriter Text ───────────────────────────────────────────────── */

function TypewriterText({
  text,
  colors,
  onComplete,
}: {
  text: string;
  colors: ColorTheme;
  onComplete?: () => void;
}) {
  const [visibleCount, setVisibleCount] = useState(0);
  const chars = text.split('');
  const intervalMs = TYPEWRITER_DURATION_MS / chars.length;

  useEffect(() => {
    let i = 0;
    const timer = setInterval(() => {
      i += 1;
      setVisibleCount(i);
      if (i >= chars.length) {
        clearInterval(timer);
        onComplete?.();
      }
    }, intervalMs);
    return () => clearInterval(timer);
    // Only run once on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <Text
      style={{
        fontFamily: FontFamily.display,
        fontSize: 32,
        color: colors.text,
        lineHeight: 42,
      }}
    >
      {chars.slice(0, visibleCount).join('')}
      {visibleCount < chars.length && (
        <Text style={{ opacity: 0 }}>
          {chars.slice(visibleCount).join('')}
        </Text>
      )}
    </Text>
  );
}

/* ── Cycling Status Line ───────────────────────────────────────────── */

function CyclingStatusLines({
  colors,
  startDelay,
  onAllComplete,
}: {
  colors: ColorTheme;
  startDelay: number;
  onAllComplete: () => void;
}) {
  const reducedMotion = useReducedMotion();
  const [currentIndex, setCurrentIndex] = useState(-1);
  const [visible, setVisible] = useState(false);
  const completedRef = useRef(false);

  useEffect(() => {
    // Delay before the first line appears
    const initialTimer = setTimeout(() => {
      setCurrentIndex(0);
      setVisible(true);
    }, startDelay);

    return () => clearTimeout(initialTimer);
  }, [startDelay]);

  useEffect(() => {
    if (currentIndex < 0) return;
    if (currentIndex >= STATUS_LINES.length) {
      if (!completedRef.current) {
        completedRef.current = true;
        onAllComplete();
      }
      return;
    }

    // Fade in is handled by Reanimated entering
    // After hold period, fade out
    const holdTimer = setTimeout(() => {
      setVisible(false);
    }, STATUS_FADE_MS + STATUS_HOLD_MS);

    // After full cycle, advance
    const advanceTimer = setTimeout(() => {
      setCurrentIndex((prev) => prev + 1);
      setVisible(true);
    }, STATUS_CYCLE_MS);

    return () => {
      clearTimeout(holdTimer);
      clearTimeout(advanceTimer);
    };
  }, [currentIndex, onAllComplete]);

  if (currentIndex < 0 || currentIndex >= STATUS_LINES.length) {
    return <View style={{ height: 24 }} />;
  }

  return (
    <View style={{ height: 24, marginTop: Spacing['4'], justifyContent: 'center' }}>
      {visible && (
        <Animated.Text
          key={`status-${currentIndex}`}
          entering={reducedMotion ? undefined : FadeIn.duration(Duration.normal).easing(Ease.out)}
          exiting={reducedMotion ? undefined : FadeOut.duration(Duration.fast).easing(Ease.out)}
          style={{
            fontFamily: FontFamily.body,
            fontSize: 15,
            color: colors.textMuted,
            lineHeight: 22,
          }}
        >
          {STATUS_LINES[currentIndex]}
        </Animated.Text>
      )}
    </View>
  );
}

/* ── Main Component ────────────────────────────────────────────────── */

export function DevotionalSegue({
  name,
  colors,
  jobId,
  devotionalId,
  submitFallback,
  onDevotionalReady,
  onContinue,
}: Props) {
  const insets = useSafeAreaInsets();
  const reducedMotion = useReducedMotion();

  /* ── State ── */
  const [isReady, setIsReady] = useState(false);
  const [theatricalDone, setTheatricalDone] = useState(false);
  const [showReadyReveal, setShowReadyReveal] = useState(false);
  const [activeJobId, setActiveJobId] = useState<string | null>(jobId);
  const [activeDevotionalId, setActiveDevotionalId] = useState<string | null>(devotionalId ?? null);
  const [generationIssue, setGenerationIssue] = useState<GenerationIssue | null>(null);
  const [isRetrying, setIsRetrying] = useState(false);
  const [pollCycle, setPollCycle] = useState(0);

  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const readyCalledRef = useRef(false);
  const fallbackAttemptedRef = useRef(false);
  const pollStartedAtRef = useRef<number | null>(null);
  const consecutivePollErrorsRef = useRef(0);
  const pollInFlightRef = useRef(false);
  const lastSeenPropJobIdRef = useRef<string | null>(jobId);
  const lastSeenPropDevotionalIdRef = useRef<string | null>(devotionalId ?? null);

  const clearPolling = useCallback(() => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
    pollInFlightRef.current = false;
  }, []);

  useEffect(() => {
    const propJobChanged = jobId !== lastSeenPropJobIdRef.current;
    const nextPropDevotionalId = devotionalId ?? null;
    const propDevotionalChanged = nextPropDevotionalId !== lastSeenPropDevotionalIdRef.current;

    lastSeenPropJobIdRef.current = jobId;
    lastSeenPropDevotionalIdRef.current = nextPropDevotionalId;

    if (jobId && propJobChanged) {
      setActiveJobId(jobId);
      setActiveDevotionalId(nextPropDevotionalId);
      setGenerationIssue(null);
      setIsReady(false);
      setShowReadyReveal(false);
      readyCalledRef.current = false;
      consecutivePollErrorsRef.current = 0;
      setPollCycle((value) => value + 1);
      return;
    }

    if (jobId && propDevotionalChanged) {
      setActiveDevotionalId(nextPropDevotionalId);
    }
  }, [devotionalId, jobId]);

  const startFallbackSubmission = useCallback(async () => {
    if (!submitFallback) {
      setGenerationIssue({
        kind: 'submit',
        title: 'We couldn’t start your devotional yet.',
        message: 'Check your connection and try again. We won’t leave you stuck here.',
        actionLabel: 'Try again',
        canRetry: false,
      });
      return;
    }

    const result = normalizeOnboardingSubmitResult(await submitFallback());
    setActiveJobId(result.jobId);
    setActiveDevotionalId(result.devotionalId);
    setGenerationIssue(null);
    consecutivePollErrorsRef.current = 0;
    setPollCycle((value) => value + 1);
  }, [submitFallback]);

  /* ── Fallback: submit job if none provided ── */
  useEffect(() => {
    if (activeJobId || fallbackAttemptedRef.current || !submitFallback) return;
    fallbackAttemptedRef.current = true;
    startFallbackSubmission().catch(() => {
      setGenerationIssue({
        kind: 'submit',
        title: 'We couldn’t start your devotional yet.',
        message: 'Check your connection and try again. We won’t leave you stuck here.',
        actionLabel: 'Try again',
        canRetry: true,
      });
    });
  }, [activeJobId, startFallbackSubmission, submitFallback]);

  /* ── Polling ── */
  useEffect(() => {
    if (!activeJobId) {
      if (!submitFallback && !fallbackAttemptedRef.current) {
        setGenerationIssue({
          kind: 'submit',
          title: 'We couldn’t start your devotional yet.',
          message: 'Check your connection and try again. We won’t leave you stuck here.',
          actionLabel: 'Try again',
          canRetry: false,
        });
      }
      return;
    }

    let cancelled = false;
    pollStartedAtRef.current = Date.now();
    consecutivePollErrorsRef.current = 0;
    pollInFlightRef.current = false;
    setGenerationIssue(null);

    const stopWithIssue = (issue: GenerationIssue) => {
      if (cancelled) return;
      setGenerationIssue(issue);
      clearPolling();
    };

    const poll = async () => {
      if (pollInFlightRef.current || readyCalledRef.current) return;
      const startedAt = pollStartedAtRef.current ?? Date.now();
      if (Date.now() - startedAt > POLL_TIMEOUT_MS) {
        stopWithIssue({
          kind: 'timeout',
          title: 'This is taking longer than expected.',
          message: 'Your devotional may still be finishing. Tap below and we’ll keep checking instead of leaving you on a spinner.',
          actionLabel: 'Keep checking',
          canRetry: true,
        });
        return;
      }

      pollInFlightRef.current = true;
      try {
        const response = await pollJobStatus(activeJobId);
        if (cancelled) return;
        consecutivePollErrorsRef.current = 0;

        if (response.status === 'complete') {
          const normalizedResult = normalizeOnboardingGenerationJobResult(
            response,
            activeDevotionalId,
          );

          if (!normalizedResult) {
            stopWithIssue({
              kind: 'invalid',
              title: 'Your devotional finished, but we couldn’t open it.',
              message: 'Try again so we can reconnect the finished reading before you continue.',
              actionLabel: 'Try again',
              canRetry: true,
            });
            return;
          }

          if (!readyCalledRef.current) {
            readyCalledRef.current = true;
            onDevotionalReady(normalizedResult);
            setIsReady(true);
          }
          clearPolling();
          return;
        }

        if (response.status === 'failed') {
          stopWithIssue({
            kind: 'failed',
            title: 'We couldn’t finish that reading.',
            message: 'Something interrupted generation. Try again and we’ll restart it safely.',
            actionLabel: 'Try again',
            canRetry: response.canRetry !== false || Boolean(submitFallback),
          });
        }
      } catch {
        if (cancelled) return;
        consecutivePollErrorsRef.current += 1;
        if (consecutivePollErrorsRef.current >= MAX_CONSECUTIVE_POLL_ERRORS) {
          stopWithIssue({
            kind: 'poll',
            title: 'We lost the connection for a moment.',
            message: 'Try again and we’ll keep checking your devotional.',
            actionLabel: 'Try again',
            canRetry: true,
          });
        }
      } finally {
        pollInFlightRef.current = false;
      }
    };

    // Poll immediately, then on interval
    poll();
    pollingRef.current = setInterval(poll, POLL_INTERVAL_MS);

    return () => {
      cancelled = true;
      clearPolling();
    };
  }, [activeDevotionalId, activeJobId, clearPolling, onDevotionalReady, pollCycle, submitFallback]);

  const handleRetry = useCallback(async () => {
    if (isRetrying) return;

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setIsRetrying(true);
    setGenerationIssue(null);
    setIsReady(false);
    setShowReadyReveal(false);
    readyCalledRef.current = false;
    consecutivePollErrorsRef.current = 0;

    try {
      if (generationIssue?.kind === 'failed' && activeJobId) {
        try {
          const retryResponse = await retryJob(activeJobId);
          setActiveJobId(retryResponse.jobId ?? activeJobId);
          setPollCycle((value) => value + 1);
          return;
        } catch {
          if (!submitFallback) throw new Error('Failed to retry onboarding generation job');
        }
      }

      if (generationIssue?.kind === 'timeout' && activeJobId) {
        setPollCycle((value) => value + 1);
        return;
      }

      if (submitFallback) {
        fallbackAttemptedRef.current = true;
        await startFallbackSubmission();
        return;
      }

      setPollCycle((value) => value + 1);
    } catch {
      setGenerationIssue({
        kind: 'submit',
        title: 'We couldn’t restart your devotional yet.',
        message: 'Check your connection and try again in a moment.',
        actionLabel: 'Try again',
        canRetry: true,
      });
    } finally {
      setIsRetrying(false);
    }
  }, [activeJobId, generationIssue, isRetrying, startFallbackSubmission, submitFallback]);

  /* ── Theatrical completion ── */
  const handleTheatricalComplete = useCallback(() => {
    setTheatricalDone(true);
  }, []);

  /* ── Show ready reveal when both conditions met ── */
  useEffect(() => {
    if (isReady && theatricalDone && !showReadyReveal) {
      setShowReadyReveal(true);
    }
  }, [isReady, theatricalDone, showReadyReveal]);

  /* ── Phase 1 opening line fade-out / Phase 2 fade-in ── */
  const phase1Opacity = useSharedValue(1);
  useEffect(() => {
    if (showReadyReveal) {
      phase1Opacity.value = withTiming(0, {
        duration: 300,
        easing: Easing.out(Easing.cubic),
      });
    } else {
      phase1Opacity.value = withTiming(1, {
        duration: 200,
        easing: Easing.out(Easing.cubic),
      });
    }
  }, [showReadyReveal, phase1Opacity]);

  const phase1Style = useAnimatedStyle(() => ({
    opacity: phase1Opacity.value,
  }));

  return (
    <View style={[styles.container, { paddingHorizontal: Spacing['6'] }]}>
      {/* Top spacer — smaller so content sits in upper-middle */}
      <View style={{ flex: 0.6 }} />

      {/* Phase 1: Theatrical reveal — heading above orbital */}
      {generationIssue && (
        <Animated.View entering={reducedMotion ? undefined : FadeIn.duration(Duration.normal).easing(Ease.out)}>
          <Text
            style={{
              fontFamily: FontFamily.display,
              fontSize: 32,
              color: colors.text,
              lineHeight: 42,
            }}
          >
            {generationIssue.title}
          </Text>

          <Text
            style={{
              fontFamily: FontFamily.body,
              fontSize: 16,
              color: colors.textMuted,
              lineHeight: 24,
              marginTop: Spacing['4'],
            }}
          >
            {generationIssue.message}
          </Text>
        </Animated.View>
      )}

      {!generationIssue && !showReadyReveal && (
        <Animated.View style={phase1Style}>
          <TypewriterText text={OPENING_LINE} colors={colors} />

          <View style={{ marginTop: Spacing['6'] }}>
            <OrbitalLoader accent={colors.accent} isSettled={false} />
          </View>

          <CyclingStatusLines
            colors={colors}
            startDelay={STATUS_START_DELAY_MS}
            onAllComplete={handleTheatricalComplete}
          />
        </Animated.View>
      )}

      {/* Phase 2: Ready reveal — larger heading, upper-middle */}
      {showReadyReveal && !generationIssue && (
        <Animated.View entering={reducedMotion ? undefined : FadeIn.duration(Duration.normal).delay(200).easing(Ease.out)}>
          <Text
            style={{
              fontFamily: FontFamily.display,
              fontSize: 34,
              color: colors.text,
              lineHeight: Math.round(34 * 1.25),
            }}
          >
            Your first devotional is ready.
          </Text>

          <Text
            style={{
              fontFamily: FontFamily.body,
              fontSize: 16,
              color: colors.textMuted,
              lineHeight: 24,
              marginTop: Spacing['4'],
            }}
          >
            Written from everything you just shared. No one else will ever read
            this.
          </Text>
        </Animated.View>
      )}

      {/* Bottom spacer — larger to push content upward */}
      <View style={styles.flex1} />

      {/* Recovery Button — only if preparation failed or timed out */}
      {generationIssue && generationIssue.canRetry && (
        <Animated.View
          entering={reducedMotion ? undefined : FadeIn.duration(Duration.normal).delay(200).easing(Ease.out)}
          style={{ paddingBottom: Math.max(insets.bottom, Spacing['4']) }}
        >
          <TouchableOpacity
            activeOpacity={0.7}
            disabled={isRetrying}
            onPress={handleRetry}
            style={{
              backgroundColor: colors.accent,
              paddingVertical: Spacing['4'],
              borderRadius: Radius.md,
              alignItems: 'center',
              opacity: isRetrying ? 0.65 : 1,
            }}
          >
            <Text
              style={{
                fontFamily: FontFamily.uiMedium,
                fontSize: FontSize.base,
                color: colors.background,
                letterSpacing: 0.3,
              }}
            >
              {isRetrying ? 'Trying again…' : generationIssue.actionLabel}
            </Text>
          </TouchableOpacity>
        </Animated.View>
      )}

      {/* CTA Button — only in Phase 2 */}
      {showReadyReveal && !generationIssue && (
        <Animated.View
          entering={reducedMotion ? undefined : FadeIn.duration(Duration.normal).delay(500).easing(Ease.out)}
          style={{ paddingBottom: Math.max(insets.bottom, Spacing['4']) }}
        >
          <TouchableOpacity
            activeOpacity={0.7}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
              onContinue();
            }}
            style={{
              backgroundColor: colors.accent,
              paddingVertical: Spacing['4'],
              borderRadius: Radius.md,
              alignItems: 'center',
            }}
          >
            <Text
              style={{
                fontFamily: FontFamily.uiMedium,
                fontSize: FontSize.base,
                color: colors.background,
                letterSpacing: 0.3,
              }}
            >
              Open your devotional
            </Text>
          </TouchableOpacity>
        </Animated.View>
      )}
    </View>
  );
}

/* ── Styles ─────────────────────────────────────────────────────────── */

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  flex1: {
    flex: 1,
  },
});
