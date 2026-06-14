import { useEffect, useState, useMemo } from 'react';
import { View, Text, ActivityIndicator, Linking, ScrollView, Image, Platform, Pressable } from 'react-native';
import { LEGAL_LINKS } from '@/lib/push-notification-helpers';
import { TouchableOpacity } from 'react-native-gesture-handler';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeIn, FadeInDown, useReducedMotion } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import * as Application from 'expo-application';
import Constants from 'expo-constants';
import { XIcon, PaletteIcon, BookOpenTextIcon, InfinityIcon, PencilLineIcon, CircleNotchIcon, CheckIcon, XCircleIcon, BellIcon, CreditCardIcon, SunHorizonIcon, BooksIcon, ChatCircleDotsIcon } from 'phosphor-react-native';
import MaskedView from '@react-native-masked-view/masked-view';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '@/lib/theme';
import { EmberSystem } from '@/components/EmberSystem';
import type { ExclusionZone } from '@/lib/ember-system';
import { alpha } from '@/components/ui';
import { FontFamily, FontSize } from '@/constants/fonts';
import { Radius } from '@/constants/radius';
import { Spacing } from '@/constants/spacing';
import { Duration, Ease } from '@/constants/animations';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getOfferings, purchasePackage, restorePurchases, isRevenueCatEnabled } from '@/lib/revenuecatClient';
import { syncTrialEndingNotification } from '@/lib/trial-notification';
import {
  resolvePaywallCompletionNavigation,
  resolvePurchaseOutcome,
  resolveRestoreOutcome,
} from '@/lib/paywall-guardrails';
import type { PurchasesPackage } from 'react-native-purchases';
import Purchases from 'react-native-purchases';
import { useUnfoldStore } from '@/lib/store';
import { logger } from '@/lib/logger';
import {
  isPaywallDiagnosticsEnabled,
  recordPaywallDiagnosticLazy,
  summarizeCustomerInfo,
  summarizeDiagnosticIdentifier,
  summarizeOfferings,
  summarizePackage,
  summarizeRevenueCatError,
} from '@/lib/paywall-diagnostics';
import { ExclusiveOfferSheet } from '@/components/ExclusiveOfferSheet';
import { mmkvStorage } from '@/lib/mmkv-storage';
import { getPerMonthEquivalent } from '@/lib/paywall-pricing';
import { getPaywallRenewalDisclosure } from '@/lib/paywall-disclosure';

type PlanChoice = 'yearly' | 'monthly';

// Shared SAVE-badge dim level — the badge is full strength while the yearly
// plan is selected and dims to this opacity when the user focuses monthly.
// ThreeStepPaywall.tsx hardcodes the same value; keep them in lockstep so the
// SAVE badge behaves identically across both paywall surfaces.
const SAVE_BADGE_DIMMED_OPACITY = 0.45;

// Hard exclusion over the pricing cards, CTA, and renewal disclosure — falling
// embers must never collide with payment copy (normalized screen rect).
const PAYWALL_TEXT_EXCLUSION: ReadonlyArray<ExclusionZone> = [
  { x: 0, y: 0.52, width: 1, height: 0.48 },
];

// Height of the soft fade band at each scroll boundary, as a fraction of the
// scroll viewport. Content fades over the top ~6% and bottom ~6% so rows never
// hard-clip mid-glyph where the scroll region meets the drag handle / footer.
const PAYWALL_FADE_BAND = 0.06;

/** Get human-readable trial duration from a package */
function getTrialDuration(pkg: PurchasesPackage | undefined | null): string | null {
  if (!pkg) return null;
  const intro = pkg.product.introPrice;
  if (!intro || intro.price !== 0) return null;

  const count = intro.periodNumberOfUnits;
  const unit = intro.periodUnit.toLowerCase();

  if (unit === 'day') return `${count}-day`;
  if (unit === 'week') return `${count * 7}-day`;
  if (unit === 'month') return `${count}-month`;
  if (unit === 'year') return `${count}-year`;
  return `${count}-${unit}`;
}

