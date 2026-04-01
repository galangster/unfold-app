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
import { CaretUp } from 'phosphor-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { FontFamily } from '@/constants/fonts';
import { useTheme } from '@/lib/theme';
import { useUnfoldStore } from '@/lib/store';
import { alpha } from '@/components/ui';
import { ScatterTitle } from '@/components/ScatterTitle';
import { ShimmerText } from '@/components/ShimmerText';

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

  // Haptic flags — shared values for worklet access
  const didTickApproach = useSharedValue(0); // 0 = no, 1 = yes
  const didTickCommit = useSharedValue(0);

  const navigateToReading = useCallback(() => {
    if (hasNavigated.current) return;
    hasNavigated.current = true;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    // Mark this day as revealed — teaser card won't show again
    if (devotionalId && dayNumber) {
      markDayAsRevealed(devotionalId, Number(dayNumber));
    }
    if (devotionalId) {
      setCurrentDevotional(devotionalId);
      // Set resume context so the home screen auto-navigates to reading
      // without a visible flash (avoids the tab hierarchy mounting home first)
      setResumeContext({
        route: 'reading',
        devotionalId,
        dayNumber: dayNumber ? Number(dayNumber) : 1,
        dayTitle: dayTitle || undefined,
        touchedAt: new Date().toISOString(),
      });
    }
    // Navigate to the home tab — it will detect resumeContext and push to reading
    router.replace('/(tabs)/(today)');
  }, [devotionalId, dayNumber, dayTitle, router, markDayAsRevealed, setCurrentDevotional, setResumeContext]);

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

  // ─── Shimmer sweep across title after scatter completes ────────
  const shimmerSweepOpacity = useSharedValue(0);
  const shimmerSweepX = useSharedValue(-SCREEN_WIDTH);

  const onScatterComplete = useCallback(() => {
    onTitleComplete();

    if (reducedMotion) return;

    // Fire shimmer sweep across the title area
    shimmerSweepOpacity.value = withSequence(
      withTiming(1, { duration: 100 }),
      withDelay(700, withTiming(0, { duration: 300 })),
    );
    shimmerSweepX.value = withTiming(SCREEN_WIDTH, {
      duration: 800,
      easing: Easing.inOut(Easing.ease),
    });
  }, [onTitleComplete, reducedMotion]);

  const shimmerSweepStyle = useAnimatedStyle(() => ({
    opacity: shimmerSweepOpacity.value,
    transform: [{ translateX: shimmerSweepX.value }],
  }));

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
            {(seriesTitle ?? 'YOUR SERIES').toUpperCase()}
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

            {/* Shimmer sweep overlay — passes once after scatter */}
            <Animated.View
              style={[styles.shimmerSweep, shimmerSweepStyle]}
              pointerEvents="none"
            >
              <LinearGradient
                colors={[
                  'transparent',
                  alpha(colors.accent, 0.15),
                  'transparent',
                ]}
                start={{ x: 0, y: 0.5 }}
                end={{ x: 1, y: 0.5 }}
                style={{ flex: 1, borderRadius: 30 }}
              />
            </Animated.View>
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
            {`DAY ${dayNum} OF ${total}`}
          </Animated.Text>
        </View>

        {/* Swipe-up prompt — bottom of screen */}
        <Animated.View style={[styles.swipePrompt, promptStyle]}>
          <Animated.View style={chevronStyle}>
            <CaretUp size={24} color={colors.textSubtle} weight="light" />
          </Animated.View>

          <ShimmerText
            text="Swipe up to reveal your devotional"
            style={{
              fontFamily: FontFamily.ui,
              fontSize: 13,
              textAlign: 'center',
              lineHeight: 20,
              marginTop: 8,
              color: colors.textSubtle,
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
    fontFamily: FontFamily.uiMedium,
    fontSize: 12,
    letterSpacing: 2,
    marginBottom: 12,
    textTransform: 'uppercase',
  },
  titleContainer: {
    marginBottom: 16,
    overflow: 'hidden',
  },
  shimmerSweep: {
    position: 'absolute',
    top: 0,
    left: 0,
    bottom: 0,
    width: 60,
  },
  dayCounter: {
    fontFamily: FontFamily.ui,
    fontSize: 11,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },
  swipePrompt: {
    alignItems: 'center',
    paddingBottom: 16,
  },
});
