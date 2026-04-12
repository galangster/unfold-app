import { useState, useCallback, useEffect, memo } from 'react';
import {
  View,
  Text,
  Image as RNImage,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { Image as ExpoImage } from 'expo-image';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
  FadeIn,
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withRepeat,
  withTiming,
  runOnJS,
  Easing,
  cancelAnimation,
} from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import LottieView from 'lottie-react-native';
import { CheckIcon, StarIcon, PlayCircleIcon } from 'phosphor-react-native';
import { FontFamily, FontSize } from '@/constants/fonts';
import { Spacing } from '@/constants/spacing';
import { Radius } from '@/constants/radius';
import { Duration } from '@/constants/animations';
import { purchasePackage, restorePurchases } from '@/lib/revenuecatClient';
import { syncTrialEndingNotification } from '@/lib/trial-notification';
import type { PurchasesPackage } from 'react-native-purchases';
import type { ColorTheme } from '@/constants/colors';
import { EmberParticles } from '@/components/EmberParticles';
import { ExclusiveOfferSheet } from '@/components/ExclusiveOfferSheet';
import { mmkvStorage } from '@/lib/mmkv-storage';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ThreeStepPaywallProps {
  colors: ColorTheme;
  isDark: boolean;
  yearlyPackage: PurchasesPackage | undefined;
  monthlyPackage: PurchasesPackage | undefined;
  yearlyPrice: string;
  monthlyPrice: string;
  yearlyRaw: number;
  monthlyRaw: number;
  trialDuration: string;
  trialDays: number;
  // When false, the yearly package has no intro/free-trial offer configured in
  // App Store Connect. We must not promise a trial anywhere in the UI — skip
  // the trial-reminder screen and drop trial copy from CTAs + disclosures.
  hasFreeTrial: boolean;
  onPurchaseSuccess: () => void;
  onSkip: () => void;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const TOTAL_PAGES_WITH_TRIAL = 3;
const TOTAL_PAGES_NO_TRIAL = 2;

const DEVICE_BEZEL_WIDTH = SCREEN_WIDTH * 0.62;

const REVIEWS = [
  {
    name: 'Sarah M.',
    location: 'Nashville, TN',
    quote:
      'I opened this on a random Tuesday morning and the devotional was EXACTLY what I needed to hear. Like eerily specific to what I was going through. Genuinely grateful for this app \u{1F64F}',
  },
  {
    name: 'Marcus',
    location: 'Denver, CO',
    quote:
      'My wife asked what\'s been different with me lately. It\'s literally just 5 minutes in this app every morning lol. The writing feels like it was made for ME specifically',
  },
  {
    name: 'Priya J.',
    location: 'Austin, TX',
    quote:
      'This is the first quiet time app where I actually WANT to come back every day. The journal prompts are \u{1F525} and the companion actually asks good questions back',
  },
] as const;

const PRICING_GAP = Spacing['3'];
const PRICING_BOX_WIDTH = (SCREEN_WIDTH - Spacing['6'] * 2 - PRICING_GAP) / 2;
const STACK_CARD_WIDTH = SCREEN_WIDTH - Spacing['6'] * 2;
const STACK_CARD_HEIGHT = 140;
const STACK_OFFSET_Y = -8;
const STACK_SCALE_STEP = 0.05;
const SWIPE_THRESHOLD = -60;
const CARD_SPRING = { damping: 28, stiffness: 200, mass: 1 };

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** CTA label per screen index. Depends on whether a free trial is offered. */
function ctaLabel(page: number, totalPages: number, hasFreeTrial: boolean): string {
  const isFinal = page === totalPages - 1;
  if (!hasFreeTrial) {
    return isFinal ? 'Subscribe' : 'Continue';
  }
  if (page === 0) return 'Start Free Trial';
  if (page === 1) return 'Continue for FREE';
  return 'Try for $0.00';
}

// ---------------------------------------------------------------------------
// Sub-components (inline, single file)
// ---------------------------------------------------------------------------

/** Five filled stars rendered inline. */
function FiveStars({ color }: { color: string }) {
  return (
    <View style={styles.starsRow}>
      {Array.from({ length: 5 }).map((_, i) => (
        <StarIcon key={i} size={14} color={color} weight="fill" />
      ))}
    </View>
  );
}

/** Small dot indicators for the stacked card carousel. */
function StackDots({
  current,
  total,
  accentColor,
  borderColor,
}: {
  current: number;
  total: number;
  accentColor: string;
  borderColor: string;
}) {
  return (
    <View style={styles.stackDotsRow}>
      {Array.from({ length: total }).map((_, i) => (
        <View
          key={i}
          style={[
            styles.stackDot,
            {
              backgroundColor: i === current ? accentColor : borderColor,
            },
          ]}
        />
      ))}
    </View>
  );
}

/** Single animated card in the stack. */
function StackCard({
  review,
  index,
  activeIndex,
  dismissX,
  colors,
  total,
}: {
  review: (typeof REVIEWS)[number];
  index: number;
  activeIndex: Animated.SharedValue<number>;
  dismissX: Animated.SharedValue<number>;
  colors: ColorTheme;
  total: number;
}) {
  const animStyle = useAnimatedStyle(() => {
    const active = activeIndex.value;
    const relativePos = ((index - active) % total + total) % total;

    // How far the front card has been dragged (0 to -SCREEN_WIDTH)
    const progress = Math.min(Math.abs(dismissX.value) / SCREEN_WIDTH, 1);

    if (relativePos === 0) {
      // Front card -- follows swipe with rotation for natural feel
      const rotate = (dismissX.value / SCREEN_WIDTH) * 12; // tilts up to 12deg
      return {
        zIndex: total,
        opacity: 1 - progress * 0.3,
        transform: [
          { translateX: dismissX.value },
          { translateY: progress * -30 }, // lifts slightly as it swipes
          { rotate: `${rotate}deg` },
          { scale: 1 },
        ],
      };
    }

    if (relativePos === 1) {
      // Second card — scales up as front card leaves
      const scale = (1 - STACK_SCALE_STEP) + STACK_SCALE_STEP * progress;
      const translateY = STACK_OFFSET_Y * (1 - progress);
      return {
        zIndex: total - 1,
        opacity: 1,
        transform: [
          { translateX: 0 },
          { translateY },
          { scale },
        ],
      };
    }

    if (relativePos === 2) {
      // Third card — moves up as second card promotes
      const scale = (1 - STACK_SCALE_STEP * 2) + STACK_SCALE_STEP * progress;
      const translateY = STACK_OFFSET_Y * 2 + STACK_OFFSET_Y * -1 * progress;
      return {
        zIndex: total - 2,
        opacity: 1,
        transform: [
          { translateX: 0 },
          { translateY },
          { scale },
        ],
      };
    }

    // Hidden
    return {
      zIndex: 0,
      opacity: 0,
      transform: [{ translateX: 0 }, { translateY: 0 }, { scale: 0.85 }],
    };
  });

  return (
    <Animated.View
      style={[
        styles.stackCard,
        {
          width: STACK_CARD_WIDTH,
          backgroundColor: colors.backgroundElevated,
          borderWidth: 1,
          borderColor: colors.border,
        },
        animStyle,
      ]}
    >
      <View style={styles.reviewCardHeader}>
        <View>
          <Text
            style={{
              fontFamily: FontFamily.uiSemiBold,
              fontSize: FontSize.sm,
              color: colors.text,
            }}
          >
            {review.name}
          </Text>
          <Text
            style={{
              fontFamily: FontFamily.ui,
              fontSize: FontSize.xs,
              color: colors.textSubtle,
              marginTop: 2,
            }}
          >
            {review.location}
          </Text>
        </View>
        <FiveStars color={colors.accent} />
      </View>
      <Text
        style={{
          fontFamily: FontFamily.body,
          fontSize: FontSize.sm,
          color: colors.textMuted,
          marginTop: Spacing['2.5'],
          lineHeight: 20,
        }}
      >
        &ldquo;{review.quote}&rdquo;
      </Text>
    </Animated.View>
  );
}

// ---------------------------------------------------------------------------
// Screen 1: Product in Action
// ---------------------------------------------------------------------------

function ScreenProductInAction({
  colors,
  hasFreeTrial,
}: {
  colors: ColorTheme;
  hasFreeTrial: boolean;
}) {
  const dragY = useSharedValue(0);
  const MAX_DRAG = 60; // 15% of ~400px content area
  const SPRING_CONFIG = { damping: 30, stiffness: 300, mass: 1 };

  const dragGesture = Gesture.Pan()
    .activeOffsetY([-8, 8])
    .failOffsetX([-24, 24])
    .shouldCancelWhenOutside(false)
    .onUpdate((e) => {
      'worklet';
      const raw = e.translationY * 0.4;
      dragY.value = raw * (1 - Math.abs(raw) / (MAX_DRAG * 2));
    })
    .onFinalize(() => {
      'worklet';
      dragY.value = withSpring(0, SPRING_CONFIG);
    });

  const dragStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: dragY.value }],
  }));

  return (
    <View style={styles.screen1Root}>
      <GestureDetector gesture={dragGesture}>
        <View style={styles.screen1DragArea} collapsable={false}>
          <Animated.View style={[styles.screen1DraggableContent, dragStyle]}>
            {/* Top section: headline */}
            <View style={styles.screen1TopSection}>
              <Text
                style={[
                  styles.headline,
                  {
                    color: colors.text,
                    textAlign: 'center',
                  },
                ]}
              >
                {hasFreeTrial
                  ? `We want you to try\nUnfold for free.`
                  : `Unlock everything\nUnfold can do.`}
              </Text>
            </View>

            {/* Device bezel -- clips at the bottom edge of the viewport */}
            <View style={styles.screen1DeviceWrapper}>
              <View
                style={[
                  styles.deviceBezel,
                  {
                    width: DEVICE_BEZEL_WIDTH,
                    borderColor: 'rgba(255,255,255,0.1)',
                  },
                ]}
              >
                <View style={styles.deviceInner}>
                  {/* Play icon + subtle label — premium placeholder */}
                  <View style={styles.previewPlaceholder}>
                    <View
                      style={[
                        styles.playIconRing,
                        { borderColor: 'rgba(200,165,92,0.3)' },
                      ]}
                    >
                      <PlayCircleIcon
                        size={40}
                        color={colors.accent}
                        weight="thin"
                      />
                    </View>
                    <Text
                      style={{
                        fontFamily: FontFamily.ui,
                        fontSize: FontSize.xs,
                        color: colors.textSubtle,
                        marginTop: Spacing['3'],
                        letterSpacing: 1.5,
                        textTransform: 'uppercase',
                      }}
                    >
                      Preview Coming Soon
                    </Text>
                  </View>
                </View>
              </View>
            </View>
          </Animated.View>
        </View>
      </GestureDetector>

      {/* Gradient fade at the bottom -- stays fixed, doesn't move with drag */}
      <LinearGradient
        colors={['rgba(10,10,10,0)', 'rgba(10,10,10,0.85)', 'rgba(10,10,10,1)']}
        style={styles.screen1Gradient}
        pointerEvents="none"
      />
    </View>
  );
}

