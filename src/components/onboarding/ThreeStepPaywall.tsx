import { useState, useCallback, useEffect, useRef, memo } from 'react';
import {
  View,
  Text,
  Image as RNImage,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
  ActivityIndicator,
  Platform,
  Linking,
} from 'react-native';
import type { LayoutChangeEvent } from 'react-native';
import { Image as ExpoImage } from 'expo-image';
import { LEGAL_LINKS } from '@/lib/push-notification-helpers';
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
  useReducedMotion,
} from 'react-native-reanimated';
import type { SharedValue } from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import LottieView from 'lottie-react-native';
import { useVideoPlayer, VideoView } from 'expo-video';
import { CheckIcon } from '@/components/icons';
import { alpha } from '@/components/ui';
import { FontFamily, FontSize } from '@/constants/fonts';
import { Spacing } from '@/constants/spacing';
import { Radius } from '@/constants/radius';
import { Duration, Ease } from '@/constants/animations';
import { useQueryClient } from '@tanstack/react-query';
import {
  POST_PURCHASE_ENTITLEMENT_WAIT_MS,
  purchasePackage,
  restorePurchases,
  getOfferings,
  waitForUnfoldPremiumEntitlement,
} from '@/lib/revenuecatClient';
import { PURCHASE_PLANS_UNAVAILABLE_MESSAGE } from '@/lib/paywall-purchase-readiness';
import { getPaywallRenewalDisclosure } from '@/lib/paywall-disclosure';
import { syncTrialEndingNotification } from '@/lib/trial-notification';
import { logger } from '@/lib/logger';
import type { PurchasesPackage } from 'react-native-purchases';
import type { ColorTheme } from '@/constants/colors';
import { EmberSystem } from '@/components/EmberSystem';
import type { ExclusionZone } from '@/lib/ember-system';
import { ExclusiveOfferSheet } from '@/components/ExclusiveOfferSheet';
import { mmkvStorage } from '@/lib/mmkv-storage';
import { isQaToolsEnabled } from '@/lib/qa-tools';
import { getPerMonthEquivalent } from '@/lib/paywall-pricing';
import {
  computeMockupSize,
  computePaywallDragOffset,
  MOCKUP_MIN_HEIGHT,
  MOCKUP_TOP_PADDING,
} from '@/lib/paywall-mockup-size';
import {
  getThreeStepPaywallPrimaryAction,
  PAYWALL_ENTITLEMENT_PENDING_CUE,
  resolveOnboardingPurchaseAdvance,
  resolveRestoreOutcome,
  runGuardedPaywallFlow,
} from '@/lib/paywall-guardrails';

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
  // True once RC offerings have loaded and both packages are present (PRICE-1).
  // When false, price strings are hidden and the purchase CTA is disabled
  // with a 'Loading plans… / Tap to retry' state.
  offeringsReady: boolean;
  onRetryOfferings: () => void;
  onPurchaseSuccess: () => void;
  onSkip: () => void;
  // Every-build exit from the paywall. The stack disables the back gesture and
  // there is no close control, so before this the only ways out were a
  // purchase, a restore that found a subscription, or force-quitting the app.
  // Distinct from onSkip, which stays QA-only.
  onDecideLater: () => void;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const TOTAL_PAGES_WITH_TRIAL = 3;
const TOTAL_PAGES_NO_TRIAL = 2;

// No aggregate store rating is shown anywhere on this surface: the app has no
// App Store rating yet (first release), and inventing one is a Guideline
// 2.3.1 misrepresentation. If a real store rating exists later, reintroduce it
// from live App Store data, never a hardcoded constant.

// Shared SAVE-badge dim level — the badge is full strength while the yearly
// plan is selected and dims to this opacity when the user focuses monthly.
// paywall.tsx hardcodes the same value; keep them in lockstep so the SAVE
// badge behaves identically across both paywall surfaces.
const SAVE_BADGE_DIMMED_OPACITY = 0.45;

// Screens 1 and 2 follow the finger through the rubber-band in
// computePaywallDragOffset and spring back with this on release.
const DRAG_RETURN_SPRING = { damping: 30, stiffness: 300, mass: 1, overshootClamping: true };

// Ember exclusion zones (normalized): benefit copy band + the stacked-card
// dot indicators — stray embers next to the dots read as faux pagination.
const PAYWALL_COPY_EXCLUSION: ReadonlyArray<ExclusionZone> = [
  { x: 0.08, y: 0.3, width: 0.84, height: 0.34 },
  { x: 0.25, y: 0.66, width: 0.5, height: 0.06 },
];

const REVIEWS = [
  {
    name: 'Sarah M.',
    location: 'Nashville, TN',
    quote:
      'I opened this on a random Tuesday morning and the devotional was EXACTLY what I needed to hear. Like eerily specific to what I was going through. Genuinely grateful for this app.',
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
      'This is the first quiet time app where I actually WANT to come back every day. The journal prompts are so good and the companion actually asks good questions back',
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
    return isFinal ? 'Unlock Premium' : 'Continue';
  }
  if (page === 0) return 'Start Free Trial';
  if (page === 1) return 'See your free trial';
  // No dollar figure in the CTA: a zero-dollar price there was the most
  // conspicuous price on the screen, competing with the billed amount (3.1.2c).
  return 'Start My Free Trial';
}

// ---------------------------------------------------------------------------
// Sub-components (inline, single file)
// ---------------------------------------------------------------------------

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
  activeIndex: SharedValue<number>;
  dismissX: SharedValue<number>;
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

