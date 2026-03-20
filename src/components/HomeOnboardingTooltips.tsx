import { useState, useCallback, useEffect, type RefObject } from 'react';
import { View, Text, TouchableOpacity, useWindowDimensions, StyleSheet } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import Svg, { Path } from 'react-native-svg';
import * as Haptics from 'expo-haptics';
import { FontFamily } from '@/constants/fonts';
import { useTheme } from '@/lib/theme';
import { useUnfoldStore } from '@/lib/store';

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

  useEffect(() => {
    if (hasSeenHomeTooltips || !isVisible) return;

    const ref = targets[step.targetKey];
    if (!ref?.current) return;

    // Wait for layout to settle, then measure
    const timer = setTimeout(() => {
      ref.current?.measureInWindow((x, y, width, height) => {
        if (width > 0 && height > 0) {
          setTargetRect({ x, y, width, height });
        }
      });
    }, 200);

    return () => clearTimeout(timer);
  }, [currentStep, isVisible, hasSeenHomeTooltips, step.targetKey, targets]);

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

  // Don't render if already seen, dismissed, or target not measured yet
  if (hasSeenHomeTooltips || !isVisible) return null;

  const isLastStep = currentStep === TOOLTIP_STEPS.length - 1;
  const tooltipBg = isDark ? colors.inputBackground : colors.background;
  const tooltipBorder = colors.border;

  // While waiting for measurement, show just the backdrop
  if (!targetRect) {
    return (
      <Animated.View
        entering={FadeIn.duration(300)}
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
      entering={FadeIn.duration(300)}
      exiting={FadeOut.duration(200)}
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
        entering={FadeIn.duration(300).delay(150)}
        exiting={FadeOut.duration(150)}
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
        entering={FadeIn.duration(350).delay(100)}
        exiting={FadeOut.duration(200)}
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
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 18,
    paddingTop: 16,
    paddingBottom: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
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
    gap: 12,
  },
  skipButton: {
    paddingVertical: 6,
    paddingHorizontal: 8,
  },
  nextButton: {
    paddingHorizontal: 18,
    paddingVertical: 8,
    borderRadius: 8,
  },
});
