import { useState, useCallback } from 'react';
import { View, Text, TouchableOpacity, useWindowDimensions, StyleSheet } from 'react-native';
import Animated, {
  FadeIn,
  FadeOut,
  FadeInDown,
  FadeOutDown,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { ArrowDownIcon, BookOpenIcon, SunIcon } from 'phosphor-react-native';
import { FontFamily } from '@/constants/fonts';
import { useTheme } from '@/lib/theme';
import { useUnfoldStore } from '@/lib/store';

interface TooltipStep {
  title: string;
  message: string;
  icon: 'journey' | 'streak';
  /** Where the tooltip card appears relative to screen */
  tooltipPosition: 'upper' | 'center';
}

const TOOLTIP_STEPS: TooltipStep[] = [
  {
    title: 'Written for You',
    message: 'This reading was shaped by your story. Tap to start.',
    icon: 'journey',
    tooltipPosition: 'upper',
  },
  {
    title: 'Your Streak',
    message: 'Come back tomorrow to keep it growing. Small steps build lasting rhythms.',
    icon: 'streak',
    tooltipPosition: 'center',
  },
];

function StepIcon({ step, color, size }: { step: TooltipStep['icon']; color: string; size: number }) {
  switch (step) {
    case 'journey':
      return <BookOpenIcon size={size} color={color} weight="light" />;
    case 'streak':
      return <SunIcon size={size} color={color} weight="light" />;
  }
}

export function HomeOnboardingTooltips() {
  const { colors, isDark } = useTheme();
  const { height: screenHeight } = useWindowDimensions();
  const hasSeenHomeTooltips = useUnfoldStore((s) => s.hasSeenHomeTooltips);
  const setHasSeenHomeTooltips = useUnfoldStore((s) => s.setHasSeenHomeTooltips);

  const [currentStep, setCurrentStep] = useState(0);
  const [isVisible, setIsVisible] = useState(true);

  const dismiss = useCallback(() => {
    setIsVisible(false);
    setHasSeenHomeTooltips(true);
  }, [setHasSeenHomeTooltips]);

  const handleNext = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (currentStep < TOOLTIP_STEPS.length - 1) {
      setCurrentStep((prev) => prev + 1);
    } else {
      dismiss();
    }
  }, [currentStep, dismiss]);

  const handleOverlayPress = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    dismiss();
  }, [dismiss]);

  // Don't render if already seen or dismissed
  if (hasSeenHomeTooltips || !isVisible) {
    return null;
  }

  const step = TOOLTIP_STEPS[currentStep];
  const isLastStep = currentStep === TOOLTIP_STEPS.length - 1;

  const getTooltipTopOffset = (): number => {
    switch (step.tooltipPosition) {
      case 'upper':
        return screenHeight * 0.28;
      case 'center':
        return screenHeight * 0.38;
    }
  };

  const tooltipCardBg = colors.inputBackground;
  const tooltipCardBorder = colors.border;

  return (
    <Animated.View
      entering={FadeIn.duration(400)}
      exiting={FadeOut.duration(300)}
      style={styles.overlay}
      pointerEvents="box-none"
    >
      {/* Semi-transparent backdrop -- tap to dismiss */}
      <TouchableOpacity activeOpacity={0.7}
        style={styles.backdrop}
        onPress={handleOverlayPress}
        accessibilityRole="button"
        accessibilityLabel="Skip onboarding tooltips"
        accessibilityHint="Tap anywhere on the dark overlay to dismiss all tooltips"
      />

      {/* Tooltip card */}
      <Animated.View
        key={`tooltip-${currentStep}`}
        entering={FadeInDown.duration(450).delay(100)}
        exiting={FadeOutDown.duration(250)}
        style={[
          styles.tooltipCard,
          {
            top: getTooltipTopOffset(),
            backgroundColor: tooltipCardBg,
            borderColor: tooltipCardBorder,
            shadowColor: colors.accent,
          },
        ]}
        pointerEvents="box-none"
      >
        {/* Accent line at top */}
        <View
          style={{
            width: 32,
            height: 2,
            backgroundColor: colors.accent,
            borderRadius: 1,
            alignSelf: 'center',
            marginBottom: 20,
          }}
        />

        {/* Icon */}
        <View
          style={{
            width: 48,
            height: 48,
            borderRadius: 24,
            backgroundColor: isDark ? 'rgba(245, 240, 235, 0.06)' : 'rgba(28, 23, 16, 0.04)',
            justifyContent: 'center',
            alignItems: 'center',
            alignSelf: 'center',
            marginBottom: 16,
          }}
        >
          <StepIcon step={step.icon} color={colors.accent} size={24} />
        </View>

        {/* Title */}
        <Text
          style={{
            fontFamily: FontFamily.uiSemiBold,
            fontSize: 17,
            color: colors.text,
            textAlign: 'center',
            marginBottom: 8,
            letterSpacing: -0.2,
          }}
        >
          {step.title}
        </Text>

        {/* Message */}
        <Text
          style={{
            fontFamily: FontFamily.ui,
            fontSize: 15,
            color: colors.textMuted,
            textAlign: 'center',
            lineHeight: 22,
            marginBottom: 24,
            paddingHorizontal: 8,
          }}
        >
          {step.message}
        </Text>

        {/* Step indicator dots */}
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
                        : 'rgba(28, 23, 16, 0.12)',
                  width: index === currentStep ? 18 : 6,
                },
              ]}
            />
          ))}
        </View>

        {/* Action button */}
        <TouchableOpacity activeOpacity={0.7}
          onPress={handleNext}
          accessibilityRole="button"
          accessibilityLabel={isLastStep ? 'Got it' : 'Next tooltip'}
          accessibilityHint={
            isLastStep
              ? 'Dismiss the onboarding tooltips'
              : `Go to tooltip ${currentStep + 2} of ${TOOLTIP_STEPS.length}`
          }
        >
          <View
            style={{
              backgroundColor: colors.accent,
              paddingVertical: 14,
              borderRadius: 12,
              alignItems: 'center',
              marginTop: 16,
            }}
          >
            <Text
              style={{
                fontFamily: FontFamily.uiSemiBold,
                fontSize: 15,
                color: colors.background,
                letterSpacing: 0.3,
              }}
            >
              {isLastStep ? 'Got it' : 'Next'}
            </Text>
          </View>
        </TouchableOpacity>

        {/* Skip hint */}
        {!isLastStep && (
          <TouchableOpacity activeOpacity={0.7}
            onPress={dismiss}
            accessibilityRole="button"
            accessibilityLabel="Skip all tooltips"
            style={{ marginTop: 12, alignSelf: 'center' }}
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
      </Animated.View>

      {/* Down arrow indicator pointing toward the spotlighted area */}
      <Animated.View
        key={`arrow-${currentStep}`}
        entering={FadeIn.duration(600).delay(300)}
        exiting={FadeOut.duration(200)}
        style={{
          position: 'absolute',
          top: getTooltipTopOffset() - 36,
          alignSelf: 'center',
        }}
        pointerEvents="none"
      >
        <ArrowDownIcon size={20} color={colors.accent} weight="light" />
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 1000,
    justifyContent: 'flex-start',
    alignItems: 'center',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
  },
  tooltipCard: {
    marginHorizontal: 28,
    paddingHorizontal: 24,
    paddingTop: 24,
    paddingBottom: 20,
    borderRadius: 20,
    borderWidth: 1,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 24,
    elevation: 12,
    width: '85%',
    maxWidth: 360,
  },
  dotsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
  },
  dot: {
    height: 6,
    borderRadius: 3,
  },
});
