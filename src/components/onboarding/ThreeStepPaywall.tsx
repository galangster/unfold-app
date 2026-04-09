import { useState, useCallback, memo, useMemo } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
  Linking,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeIn, FadeOut, runOnJS } from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import * as Haptics from 'expo-haptics';
import LottieView from 'lottie-react-native';
import { XIcon, CheckIcon, BookOpenIcon, StarIcon } from 'phosphor-react-native';
import { FontFamily, FontSize } from '@/constants/fonts';
import { Spacing } from '@/constants/spacing';
import { Radius } from '@/constants/radius';
import { Duration } from '@/constants/animations';
import { purchasePackage, restorePurchases } from '@/lib/revenuecatClient';
import type { PurchasesPackage } from 'react-native-purchases';
import type { ColorTheme } from '@/constants/colors';

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
const SWIPE_THRESHOLD = SCREEN_WIDTH * 0.25;
const SWIPE_VELOCITY = 500;
const TOTAL_PAGES = 3;

const DEVICE_BEZEL_WIDTH = SCREEN_WIDTH * 0.7;
const DEVICE_BEZEL_ASPECT = 9 / 19.5;

const REVIEWS = [
  {
    name: 'Sarah',
    location: 'Nashville, TN',
    quote:
      "I've tried every devotional app. This one actually knows me. Day 3 hit different.",
  },
  {
    name: 'Marcus',
    location: 'Denver, CO',
    quote:
      'The companion asked me a question that stopped me mid-scroll. Nobody does that.',
  },
  {
    name: 'Priya',
    location: 'Austin, TX',
    quote:
      'I cried during my first devotional. It felt like someone actually listened.',
  },
] as const;

const TERMS_URL = 'https://unfoldapp.co/terms';
const PRIVACY_URL = 'https://unfoldapp.co/privacy';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** CTA label per screen index. */
function ctaLabel(page: number): string {
  if (page === 1) return 'Continue for FREE';
  return 'Try for $0.00';
}

// ---------------------------------------------------------------------------
// Sub-components (inline, single file)
// ---------------------------------------------------------------------------

/** Dot indicators for the three pages. */
function PageDots({
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
    <View style={styles.dotsRow}>
      {Array.from({ length: total }).map((_, i) => (
        <View
          key={i}
          style={[
            styles.dot,
            {
              width: i === current ? 20 : 6,
              backgroundColor: i <= current ? accentColor : borderColor,
            },
          ]}
        />
      ))}
    </View>
  );
}

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

// ---------------------------------------------------------------------------
// Screen 1: Product in Action
// ---------------------------------------------------------------------------

