import { useCallback, useRef, useState, memo } from 'react';
import { useIsFocused } from 'expo-router';
import { View, Text, TextInput, TouchableOpacity, ScrollView, StyleSheet, Keyboard, useWindowDimensions } from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
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
import {
  COMPANION_INTRO_BODY,
  COMPANION_NAME_LATER_HINT,
  COMPANION_NAME_MAX_LENGTH,
} from '@/lib/support-clarity';
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
  companionName: string;
  onCompanionNameChange: (name: string) => void;
  companionPersonality: CompanionPersonality;
  onCompanionPersonalityChange: (personality: CompanionPersonality) => void;
  currentPage: number;
  onPageChange: (page: number | ((prev: number) => number)) => void;
  onComplete: () => void;
}

export const FeatureSummaryCarousel = memo(function FeatureSummaryCarousel({
  colors,
  companionName,
  onCompanionNameChange,
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
  // The keyboard lifts the whole step, so the page area shrinks. While the
  // name field has focus, each shrink scrolls the page to its end, where the
  // field sits, so the field stays above Next.
  const scrollRef = useRef<ScrollView>(null);
  const nameFocusedRef = useRef(false);
  const keepNameFieldInView = useCallback(() => {
    if (nameFocusedRef.current) scrollRef.current?.scrollToEnd({ animated: false });
  }, []);
  // The avoiding view takes its frame relative to its parent, so it needs the
  // distance from the top of the window. The step fills its parent, so that is
  // the step's own top. The avoiding view's ref never attaches under
  // NativeWind, so an opted-out view at its top edge measures it.
  const frameRef = useRef<View>(null);
  const [keyboardOffset, setKeyboardOffset] = useState(0);
  const measureKeyboardOffset = useCallback(() => {
    frameRef.current?.measureInWindow((_x, y) => setKeyboardOffset(y));
  }, []);
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
    <KeyboardAvoidingView behavior="padding" keyboardVerticalOffset={keyboardOffset} style={{ flex: 1 }}>
      <View
        ref={frameRef}
        cssInterop={false}
        collapsable={false}
        onLayout={measureKeyboardOffset}
        pointerEvents="none"
        style={StyleSheet.absoluteFill}
      />
      {/* Swipeable pages */}
      <GestureDetector gesture={swipeGesture}>
        <View style={{ flex: 1 }}>
          <Animated.View
            key={currentPage}
            entering={reducedMotion ? undefined : FadeIn.duration(Duration.normal).easing(Ease.out)}
            exiting={reducedMotion ? undefined : FadeOut.duration(Duration.fast).easing(Ease.out)}
            style={StyleSheet.absoluteFill}
          >
            <ScrollView
              ref={scrollRef}
              cssInterop={false}
              style={{ flex: 1 }}
              contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: Spacing['8'], paddingVertical: isCompanionPage ? Spacing['3'] : Spacing['6'] }}
              keyboardShouldPersistTaps="handled"
              onLayout={keepNameFieldInView}
            >
              <View style={{ alignItems: 'center', gap: isCompanionPage ? 20 : 36, alignSelf: 'stretch' }}>
                {/* Animation or companion orb */}
                <View>
                  {isCompanionPage ? (
                    <CompanionOrb
                      accentColor={colors.accent}
                      size={64}
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

                  {/* Companion name — optional, enters after the personality choices */}
                  {isCompanionPage && (
                    <Animated.View
                      entering={reducedMotion ? undefined : FadeIn.delay(750).duration(Duration.slow).easing(Ease.out)}
                      style={styles.nameGroup}
                    >
                      <Text key={`companion-name-label-${fontScale}`} style={[styles.nameLabel, { color: colors.textMuted }]}>Companion name (optional)</Text>
                      <TextInput
                        value={companionName}
                        onChangeText={onCompanionNameChange}
                        accessibilityLabel="Companion name"
                        accessibilityHint={COMPANION_NAME_LATER_HINT}
                        placeholder="e.g. Selah or Guide"
                        placeholderTextColor={colors.textMuted}
                        selectionColor={colors.accent}
                        cursorColor={colors.accent}
                        style={[
                          styles.nameInput,
                          {
                            color: colors.text,
                            backgroundColor: colors.inputBackground,
                            borderColor: colors.border,
                          },
                        ]}
                        maxLength={COMPANION_NAME_MAX_LENGTH}
                        returnKeyType="done"
                        submitBehavior="blurAndSubmit"
                        onSubmitEditing={Keyboard.dismiss}
                        onFocus={() => { nameFocusedRef.current = true; }}
                        onBlur={() => { nameFocusedRef.current = false; }}
                      />
                    </Animated.View>
                  )}
                </View>
              </View>
            </ScrollView>
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
    </KeyboardAvoidingView>
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
    minHeight: 56,
    paddingVertical: Spacing['2.5'],
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
  nameGroup: {
    marginTop: Spacing['4'],
  },
  nameLabel: {
    ...Typography.cardMeta,
    marginBottom: Spacing['2'],
  },
  nameInput: {
    fontFamily: FontFamily.body,
    fontSize: FontSize.lg,
    minHeight: 54,
    paddingVertical: Spacing['3'],
    paddingHorizontal: Spacing['5'],
    borderRadius: Radius.lg,
    borderWidth: 1,
  },
});
