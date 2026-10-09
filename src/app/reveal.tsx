import { useSuccessRevealCue } from '@/hooks/useSuccessRevealCue';
import { useEffect, useCallback, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, useWindowDimensions, TouchableOpacity, AccessibilityInfo } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useRevealActivity } from '@/hooks/useRevealActivity';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  withDelay,
  withSpring,
  Easing,
  FadeIn,
  runOnJS,
  cancelAnimation,
} from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import * as Haptics from 'expo-haptics';
import { CaretUp } from '@/components/icons';
import { FontFamily } from '@/constants/fonts';
import { useTheme } from '@/lib/theme';
import { flushUnfoldStorePersistAsync, updateSyncedDevotionals, useUnfoldStore } from '@/lib/store';
import { logger } from '@/lib/logger';
import { useUIState } from '@/lib/ui-state';
import { ScatterTitle } from '@/components/ScatterTitle';
import { ShimmerText } from '@/components/ShimmerText';
import { buildReadingRouteFromRevealParams } from '@/lib/push-notification-helpers';
import {
  canRevealActivateSeries,
  missingRevealSeriesId,
  resolveRevealOutcome,
  REVEAL_SERIES_PULL_TIMEOUT_MS,
} from '@/lib/reveal-params';
import { commitDevotionalPullCursor, pullDevotionalContent } from '@/lib/devotional-sync-pull';
import { applyPulledDevotionalContent } from '@/lib/devotional-pulled-content';
import { captureSyncSession, isSyncSessionCurrent } from '@/lib/sync-session-fence';
import type { ActiveSeriesCandidate } from '@/lib/devotional-active-selection';
import { mergeDevotionalLifecycle } from '@/lib/devotional-lifecycle';
import { reportReadyPushForLockedDay } from '@/lib/day-unlock-telemetry';
import { Typography } from '@/constants/typography';
import { useAccessibleAnimation } from '@/hooks/useAccessibility';
import { RevealBackdrop } from '@/components/reveal/RevealBackdrop';
import { getDailyRevealVariant } from '@/lib/reveal-variant';

// Gesture thresholds
const APPROACH_THRESHOLD = -40;
const COMMIT_THRESHOLD = -120;

// Spring config — critically-damped (damping 30, stiffness 200, mass 1 = slightly overdamped)
const CURTAIN_SPRING = { damping: 30, stiffness: 200, mass: 1 };

/**
 * Pull the series a ready push names onto this device. A failure leaves the
 * store as it was, and the reveal then sends the reader to Today. Returns the
 * series rows the pull saw, which can include series this device lacks.
 */
async function pullRevealSeries(
  devotionalId: string,
  updateDevotionalDays: Parameters<typeof applyPulledDevotionalContent>[0]['updateDevotionalDays'],
): Promise<readonly ActiveSeriesCandidate[] | null> {
  const session = captureSyncSession();
  let pulledSeries: readonly ActiveSeriesCandidate[] | null = null;
  try {
    const pulled = await pullDevotionalContent(devotionalId, { timeoutMs: REVEAL_SERIES_PULL_TIMEOUT_MS });
    if (!isSyncSessionCurrent(session)) return null;
    // Kept even if the save below fails: the series is in the store by then,
    // and the winner check still needs every row the pull saw.
    pulledSeries = pulled.canonicalSeries ?? [];
    applyPulledDevotionalContent({
      devotionalId,
      pulled,
      updateDevotionalDays,
      updateDevotionals: updateSyncedDevotionals,
    });
    // The cursor moves only once the rows are on disk, as on Today.
    await flushUnfoldStorePersistAsync();
    if (!isSyncSessionCurrent(session)) return null;
    commitDevotionalPullCursor(pulled);
  } catch (err) {
    logger.warn('[Reveal] could not pull the series a ready push names:', err instanceof Error ? err.message : err);
  }
  return pulledSeries;
}

/**
 * The pushed series as the winner check should see it. A pulled row gives the
 * server's mode and creation time: the shell built from a pull is always
 * marked progressive, and a row without a mode is one the server does not
 * select. Pause and resume come from whichever copy is newer, as a sync
 * merges them: a sync can land a newer one after the reveal's pull.
 */
function revealTargetCandidate(
  local: ActiveSeriesCandidate | undefined,
  pulled: ActiveSeriesCandidate | undefined,
): ActiveSeriesCandidate | undefined {
  if (!local || !pulled) return pulled ?? local;
  return {
    id: local.id,
    createdAt: pulled.createdAt ?? local.createdAt,
    generationMode: pulled.generationMode,
    ...mergeDevotionalLifecycle({ local, incoming: pulled }),
  };
}