// Custom Reanimated entering animation for the device mockup. Defined at
// module scope so the same worklet runs on every mount without re-creation.
//
// Option A choreography (cinematic — intentionally longer than Emil's
// "< 350ms for product UI" rule because this is a premium paywall moment,
// not a tap response):
//
//   - opacity:    0    → 1    over 700ms   (Easing.out(quad))
//   - translateY: 140  → 0    over 1600ms  (easeOutExpo bezier)
//   - scale:      0.90 → 1    over 1600ms  (easeOutExpo bezier)
//
// Opacity lands first so the phone visibly "materializes," then the
// transform keeps drifting into place after the fade completes — gives
// that slow-to-a-stop cinematic feel without any bounce/overshoot.
// easeOutExpo (0.16, 1, 0.3, 1) is the classic "decelerate dramatically
// then gently settle" curve. Still no overshoot — final value is reached
// asymptotically, never crossed.
//
// Respects system Reduce Motion via Reanimated's built-in handling of
// `entering` — when Reduce Motion is on, the view appears at its final
// state instantly.
const CINEMATIC_EASE = Easing.bezier(0.16, 1, 0.3, 1);
function phoneEntering() {
  'worklet';
  const animations = {
    opacity: withTiming(1, { duration: 700, easing: Easing.out(Easing.quad) }),
    transform: [
      { translateY: withTiming(0, { duration: 1600, easing: CINEMATIC_EASE }) },
      { scale: withTiming(1, { duration: 1600, easing: CINEMATIC_EASE }) },
    ],
  };
  const initialValues = {
    opacity: 0,
    transform: [{ translateY: 140 }, { scale: 0.9 }],
  };
  return { initialValues, animations };
}

