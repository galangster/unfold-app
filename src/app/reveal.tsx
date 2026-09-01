import { useEffect, useCallback, useMemo, useRef } from 'react';
import { View, Text, StyleSheet, Dimensions } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withSequence,
  withTiming,
  withDelay,
  withSpring,
  Easing,
  FadeIn,
  runOnJS,
  useReducedMotion,
} from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import * as Haptics from 'expo-haptics';
import { CaretUp } from '@/components/icons';
import { FontFamily } from '@/constants/fonts';
import { useTheme } from '@/lib/theme';
import { useUnfoldStore } from '@/lib/store';
import { useUIState } from '@/lib/ui-state';
import { alpha } from '@/components/ui';
import { ScatterTitle } from '@/components/ScatterTitle';
import { ShimmerText } from '@/components/ShimmerText';
import { buildReadingRouteFromRevealParams } from '@/lib/push-notification-helpers';
import { Typography } from '@/constants/typography';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

// Gesture thresholds
const APPROACH_THRESHOLD = -40;
const COMMIT_THRESHOLD = -120;

// Spring config — critically-damped (damping 30, stiffness 200, mass 1 = slightly overdamped)
const CURTAIN_SPRING = { damping: 30, stiffness: 200, mass: 1 };

/**
 * Reveal screen — full-screen overlay shown once per day
 * when new devotional content is ready. User drags up to
 * lift the curtain and begin today's reading.
 */