/**
 * Reveal screen — full-screen overlay shown once per day
 * when new devotional content is ready. User drags up to
 * lift the curtain and begin today's reading.
 */
export default function RevealScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const { reducedMotion } = useAccessibleAnimation();
  const focused = useRevealActivity();
  const { height: screenHeight } = useWindowDimensions();
  const [contentHeight, setContentHeight] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(0);
  const contentOverflows = contentHeight > viewportHeight + 1;

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
  const updateDevotionalDays = useUnfoldStore((s) => s.updateDevotionalDays);
  const devotionals = useUnfoldStore((s) => s.devotionals);

  // P3-4: params are only trusted once they resolve to a devotional that
  // exists locally and a day inside its range. Everything the store learns
  // from this screen comes from `revealTarget`, never from the raw params.
  const revealOutcome = useMemo(
    () => resolveRevealOutcome({ devotionalId, dayNumber }, devotionals),
    [devotionalId, dayNumber, devotionals],
  );
  const revealTarget = revealOutcome.kind === 'open' ? revealOutcome.target : null;
  const missingSeriesId = missingRevealSeriesId({ devotionalId, dayNumber }, devotionals);
  // The series being pulled, if any. The curtain holds until the pull settles.
  const [pullingSeriesId, setPullingSeriesId] = useState<string | null>(null);
  const seriesPullAttemptsRef = useRef(new Set<string>());
  const pulledSeriesRef = useRef<readonly ActiveSeriesCandidate[]>([]);

  const revealedDay = devotionals
    .find((row) => row.id === revealTarget?.devotionalId)?.days
    ?.find((day) => day.dayNumber === revealTarget?.dayNumber);
  useSuccessRevealCue(
    'new-day-revealed',
    revealTarget?.devotionalId,
    revealTarget?.dayNumber ?? 1,
    Boolean(revealedDay && revealTarget && revealTarget.dayNumber > 1 && !revealedDay.isRead && !revealedDay.isRevealed),
  );

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
  }, [reducedMotion, dayCounterOpacity, eyebrowOpacity, promptOpacity]);

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
  }, [reducedMotion, dayCounterOpacity, promptOpacity]);

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
    cancelAnimation(chevronY);
    chevronY.value = 0;
    if (reducedMotion || !focused) return;
    chevronY.value = withRepeat(
      withTiming(-8, { duration: 1200, easing: Easing.inOut(Easing.ease) }),
      -1,
      true,
    );
    return () => cancelAnimation(chevronY);
  }, [reducedMotion, focused, chevronY]);

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

  // Bail to Today when the params don't resolve (unknown devotional, day out
  // of range, junk) — nothing is written to the store on that path.
  // `devotionals` is a dependency so a late hydration re-evaluates the guard.
  // A series this device does not hold is pulled once first: the push can
  // arrive before the series does.
  useEffect(() => {
    if (revealOutcome.kind === 'open' || hasNavigated.current) return;
    if (!useUnfoldStore.persist.hasHydrated()) return;
    if (pullingSeriesId) return;
    if (missingSeriesId && !seriesPullAttemptsRef.current.has(missingSeriesId)) {
      seriesPullAttemptsRef.current.add(missingSeriesId);
      setPullingSeriesId(missingSeriesId);
      void pullRevealSeries(missingSeriesId, updateDevotionalDays)
        .then((pulledSeries) => {
          if (pulledSeries) pulledSeriesRef.current = pulledSeries;
        })
        .finally(() => setPullingSeriesId(null));
      return;
    }
    hasNavigated.current = true;
    if (revealOutcome.kind === 'locked') {
      // The push named a day the pacing lock keeps closed until the next local
      // day. The reader still lands on Today, which says Tomorrow; this records
      // that the server and the app disagreed.
      reportReadyPushForLockedDay(revealOutcome.dayNumber);
      logger.warn('[Reveal] ready push names a locked day — redirecting to Today');
    } else {
      logger.warn('[Reveal] params do not resolve to a local devotional day — redirecting to Today');
    }
    router.replace('/(tabs)/(today)');
  }, [revealOutcome, devotionals, router, missingSeriesId, pullingSeriesId, updateDevotionalDays]);

  const navigateToReading = useCallback(() => {
    if (hasNavigated.current) {
      return;
    }
    if (!revealTarget) {
      // Guard (P3-4): no store writes for params that don't resolve locally.
      logger.warn('[Reveal] refusing store writes for unresolved params — redirecting to Today');
      hasNavigated.current = true;
      router.replace('/(tabs)/(today)');
      return;
    }
    hasNavigated.current = true;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    // Mark this day as revealed — teaser card won't show again
    markDayAsRevealed(revealTarget.devotionalId, revealTarget.dayNumber);
    const { currentDevotionalId, devotionals: latestDevotionals } = useUnfoldStore.getState();
    // A pull can show a newer series this device does not hold yet, or a
    // newer lifecycle of one it holds (applied later, by the full sync). Each
    // series counts once, its local and pulled copies merged by the newer
    // lifecycle, so only the series the server would pick becomes current:
    // a sibling resumed elsewhere blocks it, and one archived elsewhere but
    // still live here does not.
    const pulledRows = pulledSeriesRef.current;
    const seriesIds = [...new Set([...latestDevotionals, ...pulledRows].map((row) => row.id))];
    const candidates = seriesIds
      .map((id) => revealTargetCandidate(
        latestDevotionals.find((row) => row.id === id),
        pulledRows.find((row) => row.id === id),
      ))
      .filter((row): row is ActiveSeriesCandidate => row !== undefined);
    const activatesSeries = canRevealActivateSeries(revealTarget.devotionalId, currentDevotionalId, candidates);
    if (activatesSeries) {
      setCurrentDevotional(revealTarget.devotionalId);
      setResumeContext({
        route: 'reading',
        devotionalId: revealTarget.devotionalId,
        dayNumber: revealTarget.dayNumber,
        devotionalTitle: revealTarget.seriesTitle,
        // Only what resolved against the local devotional: the raw param is
        // attacker-controlled (bounded to 200 chars by the native allowlist,
        // unbounded on web, which has no native-intent hook) and this value is
        // persisted and rendered on the Today resume card. null when the day
        // has no locally generated title yet — the card omits it.
        dayTitle: revealTarget.dayTitle,
        touchedAt: new Date().toISOString(),
      });
    }
    // Flag the transition so the home screen renders blank during the brief
    // moment React Navigation renders the tab index before the reading screen.
    useUIState.getState().setRevealTransitioning(true);
    // Safety valve: if the transition is interrupted before Reading mounts,
    // don't leave Home permanently blank.
    transitionResetTimerRef.current = setTimeout(() => {
      const { revealTransitioning, setRevealTransitioning } = useUIState.getState();
      if (revealTransitioning) {
        logger.warn('[Reveal] fallback clear revealTransitioning after interrupted navigation');
        setRevealTransitioning(false);
      }
    }, 2000);
    // Replace the top-level reveal screen with the nested Today reading route.
    // `dismissTo` can briefly pop through the tab index on this root-stack →
    // nested-tab handoff, which is exactly the blank/stranded path the reveal
    // transition guard is trying to avoid.
    const readingRoute = buildReadingRouteFromRevealParams({
      devotionalId: revealTarget.devotionalId,
      dayNumber: String(revealTarget.dayNumber),
    });
    // A series the reveal may not activate opens paused, like the library.
    router.replace(activatesSeries ? readingRoute : { ...readingRoute, params: { ...readingRoute.params, readOnly: '1' } });
  }, [revealTarget, router, markDayAsRevealed, setCurrentDevotional, setResumeContext]);

  const fireApproachHaptic = useCallback(() => {
    Haptics.selectionAsync();
  }, []);

  const fireCommitHaptic = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  }, []);

  const createPanGesture = useCallback(
    (enabled: boolean) =>
      Gesture.Pan()
        .enabled(enabled)
        .onBegin(() => {
          didTickApproach.value = 0;
          didTickCommit.value = 0;
        })
        .onUpdate((event) => {
          // Clamp to upward only
          translateY.value = reducedMotion ? 0 : Math.min(0, event.translationY);

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
            if (reducedMotion) {
              runOnJS(navigateToReading)();
              return;
            }
            // Past threshold — spring off screen, then navigate after curtain clears
            translateY.value = withSpring(-screenHeight, CURTAIN_SPRING, (finished) => {
              if (finished) {
                runOnJS(navigateToReading)();
              }
            });
          } else {
            // Before threshold — spring back
            translateY.value = reducedMotion ? 0 : withSpring(0, CURTAIN_SPRING);
          }
        }),
    [navigateToReading, fireApproachHaptic, fireCommitHaptic, didTickApproach, didTickCommit, translateY, screenHeight, reducedMotion],
  );
  const isPullingSeries = pullingSeriesId !== null;
  const panGesture = useMemo(
    () => createPanGesture(!contentOverflows && !isPullingSeries),
    [createPanGesture, contentOverflows, isPullingSeries],
  );
  const promptPanGesture = useMemo(
    () => createPanGesture(contentOverflows && !isPullingSeries),
    [createPanGesture, contentOverflows, isPullingSeries],
  );

  const curtainStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));

  // Accessible alternative to the swipe gesture — a VoiceOver "activate"
  // action on the gesture surface, plus a visually-quiet always-reachable
  // button below, both land here. Mirrors the swipe-commit path (curtain
  // lifts, then navigates) so the two ways in feel like the same action.
  const activateReveal = useCallback(() => {
    if (hasNavigated.current || isPullingSeries) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    AccessibilityInfo.announceForAccessibility('Revealing today’s reading');
    if (reducedMotion) {
      navigateToReading();
      return;
    }
    translateY.value = withSpring(-screenHeight, CURTAIN_SPRING, (finished) => {
      if (finished) {
        runOnJS(navigateToReading)();
      }
    });
  }, [reducedMotion, navigateToReading, translateY, screenHeight, isPullingSeries]);

  const onScatterComplete = useCallback(() => {
    onTitleComplete();
  }, [onTitleComplete]);

  // ─── Render ────────────────────────────────────────────────────

  const dayNum = revealTarget?.dayNumber ?? (dayNumber ? parseInt(dayNumber, 10) : 1);
  const total = revealTarget?.totalDays ?? (totalDays ? parseInt(totalDays, 10) : 1);

  return (
    <GestureDetector gesture={panGesture}>
    <Animated.View
        entering={reducedMotion ? undefined : FadeIn.duration(600)}
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
        accessibilityActions={[{ name: 'activate', label: 'Reveal' }]}
        onAccessibilityAction={(event) => {
          if (event.nativeEvent.actionName === 'activate') {
            activateReveal();
          }
        }}
      >
        {revealTarget && (
          <RevealBackdrop variant={getDailyRevealVariant(revealTarget.devotionalId, revealTarget.dayNumber)} />
        )}
        {/* Main content — centered */}
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={styles.content}
          scrollEnabled={contentOverflows}
          onLayout={(event) => setViewportHeight(event.nativeEvent.layout.height)}
          onContentSizeChange={(_, height) => setContentHeight(height)}
        >
          {/* Series title eyebrow */}
          <Animated.Text
            style={[
              styles.eyebrow,
              { color: colors.textMuted },
              eyebrowStyle,
            ]}
            accessibilityRole="text"
          >
            {seriesTitle ?? 'Your series'}
          </Animated.Text>

          {/* Day title — scatter-in animation */}
          <View style={styles.titleContainer}>
            {reducedMotion ? (
              <Text style={{ fontFamily: FontFamily.display, fontSize: 42, lineHeight: 50, textAlign: 'center', color: colors.text }}>
                {dayTitle ?? "Today's Reading"}
              </Text>
            ) : <ScatterTitle
              text={dayTitle ?? "Today's Reading"}
              color={colors.text}
              fontSize={42}
              baseDelay={500}
              stagger={80}
              onComplete={onScatterComplete}
            />}

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
        </ScrollView>

        {/* Swipe-up prompt — bottom of screen. textMuted (not textSubtle):
            the prompt rests at this colour once its one-shot fade finishes,
            and textSubtle sits at only ~3.5:1 over the dark ground. */}
        <GestureDetector gesture={promptPanGesture}>
        <Animated.View style={[styles.swipePrompt, promptStyle]}>
          <Animated.View style={chevronStyle}>
            <CaretUp size={24} color={colors.textMuted} weight="light" />
          </Animated.View>

          {reducedMotion || !focused ? (
            <Text style={{ fontFamily: FontFamily.ui, fontSize: 13, lineHeight: 20, textAlign: 'center', color: colors.text }}>
              Swipe up to reveal your devotional
            </Text>
          ) : <ShimmerText
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
          />}

          {/* Always-reachable alternative to the swipe gesture — visually
              secondary since swiping is the primary affordance, but never
              hidden from touch or screen-reader navigation. */}
          <TouchableOpacity
            activeOpacity={0.6}
            onPress={activateReveal}
            hitSlop={{ top: 8, bottom: 8, left: 16, right: 16 }}
            style={styles.revealButton}
            accessibilityRole="button"
            accessibilityLabel="Reveal today's reading"
          >
            <Text style={[styles.revealButtonText, { color: colors.textMuted }]}>
              Reveal
            </Text>
          </TouchableOpacity>
        </Animated.View>
        </GestureDetector>
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
    flexGrow: 1,
    paddingVertical: 24,
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
  revealButton: {
    marginTop: 16,
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  revealButtonText: {
    fontFamily: FontFamily.ui,
    fontSize: 12,
    textAlign: 'center',
    textDecorationLine: 'underline',
  },
});