function ScreenProductInAction({
  colors,
  hasFreeTrial,
  player,
  hasMountedVideo,
}: {
  colors: ColorTheme;
  hasFreeTrial: boolean;
  player: ReturnType<typeof useVideoPlayer>;
  hasMountedVideo: boolean;
}) {
  // Walkthrough video player is owned by the parent ThreeStepPaywall so it
  // stays alive across Screen 1 ↔ Screen 2 transitions. This eliminates the
  // Screen 2 → Screen 1 race where a freshly-created AVPlayer would wedge
  // in an error state, AND lets the first frame decode while the user is
  // first arriving (no load gap).

  // Poster layer: a static JPG of the video's first frame sits behind the
  // VideoView and fades out once onFirstFrameRender confirms the video
  // itself is actually rendering. User never sees a black gap.
  const posterOpacity = useSharedValue(1);
  const posterStyle = useAnimatedStyle(() => ({
    opacity: posterOpacity.value,
  }));
  const handleFirstFrame = useCallback(() => {
    posterOpacity.value = withTiming(0, { duration: 200 });
  }, [posterOpacity]);

  // Deferred VideoView mount. VideoView is a heavy native view —
  // AVPlayerViewController-backed — and its first mount runs in the same
  // Fabric commit as Screen 1 entering, which stalls the `phoneEntering`
  // worklet for ~1s. `hasMountedVideo` is owned by ThreeStepPaywall so it
  // only pays the cost once per paywall session (not per Screen 1 remount).
  // When reduced motion is on, the parent initializes it to `true` so there
  // is no dead zone at all — the phone doesn't animate either way.

  const dragY = useSharedValue(0);

  const dragGesture = Gesture.Pan()
    .activeOffsetY([-8, 8])
    .failOffsetX([-24, 24])
    .shouldCancelWhenOutside(false)
    .onUpdate((e) => {
      'worklet';
      dragY.value = computePaywallDragOffset(e.translationY);
    })
    .onFinalize(() => {
      'worklet';
      dragY.value = withSpring(0, DRAG_RETURN_SPRING);
    });

  const dragStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: dragY.value }],
  }));

  // The bezel is sized from the space the wrapper actually has between the
  // headline and the CTA block, so the rounded frame bottom stays visible on
  // every iPhone height and at large Dynamic Type. Sizing from the window
  // width alone made the frame ~1.34x the screen width tall — taller than the
  // page area on every supported device — so it was always clipped in a
  // straight line where the CTA block begins. Nothing renders until the
  // first layout so no wrong-size frame is ever painted (the entering
  // animation would hide it, but Reduce Motion skips that animation).
  const [wrapperLayout, setWrapperLayout] = useState<{ width: number; height: number } | null>(
    null,
  );
  const handleWrapperLayout = useCallback((e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setWrapperLayout((prev) =>
      prev && prev.width === width && prev.height === height ? prev : { width, height },
    );
  }, []);
  const mockupSize = wrapperLayout
    ? computeMockupSize({
        availableHeight: wrapperLayout.height,
        availableWidth: wrapperLayout.width,
      })
    : null;

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
                // Tighter than the global 1.8 cap: at AX sizes the headline
                // would otherwise eat the page area the phone mockup needs.
                maxFontSizeMultiplier={1.3}
              >
                {hasFreeTrial
                  ? `We want you to try\nUnfold for free.`
                  : `Unlock everything\nUnfold can do.`}
              </Text>
            </View>

            {/* Device bezel -- sized to fit the wrapper so the rounded frame
                bottom sits MOCKUP_BOTTOM_CLEARANCE above the CTA block, a gap
                that also covers the drag gesture's downward peak. It only
                overflows (and fades) below MOCKUP_MIN_HEIGHT. The entrance is
                `phoneEntering` above. */}
            <Animated.View
              testID="paywall-mockup-wrapper"
              style={styles.screen1DeviceWrapper}
              entering={phoneEntering}
              onLayout={handleWrapperLayout}
            >
              {mockupSize && (
                <View
                  testID="paywall-mockup-bezel"
                  style={[
                    styles.deviceBezel,
                    {
                      width: mockupSize.width,
                      height: mockupSize.height,
                      borderColor: 'rgba(255,255,255,0.1)',
                    },
                  ]}
                >
                  <View style={styles.deviceInner}>
                    {/* Poster: static first frame, visible until the video's
                        first real frame renders. Prevents the black-gap flash
                        while AVPlayerItem initializes. Fades to 0 over 200ms
                        via onFirstFrameRender so the transition is seamless. */}
                    <Animated.View
                      pointerEvents="none"
                      style={[StyleSheet.absoluteFill, posterStyle]}
                    >
                      <ExpoImage
                        source={require('../../../assets/video/paywall-walkthrough-poster.jpg')}
                        style={StyleSheet.absoluteFill}
                        contentFit="cover"
                        cachePolicy="memory-disk"
                      />
                    </Animated.View>
                    {hasMountedVideo && (
                      <VideoView
                        player={player}
                        style={styles.deviceVideo}
                        contentFit="cover"
                        nativeControls={false}
                        onFirstFrameRender={handleFirstFrame}
                        // Content is a silent app walkthrough — no audio to
                        // route and no PiP expected from a paywall background.
                        allowsPictureInPicture={false}
                        fullscreenOptions={{ enable: false }}
                      />
                    )}
                  </View>
                </View>
              )}
            </Animated.View>
          </Animated.View>
        </View>
      </GestureDetector>

      {/* Gradient fade at the bottom -- only when the frame is too tall for
          the page and gets clipped. Stays fixed, doesn't move with drag.
          Built from the theme background so it matches the forced-dark
          onboarding surface (and any future theme) instead of a hardcoded
          grey. */}
      {mockupSize?.overflows && (
        <LinearGradient
          testID="paywall-mockup-fade"
          colors={[alpha(colors.background, 0), alpha(colors.background, 0.85), colors.background]}
          style={styles.screen1Gradient}
          pointerEvents="none"
        />
      )}
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
  const reducedMotion = useReducedMotion();
  const dragY = useSharedValue(0);

  const dragGesture = Gesture.Pan()
    .activeOffsetY([-8, 8])
    .failOffsetX([-24, 24])
    .shouldCancelWhenOutside(false)
    .onUpdate((e) => {
      'worklet';
      dragY.value = computePaywallDragOffset(e.translationY);
    })
    .onFinalize(() => {
      'worklet';
      dragY.value = withSpring(0, DRAG_RETURN_SPRING);
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
                autoPlay={!reducedMotion}
                loop={!reducedMotion}
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
              You'll get a notification {trialDays <= 3 ? '1 day' : trialDays === 7 ? '2 days' : '1 day'} before
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
  // Guideline 3.1.2(c): the billed amount ({yearlyPrice}/yr) must be the most
  // conspicuous pricing element on the card. The per-month equivalent may only
  // appear subordinate to it — smaller, muted, beneath the billed price.
  // Shared trunc-to-cent formatter — both paywalls must show the same $/mo.
  const yearlyMonthlyEquivalent = yearlyPrice
    ? `${getPerMonthEquivalent(yearlyRaw, yearlyPrice)}/mo`
    : '';

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

        {/* Social proof — honest framing only: these are quotes from early
            testers, not App Store reviews, and there is no store rating yet
            to cite (2.3.1). */}
        <View style={styles.socialProofCaption}>
          <Text
            style={{
              fontFamily: FontFamily.ui,
              fontSize: FontSize.xs,
              color: colors.textMuted,
            }}
          >
            What early readers are saying
          </Text>
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
          activeOpacity={1}
          onPress={() => onSelectPlan('monthly')}
          accessibilityLabel={`Monthly plan, ${monthlyPrice} per month`}
          accessibilityRole="radio"
          accessibilityState={{ selected: selectedPlan === 'monthly', checked: selectedPlan === 'monthly' }}
          style={[
            styles.pricingCard,
            {
              width: PRICING_BOX_WIDTH,
              backgroundColor: selectedPlan === 'monthly'
                ? alpha(colors.accent, 0.16)
                : colors.inputBackground,
              borderColor:
                selectedPlan === 'monthly' ? colors.accent : colors.border,
              borderWidth: selectedPlan === 'monthly' ? 2 : 1,
            },
          ]}
        >
          <Text
            style={{
              fontFamily: selectedPlan === 'monthly' ? FontFamily.uiSemiBold : FontFamily.uiMedium,
              fontSize: 11,
              color: selectedPlan === 'monthly' ? colors.accent : colors.textSubtle,
            }}
          >
            Monthly
          </Text>
          {monthlyPrice ? (
            <>
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
              <Text
                style={{
                  fontFamily: FontFamily.ui,
                  fontSize: FontSize.xs,
                  color: colors.textMuted,
                  marginTop: 2,
                }}
              >
                billed monthly
              </Text>
            </>
          ) : (
            <ActivityIndicator size="small" color={colors.accent} style={{ marginTop: Spacing['1.5'] }} />
          )}
        </TouchableOpacity>

        {/* Yearly -- with SAVE badge on top border */}
        <View style={[styles.yearlyCardWrapper, { width: PRICING_BOX_WIDTH }]}>
          {/* SAVE badge overlapping top border */}
          {savings > 0 && (
            <View
              style={[
                styles.saveBadge,
                {
                  backgroundColor: colors.accent,
                  // Shared SAVE-badge dim rule (must match paywall.tsx): full
                  // strength on the selected yearly plan, dimmed when the user
                  // has moved focus to monthly so the badge stops shouting.
                  opacity: selectedPlan === 'yearly' ? 1 : SAVE_BADGE_DIMMED_OPACITY,
                },
              ]}
              accessibilityElementsHidden
              importantForAccessibility="no-hide-descendants"
            >
              <Text
                style={[
                  styles.saveBadgeText,
                  { color: colors.background },
                ]}
              >
                Save {savings}%
              </Text>
            </View>
          )}
          <TouchableOpacity
            activeOpacity={1}
            onPress={() => onSelectPlan('yearly')}
            accessibilityLabel={`Yearly plan, ${yearlyPrice} per year${savings > 0 ? `, save ${savings} percent` : ''}`}
            accessibilityRole="radio"
            accessibilityState={{ selected: selectedPlan === 'yearly', checked: selectedPlan === 'yearly' }}
            style={[
              styles.pricingCard,
              {
                backgroundColor: selectedPlan === 'yearly'
                  ? alpha(colors.accent, 0.16)
                  : colors.inputBackground,
                borderColor:
                  selectedPlan === 'yearly' ? colors.accent : colors.border,
                borderWidth: selectedPlan === 'yearly' ? 2 : 1,
              },
            ]}
          >
            <Text
              style={{
                fontFamily: selectedPlan === 'yearly' ? FontFamily.uiSemiBold : FontFamily.uiMedium,
                fontSize: 11,
                color: selectedPlan === 'yearly' ? colors.accent : colors.textSubtle,
              }}
            >
              Yearly
            </Text>
            {yearlyPrice ? (
              <>
                {/* Billed amount is the primary price (3.1.2c) */}
                <Text
                  style={{
                    fontFamily: FontFamily.uiSemiBold,
                    fontSize: FontSize.lg,
                    color:
                      selectedPlan === 'yearly' ? colors.accent : colors.text,
                    marginTop: Spacing['1.5'],
                  }}
                >
                  {yearlyPrice}
                  <Text
                    style={{
                      fontFamily: FontFamily.ui,
                      fontSize: FontSize.sm,
                      color: colors.textMuted,
                    }}
                  >
                    /yr
                  </Text>
                </Text>
                <Text
                  style={{
                    fontFamily: FontFamily.ui,
                    fontSize: FontSize.xs,
                    color: colors.textMuted,
                    marginTop: 2,
                  }}
                >
                  {yearlyMonthlyEquivalent} equivalent
                </Text>
              </>
            ) : (
              <ActivityIndicator size="small" color={colors.accent} style={{ marginTop: Spacing['1.5'] }} />
            )}
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
  disabled = false,
}: {
  label: string;
  colors: ColorTheme;
  onPress: () => void;
  isLoading: boolean;
  /**
   * Inert and dimmed, with no spinner of its own. Set while a completed
   * purchase waits on its Premium grant: the pending block above the button
   * already carries the spinner, and a second purchase would abort that wait.
   */
  disabled?: boolean;
}) {
  // Seamless breathing halo — uses a linear phase counter (0 → 1 → 0 → 1...)
  // mapped through a sine wave so the shadowOpacity rises and falls
  // continuously with no visible "pause" at the extremes. ping-pong via
  // withRepeat(...true) + easing curves can feel jittery because each
  // iteration re-interpolates from a fixed keyframe; a sin wave gives a
  // true continuous oscillation.
  const reducedMotion = useReducedMotion();
  const phase = useSharedValue(0);

  useEffect(() => {
    if (reducedMotion) return;
    phase.value = withRepeat(
      withTiming(1, { duration: 3600, easing: Easing.linear }),
      -1,
      false,
    );
    return () => cancelAnimation(phase);
  }, [phase, reducedMotion]);

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
    <TouchableOpacity activeOpacity={0.7} onPress={onPress} disabled={isLoading || disabled}>
      <Animated.View
        style={[
          styles.ctaButton,
          styles.ctaShadow,
          { backgroundColor: colors.accent, shadowColor: colors.accent },
          shadowStyle,
          disabled && styles.ctaButtonInert,
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
  yearlyPrice,
  monthlyPrice,
  yearlyRaw,
  monthlyRaw,
  selectedPlan,
  isLoading,
  purchaseError,
  entitlementPendingMessage,
  offeringsReady,
  onPress,
}: {
  colors: ColorTheme;
  currentPage: number;
  totalPages: number;
  hasFreeTrial: boolean;
  trialDays: number;
  yearlyPrice: string;
  monthlyPrice: string;
  yearlyRaw: number;
  monthlyRaw: number;
  selectedPlan: 'yearly' | 'monthly';
  isLoading: boolean;
  purchaseError: string | null;
  /** Set while a completed purchase waits on its Premium grant. Not an error. */
  entitlementPendingMessage: string | null;
  offeringsReady: boolean;
  onPress: () => void;
}) {
  // `hasFreeTrial` reflects yearly-plan eligibility only. Monthly has its own
  // cadence and its own (unverified) intro-offer state, so the moment the user
  // selects monthly on the pricing screen we must stop promising a trial —
  // CTA copy, reassurance row, and disclosure all need to reflect that.
  // Guideline 3.1.2 misrepresentation risk otherwise.
  const effectiveHasTrial = hasFreeTrial && selectedPlan === 'yearly';

  // Renewal disclosure honors the offerings loading state (RV-UI-3): null while
  // offerings are absent (prices are '' until RC resolves — PRICE-1), otherwise
  // RC's locale-aware priceStrings, never '$' around raw numbers (FAP-UI-2).
  const disclosureText = getPaywallRenewalDisclosure({
    offeringsReady,
    selectedPlan,
    hasFreeTrial: effectiveHasTrial, // verified for the SELECTED plan — monthly intro state is unverified here
    trialDays,
    yearlyPrice,
    monthlyPrice,
  });

  return (
    <View style={styles.ctaContainer}>
      {/* Grant pending: the person has paid, so this is a "finishing up"
          cue in neutral colours, never the error treatment below. */}
      {entitlementPendingMessage && (
        <View style={styles.pendingBlock} accessibilityLiveRegion="polite">
          <View style={styles.pendingRow}>
            <ActivityIndicator size="small" color={colors.accent} />
            <Text
              style={{
                fontFamily: FontFamily.uiMedium,
                fontSize: FontSize.sm,
                color: colors.text,
                marginLeft: Spacing['1.5'],
              }}
            >
              {PAYWALL_ENTITLEMENT_PENDING_CUE}
            </Text>
          </View>
          <Text
            style={{
              fontFamily: FontFamily.ui,
              fontSize: FontSize.sm,
              color: colors.textMuted,
              textAlign: 'center',
            }}
          >
            {entitlementPendingMessage}
          </Text>
        </View>
      )}

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
        // The person has paid and the grant is on its way. The most prominent
        // control on the screen must not invite a second purchase that would
        // abort the wait; Restore purchases stays live as the fallback.
        disabled={entitlementPendingMessage !== null}
      />

      {/* Renewal disclosure -- reflects selected plan; hidden until offerings
          resolve so we never render price-less text (RV-UI-3). Must NOT clamp:
          this is the App-Review 3.1.2 billing sentence, and a 1-line ellipsis
          under large Dynamic Type would cut the renewal terms mid-sentence on a
          payment screen. Wrap freely; cap the multiplier so it stays bounded. */}
      {disclosureText != null && (
        <Text
          maxFontSizeMultiplier={1.4}
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
      )}
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
  offeringsReady,
  onRetryOfferings,
  onPurchaseSuccess,
  onSkip,
  onDecideLater,
}: ThreeStepPaywallProps) {
  const insets = useSafeAreaInsets();
  const reducedMotion = useReducedMotion();
  const queryClient = useQueryClient();
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
  // Walkthrough video player (hoisted from ScreenProductInAction)
  //
  // Owned by ThreeStepPaywall so the player's lifecycle spans the entire
  // paywall session — created on paywall open, released on paywall close.
  // Key benefits:
  //   1. First frame decodes in parallel with the rest of the paywall
  //      mounting, so by the time Screen 1's onFirstFrameRender fires the
  //      video is typically already buffered → instant transition from
  //      poster image to live video.
  //   2. Advancing to Screen 2 no longer tears down the player, so the
  //      Screen 2 → Screen 1 back-nav race (AVPlayer wedging on rapid
  //      recreate with the same local asset) is impossible by construction.
  //   3. Video state is preserved across nav — the loop keeps running.
  //
  // The statusChange listener is belt-and-suspenders: if play() races the
  // source load on a cold mount, we retry once the player reports
  // readyToPlay. Listener is scoped to this player instance and released
  // when useVideoPlayer tears down at paywall close.
  const walkthroughPlayer = useVideoPlayer(
    require('../../../assets/video/paywall-walkthrough-optimized.mp4'),
    (p) => {
      p.loop = true;
      p.muted = true;
      // iOS AVPlayer default is `automaticallyWaitsToMinimizeStalling = true`
      // with `preferredForwardBufferDuration = 0` (auto). For a bundled local
      // asset that's safely decodable, that "auto" can introduce a multi-
      // second stall before the first frame renders — AVPlayer waits until
      // it estimates playback won't stall. We want the video to paint
      // instantly, so we opt out of the stall-minimization heuristic and
      // ask for a tiny forward buffer. Local file, no network, no stall
      // risk — safe to start immediately.
      p.bufferOptions = {
        waitsToMinimizeStalling: false,
        preferredForwardBufferDuration: 1,
        // These two are Android-only but setting them is a no-op on iOS:
        minBufferForPlayback: 0,
        maxBufferBytes: 0,
      };
      p.addListener('statusChange', ({ status, error }) => {
        if (status === 'readyToPlay' && !p.playing) {
          p.play();
        } else if (status === 'error') {
          logger.warn('[ThreeStepPaywall] video player error:', error);
        }
      });
      p.play();
    },
  );

  // -----------------------------------------------------------------------
  // Deferred VideoView mount latch
  //
  // VideoView is an expensive native view (AVPlayerViewController-backed).
  // Mounting it in the same initial Fabric commit as Screen 1 `entering`
  // stalls the JS→UI handshake and the phone `phoneEntering` worklet
  // waits ~1s before firing. We defer mounting VideoView for 1700ms so
  // the phone's cinematic entrance has the commit to itself, then flip
  // the latch and let the video pop in behind the already-painted poster.
  //
  // Latch lives on the parent so it is one-shot per paywall session — it
  // survives Screen 1 → Screen 2 → Screen 1 back-nav and does NOT re-arm
  // the 1700ms dead zone on every remount.
  //
  // Under reduced motion, initialize to true: the phone does not animate
  // anyway, so there's no entrance to protect and the video should be
  // live from the first frame.
  const [hasMountedVideo, setHasMountedVideo] = useState(reducedMotion);
  useEffect(() => {
    if (hasMountedVideo) return;
    const id = setTimeout(() => setHasMountedVideo(true), 1700);
    return () => clearTimeout(id);
  }, [hasMountedVideo]);

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

  // The one exit that advances onboarding. Every path that ends in Premium —
  // purchase, restore, the exclusive offer, a late entitlement — goes through
  // here, so a second callback (a restore racing a purchase, the listener
  // firing after a success) can never advance twice.
  const advancedRef = useRef(false);
  // Copy shown while a completed transaction waits on its Premium grant; null
  // when nothing is pending. Kept apart from purchaseError on purpose: the
  // person has paid, so this state gets neutral styling and no error haptic.
  const [entitlementPendingMessage, setEntitlementPendingMessage] = useState<string | null>(null);

  const advanceOnce = useCallback((): boolean => {
    if (advancedRef.current) return false;
    advancedRef.current = true;
    setEntitlementPendingMessage(null);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    // Navigate first. The notification sync reads customer info with no
    // timeout; awaiting it before onPurchaseSuccess once held a paying person
    // on the paywall, and a rejection cancelled the advance outright.
    onPurchaseSuccess();
    syncTrialEndingNotification().catch((error: unknown) => {
      logger.log('[ThreeStepPaywall] trial notification sync failed after purchase:', error);
    });
    return true;
  }, [onPurchaseSuccess]);

  // While a completed transaction waits on its entitlement, one bounded wait
  // (the SDK listener plus a 2 s poll) is the exit: the grant arrives, the
  // paywall advances, and nobody has to find Restore purchases. When the wait
  // gives up, the same copy moves to the error slot so its Restore guidance
  // reads as the next step, and the listener is already gone. Unmount aborts
  // the wait, so no listener outlives this screen.
  useEffect(() => {
    if (entitlementPendingMessage === null) return;
    const controller = new AbortController();
    void waitForUnfoldPremiumEntitlement(POST_PURCHASE_ENTITLEMENT_WAIT_MS, {
      signal: controller.signal,
    }).then((customerInfo) => {
      if (controller.signal.aborted) return;
      if (customerInfo) {
        advanceOnce();
        return;
      }
      setEntitlementPendingMessage(null);
      setPurchaseError(entitlementPendingMessage);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    });
    return () => controller.abort();
  }, [entitlementPendingMessage, advanceOnce]);

  // Both handlers are wrapped in runGuardedPaywallFlow so a rejected
  // purchasePackage / restorePurchases / fetchQuery can never leave isLoading
  // stuck at true (a permanent CTA spinner): loading is ALWAYS cleared and a
  // thrown error surfaces a message. Success/cancel branches are unchanged.
  const handlePurchase = useCallback(() => runGuardedPaywallFlow({
    setLoading: setIsLoading,
    setError: setPurchaseError,
    onError: () => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error),
    run: async () => {
      let pkg = selectedPlan === 'yearly' ? yearlyPackage : monthlyPackage;
      if (!pkg) {
        setIsLoading(true);
        setPurchaseError(null);
        const fresh = await queryClient.fetchQuery({ queryKey: ['revenuecat', 'offerings'], queryFn: getOfferings, staleTime: 0 });
        const freshOfferings = fresh?.ok ? fresh.data : null;
        pkg = freshOfferings?.current?.availablePackages.find(
          (p) => p.identifier === (selectedPlan === 'yearly' ? '$rc_annual' : '$rc_monthly'),
        );
        if (!pkg) {
          setPurchaseError(PURCHASE_PLANS_UNAVAILABLE_MESSAGE);
          return;
        }
      }
      setIsLoading(true);
      setPurchaseError(null);
      // A fresh attempt owns the wait from here; purchasePackage listens for
      // the grant itself, and a stale UI deadline must not fire underneath it.
      // handleCTAPress keeps the CTA inert while a grant is pending, so in
      // practice this only clears an already-null state.
      setEntitlementPendingMessage(null);
      const result = await purchasePackage(pkg);

      const decision = resolveOnboardingPurchaseAdvance({ result, hasAdvanced: advancedRef.current });
      switch (decision.action) {
        case 'advance':
          advanceOnce();
          return;
        case 'noop':
          return;
        case 'cancelled': {
          const hasSeenOnboardingOffer = mmkvStorage.getItem('@unfold_onboarding_offer_seen') === 'true';
          if (!hasSeenOnboardingOffer) {
            setShowExclusiveOffer(true);
          }
          return;
        }
        case 'wait_for_entitlement':
          // Not a failure: the store transaction is done and only the grant
          // is late. No error haptic, and the copy renders in the neutral
          // pending slot with a "finishing up" cue, not the error slot.
          setEntitlementPendingMessage(decision.message);
          return;
        case 'error':
          setPurchaseError(decision.message);
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
          return;
      }
    },
  }), [selectedPlan, yearlyPackage, monthlyPackage, advanceOnce, queryClient]);

  // The exclusive offer is a real purchase surface, so it needs the same two
  // exits the main CTA has: a dismissal only marks the offer seen, while a
  // completed purchase or restore must advance the onboarding flow. Without
  // the second exit a person who paid inside the sheet stayed on the paywall.
  const dismissExclusiveOffer = useCallback(() => {
    mmkvStorage.setItem('@unfold_onboarding_offer_seen', 'true');
    setShowExclusiveOffer(false);
  }, []);

  const handleDecideLater = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onDecideLater();
  }, [onDecideLater]);

  const handleExclusiveOfferPurchaseSuccess = useCallback(() => {
    dismissExclusiveOffer();
    advanceOnce();
  }, [dismissExclusiveOffer, advanceOnce]);

  const handleRestore = useCallback(() => runGuardedPaywallFlow({
    setLoading: setIsLoading,
    setError: setPurchaseError,
    errorMessage: 'Could not restore purchases. Please try again.',
    onError: () => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning),
    run: async () => {
      setIsLoading(true);
      setPurchaseError(null);
      const result = await restorePurchases();

      const outcome = resolveRestoreOutcome(result);
      if (outcome.kind === 'success') {
        advanceOnce();
        return;
      }

      setPurchaseError(outcome.message);
      Haptics.notificationAsync(
        Haptics.NotificationFeedbackType.Warning,
      );
    },
  }), [advanceOnce]);

  // -----------------------------------------------------------------------
  // CTA press: navigate on screens 1-2, purchase on screen 3
  // -----------------------------------------------------------------------

  const handleCTAPress = useCallback(() => {
    const action = getThreeStepPaywallPrimaryAction(
      currentPage,
      totalPages,
      stableHasFreeTrial,
    );

    if (action === 'next') {
      nextPage();
      return;
    }

    // A completed purchase is waiting on its grant. Buying again would abort
    // that wait and re-open the store sheet for a product the person already
    // owns, which is the Restore-only dead end Jordan hit. The button is also
    // disabled; this guard covers any press that reaches the handler anyway.
    if (entitlementPendingMessage !== null) {
      return;
    }

    handlePurchase();
  }, [currentPage, totalPages, stableHasFreeTrial, nextPage, handlePurchase, entitlementPendingMessage]);

  // -----------------------------------------------------------------------
  // Render
  // -----------------------------------------------------------------------

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      {/* Persistent ember field — stays mounted across all three screens so
          the embers flow continuously as the user taps Continue rather than
          restarting per screen. Excluded over benefit copy and page dots. */}
      <EmberSystem
        variant="ambient"
        direction="both"
        count={14}
        exclusionZones={PAYWALL_COPY_EXCLUSION}
      />

      {/* Page content — fills space between onboarding header and bottom CTA */}
      <View style={styles.flex1}>
        <Animated.View
          key={currentPage}
          entering={reducedMotion ? undefined : FadeIn.duration(Duration.normal).easing(Ease.out)}
          style={styles.flex1}
        >
          {currentPage === 0 && (
            <ScreenProductInAction
              colors={colors}
              hasFreeTrial={stableHasFreeTrial}
              player={walkthroughPlayer}
              hasMountedVideo={hasMountedVideo}
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

      {/* Bottom section: CTA + restore/legal links */}
      <View
        style={[
          styles.bottomSection,
          { paddingBottom: Math.max(insets.bottom, Spacing['4']) },
        ]}
      >
        {/* When offerings haven't resolved, show a loading / retry state instead of the
            purchase CTA so we never render a non-store-derived price (PRICE-1). */}
        {!offeringsReady && currentPage === totalPages - 1 ? (
          <View style={{ alignItems: 'center', paddingVertical: Spacing['3'], gap: Spacing['2'] }}>
            <Text style={{ fontFamily: FontFamily.ui, fontSize: FontSize.sm, color: colors.textMuted }}>
              Loading plans…
            </Text>
            <TouchableOpacity
              activeOpacity={0.6}
              onPress={onRetryOfferings}
              hitSlop={{ top: 8, bottom: 8, left: 12, right: 12 }}
              style={{ paddingVertical: 4, paddingHorizontal: 12 }}
              accessibilityRole="button"
              accessibilityLabel="Tap to retry loading plans"
            >
              <Text style={{ fontFamily: FontFamily.uiMedium, fontSize: FontSize.sm, color: colors.accent }}>
                Tap to retry
              </Text>
            </TouchableOpacity>
          </View>
        ) : (
          <BottomCTA
            colors={colors}
            currentPage={currentPage}
            totalPages={totalPages}
            hasFreeTrial={stableHasFreeTrial}
            trialDays={trialDays}
            yearlyPrice={yearlyPrice}
            monthlyPrice={monthlyPrice}
            yearlyRaw={yearlyRaw}
            monthlyRaw={monthlyRaw}
            selectedPlan={selectedPlan}
            isLoading={isLoading}
            purchaseError={purchaseError}
            entitlementPendingMessage={entitlementPendingMessage}
            offeringsReady={offeringsReady}
            onPress={currentPage === totalPages - 1 && !offeringsReady ? () => {} : handleCTAPress}
          />
        )}
        {isQaToolsEnabled() && currentPage === totalPages - 1 && (
          <TouchableOpacity
            activeOpacity={1}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              onSkip();
            }}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel="Continue without premium for QA"
            style={styles.qaSkipButton}
          >
            <Text style={[styles.qaSkipText, { color: colors.accent }]}>Continue for QA</Text>
          </TouchableOpacity>
        )}
        {/* Dignified exit. Ships in EVERY build — this is not QA-gated and must
            not be folded into the isQaToolsEnabled() block above. It renders on
            the final page whether or not offerings loaded: a person who cannot
            even see a price is the most trapped of all. Quiet text link only —
            no background, no border — so it never competes with the CTA. */}
        {currentPage === totalPages - 1 && (
          <TouchableOpacity
            activeOpacity={0.6}
            onPress={handleDecideLater}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel="I'll decide later"
            style={styles.decideLaterButton}
          >
            <Text style={[styles.decideLaterText, { color: colors.textMuted }]}>
              I'll decide later
            </Text>
          </TouchableOpacity>
        )}
        <View
          style={{
            alignSelf: 'center',
            marginTop: Spacing['2'],
            flexDirection: 'row',
            alignItems: 'center',
            flexWrap: 'wrap',
            justifyContent: 'center',
            columnGap: Spacing['1.5'],
          }}
        >
          <TouchableOpacity
            onPress={handleRestore}
            hitSlop={12}
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
          <Text style={{ fontFamily: FontFamily.ui, fontSize: FontSize.xs, color: colors.textSubtle }}>
            ·
          </Text>
          <TouchableOpacity
            onPress={() => Linking.openURL(LEGAL_LINKS.terms)}
            hitSlop={12}
            accessibilityRole="link"
            accessibilityLabel="Terms"
          >
            <Text
              style={{
                fontFamily: FontFamily.ui,
                fontSize: FontSize.xs,
                color: colors.textHint,
              }}
            >
              Terms
            </Text>
          </TouchableOpacity>
          <Text style={{ fontFamily: FontFamily.ui, fontSize: FontSize.xs, color: colors.textSubtle }}>
            ·
          </Text>
          <TouchableOpacity
            onPress={() => Linking.openURL(LEGAL_LINKS.privacy)}
            hitSlop={12}
            accessibilityRole="link"
            accessibilityLabel="Privacy"
          >
            <Text
              style={{
                fontFamily: FontFamily.ui,
                fontSize: FontSize.xs,
                color: colors.textHint,
              }}
            >
              Privacy
            </Text>
          </TouchableOpacity>
        </View>
      </View>
      <ExclusiveOfferSheet
        visible={showExclusiveOffer}
        onDismiss={dismissExclusiveOffer}
        onPurchaseSuccess={handleExclusiveOfferPurchaseSuccess}
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
    paddingTop: MOCKUP_TOP_PADDING,
  },
  screen1Gradient: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    // Covers the floor-height frame that overflows the page, so the fade
    // and the frame it hides stay in lockstep.
    height: MOCKUP_MIN_HEIGHT,
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
    fontSize: 25,
    lineHeight: Math.round(25 * 1.25),
    letterSpacing: -0.15,
  },

  // ------- Device bezel (Screen 1) -------
  deviceBezel: {
    alignSelf: 'center',
    borderWidth: 1,
    borderRadius: 36,
    overflow: 'hidden',
  },
  deviceInner: {
    // The bezel carries the computed width/height (9:19.5); fill it.
    width: '100%',
    height: '100%',
    backgroundColor: '#0F0F0F',
    // overflow:hidden on the parent deviceBezel already clips to the 36px
    // radius, but Android can leak native video surfaces past rounded
    // borders — give the inner its own matching clip as defense in depth.
    overflow: 'hidden',
  },
  deviceVideo: {
    width: '100%',
    height: '100%',
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
    fontSize: 32,
    lineHeight: Math.round(32 * 1.1),
    letterSpacing: -0.15,
    textAlign: 'center',
    marginTop: Spacing['2'],
  },
  // Social proof caption — sits just above the testimonial card carousel so
  // the early-reader framing reads as a caption attached to the quotes.
  socialProofCaption: {
    alignItems: 'center',
    marginTop: Spacing['4'],
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
  },

  // ------- Bottom CTA -------
  bottomSection: {
    paddingHorizontal: Spacing['6'],
    paddingTop: Spacing['2'],
  },
  ctaContainer: {
    gap: 0,
  },
  pendingBlock: {
    alignItems: 'center',
    marginBottom: Spacing['2'],
  },
  pendingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing['1'],
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
  // Disabled without a spinner: the pending block above already shows one.
  ctaButtonInert: {
    opacity: 0.5,
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
  qaSkipButton: {
    alignSelf: 'center',
    marginTop: Spacing['2.5'],
    paddingHorizontal: Spacing['3'],
    paddingVertical: Spacing['1.5'],
  },
  qaSkipText: {
    fontFamily: FontFamily.uiMedium,
    fontSize: FontSize.xs,
    letterSpacing: 0.2,
  },
  // Quiet text link: no background, no border, no accent. Colour is applied
  // inline from colors.textMuted so it never reads as a second CTA.
  decideLaterButton: {
    alignSelf: 'center',
    marginTop: Spacing['2.5'],
    paddingHorizontal: Spacing['3'],
    paddingVertical: Spacing['1.5'],
  },
  decideLaterText: {
    fontFamily: FontFamily.ui,
    fontSize: FontSize.sm,
    letterSpacing: 0.2,
  },
});