function ScreenProductInAction({ colors }: { colors: ColorTheme }) {
  return (
    <View style={styles.screenCenter}>
      {/* Headline */}
      <Text
        style={[
          styles.headline,
          { color: colors.text },
        ]}
      >
        We want you to try Unfold for free.
      </Text>

      {/* Device bezel */}
      <View
        style={[
          styles.deviceBezel,
          {
            width: DEVICE_BEZEL_WIDTH,
            borderColor: '#2A2A2A',
          },
        ]}
      >
        <View style={styles.deviceInner}>
          <Text
            style={{
              fontFamily: FontFamily.uiMedium,
              fontSize: FontSize.sm,
              color: colors.accent,
            }}
          >
            Preview coming soon
          </Text>
        </View>
      </View>
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
  return (
    <View style={styles.screenCenter}>
      {/* Headline */}
      <Text
        style={[
          styles.headline,
          { color: colors.text },
        ]}
      >
        We'll send you a reminder before your free trial ends
      </Text>

      {/* Lottie bell */}
      <View style={styles.bellContainer}>
        <LottieView
          source={require('../../../assets/lottie/bell-notification.json')}
          autoPlay
          loop
          style={styles.bellLottie}
          colorFilters={[
            { keypath: 'Bell Frame', color: colors.accent },
            { keypath: 'Bell Bottom', color: colors.accent },
          ]}
        />

        {/* Day badge */}
        <View
          style={[
            styles.dayBadge,
            {
              backgroundColor: colors.inputBackground,
              borderColor: colors.border,
            },
          ]}
        >
          <Text
            style={{
              fontFamily: FontFamily.uiMedium,
              fontSize: FontSize.sm,
              color: colors.textMuted,
            }}
          >
            Day {trialDays - 1}
          </Text>
        </View>
      </View>
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
  trialDays,
  selectedPlan,
  onSelectPlan,
  onRestore,
}: {
  colors: ColorTheme;
  yearlyPrice: string;
  monthlyPrice: string;
  yearlyRaw: number;
  monthlyRaw: number;
  trialDays: number;
  selectedPlan: 'yearly' | 'monthly';
  onSelectPlan: (plan: 'yearly' | 'monthly') => void;
  onRestore: () => void;
}) {
  const savings = Math.round((1 - yearlyRaw / 12 / monthlyRaw) * 100);
  const yearlyMonthlyEquivalent =
    monthlyRaw > 0
      ? `$${(yearlyRaw / 12).toFixed(2)}/mo`
      : yearlyPrice;

  return (
    <ScrollView
      style={styles.flex1}
      contentContainerStyle={styles.screen3Content}
      showsVerticalScrollIndicator={false}
      bounces={false}
    >
      {/* Logo + headline */}
      <View style={styles.screen3Header}>
        <BookOpenIcon size={32} color={colors.accent} weight="light" />
        <Text
          style={[
            styles.screen3Headline,
            { color: colors.text },
          ]}
        >
          Your personal Bible experience
        </Text>

        {/* Social proof line */}
        <View style={styles.socialProofRow}>
          <Text
            style={{
              fontFamily: FontFamily.ui,
              fontSize: FontSize.sm,
              color: colors.textMuted,
            }}
          >
            Trusted by thousands
          </Text>
          <Text
            style={{
              fontFamily: FontFamily.ui,
              fontSize: FontSize.sm,
              color: colors.textMuted,
              marginHorizontal: Spacing['1.5'],
            }}
          >
            {'\u00B7'}
          </Text>
          <Text
            style={{
              fontFamily: FontFamily.ui,
              fontSize: FontSize.sm,
              color: colors.textMuted,
              marginRight: Spacing['1'],
            }}
          >
            4.8
          </Text>
          <FiveStars color={colors.accent} />
        </View>
      </View>

      {/* Review cards */}
      <View style={styles.reviewsContainer}>
        {REVIEWS.map((review) => (
          <View
            key={review.name}
            style={[
              styles.reviewCard,
              {
                backgroundColor: colors.inputBackground,
                borderColor: colors.border,
              },
            ]}
          >
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
                color: colors.textMuted,
                marginTop: Spacing['0.5'],
              }}
            >
              {review.location}
            </Text>
            <Text
              style={{
                fontFamily: FontFamily.body,
                fontSize: FontSize.sm,
                color: colors.textMuted,
                marginTop: Spacing['2'],
                lineHeight: 20,
              }}
            >
              "{review.quote}"
            </Text>
          </View>
        ))}
      </View>

      {/* Pricing cards */}
      <View style={styles.pricingRow}>
        {/* Monthly */}
        <TouchableOpacity
          activeOpacity={0.7}
          onPress={() => onSelectPlan('monthly')}
          style={[
            styles.pricingCard,
            {
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
              fontSize: FontSize.xs,
              color: colors.textMuted,
              textTransform: 'uppercase',
              letterSpacing: 1,
            }}
          >
            Monthly
          </Text>
          <Text
            style={{
              fontFamily: FontFamily.uiSemiBold,
              fontSize: FontSize.lg,
              color: selectedPlan === 'monthly' ? colors.accent : colors.text,
              marginTop: Spacing['2'],
            }}
          >
            {monthlyPrice}/mo
          </Text>
        </TouchableOpacity>

        {/* Yearly */}
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
              fontSize: FontSize.xs,
              color: colors.textMuted,
              textTransform: 'uppercase',
              letterSpacing: 1,
            }}
          >
            Yearly
          </Text>
          <Text
            style={{
              fontFamily: FontFamily.uiSemiBold,
              fontSize: FontSize.lg,
              color: selectedPlan === 'yearly' ? colors.accent : colors.text,
              marginTop: Spacing['2'],
            }}
          >
            {yearlyMonthlyEquivalent}
          </Text>
          <Text
            style={{
              fontFamily: FontFamily.ui,
              fontSize: FontSize.xs,
              color: colors.textMuted,
              marginTop: Spacing['1'],
            }}
          >
            {yearlyPrice}/year
          </Text>

          {/* Badges */}
          <View style={styles.badgeRow}>
            {savings > 0 && (
              <View
                style={[
                  styles.badge,
                  { backgroundColor: colors.accent },
                ]}
              >
                <Text style={styles.badgeText}>SAVE {savings}%</Text>
              </View>
            )}
            <View
              style={[
                styles.badge,
                { backgroundColor: colors.accent },
              ]}
            >
              <Text style={styles.badgeText}>
                {trialDays}-DAY FREE TRIAL
              </Text>
            </View>
          </View>
        </TouchableOpacity>
      </View>

      {/* Links row */}
      <View style={styles.linksRow}>
        <TouchableOpacity
          onPress={() => Linking.openURL(TERMS_URL)}
          hitSlop={8}
        >
          <Text style={[styles.linkText, { color: colors.textHint }]}>
            Terms of use
          </Text>
        </TouchableOpacity>

        <Text style={[styles.linkSeparator, { color: colors.textHint }]}>
          {'\u00B7'}
        </Text>

        <TouchableOpacity
          onPress={() => Linking.openURL(PRIVACY_URL)}
          hitSlop={8}
        >
          <Text style={[styles.linkText, { color: colors.textHint }]}>
            Privacy policy
          </Text>
        </TouchableOpacity>

        <Text style={[styles.linkSeparator, { color: colors.textHint }]}>
          {'\u00B7'}
        </Text>

        <TouchableOpacity
          onPress={onRestore}
          hitSlop={8}
        >
          <Text style={[styles.linkText, { color: colors.textHint }]}>
            Restore
          </Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