export default function PaywallScreen() {
  const reducedMotion = useReducedMotion();
  const router = useRouter();
  const { source } = useLocalSearchParams<{ source?: string }>();
  const isFromOnboarding = source === 'onboarding' || source === 'onboarding_early';
  const isEarlyOnboarding = source === 'onboarding_early';
  const queryClient = useQueryClient();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [selectedPlan, setSelectedPlan] = useState<PlanChoice>('yearly');
  const [showExclusiveOffer, setShowExclusiveOffer] = useState(false);
  const updateUser = useUnfoldStore((s) => s.updateUser);
  const currentDevotionalId = useUnfoldStore((s) => s.currentDevotionalId);

  const completePaywallFlow = () => {
    const navigation = resolvePaywallCompletionNavigation({
      isEarlyOnboarding,
      isFromOnboarding,
      currentDevotionalId,
    });

    if (navigation.action === 'back') {
      router.back();
      return;
    }

    router.replace(navigation.href);
  };

  // Pull user's onboarding data for personalization
  const userName = useUnfoldStore((s) => s.user?.name);
  const firstName = userName?.split(' ')[0];

  const { data: offeringsResult, isLoading: isLoadingOfferings, refetch: refetchOfferings } = useQuery({
    queryKey: ['revenuecat', 'offerings'],
    queryFn: getOfferings,
    enabled: isRevenueCatEnabled(),
    retry: 3,
    retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 8000),
    staleTime: 1000 * 60 * 10, // 10 min — offerings rarely change
  });

  const offerings = offeringsResult?.ok ? offeringsResult.data : null;
  const monthlyPackage = offerings?.current?.availablePackages.find(
    (pkg) => pkg.identifier === '$rc_monthly'
  );
  const yearlyPackage = offerings?.current?.availablePackages.find(
    (pkg) => pkg.identifier === '$rc_annual'
  );
  // Both store-verified prices must be present before we render any price text,
  // the renewal disclosure, or enable the subscribe CTA (PRICE-1).
  const offeringsReady = Boolean(yearlyPackage && monthlyPackage);
  const offeringsResultOk = offeringsResult?.ok ?? null;
  const offeringsResultReason = offeringsResult && !offeringsResult.ok ? offeringsResult.reason : null;
  const currentOfferingIdentifier = offerings?.current?.identifier ?? null;
  const monthlyPackageIdentifier = monthlyPackage?.identifier ?? null;
  const monthlyProductIdentifier = monthlyPackage?.product.identifier ?? null;
  const yearlyPackageIdentifier = yearlyPackage?.identifier ?? null;
  const yearlyProductIdentifier = yearlyPackage?.product.identifier ?? null;
  const diagnosticOfferingsSummary = useMemo(
    () => (isPaywallDiagnosticsEnabled() ? summarizeOfferings(offerings) : null),
    [offerings],
  );
  const diagnosticMonthlyPackageSummary = useMemo(
    () => (isPaywallDiagnosticsEnabled() ? summarizePackage(monthlyPackage) : null),
    [monthlyPackage],
  );
  const diagnosticYearlyPackageSummary = useMemo(
    () => (isPaywallDiagnosticsEnabled() ? summarizePackage(yearlyPackage) : null),
    [yearlyPackage],
  );

  useEffect(() => {
    if (!isPaywallDiagnosticsEnabled()) return;

    void (async () => {
      let currentAppUserID: string | null = null;
      let storefrontCountryCode: string | null = null;
      let canMakePayments: boolean | null = null;
      let capabilityError: unknown = null;

      try {
        if (isRevenueCatEnabled()) {
          currentAppUserID = await Purchases.getAppUserID();
          canMakePayments = await Purchases.canMakePayments();
          if (Platform.OS === 'ios') {
            const storefront = await Purchases.getStorefront();
            storefrontCountryCode = storefront?.countryCode ?? null;
          }
        }
      } catch (error) {
        capabilityError = summarizeRevenueCatError(error);
      }

      void recordPaywallDiagnosticLazy('paywall.environment_snapshot', () => ({
        source,
        isFromOnboarding,
        isEarlyOnboarding,
        revenueCatEnabled: isRevenueCatEnabled(),
        currentAppUserID: summarizeDiagnosticIdentifier(currentAppUserID),
        canMakePayments,
        storefrontCountryCode,
        capabilityError,
        app: {
          nativeApplicationVersion: Application.nativeApplicationVersion,
          nativeBuildVersion: Application.nativeBuildVersion,
          appOwnership: Constants.appOwnership,
        },
        platform: {
          os: Platform.OS,
          version: String(Platform.Version),
        },
      }));
    })();
  }, [source, isFromOnboarding, isEarlyOnboarding]);

  useEffect(() => {
    if (!isPaywallDiagnosticsEnabled()) return;

    void recordPaywallDiagnosticLazy('paywall.offerings_state', () => ({
      source,
      selectedPlan,
      isFromOnboarding,
      isEarlyOnboarding,
      revenueCatEnabled: isRevenueCatEnabled(),
      isLoadingOfferings,
      offeringsResultOk,
      offeringsResultReason,
      offerings: diagnosticOfferingsSummary,
      monthlyPackage: diagnosticMonthlyPackageSummary,
      yearlyPackage: diagnosticYearlyPackageSummary,
    }));
  }, [
    source,
    selectedPlan,
    isFromOnboarding,
    isEarlyOnboarding,
    isLoadingOfferings,
    offeringsResultOk,
    offeringsResultReason,
    currentOfferingIdentifier,
    monthlyPackageIdentifier,
    monthlyProductIdentifier,
    yearlyPackageIdentifier,
    yearlyProductIdentifier,
    diagnosticOfferingsSummary,
    diagnosticMonthlyPackageSummary,
    diagnosticYearlyPackageSummary,
  ]);

  const isRevenueCatDisabled = !isRevenueCatEnabled();

  // Check trial eligibility via RevenueCat SDK
  const { data: trialEligibility } = useQuery({
    queryKey: ['revenuecat', 'trialEligibility'],
    queryFn: async () => {
      try {
        const productIds = [
          monthlyPackage?.product.identifier,
          yearlyPackage?.product.identifier,
        ].filter(Boolean) as string[];
        if (productIds.length === 0) return null;
        const result = await Purchases.checkTrialOrIntroductoryPriceEligibility(productIds);
        return result;
      } catch {
        return null;
      }
    },
    enabled: isRevenueCatEnabled() && !!(monthlyPackage || yearlyPackage),
  });

  // Determine trial eligibility — default false until RevenueCat confirms.
  // Never fall back to SKU config (packageHasFreeTrial) because that doesn't
  // know whether THIS user already used their trial (churned users, etc.).
  const isTrialEligible = useMemo(() => {
    const selectedPkg = selectedPlan === 'yearly' ? yearlyPackage : monthlyPackage;
    if (!selectedPkg || !trialEligibility) return false;

    const eligibility = trialEligibility[selectedPkg.product.identifier];
    return eligibility?.status === 2;
  }, [selectedPlan, yearlyPackage, monthlyPackage, trialEligibility]);

  // Trial duration strings
  const yearlyTrialDuration = getTrialDuration(yearlyPackage) ?? '3-day';
  const monthlyTrialDuration = getTrialDuration(monthlyPackage) ?? '3-day';
  const selectedTrialDuration = selectedPlan === 'yearly' ? yearlyTrialDuration : monthlyTrialDuration;

  const purchaseMutation = useMutation({
    mutationFn: (pkg: PurchasesPackage) => purchasePackage(pkg),
    onSuccess: async (result) => {
      void recordPaywallDiagnosticLazy('paywall.purchase.mutation_success', () => (result.ok
        ? {
            ok: true,
            customerInfo: summarizeCustomerInfo(result.data),
          }
        : {
            ok: false,
            reason: result.reason,
            error: summarizeRevenueCatError(result.error),
          }));

      if (result.ok) {
        const activeEntitlements = result.data.entitlements.active;
        const hasPremium = Boolean(activeEntitlements?.['Unfold Premium']);
        logger.log(
          '[Paywall] Purchase succeeded. Active entitlements:',
          JSON.stringify(Object.keys(activeEntitlements ?? {})),
          'hasPremium:', hasPremium,
          'allEntitlements:', JSON.stringify(Object.keys(result.data.entitlements.all ?? {})),
        );

        const outcome = resolvePurchaseOutcome(result);
        if (outcome.kind !== 'success') {
          logger.log('[Paywall] WARNING: Purchase ok but no Unfold Premium entitlement. Check RevenueCat dashboard.');
          void recordPaywallDiagnosticLazy('paywall.purchase.no_premium_entitlement', () => ({
            outcomeMessage: outcome.message,
            customerInfo: summarizeCustomerInfo(result.data),
          }), 'warn');
          setSubscribeError(outcome.message);
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
          return;
        }

        updateUser({ isPremium: true });

        await syncTrialEndingNotification();

        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        void recordPaywallDiagnosticLazy('paywall.purchase.entitlement_active', () => ({
          customerInfo: summarizeCustomerInfo(result.data),
        }));
        queryClient.invalidateQueries({ queryKey: ['revenuecat'] });
        completePaywallFlow();
      } else if (result.reason === 'user_cancelled') {
        void recordPaywallDiagnosticLazy('paywall.purchase.user_cancelled', () => ({}), 'warn');
        const hasSeenOnboardingOffer = mmkvStorage.getItem('@unfold_onboarding_offer_seen') === 'true';
        if (!hasSeenOnboardingOffer) {
          setShowExclusiveOffer(true);
        }
        return;
      } else if (result.reason === 'timeout') {
        logger.log('[Paywall] Purchase timed out');
        void recordPaywallDiagnosticLazy('paywall.purchase.timeout', () => ({
          error: summarizeRevenueCatError(result.error),
        }), 'error');
        setSubscribeError('Purchase took too long. Please check your connection and try again.');
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      } else {
        // Actual SDK error
        logger.log('[Paywall] Purchase did not complete:', JSON.stringify(result));
        void recordPaywallDiagnosticLazy('paywall.purchase.sdk_error', () => ({
          reason: result.reason,
          error: summarizeRevenueCatError(result.error),
        }), 'error');
        setSubscribeError('Something went wrong. Please try again.');
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      }
    },
    onError: (error) => {
      logger.log('[Paywall] Purchase error:', error);
      void recordPaywallDiagnosticLazy('paywall.purchase.mutation_error', () => ({
        error: summarizeRevenueCatError(error),
      }), 'error');
      setSubscribeError('Something went wrong. Please try again.');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    },
  });

  const restoreMutation = useMutation({
    mutationFn: restorePurchases,
    onSuccess: async (result) => {
      void recordPaywallDiagnosticLazy('paywall.restore.mutation_success', () => (result.ok
        ? {
            ok: true,
            customerInfo: summarizeCustomerInfo(result.data),
          }
        : {
            ok: false,
            reason: result.reason,
            error: summarizeRevenueCatError(result.error),
          }));

      const outcome = resolveRestoreOutcome(result);
      if (outcome.kind === 'success' && result.ok) {
        updateUser({ isPremium: true });

        await syncTrialEndingNotification();

        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        void recordPaywallDiagnosticLazy('paywall.restore.entitlement_active', () => ({
          customerInfo: summarizeCustomerInfo(result.data),
        }));
        queryClient.invalidateQueries({ queryKey: ['revenuecat'] });
        completePaywallFlow();
        return;
      }

      if (!result.ok && result.reason === 'timeout') {
        logger.log('[Paywall] Restore timed out');
      }
      const restoreErrorMessage = outcome.kind === 'error'
        ? outcome.message
        : 'Could not restore purchases. Please try again.';
      void recordPaywallDiagnosticLazy('paywall.restore.not_active', () => ({
        restoreErrorMessage,
        result: result.ok
          ? { ok: true, customerInfo: summarizeCustomerInfo(result.data) }
          : { ok: false, reason: result.reason, error: summarizeRevenueCatError(result.error) },
      }), result.ok ? 'warn' : 'error');
      setSubscribeError(restoreErrorMessage);
      Haptics.notificationAsync(
        result.ok
          ? Haptics.NotificationFeedbackType.Warning
          : Haptics.NotificationFeedbackType.Error,
      );
    },
    onError: (error) => {
      logger.log('[Paywall] Restore error:', error);
      void recordPaywallDiagnosticLazy('paywall.restore.mutation_error', () => ({
        error: summarizeRevenueCatError(error),
      }), 'error');
      setSubscribeError('Could not restore purchases. Please try again.');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    },
  });

  const handleClose = () => {
    if (isPurchasing) return;

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    completePaywallFlow();
  };

  const [subscribeError, setSubscribeError] = useState('');

  const [isRetryingOfferings, setIsRetryingOfferings] = useState(false);

  const handleSubscribe = async () => {
    if (isPurchasing) {
      void recordPaywallDiagnosticLazy('paywall.subscribe_tap_ignored', () => ({
        selectedPlan,
        reason: 'already_purchasing',
      }), 'warn');
      return;
    }
    setSubscribeError('');

    let pkg = selectedPlan === 'yearly' ? yearlyPackage : monthlyPackage;
    void recordPaywallDiagnosticLazy('paywall.subscribe_tap', () => ({
      selectedPlan,
      source,
      initialPackage: summarizePackage(pkg),
      revenueCatEnabled: isRevenueCatEnabled(),
    }));

    // If packages aren't available yet, attempt one more fetch before giving up
    if (!pkg) {
      logger.log('[Paywall] No package available for plan:', selectedPlan, '. Attempting refetch...');
      setIsRetryingOfferings(true);
      try {
        const freshResult = await refetchOfferings();
        const freshOfferings = freshResult.data?.ok ? freshResult.data.data : null;
        pkg = selectedPlan === 'yearly'
          ? freshOfferings?.current?.availablePackages.find((p) => p.identifier === '$rc_annual')
          : freshOfferings?.current?.availablePackages.find((p) => p.identifier === '$rc_monthly');
        void recordPaywallDiagnosticLazy('paywall.subscribe_refetch_result', () => ({
          selectedPlan,
          resultOk: freshResult.data?.ok ?? null,
          resultReason: freshResult.data && !freshResult.data.ok ? freshResult.data.reason : null,
          offerings: summarizeOfferings(freshOfferings),
          selectedPackageAfterRefetch: summarizePackage(pkg),
        }));
      } catch (e) {
        logger.log('[Paywall] Refetch failed:', e);
        void recordPaywallDiagnosticLazy('paywall.subscribe_refetch_error', () => ({
          selectedPlan,
          error: summarizeRevenueCatError(e),
        }), 'error');
      } finally {
        setIsRetryingOfferings(false);
      }
    }

    if (!pkg) {
      logger.log(
        '[Paywall] Still no package after refetch. plan:',
        selectedPlan,
        'enabled:', isRevenueCatEnabled(),
        'offerings:', JSON.stringify(offerings?.current?.availablePackages?.map(p => p.identifier)),
        'result ok:', offeringsResult?.ok,
        'result reason:', offeringsResult && !offeringsResult.ok ? offeringsResult.reason : 'n/a',
      );
      void recordPaywallDiagnosticLazy('paywall.subscribe_no_package', () => ({
        selectedPlan,
        revenueCatEnabled: isRevenueCatEnabled(),
        offeringsResultOk: offeringsResult?.ok ?? null,
        offeringsResultReason: offeringsResult && !offeringsResult.ok ? offeringsResult.reason : null,
        offerings: summarizeOfferings(offerings),
      }), 'error');

      if (isRevenueCatDisabled) {
        setSubscribeError('Subscriptions are being set up. Please try again later.');
      } else if (offeringsResult && !offeringsResult.ok) {
        setSubscribeError('Could not connect to the store. Check your connection and try again.');
      } else {
        // Offerings loaded OK but no packages — likely a RevenueCat dashboard config issue
        setSubscribeError('Subscription plans are being configured. Please try again shortly.');
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      return;
    }

    logger.log('[Paywall] Initiating purchase:', pkg.identifier, pkg.product.identifier, pkg.product.priceString);
    void recordPaywallDiagnosticLazy('paywall.purchase_mutate_start', () => ({
      selectedPlan,
      package: summarizePackage(pkg),
    }));
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    purchaseMutation.mutate(pkg);
  };

  const handleRestore = () => {
    void recordPaywallDiagnosticLazy('paywall.restore_tap', () => ({
      source,
      selectedPlan,
      revenueCatEnabled: isRevenueCatEnabled(),
    }));
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    restoreMutation.mutate();
  };

  const isPurchasing = purchaseMutation.isPending || restoreMutation.isPending || isRetryingOfferings;
  const isSubscribeDisabled = isPurchasing || !offeringsReady;

  // Never render stale fallback prices (PRICE-1): wait for RevenueCat packages.
  // Prices are the empty string until both offerings resolve — the CTA is
  // disabled and the renewal disclosure is suppressed while offerings load.
  const monthlyPrice = monthlyPackage?.product.priceString ?? '';
  const yearlyPrice = yearlyPackage?.product.priceString ?? '';
  const monthlyRaw = monthlyPackage?.product.price ?? 0;
  const yearlyRaw = yearlyPackage?.product.price ?? 0;
  // Shared trunc-to-cent formatter — both paywalls must show the same $/mo
  const perMonthFromYearly = getPerMonthEquivalent(yearlyRaw, yearlyPrice);
  const savingsPercent = monthlyRaw > 0 ? Math.round((1 - yearlyRaw / 12 / monthlyRaw) * 100) : 0;

  // Plan chip labels carry the real annual price only after offerings resolve —
  // never announce a stale/empty price to VoiceOver while plans are loading.
  const yearlyPlanAccessibilityLabel = offeringsReady
    ? `Yearly plan, ${yearlyPrice} per year, equal to ${perMonthFromYearly} per month${savingsPercent > 0 ? `, save ${savingsPercent} percent` : ''}`
    : 'Yearly plan loading';

  // Renewal disclosure (App Review 3.1.2) — null until offerings resolve so we
  // never render a price built from empty/stale priceStrings.
  const disclosureText = getPaywallRenewalDisclosure({
    offeringsReady,
    selectedPlan,
    hasFreeTrial: isTrialEligible, // RC-verified for the SELECTED plan (see isTrialEligible)
    trialDays: parseInt(selectedTrialDuration, 10) || 3,
    yearlyPrice,
    monthlyPrice,
  });

  // Personalized hero copy
  const heroTitle = isFromOnboarding
    ? firstName
      ? `${firstName}, you\u2019re ready.`
      : 'You\u2019re ready.'
    : firstName
      ? `${firstName}, keep going.`
      : 'Keep going.';

  const heroSubtitle = isFromOnboarding
    ? 'Your story shaped a devotional just for you. Here\u2019s what premium unlocks.'
    : 'Here\u2019s what you get with premium.';

  // Concrete premium benefits — title + description, not vague labels
  const premiumBenefits = [
    { icon: InfinityIcon, title: 'Unlimited devotionals', desc: 'Create as many series as you want, as long as you want' },
    { icon: CircleNotchIcon, title: 'AI companion', desc: 'Learns your story and shapes tomorrow\u2019s reading' },
    { icon: SunHorizonIcon, title: 'A rhythm, morning to night', desc: 'Check-ins and reflections that adapt your next devotional to your responses' },
    { icon: BooksIcon, title: 'Thousands of resources', desc: 'Stories, commentaries, and encyclopedias curated for you' },
    { icon: BookOpenTextIcon, title: '40+ study methods', desc: 'Lectio Divina, SOAP, verse mapping + guided prompts' },
    { icon: PencilLineIcon, title: 'Longer, deeper content', desc: 'Extended devotionals and longer series' },
    { icon: ChatCircleDotsIcon, title: 'Guided journal prompts', desc: 'Reflection questions shaped by your story and today\u2019s reading' },
    { icon: PaletteIcon, title: 'Themes, fonts & colors', desc: 'Make the app feel like yours' },
  ];

  // Free vs premium comparison rows
  const comparison = [
    { label: 'Devotional series', free: '1 active', premium: 'Unlimited' },
    { label: 'Series length', free: '7 days', premium: 'Up to 30 days' },
    { label: 'AI Companion', free: false, premium: 'Daily check-ins + chat' },
    { label: 'Study methods', free: 'Basic', premium: '40+ methods' },
    { label: 'Journal prompts', free: false, premium: true },
    { label: 'Themes & fonts', free: '1 theme', premium: '7 themes + fonts' },
  ];

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      {/* Falling embers — native down-drift, quiet near the price/disclosure copy */}
      <EmberSystem
        variant="ambient"
        direction="down"
        count={14}
        intensity={0.6}
        exclusionZones={PAYWALL_TEXT_EXCLUSION}
      />

      {/* Drag handle — sticky, above scroll content */}
      <View style={{ position: 'absolute', top: 6, left: 0, right: 0, zIndex: 10, alignItems: 'center', pointerEvents: 'none' }}>
        <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: colors.borderStrong }} />
      </View>

      {/* Close (X) — sticky at the sheet's true top-right corner, OUTSIDE the
          scroll + fade mask so it never scrolls, fades, or sits below the
          status-bar inset. Previously it lived inside the scroll header padded
          by insets.top, which floated it ~80pt below the sheet's top edge. */}
      <Pressable
        onPress={handleClose}
        disabled={isPurchasing}
        accessibilityLabel="Close"
        accessibilityRole="button"
        accessibilityState={{ disabled: isPurchasing }}
        hitSlop={8}
        style={{
          position: 'absolute',
          top: 12,
          right: Spacing['5'],
          zIndex: 11,
          width: 44,
          height: 44,
          alignItems: 'center',
          justifyContent: 'center',
          opacity: isPurchasing ? 0.5 : 1,
        }}
      >
        <XIcon size={22} color={colors.textMuted} weight="light" />
      </Pressable>

      {/* ─── Scrollable content ─── */}
      {/* Fade mask at the scroll boundaries: rows soften into the background at
          the top (under the drag handle) and bottom (into the sticky footer)
          instead of hard-clipping mid-glyph. The mask is a black→transparent
          gradient applied to the alpha of the ScrollView; because the mask only
          uses opacity, it is theme-agnostic and reads identically on the dark
          and light routes (porting the light route's mask to dark). */}
      <MaskedView
        style={{ flex: 1 }}
        maskElement={
          <LinearGradient
            style={{ flex: 1 }}
            colors={[
              'transparent',
              'black',
              'black',
              'transparent',
            ]}
            locations={[0, PAYWALL_FADE_BAND, 1 - PAYWALL_FADE_BAND, 1]}
            start={{ x: 0.5, y: 0 }}
            end={{ x: 0.5, y: 1 }}
          />
        }
      >
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingBottom: Spacing['6'], paddingTop: 18 }}
        showsVerticalScrollIndicator={false}
      >
        <View style={{ paddingHorizontal: Spacing['7'], paddingTop: Spacing['6'] }}>
          {/* Unfold icon row (close button is now sticky at the sheet corner) */}
          <Animated.View entering={reducedMotion ? undefined : FadeIn.duration(Duration.normal).easing(Ease.out)} style={{ flexDirection: 'row', alignItems: 'center', marginBottom: Spacing['6'] }}>
            <Image
              source={require('@/app/icon-paywall-light.png')}
              style={{ width: 28, height: 28, tintColor: colors.accent, opacity: 0.8 }}
              resizeMode="contain"
            />
          </Animated.View>

          {/* Hero — title + subtitle */}
          <Animated.View entering={reducedMotion ? undefined : FadeIn.duration(Duration.normal).easing(Ease.out)}>
            <Text
              style={{
                fontFamily: FontFamily.display,
                fontSize: 34,
                color: colors.text,
                letterSpacing: -0.5,
                lineHeight: 40,
              }}
            >
              {heroTitle}
            </Text>
            <Text
              style={{
                fontFamily: FontFamily.body,
                fontSize: 15,
                color: colors.textMuted,
                marginTop: 6,
                lineHeight: 22,
              }}
            >
              {heroSubtitle}
            </Text>
          </Animated.View>

          {/* ─── Feature benefit rows ─── */}
          <View style={{ marginTop: Spacing['6'], gap: 18 }}>
            {premiumBenefits.map((benefit, index) => {
              const Icon = benefit.icon;
              return (
                <Animated.View
                  key={benefit.title}
                  entering={reducedMotion ? undefined : FadeInDown.duration(Duration.slow).delay(150 + index * 70).easing(Ease.out)}
                  style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 14 }}
                >
                  <View
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: 10,
                      backgroundColor: `${colors.accent}12`,
                      borderWidth: 1,
                      borderColor: `${colors.accent}18`,
                      justifyContent: 'center',
                      alignItems: 'center',
                      marginTop: 1,
                    }}
                  >
                    <Icon size={18} color={colors.accent} weight="light" />
                  </View>
                  <View style={{ flex: 1 }}>
                    {/* Benefit copy is write-to-fit: no numberOfLines clamp, so a
                        sentence is never cut on a payment screen. The multiplier
                        caps keep large Dynamic Type bounded without truncating. */}
                    <Text
                      maxFontSizeMultiplier={1.3}
                      style={{
                        fontFamily: FontFamily.uiMedium,
                        fontSize: 15,
                        color: colors.text,
                        lineHeight: 20,
                      }}
                    >
                      {benefit.title}
                    </Text>
                    <Text
                      maxFontSizeMultiplier={1.4}
                      style={{
                        fontFamily: FontFamily.ui,
                        fontSize: 13,
                        color: colors.textMuted,
                        lineHeight: 18,
                        marginTop: 2,
                      }}
                    >
                      {benefit.desc}
                    </Text>
                  </View>
                </Animated.View>
              );
            })}
          </View>

          {/* ─── Free vs Premium comparison ─── */}
          <Animated.View entering={reducedMotion ? undefined : FadeInDown.duration(Duration.normal).delay(600).easing(Ease.out)} style={{ marginTop: Spacing['7'] }}>
            {/* Column headers */}
            <View style={{ flexDirection: 'row', marginBottom: 10, paddingLeft: 4 }}>
              <Text style={{ flex: 1, fontFamily: FontFamily.ui, fontSize: FontSize.xs, color: colors.textSubtle }}>
              </Text>
              <Text style={{ width: 60, fontFamily: FontFamily.uiMedium, fontSize: 11, color: colors.textSubtle, textAlign: 'center' }}>
                Free
              </Text>
              <Text style={{ width: 100, fontFamily: FontFamily.uiSemiBold, fontSize: 11, color: colors.accent, textAlign: 'center' }}>
                Premium
              </Text>
            </View>

            {/* Comparison rows */}
            {comparison.map((row, i) => (
              <View
                key={row.label}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  paddingVertical: 9,
                  paddingLeft: 4,
                  borderTopWidth: i === 0 ? 1 : 0,
                  borderBottomWidth: 1,
                  borderColor: colors.border,
                }}
              >
                <Text style={{ flex: 1, fontFamily: FontFamily.ui, fontSize: 13, color: colors.text }}>
                  {row.label}
                </Text>
                <View
                  style={{ width: 60, alignItems: 'center' }}
                  accessible={typeof row.free === 'boolean'}
                  accessibilityLabel={typeof row.free === 'boolean' ? (row.free ? 'Included in Free' : 'Not included in Free') : undefined}
                >
                  {typeof row.free === 'boolean' ? (
                    row.free
                      ? <CheckIcon size={15} color={colors.textMuted} weight="bold" />
                      : <XCircleIcon size={15} color={colors.textSubtle} weight="light" />
                  ) : (
                    <Text style={{ fontFamily: FontFamily.ui, fontSize: FontSize.xs, color: colors.textMuted, textAlign: 'center' }}>
                      {row.free}
                    </Text>
                  )}
                </View>
                <View
                  style={{ width: 100, alignItems: 'center' }}
                  accessible={typeof row.premium === 'boolean'}
                  accessibilityLabel={typeof row.premium === 'boolean' ? 'Included in Premium' : undefined}
                >
                  {typeof row.premium === 'boolean' ? (
                    <CheckIcon size={15} color={colors.accent} weight="bold" />
                  ) : (
                    <Text style={{ fontFamily: FontFamily.uiMedium, fontSize: FontSize.xs, color: colors.accent, textAlign: 'center' }}>
                      {row.premium}
                    </Text>
                  )}
                </View>
              </View>
            ))}
          </Animated.View>

          {/* ─── Trial timeline (when eligible) ─── */}
          {isTrialEligible && (
            <Animated.View entering={reducedMotion ? undefined : FadeInDown.duration(Duration.normal).delay(700).easing(Ease.out)} style={{ marginTop: Spacing['7'] }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 8 }}>
                {/* Today */}
                <View style={{ alignItems: 'center', flex: 1 }}>
                  <View style={{ width: 32, height: 32, borderRadius: Radius.lg, backgroundColor: `${colors.accent}20`, justifyContent: 'center', alignItems: 'center', marginBottom: 8 }}>
                    <CheckIcon size={16} color={colors.accent} weight="bold" />
                  </View>
                  <Text style={{ fontFamily: FontFamily.uiSemiBold, fontSize: 11, color: colors.text, marginBottom: 2 }}>Today</Text>
                  <Text style={{ fontFamily: FontFamily.ui, fontSize: 10, color: colors.textMuted, textAlign: 'center' }}>Full access{'\n'}starts now</Text>
                </View>
                {/* Connector */}
                <View style={{ flex: 0.5, justifyContent: 'flex-start', paddingTop: 16 }}>
                  <View style={{ height: 1, backgroundColor: colors.border }} />
                </View>
                {/* Reminder */}
                <View style={{ alignItems: 'center', flex: 1 }}>
                  <View style={{ width: 32, height: 32, borderRadius: Radius.lg, backgroundColor: `${colors.accent}12`, justifyContent: 'center', alignItems: 'center', marginBottom: 8 }}>
                    <BellIcon size={16} color={colors.textMuted} weight="light" />
                  </View>
                  <Text style={{ fontFamily: FontFamily.uiSemiBold, fontSize: 11, color: colors.text, marginBottom: 2 }}>Day {parseInt(selectedTrialDuration) - 2 || 12}</Text>
                  <Text style={{ fontFamily: FontFamily.ui, fontSize: 10, color: colors.textMuted, textAlign: 'center' }}>We’ll remind{'\n'}you</Text>
                </View>
                {/* Connector */}
                <View style={{ flex: 0.5, justifyContent: 'flex-start', paddingTop: 16 }}>
                  <View style={{ height: 1, backgroundColor: colors.border }} />
                </View>
                {/* Charge */}
                <View style={{ alignItems: 'center', flex: 1 }}>
                  <View style={{ width: 32, height: 32, borderRadius: Radius.lg, backgroundColor: `${colors.accent}12`, justifyContent: 'center', alignItems: 'center', marginBottom: 8 }}>
                    <CreditCardIcon size={16} color={colors.textMuted} weight="light" />
                  </View>
                  <Text style={{ fontFamily: FontFamily.uiSemiBold, fontSize: 11, color: colors.text, marginBottom: 2 }}>Day {parseInt(selectedTrialDuration) || 14}</Text>
                  <Text style={{ fontFamily: FontFamily.ui, fontSize: 10, color: colors.textMuted, textAlign: 'center' }}>First charge{'\n'}Cancel anytime</Text>
                </View>
              </View>
            </Animated.View>
          )}
        </View>
      </ScrollView>
      </MaskedView>

      {/* ─── Sticky footer: plans + CTA + legal ─── */}
      <View
        style={{
          paddingHorizontal: Spacing['7'],
          paddingTop: 14,
          paddingBottom: Math.max(insets.bottom, 16) + 4,
          backgroundColor: colors.background,
        }}
      >
        {/* Plan selection — stacked full-width cards */}
        <View style={{ gap: Spacing['2'], marginBottom: 10 }}>
          <TouchableOpacity
            activeOpacity={1}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              setSelectedPlan('yearly');
            }}
            accessibilityLabel={yearlyPlanAccessibilityLabel}
            accessibilityRole="radio"
            accessibilityState={{ selected: selectedPlan === 'yearly', checked: selectedPlan === 'yearly' }}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              paddingVertical: 14,
              paddingHorizontal: 18,
              borderRadius: Radius.md,
              backgroundColor: selectedPlan === 'yearly' ? alpha(colors.accent, 0.16) : 'transparent',
              borderWidth: selectedPlan === 'yearly' ? 2 : 1.5,
              borderColor: selectedPlan === 'yearly' ? colors.accent : colors.border,
            }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Text
                style={{
                  fontFamily: selectedPlan === 'yearly' ? FontFamily.uiSemiBold : FontFamily.ui,
                  fontSize: 15,
                  color: selectedPlan === 'yearly' ? colors.accent : colors.textMuted,
                }}
              >
                Yearly
              </Text>
              {/* Shared SAVE-badge dim rule (must match ThreeStepPaywall): the
                  badge is full strength while the yearly plan is selected and
                  dims to SAVE_BADGE_DIMMED_OPACITY when the user focuses monthly
                  so it stops shouting from the de-emphasized card. */}
              {savingsPercent > 0 && (
                <View
                  style={{
                    backgroundColor: colors.accent,
                    paddingHorizontal: 6,
                    paddingVertical: 2,
                    borderRadius: 4,
                    opacity: selectedPlan === 'yearly' ? 1 : SAVE_BADGE_DIMMED_OPACITY,
                  }}
                  accessibilityElementsHidden
                  importantForAccessibility="no-hide-descendants"
                >
                  <Text style={{ fontFamily: FontFamily.uiSemiBold, fontSize: 10, color: colors.background }}>
                    Save {savingsPercent}%
                  </Text>
                </View>
              )}
            </View>
            <Text
              style={{
                fontFamily: selectedPlan === 'yearly' ? FontFamily.uiSemiBold : FontFamily.ui,
                fontSize: 15,
                color: selectedPlan === 'yearly' ? colors.accent : colors.textMuted,
              }}
            >
              {perMonthFromYearly}/mo
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            activeOpacity={1}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              setSelectedPlan('monthly');
            }}
            accessibilityLabel={`Monthly plan, ${monthlyPrice} per month`}
            accessibilityRole="radio"
            accessibilityState={{ selected: selectedPlan === 'monthly', checked: selectedPlan === 'monthly' }}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              paddingVertical: 14,
              paddingHorizontal: 18,
              borderRadius: Radius.md,
              backgroundColor: selectedPlan === 'monthly' ? alpha(colors.accent, 0.16) : 'transparent',
              borderWidth: selectedPlan === 'monthly' ? 2 : 1.5,
              borderColor: selectedPlan === 'monthly' ? colors.accent : colors.border,
            }}
          >
            <Text
              style={{
                fontFamily: selectedPlan === 'monthly' ? FontFamily.uiSemiBold : FontFamily.ui,
                fontSize: 15,
                color: selectedPlan === 'monthly' ? colors.accent : colors.textMuted,
              }}
            >
              Monthly
            </Text>
            <Text
              style={{
                fontFamily: selectedPlan === 'monthly' ? FontFamily.uiSemiBold : FontFamily.ui,
                fontSize: 15,
                color: selectedPlan === 'monthly' ? colors.accent : colors.textMuted,
              }}
            >
              {monthlyPrice}/mo
            </Text>
          </TouchableOpacity>
        </View>

        {/* Billing disclosure — real charge amount and period (App Review 3.1.2).
            yearlyPrice/monthlyPrice are RC priceStrings with honest fallbacks.
            No clamp: the renewal terms must wrap, never truncate mid-sentence on
            a payment screen. Multiplier cap keeps large Dynamic Type bounded. */}
        <Text
          maxFontSizeMultiplier={1.4}
          style={{
            fontFamily: FontFamily.ui,
            fontSize: FontSize.xs,
            color: colors.textMuted,
            textAlign: 'center',
            marginBottom: 12,
          }}
        >
          {disclosureText}
        </Text>

        {/* CTA button */}
        <TouchableOpacity
          activeOpacity={0.8}
          onPress={handleSubscribe}
          disabled={isSubscribeDisabled}
          accessibilityLabel={
            isLoadingOfferings || !offeringsReady
              ? 'Loading subscription plans'
              : isTrialEligible
                ? `Start your ${selectedTrialDuration} free trial`
                : 'Unlock Unfold Premium'
          }
          accessibilityRole="button"
          accessibilityState={{ disabled: isSubscribeDisabled }}
          style={{
            backgroundColor: colors.accent,
            paddingVertical: 17,
            paddingHorizontal: Spacing['8'],
            borderRadius: 28,
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: 4,
            opacity: isSubscribeDisabled ? 0.7 : 1,
          }}
        >
          {(isPurchasing || isLoadingOfferings) ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing['2'] }}>
              <ActivityIndicator color={colors.background} size="small" />
              {isLoadingOfferings && !isPurchasing && (
                <Text
                  style={{
                    fontFamily: FontFamily.ui,
                    fontSize: 15,
                    color: colors.background,
                  }}
                >
                  Loading plans...
                </Text>
              )}
            </View>
          ) : (
            <Text
              style={{
                fontFamily: FontFamily.uiSemiBold,
                fontSize: 17,
                color: colors.background,
                textAlign: 'center',
                letterSpacing: 0.3,
              }}
            >
              {!offeringsReady
                ? 'Unlock Premium'
                : isTrialEligible
                  ? `Start My Free Trial`
                  : selectedPlan === 'yearly'
                    ? `Unlock Premium \u2014 ${perMonthFromYearly}/mo`
                    : `Unlock Premium \u2014 ${monthlyPrice}/mo`}
            </Text>
          )}
        </TouchableOpacity>

        {/* Offerings failed to load \u2014 disabled CTA above, explicit retry here.
            Shown only when offerings are not loading and still not ready, so the
            user is never stranded with a dead button and no recovery path. */}
        {!offeringsReady && !isLoadingOfferings ? (
          <View style={{ alignItems: 'center', marginTop: 6, gap: 4 }}>
            <Text style={{ fontFamily: FontFamily.ui, fontSize: 13, color: colors.textMuted, textAlign: 'center' }}>
              Subscription plans unavailable
            </Text>
            <TouchableOpacity
              activeOpacity={0.6}
              onPress={() => {
                setSubscribeError('');
                refetchOfferings();
              }}
              accessibilityLabel="Retry loading subscription plans"
              accessibilityRole="button"
              hitSlop={{ top: 8, bottom: 8, left: 12, right: 12 }}
              style={{ paddingVertical: 4, paddingHorizontal: 12 }}
            >
              <Text style={{ fontFamily: FontFamily.uiMedium, fontSize: 13, color: colors.accent }}>
                Tap to retry
              </Text>
            </TouchableOpacity>
          </View>
        ) : null}

        {/* Error */}
        {subscribeError ? (
          <View style={{ alignItems: 'center', marginTop: 6, gap: 4 }}>
            <Text style={{ fontFamily: FontFamily.ui, fontSize: 13, color: '#E85C5C', textAlign: 'center' }}>
              {subscribeError}
            </Text>
            <TouchableOpacity
              activeOpacity={0.6}
              onPress={() => {
                setSubscribeError('');
                refetchOfferings();
              }}
              hitSlop={{ top: 8, bottom: 8, left: 12, right: 12 }}
              style={{ paddingVertical: 4, paddingHorizontal: 12 }}
            >
              <Text style={{ fontFamily: FontFamily.uiMedium, fontSize: 13, color: colors.accent }}>
                Tap to retry
              </Text>
            </TouchableOpacity>
          </View>
        ) : null}

        {/* Restore + Skip + Legal row */}
        <View style={{ flexDirection: 'row', justifyContent: 'center', alignItems: 'center', marginTop: 10, gap: 8 }}>
          <TouchableOpacity
            activeOpacity={0.6}
            onPress={handleRestore}
            disabled={isPurchasing}
            accessibilityLabel="Restore purchases"
            accessibilityRole="button"
            hitSlop={{ top: 12, bottom: 12, left: 8, right: 8 }}
            style={{ padding: 6, opacity: isPurchasing ? 0.5 : 1 }}
          >
            <Text style={{ fontFamily: FontFamily.ui, fontSize: FontSize.xs, color: colors.textMuted }}>
              Restore
            </Text>
          </TouchableOpacity>
          <Text style={{ color: colors.textSubtle, fontSize: 11 }}>{'\u00B7'}</Text>
          {isFromOnboarding && (
            <>
              <TouchableOpacity
                activeOpacity={0.6}
                onPress={handleClose}
                hitSlop={{ top: 12, bottom: 12, left: 8, right: 8 }}
                style={{ padding: 6 }}
              >
                <Text style={{ fontFamily: FontFamily.ui, fontSize: FontSize.xs, color: colors.textMuted }}>
                  Maybe later
                </Text>
              </TouchableOpacity>
              <Text style={{ color: colors.textSubtle, fontSize: 11 }}>{'\u00B7'}</Text>
            </>
          )}
          <TouchableOpacity
            activeOpacity={0.6}
            onPress={() => Linking.openURL(LEGAL_LINKS.terms)}
            accessibilityRole="link"
            hitSlop={{ top: 12, bottom: 12, left: 8, right: 8 }}
            style={{ padding: 6 }}
          >
            <Text style={{ fontFamily: FontFamily.ui, fontSize: 11, color: colors.textMuted }}>
              Terms
            </Text>
          </TouchableOpacity>
          <Text style={{ color: colors.textSubtle, fontSize: 11 }}>{'\u00B7'}</Text>
          <TouchableOpacity
            activeOpacity={0.6}
            onPress={() => Linking.openURL(LEGAL_LINKS.privacy)}
            accessibilityRole="link"
            hitSlop={{ top: 12, bottom: 12, left: 8, right: 8 }}
            style={{ padding: 6 }}
          >
            <Text style={{ fontFamily: FontFamily.ui, fontSize: 11, color: colors.textMuted }}>
              Privacy
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Purchase loading overlay */}
      {isPurchasing && (
        <View
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0,0,0,0.5)',
            justifyContent: 'center',
            alignItems: 'center',
          }}
        >
          <View
            style={{
              backgroundColor: colors.backgroundElevated,
              borderRadius: Radius.lg,
              padding: 28,
              alignItems: 'center',
            }}
          >
            <ActivityIndicator size="large" color={colors.accent} />
            <Text
              style={{
                fontFamily: FontFamily.ui,
                fontSize: 15,
                color: colors.text,
                marginTop: 16,
              }}
            >
              Processing...
            </Text>
          </View>
        </View>
      )}
      <ExclusiveOfferSheet
        visible={showExclusiveOffer}
        onDismiss={() => {
          mmkvStorage.setItem('@unfold_onboarding_offer_seen', 'true');
          setShowExclusiveOffer(false);
        }}
        context="onboarding"
      />
    </View>
  );
}
