import { useState, useCallback, useEffect, useRef, type RefObject } from 'react';
import { View, Text, TouchableOpacity, useWindowDimensions, StyleSheet, InteractionManager } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { Duration } from '@/constants/animations';
import Svg, { Path } from 'react-native-svg';
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

interface TargetRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface TooltipStep {
  title: string;
  message: string;
  targetKey: 'reading' | 'streak';
  /** Where the tooltip appears relative to the spotlight */
  placement: 'below' | 'above';
}

export interface OnboardingTargets {
  reading: RefObject<View | null>;
  streak: RefObject<View | null>;
}

// ---------------------------------------------------------------------------
// Steps
// ---------------------------------------------------------------------------

const TOOLTIP_STEPS: TooltipStep[] = [
  {
    title: 'Today\u2019s Reading',
    message: 'Made for you, based on what you shared. Tap the card to begin.',
    targetKey: 'reading',
    placement: 'below',
  },
  {
    title: 'Your Streak',
    message: 'Read each day to build momentum. Small steps add up.',
    targetKey: 'streak',
    placement: 'above',
  },
];

// ---------------------------------------------------------------------------
// SVG spotlight mask — full screen dark + rounded-rect hole
// ---------------------------------------------------------------------------

const SPOTLIGHT_PADDING = 10;
const SPOTLIGHT_RADIUS = 22;
const BACKDROP_OPACITY = 0.55;

function buildMaskPath(
  screenW: number,
  screenH: number,
  rect: TargetRect,
): string {
  // Outer rect (full screen)
  const outer = `M0,0 H${screenW} V${screenH} H0 Z`;

  // Inner rounded rect (the hole) — slightly larger than the target
  const x = rect.x - SPOTLIGHT_PADDING;
  const y = rect.y - SPOTLIGHT_PADDING;
  const w = rect.width + SPOTLIGHT_PADDING * 2;
  const h = rect.height + SPOTLIGHT_PADDING * 2;
  const r = SPOTLIGHT_RADIUS;

  const inner = [
    `M${x + r},${y}`,
    `H${x + w - r}`,
    `A${r},${r} 0 0 1 ${x + w},${y + r}`,
    `V${y + h - r}`,
    `A${r},${r} 0 0 1 ${x + w - r},${y + h}`,
    `H${x + r}`,
    `A${r},${r} 0 0 1 ${x},${y + h - r}`,
    `V${y + r}`,
    `A${r},${r} 0 0 1 ${x + r},${y}`,
    'Z',
  ].join(' ');

  return `${outer} ${inner}`;
}

// ---------------------------------------------------------------------------
// Arrow triangle component
// ---------------------------------------------------------------------------

const ARROW_SIZE = 8;

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

