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

type TargetKey = 'reading' | 'companion' | 'bible' | 'journal' | 'streak';

interface TooltipStep {
  title: string;
  message: string;
  targetKey: TargetKey;
  placement: 'below' | 'above';
}

export interface OnboardingLayoutRects {
  reading: TargetRect | null;
  streak: TargetRect | null;
}

// ---------------------------------------------------------------------------
// Steps
// ---------------------------------------------------------------------------

const TOOLTIP_STEPS: TooltipStep[] = [
  {
    title: 'Your Daily Reading',
    message: 'Made for you, based on what you shared. Tap here to start today\u2019s devotional.',
    targetKey: 'reading',
    placement: 'below',
  },
  {
    title: 'Your Companion',
    message: 'Ask questions, go deeper, or just talk about what you\u2019re reading.',
    targetKey: 'companion',
    placement: 'above',
  },
  {
    title: 'Your Bible',
    message: 'The full Bible is here. Highlight verses, take notes, and pick up where you left off.',
    targetKey: 'bible',
    placement: 'above',
  },
  {
    title: 'Your Journal',
    message: 'Reflect on what you\u2019re reading. Entries are linked to each day.',
    targetKey: 'journal',
    placement: 'above',
  },
  {
    title: 'Your Streak',
    message: 'Read each day to build momentum. Small steps add up.',
    targetKey: 'streak',
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

/** Compute tab bar item rects from screen dimensions — tabs are fixed at bottom */
function computeTabRects(screenW: number, screenH: number, bottomInset: number): Record<string, TargetRect> {
  // 4 visible tabs: Today(0), Bible(1), Companion(2), Journal(3)
  // Tab bar has paddingHorizontal: Spacing['6'] = 24
  const tabCount = 4;
  const usableWidth = screenW - TAB_BAR_PADDING_H * 2;
  const tabWidth = usableWidth / tabCount;
  const tabBarTop = screenH - TAB_BAR_HEIGHT - bottomInset;
  const iconSize = 28;

  const makeTabRect = (index: number): TargetRect => ({
    x: TAB_BAR_PADDING_H + tabWidth * index + (tabWidth - iconSize) / 2,
    y: tabBarTop + 6,
    width: iconSize,
    height: iconSize,
  });

  return {
    bible: makeTabRect(1),
    companion: makeTabRect(2),
    journal: makeTabRect(3),
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
    const tabRects = computeTabRects(screenW, screenH, insets.bottom);
    Object.assign(rects, tabRects);
    if (layoutRects?.reading) rects.reading = layoutRects.reading;
    if (layoutRects?.streak) rects.streak = layoutRects.streak;
    return rects;
  }, [hasSeenHomeTooltips, layoutRects, screenW, screenH, insets.bottom]);

  const step = TOOLTIP_STEPS[currentStep];

  const dismiss = useCallback(() => {
    setIsVisible(false);
    setHasSeenHomeTooltips(true);
  }, [setHasSeenHomeTooltips]);

  const handleNext = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (currentStep < TOOLTIP_STEPS.length - 1) {
      setTooltipHeight(TOOLTIP_ESTIMATED_HEIGHT);
      setCurrentStep((prev) => prev + 1);
    } else {
      dismiss();
    }
  }, [currentStep, dismiss]);

  // Don't render if already seen or dismissed
  if (hasSeenHomeTooltips || !isVisible || !step) return null;

  // Don't render until we have the current step's target measured
  const targetRect = measuredRects[step.targetKey] ?? null;
  if (!targetRect) return null;

  const isLastStep = currentStep === TOOLTIP_STEPS.length - 1;
  const tooltipBg = colors.backgroundElevated;
  const tooltipBorder = isDark ? 'rgba(245, 240, 235, 0.12)' : 'rgba(28, 23, 16, 0.08)';

  // Calculate tooltip position
  const GAP = 14;
  const TOOLTIP_MARGIN_H = 24;

  let tooltipTop: number;
  let arrowDirection: 'up' | 'down';
  const activeHeight = tooltipHeight > 0 ? tooltipHeight : TOOLTIP_ESTIMATED_HEIGHT;

  if (step.placement === 'below') {
    // For "below" placement (reading card), position below the spotlight
    const spotlightBottom = targetRect.y + targetRect.height + SPOTLIGHT_PADDING;
    tooltipTop = spotlightBottom + GAP;
    arrowDirection = 'up';
  } else {
    // For "above" placement (tab items, streak), position above the target
    tooltipTop = targetRect.y - SPOTLIGHT_PADDING - GAP - activeHeight;
    arrowDirection = 'down';
  }

  const arrowLeft = targetRect.x + targetRect.width / 2 - ARROW_SIZE;

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
            left: arrowLeft - TOOLTIP_MARGIN_H,
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
            {TOOLTIP_STEPS.map((_, index) => (
              <View
                key={index}
                style={[
                  styles.dot,
                  {
                    backgroundColor:
                      index === currentStep
                        ? colors.accent
                        : isDark
                          ? 'rgba(245, 240, 235, 0.15)'
                          : 'rgba(28, 23, 16, 0.10)',
                    width: index === currentStep ? 14 : 5,
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
