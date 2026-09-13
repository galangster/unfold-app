import { useCallback, memo } from 'react';
import { useIsFocused } from 'expo-router';
import { View, Text, TouchableOpacity, StyleSheet, useWindowDimensions } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeIn, FadeOut, runOnJS } from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import * as Haptics from 'expo-haptics';
import { FontFamily, FontSize } from '@/constants/fonts';
import { Spacing } from '@/constants/spacing';
import { Radius } from '@/constants/radius';
import { Duration, Ease } from '@/constants/animations';
import { Typography } from '@/constants/typography';
import { CompanionOrb } from '@/components/CompanionOrb';
import {
  FEATURE_PAGES,
  CardAnimation,
  AnimatedHeadline,
  AnimatedBody,
} from '@/app/how-it-works';
import type { FeatureCard } from '@/app/how-it-works';
import type { ColorTheme } from '@/constants/colors';
import { COMPANION_INTRO_BODY } from '@/lib/support-clarity';
import { COMPANION_PERSONALITIES, type CompanionPersonality } from '@/lib/companion-personality';
import { useAccessibleAnimation } from '@/hooks/useAccessibility';

const SWIPE_VELOCITY = 500;

// Companion introduction card — inserted into the carousel
const COMPANION_CARD: FeatureCard & { type: 'companion' } = {
  headline: 'Meet your companion',
  body: COMPANION_INTRO_BODY,
  animation: 'orb',
  type: 'companion',
};

// All pages: features + companion card inserted after the first 3
const ALL_PAGES = [
  ...FEATURE_PAGES.slice(0, 3),
  COMPANION_CARD,
  ...FEATURE_PAGES.slice(3),
];

interface Props {
  colors: ColorTheme;
  companionPersonality: CompanionPersonality;
  onCompanionPersonalityChange: (personality: CompanionPersonality) => void;
  currentPage: number;
  onPageChange: (page: number | ((prev: number) => number)) => void;
  onComplete: () => void;
}

