import { useCallback, useEffect, useState, memo } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Dimensions, Keyboard, Platform, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeIn, FadeOut, runOnJS, useReducedMotion } from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import * as Haptics from 'expo-haptics';
import { FontFamily, FontSize } from '@/constants/fonts';
import { Spacing } from '@/constants/spacing';
import { Radius } from '@/constants/radius';
import { Duration, Ease } from '@/constants/animations';
import { CompanionOrb } from '@/components/CompanionOrb';
import {
  FEATURE_PAGES,
  CardAnimation,
  AnimatedHeadline,
  AnimatedBody,
} from '@/app/how-it-works';
import type { FeatureCard } from '@/app/how-it-works';
import type { ColorTheme } from '@/constants/colors';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const SWIPE_THRESHOLD = SCREEN_WIDTH * 0.25;
const SWIPE_VELOCITY = 500;

// Companion naming card — inserted into the carousel
const COMPANION_CARD: FeatureCard & { type: 'companion' } = {
  headline: 'Meet your companion',
  body: 'Checks in daily, learns what matters to you, and shapes every devotional around where you are right now.',
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
  isDark: boolean;
  companionName: string;
  onCompanionNameChange: (name: string) => void;
  currentPage: number;
  onPageChange: (page: number | ((prev: number) => number)) => void;
  onComplete: () => void;
}

export const FeatureSummaryCarousel = memo(function FeatureSummaryCarousel({
  colors,
  isDark,
  companionName,
  onCompanionNameChange,
  currentPage,
  onPageChange,
  onComplete,
}: Props) {
  const insets = useSafeAreaInsets();
  const reducedMotion = useReducedMotion();
  const { height: screenHeight } = useWindowDimensions();
  const [keyboardHeight, setKeyboardHeight] = useState(0);

  useEffect(() => {
    const showSub = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow',
      (event) => setKeyboardHeight(event.endCoordinates.height)
    );
    const hideSub = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide',
      () => setKeyboardHeight(0)
    );

    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  const page = ALL_PAGES[currentPage];
  const isLastPage = currentPage === ALL_PAGES.length - 1;
  const isCompanionPage = 'type' in page && (page as any).type === 'companion';
  const companionKeyboardLift = isCompanionPage && keyboardHeight > 0
    ? Math.min(Math.round(keyboardHeight * 0.48), screenHeight < 860 ? 170 : 190)
    : 0;

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
    .onEnd((e) => {
      if (e.translationX < -SWIPE_THRESHOLD || e.velocityX < -SWIPE_VELOCITY) {
        runOnJS(handleSwipeLeft)();
      } else if (e.translationX > SWIPE_THRESHOLD || e.velocityX > SWIPE_VELOCITY) {
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
            style={[
              StyleSheet.absoluteFill,
              companionKeyboardLift > 0 ? { transform: [{ translateY: -companionKeyboardLift }] } : null,
            ]}
          >
            <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: Spacing['8'] }}>
              <View style={{ alignItems: 'center', gap: 36, alignSelf: 'stretch' }}>
                {/* Animation or companion orb */}
                <View>
                  {isCompanionPage ? (
                    <CompanionOrb accentColor={colors.accent} size={96} isActive showBadge={false} />
                  ) : (
                    <CardAnimation type={page.animation} accent={colors.accent} />
                  )}
                </View>

                <View style={{ gap: 12, alignSelf: 'stretch' }}>
                  <AnimatedHeadline
                    text={page.headline}
                    color={colors.text}
                    pageKey={currentPage}
                  />
                  <AnimatedBody
                    text={page.body}
                    color={colors.textMuted}
                    pageKey={currentPage}
                  />

                  {/* Companion name input — staggered entrance top to bottom */}
                  {isCompanionPage && (
                    <View style={{ marginTop: Spacing['4'] }}>
                      <Animated.View entering={reducedMotion ? undefined : FadeIn.delay(600).duration(Duration.slow).easing(Ease.out)}>
                        <Text style={{
                          fontFamily: FontFamily.uiMedium,
                          fontSize: FontSize.xs,
                          color: colors.textMuted,
                          letterSpacing: 1.2,
                          textTransform: 'uppercase',
                          marginBottom: Spacing['2'],
                        }}>
                          Companion name
                        </Text>
                      </Animated.View>
                      <Animated.View entering={reducedMotion ? undefined : FadeIn.delay(750).duration(Duration.slow).easing(Ease.out)}>
                        <TextInput
                          value={companionName}
                          onChangeText={onCompanionNameChange}
                          placeholder="e.g. Grace, Selah, Guide"
                          placeholderTextColor={colors.textMuted}
                          selectionColor={colors.accent}
                          cursorColor={colors.accent}
                          style={{
                            fontFamily: FontFamily.body,
                            fontSize: FontSize.lg,
                            color: colors.text,
                            height: 54,
                            paddingHorizontal: Spacing['5'],
                            backgroundColor: colors.inputBackground,
                            borderRadius: Radius.lg,
                            borderWidth: 1,
                            borderColor: colors.border,
                          }}
                          maxLength={30}
                          returnKeyType="done"
                          submitBehavior="blurAndSubmit"
                          onSubmitEditing={Keyboard.dismiss}
                        />
                      </Animated.View>
                      <Animated.Text
                        entering={reducedMotion ? undefined : FadeIn.delay(900).duration(Duration.slow).easing(Ease.out)}
                        style={{
                          fontFamily: FontFamily.ui,
                          fontSize: FontSize.xs,
                          color: colors.textSubtle,
                          marginTop: Spacing['2'],
                        }}
                      >
                        You can always change this later.
                      </Animated.Text>
                    </View>
                  )}
                </View>
              </View>
            </View>
          </Animated.View>
        </View>
      </GestureDetector>

      {/* Bottom: page dots + continue button */}
      <View style={{ paddingHorizontal: Spacing['6'], paddingBottom: Math.max(insets.bottom, Spacing['4']) }}>
        {/* Page dots */}
        <View style={{ flexDirection: 'row', justifyContent: 'flex-start', alignItems: 'center', gap: 6, marginBottom: Spacing['6'] }}>
          {ALL_PAGES.map((_, index) => (
            <View
              key={index}
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
        <TouchableOpacity activeOpacity={0.7} onPress={handleContinue}>
          <View style={{
            paddingVertical: Spacing['4'],
            borderRadius: Radius.md,
            alignItems: 'center',
            backgroundColor: colors.accent,
          }}>
            <Text style={{
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