export default function RevealScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const reducedMotion = useReducedMotion();

  const { devotionalId, dayNumber, seriesTitle, dayTitle, totalDays } =
    useLocalSearchParams<{
      devotionalId: string;
      dayNumber: string;
      seriesTitle: string;
      dayTitle: string;
      totalDays: string;
    }>();

  const markDayAsRevealed = useUnfoldStore((s) => s.markDayAsRevealed);
  const setCurrentDevotional = useUnfoldStore((s) => s.setCurrentDevotional);
  const setResumeContext = useUnfoldStore((s) => s.setResumeContext);


  // ─── Entrance stagger state ────────────────────────────────────
  const eyebrowOpacity = useSharedValue(0);
  const dayCounterOpacity = useSharedValue(0);
  const promptOpacity = useSharedValue(0);

  useEffect(() => {
    if (reducedMotion) {
      // Show everything immediately
      eyebrowOpacity.value = 1;
      dayCounterOpacity.value = 1;
      promptOpacity.value = 1;
      return;
    }
    // Eyebrow fades in at 200ms
    eyebrowOpacity.value = withDelay(
      200,
      withTiming(1, { duration: 300, easing: Easing.out(Easing.cubic) }),
    );
  }, [reducedMotion]);

  // Called when ScatterTitle finishes all letters
  const onTitleComplete = useCallback(() => {
    if (reducedMotion) return; // Already shown immediately
    // Day counter fades in ~100ms after title completes
    dayCounterOpacity.value = withDelay(
      100,
      withTiming(1, { duration: 300, easing: Easing.out(Easing.cubic) }),
    );
    // Swipe prompt fades in ~300ms after title completes
    promptOpacity.value = withDelay(
      300,
      withTiming(1, { duration: 300, easing: Easing.out(Easing.cubic) }),
    );
  }, [reducedMotion]);

  const eyebrowStyle = useAnimatedStyle(() => ({
    opacity: eyebrowOpacity.value,
  }));
  const dayCounterStyle = useAnimatedStyle(() => ({
    opacity: dayCounterOpacity.value,
  }));
  const promptStyle = useAnimatedStyle(() => ({
    opacity: promptOpacity.value,
  }));

  // ─── Dual chevron float ────────────────────────────────────────
  const chevronY = useSharedValue(0);

  useEffect(() => {
    if (reducedMotion) return;
    chevronY.value = withRepeat(
      withTiming(-8, { duration: 1200, easing: Easing.inOut(Easing.ease) }),
      -1,
      true,
    );
  }, [reducedMotion]);

  const chevronStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: chevronY.value }],
  }));

  // ─── Draggable curtain lift ────────────────────────────────────
  const translateY = useSharedValue(0);
  const hasNavigated = useRef(false);
  const transitionResetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Haptic flags — shared values for worklet access
  const didTickApproach = useSharedValue(0); // 0 = no, 1 = yes
  const didTickCommit = useSharedValue(0);

  useEffect(() => {
    return () => {
      if (transitionResetTimerRef.current) {
        clearTimeout(transitionResetTimerRef.current);
      }
    };
  }, []);

  const navigateToReading = useCallback(() => {
    console.log('[Reveal] navigateToReading START', { devotionalId, dayNumber, hasNavigated: hasNavigated.current });
    if (hasNavigated.current) {
      console.log('[Reveal] already navigated, bailing');
      return;
    }
    hasNavigated.current = true;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    // Mark this day as revealed — teaser card won't show again
    if (devotionalId && dayNumber) {
      console.log('[Reveal] markDayAsRevealed', { devotionalId, dayNumber });
      markDayAsRevealed(devotionalId, Number(dayNumber));
    }
    if (devotionalId) {
      console.log('[Reveal] setCurrentDevotional', devotionalId);
      setCurrentDevotional(devotionalId);
    }
    console.log('[Reveal] setResumeContext for reading handoff', { devotionalId, dayNumber });
    setResumeContext({
      route: 'reading',
      devotionalId,
      dayNumber: Number(dayNumber ?? '1'),
      devotionalTitle: seriesTitle,
      dayTitle,
      touchedAt: new Date().toISOString(),
    });
    // Flag the transition so the home screen renders blank during the brief
    // moment React Navigation renders the tab index before the reading screen.
    console.log('[Reveal] setRevealTransitioning(true)');
    useUIState.getState().setRevealTransitioning(true);
    // Safety valve: if the transition is interrupted before Reading mounts,
    // don't leave Home permanently blank.
    transitionResetTimerRef.current = setTimeout(() => {
      const { revealTransitioning, setRevealTransitioning } = useUIState.getState();
      if (revealTransitioning) {
        console.log('[Reveal] fallback clear revealTransitioning after interrupted navigation');
        setRevealTransitioning(false);
      }
    }, 2000);
    // Replace the top-level reveal screen with the nested Today reading route.
    // `dismissTo` can briefly pop through the tab index on this root-stack →
    // nested-tab handoff, which is exactly the blank/stranded path the reveal
    // transition guard is trying to avoid.
    console.log('[Reveal] replace → /(tabs)/(today)/reading', {
      devotionalId,
      dayNumber: String(dayNumber ?? '1'),
    });
    router.replace(
      buildReadingRouteFromRevealParams({
        devotionalId,
        dayNumber,
      }),
    );
    console.log('[Reveal] navigateToReading DONE');
  }, [devotionalId, dayNumber, router, markDayAsRevealed, setCurrentDevotional, setResumeContext, seriesTitle, dayTitle]);

  const fireApproachHaptic = useCallback(() => {
    Haptics.selectionAsync();
  }, []);

  const fireCommitHaptic = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  }, []);

  const panGesture = useMemo(
    () =>
      Gesture.Pan()
        .onBegin(() => {
          didTickApproach.value = 0;
          didTickCommit.value = 0;
        })
        .onUpdate((event) => {
          // Clamp to upward only
          translateY.value = Math.min(0, event.translationY);

          // Approach haptic at -40px
          if (event.translationY < APPROACH_THRESHOLD && didTickApproach.value === 0) {
            didTickApproach.value = 1;
            runOnJS(fireApproachHaptic)();
          }

          // Commit haptic at -120px
          if (event.translationY < COMMIT_THRESHOLD && didTickCommit.value === 0) {
            didTickCommit.value = 1;
            runOnJS(fireCommitHaptic)();
          }
        })
        .onEnd((event) => {
          if (event.translationY < COMMIT_THRESHOLD) {
            // Past threshold — spring off screen, then navigate after curtain clears
            translateY.value = withSpring(-SCREEN_HEIGHT, CURTAIN_SPRING, (finished) => {
              if (finished) {
                runOnJS(navigateToReading)();
              }
            });
          } else {
            // Before threshold — spring back
            translateY.value = withSpring(0, CURTAIN_SPRING);
          }
        }),
    [navigateToReading, fireApproachHaptic, fireCommitHaptic],
  );

  const curtainStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));

  const onScatterComplete = useCallback(() => {
    onTitleComplete();
  }, [onTitleComplete]);

  // ─── Render ────────────────────────────────────────────────────

  const dayNum = dayNumber ? parseInt(dayNumber, 10) : 1;
  const total = totalDays ? parseInt(totalDays, 10) : 1;

  return (
    <GestureDetector gesture={panGesture}>
      <Animated.View
        entering={FadeIn.duration(600)}
        style={[
          styles.container,
          {
            backgroundColor: colors.background,
            paddingTop: insets.top,
            paddingBottom: insets.bottom,
          },
          curtainStyle,
        ]}
        accessible
        accessibilityLabel={`New devotional ready: ${seriesTitle ?? 'Series'}, ${dayTitle ?? 'Today'}. Day ${dayNum} of ${total}. Swipe up to reveal your devotional.`}
        accessibilityRole="header"
      >
        {/* Main content — centered */}
        <View style={styles.content}>
          {/* Series title eyebrow */}
          <Animated.Text
            style={[
              styles.eyebrow,
              { color: colors.textMuted },
              eyebrowStyle,
            ]}
            numberOfLines={1}
            accessibilityRole="text"
          >
            {seriesTitle ?? 'Your series'}
          </Animated.Text>

          {/* Day title — scatter-in animation */}
          <View style={styles.titleContainer}>
            <ScatterTitle
              text={dayTitle ?? "Today's Reading"}
              fontSize={42}
              baseDelay={500}
              stagger={80}
              onComplete={onScatterComplete}
            />

          </View>

          {/* Day counter */}
          <Animated.Text
            style={[
              styles.dayCounter,
              { color: colors.textMuted },
              dayCounterStyle,
            ]}
            accessibilityRole="text"
          >
            {`Day ${dayNum} of ${total}`}
          </Animated.Text>
        </View>

        {/* Swipe-up prompt — bottom of screen. textMuted (not textSubtle):
            the prompt rests at this colour once its one-shot fade finishes,
            and textSubtle sits at only ~3.5:1 over the dark ground. */}
        <Animated.View style={[styles.swipePrompt, promptStyle]}>
          <Animated.View style={chevronStyle}>
            <CaretUp size={24} color={colors.textMuted} weight="light" />
          </Animated.View>

          <ShimmerText
            text="Swipe up to reveal your devotional"
            style={{
              fontFamily: FontFamily.ui,
              fontSize: 13,
              textAlign: 'center',
              lineHeight: 20,
              marginTop: 8,
              color: colors.textMuted,
            }}
            shimmerWidth={60}
            sweepDuration={800}
            pauseDuration={2200}
            initialDelay={1800}
          />
        </Animated.View>
      </Animated.View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
  },
  eyebrow: {
    ...Typography.cardMeta,
    marginBottom: 12,
  },
  titleContainer: {
    marginBottom: 16,
    overflow: 'hidden',
  },
  dayCounter: {
    ...Typography.cardMeta,
  },
  swipePrompt: {
    alignItems: 'center',
    paddingBottom: 16,
  },
});