export const FeatureSummaryCarousel = memo(function FeatureSummaryCarousel({
  colors,
  companionPersonality,
  onCompanionPersonalityChange,
  currentPage,
  onPageChange,
  onComplete,
}: Props) {
  const insets = useSafeAreaInsets();
  const { width: viewportWidth, fontScale } = useWindowDimensions();
  const isFocused = useIsFocused();
  const { reducedMotion } = useAccessibleAnimation();
  const swipeThreshold = viewportWidth * 0.25;
  const page = ALL_PAGES[currentPage];
  const isLastPage = currentPage === ALL_PAGES.length - 1;
  const isCompanionPage = 'type' in page && page.type === 'companion';
  const handleContinue = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (isLastPage) {
      onComplete();
    } else {
      onPageChange((p) => Math.min((typeof p === 'number' ? p : currentPage) + 1, ALL_PAGES.length - 1));
    }
  }, [currentPage, isLastPage, onComplete, onPageChange]);

  const handleSwipeLeft = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onPageChange((p) => Math.min((typeof p === 'number' ? p : currentPage) + 1, ALL_PAGES.length - 1));
  }, [currentPage, onPageChange]);

  const handleSwipeRight = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onPageChange((p) => Math.max((typeof p === 'number' ? p : currentPage) - 1, 0));
  }, [currentPage, onPageChange]);

  const swipeGesture = Gesture.Pan()
    .activeOffsetX([-20, 20])
    .failOffsetY([-15, 15])
    .onEnd((e) => {
      if (e.translationX < -swipeThreshold || e.velocityX < -SWIPE_VELOCITY) {
        runOnJS(handleSwipeLeft)();
      } else if (e.translationX > swipeThreshold || e.velocityX > SWIPE_VELOCITY) {
        runOnJS(handleSwipeRight)();
      }
    });

  return (
    <View style={{ flex: 1 }}>
      {/* Swipeable pages */}
      <GestureDetector gesture={swipeGesture}>
        <View style={{ flex: 1 }}>
          <Animated.View
            key={currentPage}
            entering={reducedMotion ? undefined : FadeIn.duration(Duration.normal).easing(Ease.out)}
            exiting={reducedMotion ? undefined : FadeOut.duration(Duration.fast).easing(Ease.out)}
            style={StyleSheet.absoluteFill}
          >
            <KeyboardAwareScrollView
              style={{ flex: 1 }}
              contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: Spacing['8'], paddingVertical: Spacing['6'] }}
              keyboardShouldPersistTaps="handled"
              bottomOffset={24}
            >
              <View style={{ alignItems: 'center', gap: 36, alignSelf: 'stretch' }}>
                {/* Animation or companion orb */}
                <View>
                  {isCompanionPage ? (
                    <CompanionOrb
                      accentColor={colors.accent}
                      size={96}
                      isActive
                      showBadge={false}
                      expression="welcome"
                      idleStyle="joyful"
                      active={isCompanionPage && isFocused}
                    />
                  ) : (
                    <CardAnimation
                      type={page.animation}
                      accent={colors.accent}
                      reducedMotion={reducedMotion}
                    />
                  )}
                </View>

                <View style={{ gap: 12, alignSelf: 'stretch' }}>
                  <AnimatedHeadline
                    key={`feature-headline-${fontScale}`}
                    text={page.headline}
                    color={colors.text}
                    pageKey={currentPage}
                    reducedMotion={reducedMotion}
                  />
                  <AnimatedBody
                    key={`feature-body-${fontScale}`}
                    text={page.body}
                    color={colors.textMuted}
                    pageKey={currentPage}
                    reducedMotion={reducedMotion}
                  />

                  {/* Companion personality choices — staggered entrance top to bottom */}
                  {isCompanionPage && (
                    <Animated.View
                      entering={reducedMotion ? undefined : FadeIn.delay(600).duration(Duration.slow).easing(Ease.out)}
                      accessibilityRole="radiogroup"
                      accessibilityLabel="Companion personality"
                      style={styles.personalityGroup}
                    >
                      <Text key={`personality-prompt-${fontScale}`} style={[styles.personalityPrompt, { color: colors.textMuted }]}>How should your companion meet you?</Text>
                      {COMPANION_PERSONALITIES.map((option) => {
                        const selected = companionPersonality === option.value;
                        return (
                          <TouchableOpacity
                            key={option.value}
                            accessibilityRole="radio"
                            accessibilityState={{ checked: selected }}
                            onPress={() => onCompanionPersonalityChange(option.value)}
                            activeOpacity={0.76}
                            style={[
                              styles.personalityChoice,
                              {
                                backgroundColor: colors.inputBackground,
                                borderColor: selected ? colors.accent : colors.border,
                              },
                            ]}
                          >
                            <Text key={`personality-label-${fontScale}`} style={[styles.personalityLabel, { color: colors.text }]}>{option.label}</Text>
                            <Text key={`personality-description-${fontScale}`} style={[styles.personalityDescription, { color: colors.textMuted }]}>{option.description}</Text>
                          </TouchableOpacity>
                        );
                      })}
                    </Animated.View>
                  )}
                </View>
              </View>
            </KeyboardAwareScrollView>
          </Animated.View>
        </View>
      </GestureDetector>

      {/* Bottom: page dots + continue button */}
      <View style={{ paddingHorizontal: Spacing['6'], paddingBottom: Math.max(insets.bottom, Spacing['4']) }}>
        {/* Page dots */}
        <View
          accessible
          accessibilityRole="text"
          accessibilityLabel={`Step ${currentPage + 1} of ${ALL_PAGES.length}`}
          style={{ flexDirection: 'row', justifyContent: 'flex-start', alignItems: 'center', gap: 6, marginBottom: Spacing['6'] }}
        >
          {ALL_PAGES.map((_, index) => (
            <View
              key={index}
              accessible={false}
              importantForAccessibility="no"
              style={{
                width: index === currentPage ? 20 : 6,
                height: 6,
                borderRadius: 3,
                backgroundColor: index <= currentPage ? colors.accent : colors.border,
              }}
            />
          ))}
        </View>

        {/* Continue button */}
        <TouchableOpacity
          activeOpacity={0.7}
          onPress={handleContinue}
          accessibilityRole="button"
          accessibilityLabel={isLastPage ? 'Continue' : 'Next'}
        >
          <View style={{
            paddingVertical: Spacing['4'],
            borderRadius: Radius.md,
            alignItems: 'center',
            backgroundColor: colors.accent,
          }}>
            <Text key={`continue-font-${fontScale}`} style={{
              fontFamily: FontFamily.uiMedium,
              fontSize: FontSize.base,
              color: colors.background,
              letterSpacing: 0.3,
            }}>
              {isLastPage ? 'Continue' : 'Next'}
            </Text>
          </View>
        </TouchableOpacity>
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  personalityGroup: {
    marginTop: Spacing['4'],
    gap: Spacing['2'],
  },
  personalityPrompt: {
    ...Typography.cardMeta,
    marginBottom: Spacing['1'],
  },
  personalityChoice: {
    minHeight: 64,
    paddingVertical: Spacing['3'],
    paddingHorizontal: Spacing['4'],
    borderRadius: Radius.lg,
    borderWidth: 1,
  },
  personalityLabel: {
    fontFamily: FontFamily.uiMedium,
    fontSize: FontSize.base,
    lineHeight: 22,
  },
  personalityDescription: {
    marginTop: 2,
    fontFamily: FontFamily.body,
    fontSize: FontSize.sm,
    lineHeight: 20,
    flexShrink: 1,
  },
});