// ---------------------------------------------------------------------------
// Shared Bottom CTA Section
// ---------------------------------------------------------------------------

function BottomCTA({
  colors,
  currentPage,
  trialDays,
  yearlyPrice,
  isLoading,
  purchaseError,
  onPress,
}: {
  colors: ColorTheme;
  currentPage: number;
  trialDays: number;
  yearlyPrice: string;
  isLoading: boolean;
  purchaseError: string | null;
  onPress: () => void;
}) {
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

      {/* No payment due now */}
      <View style={styles.noPaymentRow}>
        <CheckIcon size={16} color={colors.textMuted} weight="bold" />
        <Text
          style={{
            fontFamily: FontFamily.ui,
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
        activeOpacity={0.7}
        onPress={onPress}
        disabled={isLoading}
      >
        <View
          style={[
            styles.ctaButton,
            { backgroundColor: colors.accent },
          ]}
        >
          {isLoading ? (
            <ActivityIndicator color={colors.background} size="small" />
          ) : (
            <Text
              style={{
                fontFamily: FontFamily.uiMedium,
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

      {/* Renewal disclosure */}
      <Text
        style={{
          fontFamily: FontFamily.ui,
          fontSize: FontSize.sm,
          color: colors.textMuted,
          textAlign: 'center',
          marginTop: Spacing['3'],
        }}
      >
        {trialDays} days free, then {yearlyPrice}/year. Cancel anytime.
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
  // Navigation
  // -----------------------------------------------------------------------

  const nextPage = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setCurrentPage((p) => Math.min(p + 1, TOTAL_PAGES - 1));
  }, []);

  const prevPage = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setCurrentPage((p) => Math.max(p - 1, 0));
  }, []);

  const swipeGesture = useMemo(
    () =>
      Gesture.Pan()
        .activeOffsetX([-20, 20])
        .onEnd((e) => {
          if (
            e.translationX < -SWIPE_THRESHOLD ||
            e.velocityX < -SWIPE_VELOCITY
          ) {
            runOnJS(nextPage)();
          } else if (
            e.translationX > SWIPE_THRESHOLD ||
            e.velocityX > SWIPE_VELOCITY
          ) {
            runOnJS(prevPage)();
          }
        }),
    [nextPage, prevPage],
  );

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
      {/* Close button */}
      <TouchableOpacity
        onPress={onSkip}
        hitSlop={12}
        style={[styles.closeButton, { top: insets.top + Spacing['2'] }]}
        accessibilityRole="button"
        accessibilityLabel="Close"
      >
        <XIcon size={24} color={colors.textMuted} weight="regular" />
      </TouchableOpacity>

      {/* Page content */}
      <GestureDetector gesture={swipeGesture}>
        <View style={[styles.flex1, { paddingTop: insets.top + Spacing['12'] }]}>
          <Animated.View
            key={currentPage}
            entering={FadeIn.duration(Duration.normal)}
            exiting={FadeOut.duration(Duration.fast)}
            style={styles.flex1}
          >
            {currentPage === 0 && (
              <ScreenProductInAction colors={colors} />
            )}
            {currentPage === 1 && (
              <ScreenTrialReminder
                colors={colors}
                trialDays={trialDays}
              />
            )}
            {currentPage === 2 && (
              <ScreenPricing
                colors={colors}
                yearlyPrice={yearlyPrice}
                monthlyPrice={monthlyPrice}
                yearlyRaw={yearlyRaw}
                monthlyRaw={monthlyRaw}
                trialDays={trialDays}
                selectedPlan={selectedPlan}
                onSelectPlan={setSelectedPlan}
                onRestore={handleRestore}
              />
            )}
          </Animated.View>
        </View>
      </GestureDetector>

      {/* Bottom section: dots + CTA */}
      <View
        style={[
          styles.bottomSection,
          { paddingBottom: Math.max(insets.bottom, Spacing['4']) },
        ]}
      >
        <PageDots
          current={currentPage}
          total={TOTAL_PAGES}
          accentColor={colors.accent}
          borderColor={colors.border}
        />

        <BottomCTA
          colors={colors}
          currentPage={currentPage}
          trialDays={trialDays}
          yearlyPrice={yearlyPrice}
          isLoading={isLoading}
          purchaseError={purchaseError}
          onPress={handleCTAPress}
        />
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

  // Close button
  closeButton: {
    position: 'absolute',
    right: Spacing['5'],
    zIndex: 10,
  },

  // Screen layout
  screenCenter: {
    flex: 1,
    paddingHorizontal: Spacing['6'],
    justifyContent: 'center',
    gap: Spacing['8'],
  },

  // Headlines
  headline: {
    fontFamily: FontFamily.display,
    fontSize: 26,
    lineHeight: Math.round(26 * 1.2),
  },

  // Device bezel (Screen 1)
  deviceBezel: {
    alignSelf: 'center',
    borderWidth: 2,
    borderRadius: 40,
    overflow: 'hidden',
  },
  deviceInner: {
    width: '100%',
    aspectRatio: DEVICE_BEZEL_ASPECT,
    backgroundColor: '#111111',
    justifyContent: 'center',
    alignItems: 'center',
  },

  // Bell (Screen 2)
  bellContainer: {
    alignItems: 'center',
    gap: Spacing['4'],
  },
  bellLottie: {
    width: 120,
    height: 120,
  },
  dayBadge: {
    paddingHorizontal: Spacing['4'],
    paddingVertical: Spacing['2'],
    borderRadius: Radius.full,
    borderWidth: 1,
  },

  // Screen 3
  screen3Content: {
    paddingHorizontal: Spacing['6'],
    paddingBottom: Spacing['4'],
    gap: Spacing['6'],
  },
  screen3Header: {
    alignItems: 'center',
    gap: Spacing['3'],
  },
  screen3Headline: {
    fontFamily: FontFamily.display,
    fontSize: FontSize['2xl'],
    lineHeight: Math.round(FontSize['2xl'] * 1.2),
    textAlign: 'center',
  },
  socialProofRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  starsRow: {
    flexDirection: 'row',
    gap: 2,
  },

  // Reviews
  reviewsContainer: {
    gap: Spacing['3'],
  },
  reviewCard: {
    borderRadius: Radius.card,
    padding: Spacing['4'],
    borderWidth: 1,
  },

  // Pricing
  pricingRow: {
    flexDirection: 'row',
    gap: Spacing['3'],
  },
  pricingCard: {
    flex: 1,
    borderRadius: Radius.card,
    padding: Spacing['4'],
  },
  badgeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing['1.5'],
    marginTop: Spacing['3'],
  },
  badge: {
    paddingHorizontal: Spacing['2'],
    paddingVertical: Spacing['1'],
    borderRadius: Radius.sm,
  },
  badgeText: {
    fontFamily: FontFamily.uiSemiBold,
    fontSize: 10,
    color: '#FFFFFF',
    letterSpacing: 0.5,
  },

  // Links
  linksRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: Spacing['2'],
    paddingTop: Spacing['2'],
  },
  linkText: {
    fontFamily: FontFamily.ui,
    fontSize: FontSize.xs,
  },
  linkSeparator: {
    fontFamily: FontFamily.ui,
    fontSize: FontSize.xs,
  },

  // Dots
  dotsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
    marginBottom: Spacing['4'],
  },
  dot: {
    height: 6,
    borderRadius: 3,
  },

  // Bottom CTA
  bottomSection: {
    paddingHorizontal: Spacing['6'],
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
    paddingVertical: Spacing['4'],
    borderRadius: Radius.md,
    alignItems: 'center',
    width: '100%',
  },
});
