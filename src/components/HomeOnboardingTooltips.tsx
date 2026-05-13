import { useState, useCallback, useMemo } from 'react';
import { View, Text, TouchableOpacity, useWindowDimensions, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeIn, FadeOut, useReducedMotion } from 'react-native-reanimated';
import { Duration, Ease } from '@/constants/animations';
import Svg, { Defs, Rect, Mask } from 'react-native-svg';
import * as Haptics from 'expo-haptics';
import { FontFamily } from '@/constants/fonts';
import { useTheme } from '@/lib/theme';
import { useUnfoldStore } from '@/lib/store';
import { Radius } from '@/constants/radius';
import { Shadow } from '@/constants/shadows';
import { Spacing } from '@/constants/spacing';

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
    title: 'Today’s thread',
    message: 'Your next reading lives here. If a day slips by, Today gently brings you back to the right place.',
    targetKey: 'reading',
    placement: 'below',
  },
  {
    title: 'Companion check-in',
    message: 'When a prompt appears, use it to reflect on the reading without leaving Today.',
    targetKey: 'context',
    placement: 'auto',
  },
  {
    title: 'Daily Rhythm',
    message: 'A quiet signal of consistency — not a scoreboard. One faithful day at a time.',
    targetKey: 'rhythm',
    placement: 'above',
  },
  {
    title: 'Read, Ask & Write',
    message: 'Bible, Companion, and Journal are always one tap away whenever you want to read, ask, or write.',
    targetKey: 'tabs',
    placement: 'above',
  },
];

// ---------------------------------------------------------------------------
// SVG spotlight mask — full screen dark + feathered rounded-rect hole
// ---------------------------------------------------------------------------

const SPOTLIGHT_PADDING = 10;
const BACKDROP_OPACITY = 0.65;
const FEATHER_SIZE = 14;
const SPOT_CORNER_RADIUS = 14;

// ---------------------------------------------------------------------------
// Arrow triangle component
// ---------------------------------------------------------------------------

const ARROW_SIZE = 10;

