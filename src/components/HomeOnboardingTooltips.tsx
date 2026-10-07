import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { Modal, View, Text, TouchableOpacity, useWindowDimensions, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
  FadeIn,
  FadeOut,
  runOnJS,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { Duration, Ease } from '@/constants/animations';
import Svg, { Defs, Rect, Mask, Path } from 'react-native-svg';
import * as Haptics from 'expo-haptics';
import { FontFamily } from '@/constants/fonts';
import { useTheme } from '@/lib/theme';
import { useUnfoldStore } from '@/lib/store';
import { useUIState, type TabBarRowRect } from '@/lib/ui-state';
import { buildBubblePath } from '@/lib/bubble-path';
import { Radius } from '@/constants/radius';
import { Shadow } from '@/constants/shadows';
import { Spacing } from '@/constants/spacing';
import {
  TAB_BAR_HORIZONTAL_PADDING,
  TAB_BAR_ROW_PADDING_TOP,
  tabBarRowPaddingBottom,
  VISIBLE_TAB_GROUPS,
} from '@/lib/visible-tabs';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TargetRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

type TargetKey = 'reading' | 'context' | 'rhythm' | 'tabs';
export type ContentTargetKey = Exclude<TargetKey, 'tabs'>;

interface TooltipStep {
  title: string;
  message: string;
  targetKey: TargetKey;
  placement: 'below' | 'above' | 'auto';
}

export interface OnboardingLayoutRects {
  reading: TargetRect | null;
  context: TargetRect | null;
  rhythm: TargetRect | null;
}

// ---------------------------------------------------------------------------
// Steps
// ---------------------------------------------------------------------------

const TOOLTIP_STEPS: TooltipStep[] = [
  {
    title: 'Through the day',
    message: 'Check-ins and notes from Companion gather here as your day unfolds. Tap one to respond, or dismiss it.',
    targetKey: 'context',
    placement: 'auto',
  },
  {
    title: 'Today’s thread',
    message: 'Your next reading lives here. If a day slips by, Today gently brings you back to the right place.',
    targetKey: 'reading',
    placement: 'below',
  },
  {
    title: 'Daily Rhythm',
    message: 'A quiet signal of consistency — not a scoreboard. One faithful day at a time.',
    targetKey: 'rhythm',
    placement: 'above',
  },
  {
    title: 'Read, Ask & Write',
    message: 'Devotional, Bible, Companion, and Journal are always one tap away whenever you want to continue a series, read, ask, or write.',
    targetKey: 'tabs',
    placement: 'above',
  },
];

// ---------------------------------------------------------------------------
// SVG spotlight mask — full screen dark + feathered rounded-rect hole
// ---------------------------------------------------------------------------

const BACKDROP_OPACITY = 0.70;
const FEATHER_SIZE = 14;

interface StepVisualTuning {
  spotlightPadding: number;
  tooltipGap: number;
  cornerRadius: number;
}

const STEP_VISUAL_TUNING: Record<TargetKey, StepVisualTuning> = {
  reading: {
    spotlightPadding: 8,
    tooltipGap: 16,
    cornerRadius: 18,
  },
  context: {
    spotlightPadding: 8,
    tooltipGap: 16,
    cornerRadius: 16,
  },
  rhythm: {
    spotlightPadding: 8,
    tooltipGap: 16,
    cornerRadius: 18,
  },
  tabs: {
    spotlightPadding: 6,
    tooltipGap: 12,
    cornerRadius: 20,
  },
};

// ---------------------------------------------------------------------------
// Bubble shape tuning
// ---------------------------------------------------------------------------

const TOOLTIP_ARROW_HEIGHT = 12;
const TOOLTIP_ARROW_WIDTH = 28;
const TOOLTIP_STROKE_WIDTH = 1;

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

const TOOLTIP_ESTIMATED_HEIGHT = 130;

/** Spotlight the non-Today tabs inside the tab bar row. */
function spotlitTabsRect(row: TabBarRowRect, bottomInset: number): TargetRect {
  const visibleTabCount = VISIBLE_TAB_GROUPS.length;
  const todayIndex = Math.max(VISIBLE_TAB_GROUPS.indexOf('(today)'), 0);
  const tabWidth = (row.width - TAB_BAR_HORIZONTAL_PADDING * 2) / visibleTabCount;

  return {
    x: row.x + TAB_BAR_HORIZONTAL_PADDING + tabWidth * (todayIndex + 1),
    y: row.y + TAB_BAR_ROW_PADDING_TOP,
    width: tabWidth * (visibleTabCount - 1),
    height: Math.max(row.height - TAB_BAR_ROW_PADDING_TOP - tabBarRowPaddingBottom(bottomInset), 0),
  };
}


/** A reveal that never lands must not leave the reader on a dim screen. */
const REVEAL_TIMEOUT_MS = 1500;
// Room left between a revealed target and the edge of the visible area.
const REVEAL_MARGIN = 24;

/**
 * How far Today must scroll so a target sits between `top` and `bottom`.
 * Negative scrolls up. A target taller than the gap keeps its top in view.
 */
export function sameTargetRect(a: TargetRect | null, b: TargetRect | null): boolean {
  if (!a || !b) return a === b;
  return a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height;
}

function revealDistance(rect: TargetRect, top: number, bottom: number): number {
  if (rect.y < top) return rect.y - top - REVEAL_MARGIN;
  const below = rect.y + rect.height - bottom;
  if (below <= 0) return 0;
  return Math.min(below + REVEAL_MARGIN, rect.y - top);
}

interface HomeOnboardingTooltipsProps {
  layoutRects?: OnboardingLayoutRects;
  /** Scroll Today by `distance` points so the current target is in view. Negative scrolls up. */
  onRevealTarget?: (distance: number) => void;
  /** The tour is closing, from Skip or from the last step. */
  onFinish?: () => void;
}

export function HomeOnboardingTooltips({ layoutRects, onRevealTarget, onFinish }: HomeOnboardingTooltipsProps) {
  const { colors, isDark } = useTheme();
  const { width: screenW, height: screenH } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const hasSeenHomeTooltips = useUnfoldStore((s) => s.hasSeenHomeTooltips);
  const setHasSeenHomeTooltips = useUnfoldStore((s) => s.setHasSeenHomeTooltips);

  const reducedMotion = useReducedMotion();
  const [currentStep, setCurrentStep] = useState(0);
  const [isVisible, setIsVisible] = useState(true);
  const [tooltipHeight, setTooltipHeight] = useState(TOOLTIP_ESTIMATED_HEIGHT);
  const tabBarHidden = useUIState((s) => s.tabBarHidden);
  const tabBarRowRect = useUIState((s) => s.tabBarRowRect);
  // The tabs step and the visible area come from the measured tab bar row, so
  // the tour waits for it unless the tab bar is hidden.
  const tabBarRow = tabBarHidden ? null : tabBarRowRect;
  const waitingForTabBar = !tabBarHidden && !tabBarRowRect;
  // A target is visible only between these lines.
  const visibleTop = insets.top + 12;
  const visibleBottom = (tabBarRow ? tabBarRow.y : screenH - insets.bottom) - 16;

  const measuredRects = useMemo<Record<string, TargetRect>>(() => {
    if (hasSeenHomeTooltips) return {};
    const rects: Record<string, TargetRect> = {};
    if (tabBarRow) rects.tabs = spotlitTabsRect(tabBarRow, insets.bottom);
    if (layoutRects?.reading) rects.reading = layoutRects.reading;
    if (layoutRects?.context) rects.context = layoutRects.context;
    if (layoutRects?.rhythm) rects.rhythm = layoutRects.rhythm;
    return rects;
  }, [hasSeenHomeTooltips, layoutRects, tabBarRow, insets.bottom]);

  const availableSteps = useMemo(
    () => TOOLTIP_STEPS.filter((tooltipStep) => measuredRects[tooltipStep.targetKey]),
    [measuredRects],
  );
  const stepIndex = Math.min(currentStep, Math.max(availableSteps.length - 1, 0));
  const step = availableSteps[stepIndex];

  // The tour lives in a Modal, which unmounts at once, so it fades out first.
  // While it fades, it takes no taps and asks for no scroll.
  const [closing, setClosing] = useState(false);
  const overlayOpacity = useSharedValue(1);
  const overlayFadeStyle = useAnimatedStyle(() => ({ opacity: overlayOpacity.value }));
  const finish = useCallback(() => {
    setIsVisible(false);
    setHasSeenHomeTooltips(true);
  }, [setHasSeenHomeTooltips]);
  const dismiss = useCallback(() => {
    setClosing(true);
    onFinish?.();
    if (reducedMotion) {
      finish();
      return;
    }
    overlayOpacity.value = withTiming(0, { duration: Duration.fast, easing: Ease.out }, (done) => {
      if (done) runOnJS(finish)();
    });
  }, [finish, onFinish, overlayOpacity, reducedMotion]);

  const handleNext = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (currentStep < availableSteps.length - 1) {
      setTooltipHeight(TOOLTIP_ESTIMATED_HEIGHT);
      setCurrentStep((prev) => prev + 1);
    } else {
      dismiss();
    }
  }, [availableSteps.length, currentStep, dismiss]);

  // A target outside the visible area is scrolled into view before the tour points at it.
  // The tour shows a dim screen until Today publishes positions that show the target, or
  // until REVEAL_TIMEOUT_MS passes. A step asks once per target position, so a scroll
  // that cannot go further does not loop.
  const contentTarget = step && step.targetKey !== 'tabs' ? step.targetKey : null;
  const contentRect = contentTarget ? measuredRects[contentTarget] ?? null : null;
  const distance = contentRect && !waitingForTabBar ? revealDistance(contentRect, visibleTop, visibleBottom) : 0;
  const needsReveal = !closing && onRevealTarget !== undefined && Math.abs(distance) >= 1;
  const lastRevealRef = useRef<{ step: number; rect: TargetRect } | null>(null);
  useEffect(() => {
    if (!needsReveal || !contentRect) return;
    const last = lastRevealRef.current;
    if (last && last.step === stepIndex && sameTargetRect(last.rect, contentRect)) return;
    lastRevealRef.current = { step: stepIndex, rect: contentRect };
    onRevealTarget?.(distance);
  }, [needsReveal, contentRect, stepIndex, distance, onRevealTarget]);
  const [revealTimedOutStep, setRevealTimedOutStep] = useState(-1);
  useEffect(() => {
    if (!needsReveal) return;
    const timer = setTimeout(() => setRevealTimedOutStep(stepIndex), REVEAL_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [needsReveal, stepIndex]);
  const waitingForReveal = needsReveal && revealTimedOutStep !== stepIndex;

  // Don't render if already seen or dismissed, or before the tab bar reports its row
  if (hasSeenHomeTooltips || !isVisible || !step || waitingForTabBar) return null;

  // Don't render until we have the current step's target measured
  const targetRect = measuredRects[step.targetKey] ?? null;
  if (!targetRect) return null;

  const isLastStep = stepIndex === availableSteps.length - 1;
  const tooltipBg = colors.backgroundElevated;
  const tooltipBodyColor = isDark ? 'rgba(245, 240, 235, 0.74)' : colors.textMuted;
  const tooltipBorder = isDark ? 'rgba(245, 240, 235, 0.14)' : 'rgba(28, 23, 16, 0.08)';
  const spotlightStroke = isDark ? 'rgba(220, 180, 96, 0.62)' : 'rgba(139, 99, 32, 0.34)';
  const spotlightHalo = isDark ? 'rgba(220, 180, 96, 0.14)' : 'rgba(139, 99, 32, 0.10)';
  const stepTuning = STEP_VISUAL_TUNING[step.targetKey];

  // Calculate tooltip position
  const GAP = stepTuning.tooltipGap;
  const TOOLTIP_MARGIN_H = 24;

  let tooltipTop: number;
  let arrowDirection: 'up' | 'down';
  const activeHeight = tooltipHeight > 0 ? tooltipHeight : TOOLTIP_ESTIMATED_HEIGHT;

  const bottomGuard = visibleBottom;
  const belowFits = targetRect.y + targetRect.height + stepTuning.spotlightPadding + GAP + activeHeight <= bottomGuard;
  const shouldPlaceBelow = step.placement === 'below' || (step.placement === 'auto' && belowFits);

  if (shouldPlaceBelow) {
    const spotlightBottom = targetRect.y + targetRect.height + stepTuning.spotlightPadding;
    tooltipTop = spotlightBottom + GAP;
    arrowDirection = 'up';
  } else {
    tooltipTop = targetRect.y - stepTuning.spotlightPadding - GAP - activeHeight;
    arrowDirection = 'down';
  }

  const minTooltipTop = visibleTop;
  const maxTooltipTop = Math.max(minTooltipTop, bottomGuard - activeHeight);
  tooltipTop = Math.max(minTooltipTop, Math.min(tooltipTop, maxTooltipTop));

  const tooltipWidth = screenW - TOOLTIP_MARGIN_H * 2;
  const arrowCenterX = Math.max(
    Radius.card + TOOLTIP_ARROW_WIDTH / 2 + 2,
    Math.min(
      targetRect.x + targetRect.width / 2 - TOOLTIP_MARGIN_H,
      tooltipWidth - Radius.card - TOOLTIP_ARROW_WIDTH / 2 - 2,
    ),
  );
  const tooltipBubblePath = buildBubblePath({
    width: tooltipWidth,
    height: activeHeight,
    radius: Radius.card,
    tail: {
      edge: arrowDirection === 'up' ? 'top' : 'bottom',
      centerX: arrowCenterX,
      width: TOOLTIP_ARROW_WIDTH,
      height: TOOLTIP_ARROW_HEIGHT,
    },
    strokeWidth: TOOLTIP_STROKE_WIDTH,
  });
  const tooltipSvgHeight = activeHeight + TOOLTIP_ARROW_HEIGHT + TOOLTIP_STROKE_WIDTH;

  // Build rectangular spotlight
  const spotX = targetRect.x - stepTuning.spotlightPadding;
  const spotY = targetRect.y - stepTuning.spotlightPadding;
  const spotW = targetRect.width + stepTuning.spotlightPadding * 2;
  const spotH = targetRect.height + stepTuning.spotlightPadding * 2;

  const overlay = (
    <Animated.View
      entering={reducedMotion ? undefined : FadeIn.duration(Duration.normal).easing(Ease.out)}
      style={styles.overlay}
      pointerEvents="box-none"
    >
      {/* Backdrop — blocks interaction but no onPress (user must use Next/Skip) */}
      <View style={StyleSheet.absoluteFill} pointerEvents="auto">
        <Svg width={screenW} height={screenH} style={StyleSheet.absoluteFill}>
          <Defs>
            <Mask id="spotlightMask">
              {/* White = backdrop visible (dimmed) */}
              <Rect x="0" y="0" width={screenW} height={screenH} fill="white" />
              {/* Feathered rectangular hole — concentric rects */}
              <Rect
                x={spotX - FEATHER_SIZE}
                y={spotY - FEATHER_SIZE}
                width={spotW + FEATHER_SIZE * 2}
                height={spotH + FEATHER_SIZE * 2}
                rx={stepTuning.cornerRadius + FEATHER_SIZE * 0.6}
                fill="black"
                opacity="0.2"
              />
              <Rect
                x={spotX - FEATHER_SIZE * 0.6}
                y={spotY - FEATHER_SIZE * 0.6}
                width={spotW + FEATHER_SIZE * 1.2}
                height={spotH + FEATHER_SIZE * 1.2}
                rx={stepTuning.cornerRadius + FEATHER_SIZE * 0.3}
                fill="black"
                opacity="0.3"
              />
              <Rect
                x={spotX - FEATHER_SIZE * 0.3}
                y={spotY - FEATHER_SIZE * 0.3}
                width={spotW + FEATHER_SIZE * 0.6}
                height={spotH + FEATHER_SIZE * 0.6}
                rx={stepTuning.cornerRadius + FEATHER_SIZE * 0.15}
                fill="black"
                opacity="0.4"
              />
              {/* Solid hole matching target bounds */}
              <Rect
                testID="home-tooltip-spotlight"
                x={spotX}
                y={spotY}
                width={spotW}
                height={spotH}
                rx={stepTuning.cornerRadius}
                fill="black"
              />
            </Mask>
          </Defs>
          <Rect
            x="0"
            y="0"
            width={screenW}
            height={screenH}
            fill={`rgba(0, 0, 0, ${BACKDROP_OPACITY})`}
            mask="url(#spotlightMask)"
          />
          <Rect
            x={spotX - 2}
            y={spotY - 2}
            width={spotW + 4}
            height={spotH + 4}
            rx={stepTuning.cornerRadius + 2}
            fill="none"
            stroke={spotlightHalo}
            strokeWidth={6}
          />
          <Rect
            x={spotX}
            y={spotY}
            width={spotW}
            height={spotH}
            rx={stepTuning.cornerRadius}
            fill="none"
            stroke={spotlightStroke}
            strokeWidth={1.5}
          />
        </Svg>
      </View>

      {/* Tooltip card */}
      <Animated.View
        key={`tooltip-${currentStep}`}
        entering={reducedMotion ? undefined : FadeIn.duration(Duration.normal).easing(Ease.out).delay(currentStep === 0 ? 100 : 0)}
        exiting={reducedMotion ? undefined : FadeOut.duration(Duration.fast).easing(Ease.out)}
        onLayout={(e) => {
          const h = e.nativeEvent.layout.height;
          if (h > 0 && Math.abs(h - tooltipHeight) > 2) setTooltipHeight(h);
        }}
        style={[
          styles.tooltipCard,
          {
            top: tooltipTop,
            left: TOOLTIP_MARGIN_H,
            right: TOOLTIP_MARGIN_H,
          },
        ]}
        pointerEvents="box-none"
      >
        {/* Single-path card + arrow outline. The notch is not a separate shape. */}
        <Svg
          width={tooltipWidth}
          height={tooltipSvgHeight}
          viewBox={`0 0 ${tooltipWidth} ${tooltipSvgHeight}`}
          style={{
            position: 'absolute',
            left: 0,
            top: arrowDirection === 'up' ? -TOOLTIP_ARROW_HEIGHT : 0,
            overflow: 'visible',
          }}
          pointerEvents="none"
        >
          <Path
            d={tooltipBubblePath}
            fill={tooltipBg}
            stroke={tooltipBorder}
            strokeWidth={TOOLTIP_STROKE_WIDTH}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        </Svg>
        <Text
          style={{
            fontFamily: FontFamily.uiSemiBold,
            fontSize: 15,
            color: colors.text,
            letterSpacing: -0.2,
            marginBottom: 4,
          }}
        >
          {step.title}
        </Text>
        <Text
          style={{
            fontFamily: FontFamily.ui,
            fontSize: 13,
            color: tooltipBodyColor,
            lineHeight: 18,
            marginBottom: 14,
          }}
        >
          {step.message}
        </Text>

        <View style={styles.bottomRow}>
          <View style={styles.dotsRow}>
            {availableSteps.map((_, index) => (
              <View
                key={index}
                style={[
                  styles.dot,
                  {
                    backgroundColor:
                      index === stepIndex
                        ? colors.accent
                        : isDark
                          ? 'rgba(245, 240, 235, 0.15)'
                          : 'rgba(28, 23, 16, 0.10)',
                    width: index === stepIndex ? 14 : 5,
                  },
                ]}
              />
            ))}
          </View>

          <View style={styles.actionsRow}>
            {!isLastStep && (
              <TouchableOpacity
                activeOpacity={0.7}
                onPress={dismiss}
                accessibilityRole="button"
                accessibilityLabel="Skip"
                style={styles.skipButton}
              >
                <Text
                  style={{
                    fontFamily: FontFamily.ui,
                    fontSize: 13,
                    color: colors.textSubtle,
                  }}
                >
                  Skip
                </Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              activeOpacity={0.7}
              onPress={handleNext}
              accessibilityRole="button"
              accessibilityLabel={isLastStep ? 'Got it' : 'Next'}
              style={[styles.nextButton, { backgroundColor: colors.accent }]}
            >
              <Text
                style={{
                  fontFamily: FontFamily.uiSemiBold,
                  fontSize: 13,
                  color: colors.background,
                }}
              >
                {isLastStep ? 'Got it' : 'Next'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Animated.View>
    </Animated.View>
  );

  // A Modal draws above the tab bar, so the dim and the spotlight reach the tabs.
  return (
    <Modal visible transparent animationType="none" statusBarTranslucent onRequestClose={dismiss}>
      {/* The fade-out sits on this wrapper and the fade-in on the overlay. On one
          view, the entering animation could overwrite the animated opacity. */}
      <Animated.View style={[StyleSheet.absoluteFill, overlayFadeStyle]} pointerEvents={closing ? 'none' : 'box-none'}>
        {waitingForReveal ? (
          <View style={[StyleSheet.absoluteFill, { backgroundColor: `rgba(0, 0, 0, ${BACKDROP_OPACITY})` }]} />
        ) : (
          overlay
        )}
      </Animated.View>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFill,
    zIndex: 1000,
  },
  tooltipCard: {
    position: 'absolute',
    overflow: 'visible',
    paddingHorizontal: 18,
    paddingTop: Spacing['4'],
    paddingBottom: 14,
    ...Shadow.lg,
  },
  bottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  dotsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  dot: {
    height: 5,
    borderRadius: 2.5,
  },
  actionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing['3'],
  },
  skipButton: {
    paddingVertical: 6,
    paddingHorizontal: Spacing['2'],
  },
  nextButton: {
    paddingHorizontal: 18,
    paddingVertical: Spacing['2'],
    borderRadius: Radius.sm,
  },
});
