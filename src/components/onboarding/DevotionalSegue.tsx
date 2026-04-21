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
import { pollJobStatus } from '@/lib/generation-api';
import type { ColorTheme } from '@/constants/colors';

/* ── Types ─────────────────────────────────────────────────────────── */

interface Props {
  name: string;
  colors: ColorTheme;
  jobId: string | null;
  /** If no jobId was provided, call this to submit the generation job and get one */
  submitFallback?: () => Promise<string>;
  onDevotionalReady: (result: any) => void;
  onContinue: () => void;
}

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

  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const readyCalledRef = useRef(false);
  const fallbackAttemptedRef = useRef(false);

  /* ── Fallback: submit job if none provided ── */
  useEffect(() => {
    if (activeJobId || fallbackAttemptedRef.current || !submitFallback) return;
    fallbackAttemptedRef.current = true;
    submitFallback()
      .then((newJobId) => setActiveJobId(newJobId))
      .catch(() => setIsReady(true)); // If fallback fails, let user through anyway
  }, [activeJobId, submitFallback]);

  /* ── Polling ── */
  useEffect(() => {
    if (!activeJobId) {
      // No job yet — waiting for fallback or treating as ready
      if (!submitFallback) setIsReady(true);
      return;
    }

    const poll = async () => {
      try {
        const response = await pollJobStatus(activeJobId!);
        if (response.status === 'complete' && response.result?.devotionalDay) {
          if (!readyCalledRef.current) {
            readyCalledRef.current = true;
            onDevotionalReady(response.result);
            setIsReady(true);
          }
          if (pollingRef.current) {
            clearInterval(pollingRef.current);
            pollingRef.current = null;
          }
        }
      } catch {
        // Silent — keep polling
      }
    };

    // Poll immediately, then on interval
    poll();
    pollingRef.current = setInterval(poll, POLL_INTERVAL_MS);

    return () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
        pollingRef.current = null;
      }
    };
  }, [activeJobId, onDevotionalReady]);

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
      {!showReadyReveal && (
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
      {showReadyReveal && (
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

      {/* CTA Button — only in Phase 2 */}
      {showReadyReveal && (
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