export function HomeOnboardingTooltips({ targets }: { targets: OnboardingTargets }) {
  const { colors, isDark } = useTheme();
  const { width: screenW, height: screenH } = useWindowDimensions();
  const hasSeenHomeTooltips = useUnfoldStore((s) => s.hasSeenHomeTooltips);
  const setHasSeenHomeTooltips = useUnfoldStore((s) => s.setHasSeenHomeTooltips);

  const [currentStep, setCurrentStep] = useState(0);
  const [isVisible, setIsVisible] = useState(true);
  const [targetRect, setTargetRect] = useState<TargetRect | null>(null);

  // Measure the current step's target element
  const step = TOOLTIP_STEPS[currentStep];
  const retryCountRef = useRef(0);
  const MAX_RETRIES = 8;

  useEffect(() => {
    if (hasSeenHomeTooltips || !isVisible) return;
    if (!step || !targets) return;

    const ref = targets[step.targetKey];
    if (!ref?.current) return;

    let cancelled = false;
    retryCountRef.current = 0;

    // Attempt to measure the target view. Retries with increasing delay
    // because views inside a ScrollView with entering animations may not
    // have valid layout dimensions on the first attempt.
    function attemptMeasure() {
      if (cancelled) return;

      const node = ref.current;
      if (!node) return;

      node.measureInWindow((x, y, width, height) => {
        if (cancelled) return;

        if (width > 0 && height > 0) {
          setTargetRect({ x, y, width, height });
        } else if (retryCountRef.current < MAX_RETRIES) {
          retryCountRef.current += 1;
          // Exponential backoff: 200, 400, 600, 800...
          const delay = 200 * retryCountRef.current;
          timerId = setTimeout(attemptMeasure, delay);
        }
      });
    }

    // Wait for all animations/interactions to complete, then start measuring
    let timerId: ReturnType<typeof setTimeout> | undefined;
    const handle = InteractionManager.runAfterInteractions(() => {
      // Extra 500ms for entering animations (FadeIn.delay(100/200).duration(400))
      timerId = setTimeout(attemptMeasure, 500);
    });

    return () => {
      cancelled = true;
      handle.cancel();
      if (timerId) clearTimeout(timerId);
    };
  }, [currentStep, isVisible, hasSeenHomeTooltips, step, targets]);

  const dismiss = useCallback(() => {
    setIsVisible(false);
    setHasSeenHomeTooltips(true);
  }, [setHasSeenHomeTooltips]);

  const handleNext = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (currentStep < TOOLTIP_STEPS.length - 1) {
      setTargetRect(null); // Clear rect so it re-measures for next step
      setCurrentStep((prev) => prev + 1);
    } else {
      dismiss();
    }
  }, [currentStep, dismiss]);

  const handleOverlayPress = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    dismiss();
  }, [dismiss]);

  // Don't render if already seen, dismissed, or step out of bounds
  if (hasSeenHomeTooltips || !isVisible || !step) return null;

  const isLastStep = currentStep === TOOLTIP_STEPS.length - 1;
  const tooltipBg = isDark ? colors.inputBackground : colors.background;
  const tooltipBorder = colors.border;

  // While waiting for measurement, show just the backdrop
  if (!targetRect) {
    return (
      <Animated.View
        entering={FadeIn.duration(Duration.slow)}
        style={styles.overlay}
        pointerEvents="box-none"
      >
        <TouchableOpacity
          activeOpacity={1}
          style={[styles.backdrop, { backgroundColor: `rgba(0, 0, 0, ${BACKDROP_OPACITY})` }]}
          onPress={handleOverlayPress}
          accessibilityRole="button"
          accessibilityLabel="Skip onboarding"
        />
      </Animated.View>
    );
  }

  // Calculate tooltip position
  const GAP = 12; // gap between spotlight edge and tooltip
  const TOOLTIP_MARGIN_H = 24;
  const spotlightBottom = targetRect.y + targetRect.height + SPOTLIGHT_PADDING;
  const spotlightTop = targetRect.y - SPOTLIGHT_PADDING;

  let tooltipTop: number;
  let arrowDirection: 'up' | 'down';

  if (step.placement === 'below') {
    tooltipTop = spotlightBottom + GAP;
    arrowDirection = 'up';
  } else {
    // We'll calculate from the bottom of the tooltip, but we need to estimate height first
    // Tooltip is roughly 80-100px tall. Place it above the spotlight.
    tooltipTop = spotlightTop - GAP - 90;
    arrowDirection = 'down';
  }

  // Arrow horizontal position — center it on the target
  const arrowLeft = targetRect.x + targetRect.width / 2 - ARROW_SIZE;

  // SVG mask path
  const maskPath = buildMaskPath(screenW, screenH, targetRect);

  return (
    <Animated.View
      entering={FadeIn.duration(Duration.slow)}
      exiting={FadeOut.duration(Duration.normal)}
      style={styles.overlay}
      pointerEvents="box-none"
    >
      {/* SVG spotlight mask — dark everywhere except the target */}
      <TouchableOpacity
        activeOpacity={1}
        onPress={handleOverlayPress}
        style={StyleSheet.absoluteFill}
        accessibilityRole="button"
        accessibilityLabel="Skip onboarding"
      >
        <Svg width={screenW} height={screenH} style={StyleSheet.absoluteFill}>
          <Path
            d={maskPath}
            fill={`rgba(0, 0, 0, ${BACKDROP_OPACITY})`}
            fillRule="evenodd"
          />
        </Svg>
      </TouchableOpacity>

      {/* Arrow */}
      <Animated.View
        key={`arrow-${currentStep}`}
        entering={FadeIn.duration(Duration.slow).delay(150)}
        exiting={FadeOut.duration(Duration.fast)}
        style={{
          position: 'absolute',
          top: arrowDirection === 'up' ? tooltipTop - ARROW_SIZE : undefined,
          bottom: arrowDirection === 'down' ? screenH - tooltipTop - 90 - ARROW_SIZE : undefined,
          left: arrowLeft,
        }}
        pointerEvents="none"
      >
        <Arrow direction={arrowDirection} color={tooltipBg} />
      </Animated.View>

      {/* Tooltip card */}
      <Animated.View
        key={`tooltip-${currentStep}`}
        entering={FadeIn.duration(Duration.slow).delay(100)}
        exiting={FadeOut.duration(Duration.normal)}
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
        {/* Title + message */}
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

        {/* Bottom row: dots + actions */}
        <View style={styles.bottomRow}>
          {/* Step dots */}
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

          {/* Actions */}
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
  backdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  tooltipCard: {
    position: 'absolute',
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
