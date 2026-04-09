import { useState, useCallback, memo, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
  ActivityIndicator,
  FlatList,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeIn } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import LottieView from 'lottie-react-native';
import { CheckIcon, BookOpenIcon, StarIcon, PlayCircleIcon } from 'phosphor-react-native';
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
const TOTAL_PAGES = 3;

const DEVICE_BEZEL_WIDTH = SCREEN_WIDTH * 0.62;

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

const REVIEW_CARD_WIDTH = SCREEN_WIDTH - Spacing['6'] * 2;
const REVIEW_SNAP_INTERVAL = REVIEW_CARD_WIDTH + Spacing['2'];

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

/** Small dot indicators for the review carousel. */
function ReviewDots({
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
    <View style={styles.reviewDotsRow}>
      {Array.from({ length: total }).map((_, i) => (
        <View
          key={i}
          style={[
            styles.reviewDot,
            {
              backgroundColor: i === current ? accentColor : borderColor,
            },
          ]}
        />
      ))}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Screen 1: Product in Action
// ---------------------------------------------------------------------------

function ScreenProductInAction({ colors }: { colors: ColorTheme }) {
  return (
    <View style={styles.screen1Root}>
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

      {/* Gradient fade at the bottom -- feathers the bezel into bg */}
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
  return (
    <View style={styles.screen2Root}>
      {/* Vertically centered content group */}
      <View style={styles.screen2Content}>
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
  const savings = Math.round((1 - yearlyRaw / 12 / monthlyRaw) * 100);
  const yearlyMonthlyEquivalent =
    monthlyRaw > 0 ? `$${(yearlyRaw / 12).toFixed(2)}/mo` : yearlyPrice;

  const [activeReviewIndex, setActiveReviewIndex] = useState(0);
  const flatListRef = useRef<FlatList>(null);

  const onReviewScroll = useCallback(
    (e: { nativeEvent: { contentOffset: { x: number } } }) => {
      const index = Math.round(
        e.nativeEvent.contentOffset.x / REVIEW_SNAP_INTERVAL,
      );
      if (index >= 0 && index < REVIEWS.length) {
        setActiveReviewIndex(index);
      }
    },
    [],
  );

  return (
    <View style={styles.screen3Root}>
      {/* Logo + headline */}
      <View style={styles.screen3Header}>
        <BookOpenIcon size={28} color={colors.accent} weight="light" />
        <Text style={[styles.screen3Headline, { color: colors.text }]}>
          Your personal Bible{'\n'}experience
        </Text>

        {/* Social proof line */}
        <View style={styles.socialProofRow}>
          <Text
            style={{
              fontFamily: FontFamily.ui,
              fontSize: FontSize.xs,
              color: colors.textMuted,
            }}
          >
            Trusted by thousands
          </Text>
          <Text
            style={{
              fontFamily: FontFamily.ui,
              fontSize: FontSize.xs,
              color: colors.textSubtle,
              marginHorizontal: Spacing['1.5'],
            }}
          >
            {'\u00B7'}
          </Text>
          <Text
            style={{
              fontFamily: FontFamily.uiMedium,
              fontSize: FontSize.xs,
              color: colors.textMuted,
              marginRight: Spacing['1'],
            }}
          >
            4.8
          </Text>
          <FiveStars color={colors.accent} />
        </View>
      </View>

      {/* Horizontal review carousel -- breaks out of parent padding */}
      <View style={styles.reviewCarouselWrapper}>
        <FlatList
          ref={flatListRef}
          data={REVIEWS}
          horizontal
          showsHorizontalScrollIndicator={false}
          snapToInterval={REVIEW_SNAP_INTERVAL}
          decelerationRate="fast"
          onMomentumScrollEnd={onReviewScroll}
          keyExtractor={(item) => item.name}
          contentContainerStyle={styles.reviewFlatListContent}
          ItemSeparatorComponent={() => <View style={{ width: Spacing['2'] }} />}
          renderItem={({ item: review }) => (
            <View
              style={[
                styles.reviewCard,
                {
                  width: REVIEW_CARD_WIDTH,
                  backgroundColor: colors.inputBackground,
                  borderWidth: 1,
                  borderColor: colors.border,
                },
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
            </View>
          )}
        />
        <ReviewDots
          current={activeReviewIndex}
          total={REVIEWS.length}
          accentColor={colors.accent}
          borderColor={colors.border}
        />
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
        <View style={styles.yearlyCardWrapper}>
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

      {/* Renewal disclosure -- must fit one line */}
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
        {trialDays} days free, then {yearlyPrice}/yr. Cancel anytime.
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
      {/* Top bar: Skip (left) + Restore (right) */}
      <View style={[styles.topBar, { paddingTop: insets.top + Spacing['2'] }]}>
        <TouchableOpacity
          onPress={onSkip}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel="Skip trial"
        >
          <Text
            style={{
              fontFamily: FontFamily.ui,
              fontSize: FontSize.sm,
              color: colors.textSubtle,
            }}
          >
            Skip
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={handleRestore}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel="Restore purchases"
        >
          <Text
            style={{
              fontFamily: FontFamily.ui,
              fontSize: FontSize.sm,
              color: colors.textSubtle,
            }}
          >
            Restore
          </Text>
        </TouchableOpacity>
      </View>

      {/* Page content */}
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

      {/* Bottom section: CTA (no dots) */}
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

  // Top bar (Skip left, Restore right)
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing['5'],
    paddingBottom: Spacing['2'],
    zIndex: 10,
  },

  // ------- Screen 1 -------
  screen1Root: {
    flex: 1,
    overflow: 'hidden',
  },
  screen1TopSection: {
    paddingHorizontal: Spacing['8'],
    paddingTop: Spacing['6'],
  },
  screen1DeviceWrapper: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'flex-start',
    paddingTop: Spacing['6'],
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
    fontSize: FontSize['2xl'],
    lineHeight: Math.round(FontSize['2xl'] * 1.25),
    textAlign: 'center',
  },
  socialProofRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: Spacing['0.5'],
  },
  starsRow: {
    flexDirection: 'row',
    gap: 2,
  },

  // ------- Review carousel -------
  reviewCarouselWrapper: {
    // Break out of parent's paddingHorizontal so FlatList spans full width
    marginHorizontal: -Spacing['6'],
  },
  reviewFlatListContent: {
    paddingHorizontal: Spacing['6'],
  },
  reviewCard: {
    borderRadius: Radius.card,
    padding: Spacing['4'],
  },
  reviewCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  reviewDotsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
    marginTop: Spacing['2.5'],
  },
  reviewDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
  },

  // ------- Pricing -------
  pricingRow: {
    flexDirection: 'row',
    gap: Spacing['3'],
    marginBottom: Spacing['1'],
  },
  pricingCard: {
    flex: 1,
    borderRadius: Radius.card,
    paddingHorizontal: Spacing['4'],
    paddingVertical: Spacing['3.5'],
  },
  yearlyCardWrapper: {
    flex: 1,
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