// ---------------------------------------------------------------------------
// Screen 2: Trial Reminder
// ---------------------------------------------------------------------------

function ScreenTrialReminder({
  colors,
  trialDays,
}: {
  colors: ColorTheme;
  trialDays: number;
}) {
  const dragY = useSharedValue(0);
  const MAX_DRAG = 60;
  const SPRING_CONFIG = { damping: 30, stiffness: 300, mass: 1 };

  const dragGesture = Gesture.Pan()
    .activeOffsetY([-8, 8])
    .failOffsetX([-24, 24])
    .shouldCancelWhenOutside(false)
    .onUpdate((e) => {
      'worklet';
      const raw = e.translationY * 0.4;
      dragY.value = raw * (1 - Math.abs(raw) / (MAX_DRAG * 2));
    })
    .onFinalize(() => {
      'worklet';
      dragY.value = withSpring(0, SPRING_CONFIG);
    });

  const dragStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: dragY.value }],
  }));

  return (
    <View style={styles.screen2Root}>
      <GestureDetector gesture={dragGesture}>
        <View style={styles.screen2DragArea} collapsable={false}>
          <Animated.View style={[styles.screen2Content, dragStyle]}>
            {/* Lottie bell -- above headline for visual anchor */}
            <View style={styles.bellContainer}>
              <LottieView
                source={require('../../../assets/lottie/bell-notification.json')}
                autoPlay
                loop
                style={styles.bellLottie}
                colorFilters={[
                  { keypath: 'Pre-comp 1', color: colors.accent },
                  { keypath: 'Bell Frame', color: colors.accent },
                  { keypath: 'Bell Bottom', color: colors.accent },
                  { keypath: 'Mask', color: colors.accent },
                ]}
              />
            </View>

            {/* Headline */}
            <Text
              style={[
                styles.headline,
                {
                  color: colors.text,
                  textAlign: 'center',
                  marginTop: Spacing['6'],
                },
              ]}
            >
              We'll remind you before{'\n'}your free trial ends
            </Text>

            {/* Supporting body text */}
            <Text
              style={{
                fontFamily: FontFamily.body,
                fontSize: FontSize.base,
                lineHeight: 24,
                color: colors.textMuted,
                textAlign: 'center',
                marginTop: Spacing['4'],
                paddingHorizontal: Spacing['4'],
              }}
            >
              You'll get a notification {trialDays === 7 ? '2 days' : '1 day'} before
              your trial ends. No surprises, ever.
            </Text>
          </Animated.View>
        </View>
      </GestureDetector>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Screen 3: Pricing + Social Proof
// ---------------------------------------------------------------------------

function ScreenPricing({
  colors,
  yearlyPrice,
  monthlyPrice,
  yearlyRaw,
  monthlyRaw,
  selectedPlan,
  onSelectPlan,
}: {
  colors: ColorTheme;
  yearlyPrice: string;
  monthlyPrice: string;
  yearlyRaw: number;
  monthlyRaw: number;
  selectedPlan: 'yearly' | 'monthly';
  onSelectPlan: (plan: 'yearly' | 'monthly') => void;
}) {
  const savings = monthlyRaw > 0 ? Math.round((1 - yearlyRaw / 12 / monthlyRaw) * 100) : 0;
  const yearlyMonthlyEquivalent =
    monthlyRaw > 0
      ? `$${(Math.floor((yearlyRaw / 12) * 100) / 100).toFixed(2)}/mo`
      : yearlyPrice;

  // --- Stacked card carousel state ---
  const [activeReviewIndex, setActiveReviewIndex] = useState(0);
  const activeIndex = useSharedValue(0);
  const dismissX = useSharedValue(0);

  const advanceCard = useCallback(() => {
    setActiveReviewIndex((prev) => (prev + 1) % REVIEWS.length);
  }, []);

  const swipeGesture = Gesture.Pan()
    .activeOffsetX([-12, 12])
    .onUpdate((e) => {
      'worklet';
      dismissX.value = e.translationX;
    })
    .onEnd((e) => {
      'worklet';
      if (Math.abs(e.translationX) > Math.abs(SWIPE_THRESHOLD)) {
        // Dismiss: animate card off in the direction of swipe
        const direction = e.translationX < 0 ? -1 : 1;
        dismissX.value = withTiming(direction * SCREEN_WIDTH, { duration: 200 }, () => {
          activeIndex.value = (activeIndex.value + 1) % REVIEWS.length;
          dismissX.value = 0;
          runOnJS(advanceCard)();
        });
      } else {
        // Snap back
        dismissX.value = withSpring(0, CARD_SPRING);
      }
    });

  const handleCardTap = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    dismissX.value = withTiming(-SCREEN_WIDTH, { duration: 200 }, () => {
      activeIndex.value = (activeIndex.value + 1) % REVIEWS.length;
      dismissX.value = 0;
      runOnJS(advanceCard)();
    });
  }, [activeIndex, dismissX, advanceCard]);

  return (
    <View style={styles.screen3Root}>
      {/* Logo + headline. Using expo-image (not RN Image) so the bundled
          PNG paints synchronously with its tint applied — native Image
          has a brief async tint processing step on iOS that made the
          logo fade in noticeably later than the headline text. */}
      <View style={styles.screen3Header}>
        <ExpoImage
          source={require('../../../assets/icon-paywall.png')}
          style={{ width: 32, height: 32, opacity: 0.9 }}
          contentFit="contain"
          tintColor={colors.accent}
          cachePolicy="memory-disk"
        />
        <Text style={[styles.screen3Headline, { color: colors.text }]}>
          The most personal{'\n'}Bible experience{'\n'}in the world
        </Text>

        {/* Social proof — simple row, no wreath. Sits close to the
            testimonial cards below so it reads as a trust badge for them. */}
        <View style={styles.socialProofRow}>
          <Text
            style={{
              fontFamily: FontFamily.ui,
              fontSize: FontSize.xs,
              color: colors.textMuted,
              marginRight: Spacing['2'],
            }}
          >
            Trusted by thousands
          </Text>
          <Text
            style={{
              fontFamily: FontFamily.uiSemiBold,
              fontSize: FontSize.sm,
              color: colors.text,
              marginRight: Spacing['1'],
            }}
          >
            4.8
          </Text>
          <FiveStars color={colors.accent} />
        </View>
      </View>

      {/* Stacked card carousel */}
      <View style={styles.stackCarouselWrapper}>
        <GestureDetector gesture={swipeGesture}>
          <TouchableOpacity
            activeOpacity={1}
            onPress={handleCardTap}
            style={styles.stackContainer}
          >
            {REVIEWS.map((review, i) => (
              <StackCard
                key={review.name}
                review={review}
                index={i}
                activeIndex={activeIndex}
                dismissX={dismissX}
                colors={colors}
                total={REVIEWS.length}
              />
            ))}
          </TouchableOpacity>
        </GestureDetector>
        <StackDots
          current={activeReviewIndex}
          total={REVIEWS.length}
          accentColor={colors.accent}
          borderColor={colors.border}
        />
      </View>

      {/* Pricing cards -- explicit equal widths */}
      <View style={styles.pricingRow}>
        {/* Monthly */}
        <TouchableOpacity
          activeOpacity={0.7}
          onPress={() => onSelectPlan('monthly')}
          style={[
            styles.pricingCard,
            {
              width: PRICING_BOX_WIDTH,
              backgroundColor: colors.inputBackground,
              borderColor:
                selectedPlan === 'monthly' ? colors.accent : colors.border,
              borderWidth: selectedPlan === 'monthly' ? 1.5 : 1,
            },
          ]}
        >
          <Text
            style={{
              fontFamily: FontFamily.uiMedium,
              fontSize: 11,
              color: colors.textSubtle,
              textTransform: 'uppercase',
              letterSpacing: 1.2,
            }}
          >
            Monthly
          </Text>
          <Text
            style={{
              fontFamily: FontFamily.uiSemiBold,
              fontSize: FontSize.lg,
              color:
                selectedPlan === 'monthly' ? colors.accent : colors.text,
              marginTop: Spacing['1.5'],
            }}
          >
            {monthlyPrice}
            <Text
              style={{
                fontFamily: FontFamily.ui,
                fontSize: FontSize.sm,
                color: colors.textMuted,
              }}
            >
              /mo
            </Text>
          </Text>
        </TouchableOpacity>

        {/* Yearly -- with SAVE badge on top border */}
        <View style={[styles.yearlyCardWrapper, { width: PRICING_BOX_WIDTH }]}>
          {/* SAVE badge overlapping top border */}
          {savings > 0 && (
            <View style={[styles.saveBadge, { backgroundColor: colors.accent }]}>
              <Text
                style={[
                  styles.saveBadgeText,
                  { color: colors.contrastText ?? '#FFFFFF' },
                ]}
              >
                SAVE {savings}%
              </Text>
            </View>
          )}
          <TouchableOpacity
            activeOpacity={0.7}
            onPress={() => onSelectPlan('yearly')}
            style={[
              styles.pricingCard,
              {
                backgroundColor: colors.inputBackground,
                borderColor:
                  selectedPlan === 'yearly' ? colors.accent : colors.border,
                borderWidth: selectedPlan === 'yearly' ? 1.5 : 1,
              },
            ]}
          >
            <Text
              style={{
                fontFamily: FontFamily.uiMedium,
                fontSize: 11,
                color: colors.textSubtle,
                textTransform: 'uppercase',
                letterSpacing: 1.2,
              }}
            >
              Yearly
            </Text>
            <Text
              style={{
                fontFamily: FontFamily.uiSemiBold,
                fontSize: FontSize.lg,
                color:
                  selectedPlan === 'yearly' ? colors.accent : colors.text,
                marginTop: Spacing['1.5'],
              }}
            >
              {yearlyMonthlyEquivalent}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Shared Bottom CTA Section
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Glowing gold CTA button
// ---------------------------------------------------------------------------
// Mirrors the gold button treatment used on the home devotional card —
// bright accent fill, native iOS shadow in the accent color, and a looping
// pulsed inner-glow overlay so the button feels alive rather than static.
// Applied globally via BottomCTA so all three paywall screens get the same
// glow without per-screen duplication.

function GlowingCTA({
  label,
  colors,
  onPress,
  isLoading,
}: {
  label: string;
  colors: ColorTheme;
  onPress: () => void;
  isLoading: boolean;
}) {
  // Seamless breathing halo — uses a linear phase counter (0 → 1 → 0 → 1...)
  // mapped through a sine wave so the shadowOpacity rises and falls
  // continuously with no visible "pause" at the extremes. ping-pong via
  // withRepeat(...true) + easing curves can feel jittery because each
  // iteration re-interpolates from a fixed keyframe; a sin wave gives a
  // true continuous oscillation.
  const phase = useSharedValue(0);

  useEffect(() => {
    phase.value = withRepeat(
      withTiming(1, { duration: 3600, easing: Easing.linear }),
      -1,
      false,
    );
    return () => cancelAnimation(phase);
  }, [phase]);

  const shadowStyle = useAnimatedStyle(() => {
    // sin wave: phase 0 → sin(-π/2) = -1 → 0; phase 0.5 → sin(π/2) = 1;
    // phase 1 → sin(3π/2) = -1 → 0. Normalised to 0..1 range.
    'worklet';
    const sine = (Math.sin(phase.value * Math.PI * 2 - Math.PI / 2) + 1) / 2;
    return {
      shadowOpacity: 0.55 + sine * 0.45,
    };
  });

  return (
    <TouchableOpacity activeOpacity={0.85} onPress={onPress} disabled={isLoading}>
      <Animated.View
        style={[
          styles.ctaButton,
          styles.ctaShadow,
          { backgroundColor: colors.accent, shadowColor: colors.accent },
          shadowStyle,
        ]}
      >
        {isLoading ? (
          <ActivityIndicator color={colors.background} size="small" />
        ) : (
          <Text
            style={{
              fontFamily: FontFamily.uiSemiBold,
              fontSize: FontSize.base,
              color: colors.background,
              letterSpacing: 0.3,
            }}
          >
            {label}
          </Text>
        )}
      </Animated.View>
    </TouchableOpacity>
  );
}

function BottomCTA({
  colors,
  currentPage,
  totalPages,
  hasFreeTrial,
  trialDays,
  yearlyRaw,
  monthlyRaw,
  selectedPlan,
  isLoading,
  purchaseError,
  onPress,
}: {
  colors: ColorTheme;
  currentPage: number;
  totalPages: number;
  hasFreeTrial: boolean;
  trialDays: number;
  yearlyRaw: number;
  monthlyRaw: number;
  selectedPlan: 'yearly' | 'monthly';
  isLoading: boolean;
  purchaseError: string | null;
  onPress: () => void;
}) {
  // `hasFreeTrial` reflects yearly-plan eligibility only. Monthly has its own
  // cadence and its own (unverified) intro-offer state, so the moment the user
  // selects monthly on the pricing screen we must stop promising a trial —
  // CTA copy, reassurance row, and disclosure all need to reflect that.
  // Guideline 3.1.2 misrepresentation risk otherwise.
  const effectiveHasTrial = hasFreeTrial && selectedPlan === 'yearly';

  const disclosureText =
    selectedPlan === 'yearly'
      ? effectiveHasTrial
        ? `${trialDays} days free, then $${yearlyRaw.toFixed(2)}/yr. Cancel anytime.`
        : `$${yearlyRaw.toFixed(2)}/yr. Cancel anytime.`
      : `$${monthlyRaw.toFixed(2)}/mo. Cancel anytime.`;

  return (
    <View style={styles.ctaContainer}>
      {/* Error message */}
      {purchaseError && (
        <Text
          style={{
            fontFamily: FontFamily.ui,
            fontSize: FontSize.sm,
            color: colors.error,
            textAlign: 'center',
            marginBottom: Spacing['2'],
          }}
        >
          {purchaseError}
        </Text>
      )}

      {/* No payment due now — reassurance only valid when there IS a trial.
          If there's no trial, the user IS paying now, so hiding this row
          (and dropping "free" from the CTA/disclosure) keeps us honest. */}
      {effectiveHasTrial && (
        <View style={styles.noPaymentRow}>
          <CheckIcon size={14} color={colors.accent} weight="bold" />
          <Text
            style={{
              fontFamily: FontFamily.uiMedium,
              fontSize: FontSize.sm,
              color: colors.textMuted,
              marginLeft: Spacing['1.5'],
            }}
          >
            No Payment Due Now
          </Text>
        </View>
      )}

      {/* Gold CTA button — pulsing glow + bright accent fill, mirrors the
          gold button treatment on the home devotional card. */}
      <GlowingCTA
        label={ctaLabel(currentPage, totalPages, effectiveHasTrial)}
        colors={colors}
        onPress={onPress}
        isLoading={isLoading}
      />

      {/* Renewal disclosure -- reflects selected plan */}
      <Text
        numberOfLines={1}
        style={{
          fontFamily: FontFamily.ui,
          fontSize: FontSize.xs,
          color: colors.textSubtle,
          textAlign: 'center',
          marginTop: Spacing['2.5'],
        }}
      >
        {disclosureText}
      </Text>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export const ThreeStepPaywall = memo(function ThreeStepPaywall({
  colors,
  isDark,
  yearlyPackage,
  monthlyPackage,
  yearlyPrice,
  monthlyPrice,
  yearlyRaw,
  monthlyRaw,
  trialDuration,
  trialDays,
  hasFreeTrial,
  onPurchaseSuccess,
  onSkip,
}: ThreeStepPaywallProps) {
  const insets = useSafeAreaInsets();
  const [currentPage, setCurrentPage] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [purchaseError, setPurchaseError] = useState<string | null>(null);
  const [showExclusiveOffer, setShowExclusiveOffer] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState<'yearly' | 'monthly'>(
    'yearly',
  );

  // Latch the initial hasFreeTrial value for the component's lifetime.
  // Offerings + trial eligibility resolve async, so the prop can flip from
  // false -> true after mount. Without latching, totalPages would jump
  // 2 -> 3 while the user is mid-flow, remapping pages and rewriting CTA
  // copy in place. Snapshot once on mount; honor any later updates only if
  // the user is still on the first screen (safe to extend the flow).
  const [stableHasFreeTrial, setStableHasFreeTrial] = useState<boolean>(
    () => hasFreeTrial,
  );
  useEffect(() => {
    if (hasFreeTrial !== stableHasFreeTrial && currentPage === 0) {
      setStableHasFreeTrial(hasFreeTrial);
    }
  }, [hasFreeTrial, stableHasFreeTrial, currentPage]);

  const totalPages = stableHasFreeTrial
    ? TOTAL_PAGES_WITH_TRIAL
    : TOTAL_PAGES_NO_TRIAL;

  // -----------------------------------------------------------------------
  // Navigation — CTA buttons only, no swipe
  // -----------------------------------------------------------------------

  const nextPage = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setCurrentPage((p) => Math.min(p + 1, totalPages - 1));
  }, [totalPages]);

  // -----------------------------------------------------------------------
  // Purchase / Restore
  // -----------------------------------------------------------------------

  const handlePurchase = useCallback(async () => {
    const pkg = selectedPlan === 'yearly' ? yearlyPackage : monthlyPackage;
    if (!pkg) return;
    setIsLoading(true);
    setPurchaseError(null);
    const result = await purchasePackage(pkg);
    setIsLoading(false);
    if (result.ok) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      await syncTrialEndingNotification();
      onPurchaseSuccess();
    } else {
      if (result.reason === 'user_cancelled') {
        const hasSeenOnboardingOffer = mmkvStorage.getItem('@unfold_onboarding_offer_seen') === 'true';
        if (!hasSeenOnboardingOffer) {
          mmkvStorage.setItem('@unfold_onboarding_offer_seen', 'true');
          setShowExclusiveOffer(true);
        }
      } else {
        setPurchaseError('Something went wrong. Please try again.');
      }
    }
  }, [selectedPlan, yearlyPackage, monthlyPackage, onPurchaseSuccess]);

  const handleRestore = useCallback(async () => {
    setIsLoading(true);
    setPurchaseError(null);
    const result = await restorePurchases();
    setIsLoading(false);
    if (result.ok) {
      const isPremium = Boolean(
        result.data.entitlements.active['Unfold Premium'],
      );
      if (isPremium) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        await syncTrialEndingNotification();
        onPurchaseSuccess();
      } else {
        setPurchaseError('No previous purchases found.');
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      }
    } else {
      setPurchaseError('Could not restore purchases. Please try again.');
    }
  }, [onPurchaseSuccess]);

  // -----------------------------------------------------------------------
  // CTA press: navigate on screens 1-2, purchase on screen 3
  // -----------------------------------------------------------------------

  const handleCTAPress = useCallback(() => {
    if (currentPage < totalPages - 1) {
      nextPage();
    } else {
      handlePurchase();
    }
  }, [currentPage, totalPages, nextPage, handlePurchase]);

  // -----------------------------------------------------------------------
  // Render
  // -----------------------------------------------------------------------

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      {/* Persistent ember particles — stay mounted across all three
          screens so the embers flow continuously as the user taps
          Continue rather than restarting per screen. */}
      <EmberParticles color={colors.accent} count={18} bidirectional />

      {/* Page content — fills space between onboarding header and bottom CTA */}
      <View style={styles.flex1}>
        <Animated.View
          key={currentPage}
          entering={FadeIn.duration(Duration.normal)}
          style={styles.flex1}
        >
          {currentPage === 0 && (
            <ScreenProductInAction
              colors={colors}
              hasFreeTrial={stableHasFreeTrial}
            />
          )}
          {stableHasFreeTrial && currentPage === 1 && (
            <ScreenTrialReminder colors={colors} trialDays={trialDays} />
          )}
          {currentPage === totalPages - 1 && (
            <ScreenPricing
              colors={colors}
              yearlyPrice={yearlyPrice}
              monthlyPrice={monthlyPrice}
              yearlyRaw={yearlyRaw}
              monthlyRaw={monthlyRaw}
              selectedPlan={selectedPlan}
              onSelectPlan={setSelectedPlan}
            />
          )}
        </Animated.View>
      </View>

      {/* Bottom section: CTA + Restore */}
      <View
        style={[
          styles.bottomSection,
          { paddingBottom: Math.max(insets.bottom, Spacing['4']) },
        ]}
      >
        <BottomCTA
          colors={colors}
          currentPage={currentPage}
          totalPages={totalPages}
          hasFreeTrial={stableHasFreeTrial}
          trialDays={trialDays}
          yearlyRaw={yearlyRaw}
          monthlyRaw={monthlyRaw}
          selectedPlan={selectedPlan}
          isLoading={isLoading}
          purchaseError={purchaseError}
          onPress={handleCTAPress}
        />
        <TouchableOpacity
          onPress={handleRestore}
          hitSlop={12}
          style={{ alignSelf: 'center', marginTop: Spacing['2'] }}
          accessibilityRole="button"
          accessibilityLabel="Restore purchases"
        >
          <Text
            style={{
              fontFamily: FontFamily.ui,
              fontSize: FontSize.xs,
              color: colors.textHint,
            }}
          >
            Restore purchases
          </Text>
        </TouchableOpacity>
      </View>
      <ExclusiveOfferSheet
        visible={showExclusiveOffer}
        onDismiss={() => setShowExclusiveOffer(false)}
        context="onboarding"
      />
    </View>
  );
});

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  flex1: {
    flex: 1,
  },

  // ------- Screen 1 -------
  screen1Root: {
    flex: 1,
    overflow: 'hidden',
  },
  screen1DragArea: {
    flex: 1,
    minHeight: 1,
  },
  screen1DraggableContent: {
    flex: 1,
  },
  screen1TopSection: {
    paddingHorizontal: Spacing['8'],
    paddingTop: Spacing['2'],
  },
  screen1DeviceWrapper: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'flex-start',
    paddingTop: Spacing['4'],
  },
  screen1Gradient: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 240,
  },

  // ------- Screen 2 -------
  screen2Root: {
    flex: 1,
    paddingHorizontal: Spacing['6'],
    justifyContent: 'center',
    alignItems: 'center',
  },
  screen2DragArea: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    minHeight: 1,
  },
  screen2Content: {
    alignItems: 'center',
    // Shift content up slightly from true center for optical balance
    marginTop: -Spacing['10'],
  },

  // ------- Shared Headlines -------
  headline: {
    fontFamily: FontFamily.display,
    fontSize: 28,
    lineHeight: Math.round(28 * 1.25),
  },

  // ------- Device bezel (Screen 1) -------
  deviceBezel: {
    alignSelf: 'center',
    borderWidth: 1,
    borderRadius: 36,
    overflow: 'hidden',
  },
  deviceInner: {
    width: '100%',
    aspectRatio: 9 / 19.5,
    backgroundColor: '#0F0F0F',
    justifyContent: 'center',
    alignItems: 'center',
  },
  previewPlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  playIconRing: {
    width: 72,
    height: 72,
    borderRadius: 36,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },

  // ------- Bell (Screen 2) -------
  bellContainer: {
    alignItems: 'center',
  },
  bellLottie: {
    width: 160,
    height: 160,
  },

  // ------- Screen 3 -------
  screen3Root: {
    flex: 1,
    paddingHorizontal: Spacing['6'],
    paddingTop: Spacing['3'],
    justifyContent: 'space-between',
  },
  screen3Header: {
    alignItems: 'center',
    gap: Spacing['2'],
  },
  screen3Headline: {
    fontFamily: FontFamily.display,
    fontSize: 36,
    lineHeight: Math.round(36 * 1.1),
    textAlign: 'center',
    marginTop: Spacing['2'],
  },
  // Social proof row — sits just above the testimonial card carousel
  // so the "Trusted by thousands · 4.8 ★★★★★" line reads as a trust
  // badge directly attached to the reviews below.
  socialProofRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: Spacing['4'],
  },
  ratingRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  starsRow: {
    flexDirection: 'row',
    gap: 2,
  },

  // ------- Stacked card carousel -------
  stackCarouselWrapper: {
    alignItems: 'center',
  },
  stackContainer: {
    width: STACK_CARD_WIDTH,
    height: STACK_CARD_HEIGHT,
    position: 'relative',
  },
  stackCard: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    borderRadius: Radius.card,
    padding: Spacing['4'],
  },
  reviewCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  stackDotsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
    marginTop: Spacing['8'],
  },
  stackDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
  },

  // ------- Pricing -------
  pricingRow: {
    flexDirection: 'row',
    gap: Spacing['3'],
    marginBottom: Spacing['1'],
    alignItems: 'stretch',
  },
  pricingCard: {
    borderRadius: Radius.card,
    paddingHorizontal: Spacing['4'],
    paddingVertical: Spacing['4'],
    justifyContent: 'center',
  },
  yearlyCardWrapper: {
    position: 'relative',
  },
  saveBadge: {
    position: 'absolute',
    top: -10,
    alignSelf: 'center',
    zIndex: 1,
    paddingHorizontal: Spacing['2.5'],
    paddingVertical: Spacing['0.5'],
    borderRadius: Radius.full,
  },
  saveBadgeText: {
    fontFamily: FontFamily.uiSemiBold,
    fontSize: 10,
    letterSpacing: 0.5,
  },

  // ------- Bottom CTA -------
  bottomSection: {
    paddingHorizontal: Spacing['6'],
    paddingTop: Spacing['2'],
  },
  ctaContainer: {
    gap: 0,
  },
  noPaymentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing['3'],
  },
  ctaButton: {
    paddingVertical: Spacing['3.5'],
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
  },
  // iOS native shadow produces a true GPU-blurred colored halo that
  // actually feathers at the edges. Combined with the sin-wave animated
  // shadowOpacity in GlowingCTA, this creates a breathing aura. 34px
  // radius = tight glow hugging the button edges (down from 42, ~20%
  // reduction). Android falls back to elevation which won't produce a
  // visible colored glow (system uses a generic shadow color).
  ctaShadow: {
    shadowOffset: { width: 0, height: 0 },
    shadowRadius: 34,
    // shadowOpacity is animated by GlowingCTA — this is the max/fallback.
    shadowOpacity: Platform.OS === 'ios' ? 1 : 0,
    elevation: 18,
  },
});
