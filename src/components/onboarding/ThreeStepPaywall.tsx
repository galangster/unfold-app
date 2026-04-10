import { useState, useCallback, memo } from 'react';
import {
  View,
  Text,
  Image as RNImage,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
  ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
  FadeIn,
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  runOnJS,
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
import LaurelWreath from '../../../assets/images/laurel-wreath.svg';
import { EmberParticles } from '@/components/EmberParticles';

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
  onPurchaseSuccess: () => void;
  onSkip: () => void;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const TOTAL_PAGES = 3;

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

/** CTA label per screen index. */
function ctaLabel(page: number): string {
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

function ScreenProductInAction({ colors }: { colors: ColorTheme }) {
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
                We want you to try{'\n'}Unfold for free.
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
      {/* Logo + headline */}
      <View style={styles.screen3Header}>
        <RNImage
          source={require('../../../assets/icon-paywall.png')}
          style={{ width: 32, height: 32, tintColor: colors.accent, opacity: 0.9 }}
          resizeMode="contain"
        />
        <Text style={[styles.screen3Headline, { color: colors.text }]}>
          Your personal Bible experience
        </Text>

        {/* Social proof -- stacked inside real SVG laurel wreath. The
            wreath SVG uses preserveAspectRatio="none" so we can freely
            resize — made wider (260) so the leaf opening clears the text
            and shorter (72) so the wreath reads as low and wide rather
            than tall and cartoonish. */}
        <View style={styles.laurelContainer}>
          <LaurelWreath
            width={260}
            height={72}
            color={colors.accent}
            style={styles.laurelImage}
          />
          <View style={styles.laurelContent}>
            <Text
              style={{
                fontFamily: FontFamily.ui,
                fontSize: FontSize.xs,
                color: colors.textMuted,
                textAlign: 'center',
              }}
            >
              Trusted by thousands
            </Text>
            <View style={styles.ratingRow}>
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

function BottomCTA({
  colors,
  currentPage,
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
  trialDays: number;
  yearlyRaw: number;
  monthlyRaw: number;
  selectedPlan: 'yearly' | 'monthly';
  isLoading: boolean;
  purchaseError: string | null;
  onPress: () => void;
}) {
  const disclosureText =
    selectedPlan === 'yearly'
      ? `${trialDays} days free, then $${yearlyRaw.toFixed(2)}/yr. Cancel anytime.`
      : `${trialDays} days free, then $${(monthlyRaw * 12).toFixed(2)}/yr. Cancel anytime.`;

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

      {/* No payment due now -- reassurance line */}
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

      {/* Gold CTA button */}
      <TouchableOpacity
        activeOpacity={0.8}
        onPress={onPress}
        disabled={isLoading}
      >
        <View
          style={[styles.ctaButton, { backgroundColor: colors.accent }]}
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
              {ctaLabel(currentPage)}
            </Text>
          )}
        </View>
      </TouchableOpacity>

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
  onPurchaseSuccess,
  onSkip,
}: ThreeStepPaywallProps) {
  const insets = useSafeAreaInsets();
  const [currentPage, setCurrentPage] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [purchaseError, setPurchaseError] = useState<string | null>(null);
  const [selectedPlan, setSelectedPlan] = useState<'yearly' | 'monthly'>(
    'yearly',
  );

  // -----------------------------------------------------------------------
  // Navigation — CTA buttons only, no swipe
  // -----------------------------------------------------------------------

  const nextPage = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setCurrentPage((p) => Math.min(p + 1, TOTAL_PAGES - 1));
  }, []);

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
      if (result.reason !== 'user_cancelled') {
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
    if (currentPage < TOTAL_PAGES - 1) {
      nextPage();
    } else {
      handlePurchase();
    }
  }, [currentPage, nextPage, handlePurchase]);

  // -----------------------------------------------------------------------
  // Render
  // -----------------------------------------------------------------------

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      {/* Persistent ambient background — stays mounted across all three
          screens so the embers + gradient flow continuously as the user
          taps Continue, rather than restarting per screen. */}
      <EmberParticles color={colors.accent} count={18} bidirectional />
      <LinearGradient
        colors={['transparent', `${colors.accent}12`, `${colors.accent}24`]}
        style={styles.ambientGradient}
        pointerEvents="none"
      />

      {/* Page content — fills space between onboarding header and bottom CTA */}
      <View style={styles.flex1}>
        <Animated.View
          key={currentPage}
          entering={FadeIn.duration(Duration.normal)}
          style={styles.flex1}
        >
          {currentPage === 0 && (
            <ScreenProductInAction colors={colors} />
          )}
          {currentPage === 1 && (
            <ScreenTrialReminder colors={colors} trialDays={trialDays} />
          )}
          {currentPage === 2 && (
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
  // Persistent ambient gradient — sits behind all three paywall screens,
  // anchored to the bottom so warmth accumulates near the CTA.
  ambientGradient: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 380,
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
    fontSize: 22,
    lineHeight: Math.round(22 * 1.25),
    textAlign: 'center',
  },
  laurelContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    marginTop: Spacing['2'],
    width: 260,
    height: 72,
  },
  laurelImage: {
    position: 'absolute',
    opacity: 0.5,
  },
  laurelContent: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing['0.5'],
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
    width: '100%',
  },
});