function Arrow({ direction, color }: { direction: 'up' | 'down'; color: string }) {
  if (direction === 'down') {
    return (
      <View
        style={{
          width: 0,
          height: 0,
          borderLeftWidth: ARROW_SIZE,
          borderRightWidth: ARROW_SIZE,
          borderTopWidth: ARROW_SIZE,
          borderLeftColor: 'transparent',
          borderRightColor: 'transparent',
          borderTopColor: color,
        }}
      />
    );
  }
  return (
    <View
      style={{
        width: 0,
        height: 0,
        borderLeftWidth: ARROW_SIZE,
        borderRightWidth: ARROW_SIZE,
        borderBottomWidth: ARROW_SIZE,
        borderLeftColor: 'transparent',
        borderRightColor: 'transparent',
        borderBottomColor: color,
      }}
    />
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

const TAB_BAR_HEIGHT = 49;
const TAB_BAR_PADDING_H = Spacing['6']; // matches _layout.tsx paddingHorizontal
const TOOLTIP_ESTIMATED_HEIGHT = 130;

/** Compute the Bible / Companion / Journal rect from the fixed bottom navigation. */
function computeTabBarRect(screenW: number, screenH: number, bottomInset: number): TargetRect {
  const usableWidth = screenW - TAB_BAR_PADDING_H * 2;
  const tabWidth = usableWidth / 4;
  const tabBarTop = screenH - TAB_BAR_HEIGHT - bottomInset;

  return {
    x: TAB_BAR_PADDING_H + tabWidth,
    y: tabBarTop + 4,
    width: tabWidth * 3,
    height: TAB_BAR_HEIGHT - 4,
  };
}

interface HomeOnboardingTooltipsProps {
  layoutRects?: OnboardingLayoutRects;
}

export function HomeOnboardingTooltips({ layoutRects }: HomeOnboardingTooltipsProps) {
  const { colors, isDark } = useTheme();
  const { width: screenW, height: screenH } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const hasSeenHomeTooltips = useUnfoldStore((s) => s.hasSeenHomeTooltips);
  const setHasSeenHomeTooltips = useUnfoldStore((s) => s.setHasSeenHomeTooltips);

  const reducedMotion = useReducedMotion();
  const [currentStep, setCurrentStep] = useState(0);
  const [isVisible, setIsVisible] = useState(true);
  const [tooltipHeight, setTooltipHeight] = useState(TOOLTIP_ESTIMATED_HEIGHT);

  const measuredRects = useMemo<Record<string, TargetRect>>(() => {
    if (hasSeenHomeTooltips) return {};
    const rects: Record<string, TargetRect> = {};
    rects.tabs = computeTabBarRect(screenW, screenH, insets.bottom);
    if (layoutRects?.reading) rects.reading = layoutRects.reading;
    if (layoutRects?.context) rects.context = layoutRects.context;
    if (layoutRects?.rhythm) rects.rhythm = layoutRects.rhythm;
    return rects;
  }, [hasSeenHomeTooltips, layoutRects, screenW, screenH, insets.bottom]);

  const availableSteps = useMemo(
    () => TOOLTIP_STEPS.filter((tooltipStep) => measuredRects[tooltipStep.targetKey]),
    [measuredRects],
  );
  const stepIndex = Math.min(currentStep, Math.max(availableSteps.length - 1, 0));
  const step = availableSteps[stepIndex];

  const dismiss = useCallback(() => {
    setIsVisible(false);
    setHasSeenHomeTooltips(true);
  }, [setHasSeenHomeTooltips]);

  const handleNext = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (currentStep < availableSteps.length - 1) {
      setTooltipHeight(TOOLTIP_ESTIMATED_HEIGHT);
      setCurrentStep((prev) => prev + 1);
    } else {
      dismiss();
    }
  }, [availableSteps.length, currentStep, dismiss]);

  // Don't render if already seen or dismissed
  if (hasSeenHomeTooltips || !isVisible || !step) return null;

  // Don't render until we have the current step's target measured
  const targetRect = measuredRects[step.targetKey] ?? null;
  if (!targetRect) return null;

  const isLastStep = stepIndex === availableSteps.length - 1;
  const tooltipBg = colors.backgroundElevated;
  const tooltipBorder = isDark ? 'rgba(245, 240, 235, 0.12)' : 'rgba(28, 23, 16, 0.08)';
  const spotlightStroke = isDark ? 'rgba(200, 165, 92, 0.42)' : 'rgba(139, 99, 32, 0.28)';

  // Calculate tooltip position
  const GAP = 14;
  const TOOLTIP_MARGIN_H = 24;

  let tooltipTop: number;
  let arrowDirection: 'up' | 'down';
  const activeHeight = tooltipHeight > 0 ? tooltipHeight : TOOLTIP_ESTIMATED_HEIGHT;

  const bottomGuard = screenH - insets.bottom - TAB_BAR_HEIGHT - 16;
  const belowFits = targetRect.y + targetRect.height + SPOTLIGHT_PADDING + GAP + activeHeight <= bottomGuard;
  const shouldPlaceBelow = step.placement === 'below' || (step.placement === 'auto' && belowFits);

  if (shouldPlaceBelow) {
    const spotlightBottom = targetRect.y + targetRect.height + SPOTLIGHT_PADDING;
    tooltipTop = spotlightBottom + GAP;
    arrowDirection = 'up';
  } else {
    tooltipTop = targetRect.y - SPOTLIGHT_PADDING - GAP - activeHeight;
    arrowDirection = 'down';
  }

  const minTooltipTop = insets.top + 12;
  const maxTooltipTop = Math.max(minTooltipTop, bottomGuard - activeHeight);
  tooltipTop = Math.max(minTooltipTop, Math.min(tooltipTop, maxTooltipTop));

  const tooltipWidth = screenW - TOOLTIP_MARGIN_H * 2;
  const arrowLeft = Math.max(
    18,
    Math.min(
      targetRect.x + targetRect.width / 2 - ARROW_SIZE - TOOLTIP_MARGIN_H,
      tooltipWidth - ARROW_SIZE * 2 - 18,
    ),
  );

  // Build rectangular spotlight
  const spotX = targetRect.x - SPOTLIGHT_PADDING;
  const spotY = targetRect.y - SPOTLIGHT_PADDING;
  const spotW = targetRect.width + SPOTLIGHT_PADDING * 2;
  const spotH = targetRect.height + SPOTLIGHT_PADDING * 2;

  return (
    <Animated.View
      entering={reducedMotion ? undefined : FadeIn.duration(Duration.normal).easing(Ease.out)}
      exiting={reducedMotion ? undefined : FadeOut.duration(Duration.fast).easing(Ease.out)}
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
                rx={SPOT_CORNER_RADIUS + FEATHER_SIZE * 0.6}
                fill="black"
                opacity="0.2"
              />
              <Rect
                x={spotX - FEATHER_SIZE * 0.6}
                y={spotY - FEATHER_SIZE * 0.6}
                width={spotW + FEATHER_SIZE * 1.2}
                height={spotH + FEATHER_SIZE * 1.2}
                rx={SPOT_CORNER_RADIUS + FEATHER_SIZE * 0.3}
                fill="black"
                opacity="0.3"
              />
              <Rect
                x={spotX - FEATHER_SIZE * 0.3}
                y={spotY - FEATHER_SIZE * 0.3}
                width={spotW + FEATHER_SIZE * 0.6}
                height={spotH + FEATHER_SIZE * 0.6}
                rx={SPOT_CORNER_RADIUS + FEATHER_SIZE * 0.15}
                fill="black"
                opacity="0.4"
              />
              {/* Solid hole matching target bounds */}
              <Rect
                x={spotX}
                y={spotY}
                width={spotW}
                height={spotH}
                rx={SPOT_CORNER_RADIUS}
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
            x={spotX}
            y={spotY}
            width={spotW}
            height={spotH}
            rx={SPOT_CORNER_RADIUS}
            fill="none"
            stroke={spotlightStroke}
            strokeWidth={1}
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
            backgroundColor: tooltipBg,
            borderColor: tooltipBorder,
          },
        ]}
        pointerEvents="box-none"
      >
        {/* Arrow — inside card so it renders above the SVG backdrop */}
        <View
          style={{
            position: 'absolute',
            ...(arrowDirection === 'up'
              ? { top: -(ARROW_SIZE - 1) }
              : { bottom: -(ARROW_SIZE - 1) }),
            left: arrowLeft,
          }}
          pointerEvents="none"
        >
          <Arrow direction={arrowDirection} color={tooltipBg} />
        </View>
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
            color: colors.textMuted,
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
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 1000,
  },
  tooltipCard: {
    position: 'absolute',
    overflow: 'visible',
    borderRadius: Radius.card,
    borderWidth: 1,
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
