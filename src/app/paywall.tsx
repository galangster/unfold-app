import { useState, useMemo } from 'react';
import { View, Text, ActivityIndicator, Linking, ScrollView, Image, StyleSheet } from 'react-native';
import { TouchableOpacity } from 'react-native-gesture-handler';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { XIcon, PaletteIcon, BookOpenTextIcon, PencilSimpleLineIcon, InfinityIcon, PencilLineIcon, CircleNotchIcon, CheckIcon, XCircleIcon, BellIcon, CreditCardIcon, SunHorizonIcon, BookmarkSimpleIcon, BooksIcon, ChatCircleDotsIcon } from 'phosphor-react-native';
import { useTheme } from '@/lib/theme';
import { GoldEmberField } from '@/components/home/GoldEmberField';
import { FontFamily, FontSize } from '@/constants/fonts';
import { Radius } from '@/constants/radius';
import { Spacing } from '@/constants/spacing';
import { Duration } from '@/constants/animations';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getOfferings, purchasePackage, restorePurchases, isRevenueCatEnabled, hasActiveSubscription } from '@/lib/revenuecatClient';
import { syncTrialEndingNotification } from '@/lib/trial-notification';
import type { PurchasesPackage } from 'react-native-purchases';
import Purchases from 'react-native-purchases';
import { useUnfoldStore } from '@/lib/store';
import { logger } from '@/lib/logger';
import { getThemeById } from '@/constants/devotional-types';
import { ExclusiveOfferSheet } from '@/components/ExclusiveOfferSheet';
import { mmkvStorage } from '@/lib/mmkv-storage';
import type { ThemeCategory } from '@/constants/devotional-types';

type PlanChoice = 'yearly' | 'monthly';

/** Maps a theme category to an identity-oriented transformation phrase */
function getThemeIdentityPhrase(theme: ThemeCategory): string {
  const map: Record<ThemeCategory, string> = {
    trust: 'someone who rests easy, even when life doesn\u2019t',
    identity: 'someone grounded in who they actually are',
    rest: 'someone who can finally exhale',
    purpose: 'someone who sees meaning in the everyday',
    healing: 'someone walking toward wholeness',
    gratitude: 'someone who notices what\u2019s already good',
    surrender: 'someone free from needing to control it all',
    courage: 'someone who steps forward anyway',
    hope: 'someone who keeps their eyes on the light',
    presence: 'someone who notices God in the ordinary',
    conviction: 'someone whose faith has real edges',
    joy: 'someone whose joy survives the hard days',
    lament: 'someone brave enough to grieve honestly',
    justice: 'someone who acts on what they believe',
    discipline: 'someone whose habits match their heart',
    wonder: 'someone who hasn\u2019t stopped being amazed',
  };
  return map[theme] ?? 'the version of yourself that follows through';
}

/** Build 2 concise identity statements — one sentence each, punchy */
function buildIdentityStatements(
  userName: string | undefined,
  emotionalState: string | undefined,
  spiritualSeeking: string | undefined,
  selectedTheme: ThemeCategory | undefined,
): string[] {
  const statements: string[] = [];
  const name = userName?.split(' ')[0];

  // Statement 1: Anchor on their theme / seeking
  if (selectedTheme) {
    const identityPhrase = getThemeIdentityPhrase(selectedTheme);
    statements.push(`Premium helps you become ${identityPhrase}.`);
  } else if (spiritualSeeking) {
    const seeking = spiritualSeeking.length > 60
      ? spiritualSeeking.slice(0, 57).replace(/\s+\S*$/, '') + '...'
      : spiritualSeeking;
    statements.push(`You\u2019re looking for "${seeking}" \u2014 this is where you find it.`);
  } else {
    statements.push('Devotionals that grow with you, not generic content that stays the same.');
  }

  // Statement 2: Emotional or story-based
  if (emotionalState && emotionalState.length > 10) {
    statements.push('You opened up about something real. Premium keeps meeting you there.');
  } else {
    statements.push('Your story shapes every reading. Premium makes that personal.');
  }

  return statements;
}

/** Determine if a package has a free trial intro offer */
function packageHasFreeTrial(pkg: PurchasesPackage | undefined | null): boolean {
  if (!pkg) return false;
  const intro = pkg.product.introPrice;
  if (!intro) return false;
  return intro.price === 0;
}

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

  // Pull user's onboarding data for personalization
  const userName = useUnfoldStore((s) => s.user?.name);
  const emotionalState = useUnfoldStore((s) => s.user?.emotionalState);
  const spiritualSeeking = useUnfoldStore((s) => s.user?.spiritualSeeking);
  const selectedTheme = useUnfoldStore((s) => s.user?.selectedTheme);

  const firstName = userName?.split(' ')[0];

  // Build the personalized identity statements (2 concise lines)
  const identityStatements = useMemo(
    () => buildIdentityStatements(userName, emotionalState, spiritualSeeking, selectedTheme),
    [userName, emotionalState, spiritualSeeking, selectedTheme],
  );

  const { data: offeringsResult, isLoading: isLoadingOfferings, isError: isOfferingsError, refetch: refetchOfferings } = useQuery({
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

  // Track whether offerings loaded but packages are missing (configuration issue)
  const offeringsLoaded = !isLoadingOfferings && offeringsResult !== undefined;
  const hasPackages = !!(monthlyPackage || yearlyPackage);
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

  // Determine trial eligibility
  const isTrialEligible = useMemo(() => {
    const selectedPkg = selectedPlan === 'yearly' ? yearlyPackage : monthlyPackage;
    if (!selectedPkg) return false;

    if (trialEligibility) {
      const eligibility = trialEligibility[selectedPkg.product.identifier];
      if (eligibility) {
        if (eligibility.status === 2) return true;
        if (eligibility.status === 1) return false;
      }
    }

    return packageHasFreeTrial(selectedPkg);
  }, [selectedPlan, yearlyPackage, monthlyPackage, trialEligibility]);

  // Check if either plan has a trial (for badge on plan cards)
  const yearlyHasTrial = useMemo(() => {
    if (trialEligibility && yearlyPackage) {
      const e = trialEligibility[yearlyPackage.product.identifier];
      if (e && e.status === 1) return false;
      if (e && e.status === 2) return true;
    }
    return packageHasFreeTrial(yearlyPackage);
  }, [yearlyPackage, trialEligibility]);

  const monthlyHasTrial = useMemo(() => {
    if (trialEligibility && monthlyPackage) {
      const e = trialEligibility[monthlyPackage.product.identifier];
      if (e && e.status === 1) return false;
      if (e && e.status === 2) return true;
    }
    return packageHasFreeTrial(monthlyPackage);
  }, [monthlyPackage, trialEligibility]);

  // Trial duration strings
  const yearlyTrialDuration = getTrialDuration(yearlyPackage) ?? '7-day';
  const monthlyTrialDuration = getTrialDuration(monthlyPackage) ?? '7-day';
  const selectedTrialDuration = selectedPlan === 'yearly' ? yearlyTrialDuration : monthlyTrialDuration;

  const purchaseMutation = useMutation({
    mutationFn: (pkg: PurchasesPackage) => purchasePackage(pkg),
    onSuccess: async (result) => {
      if (result.ok) {
        const subscriptionResult = await hasActiveSubscription();
        if (subscriptionResult.ok) {
          updateUser({ isPremium: subscriptionResult.data });
        }

        await syncTrialEndingNotification();

        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        queryClient.invalidateQueries({ queryKey: ['revenuecat'] });
        if (isEarlyOnboarding) {
          router.back();
        } else if (isFromOnboarding) {
          // If the user already has a generated devotional, go straight to home
          // instead of looping back to the generating screen
          if (currentDevotionalId) {
            router.replace('/(tabs)/(today)');
          } else {
            router.replace('/generating');
          }
        } else {
          router.back();
        }
      } else if (result.reason === 'user_cancelled') {
        const hasSeenOnboardingOffer = mmkvStorage.getItem('@unfold_onboarding_offer_seen') === 'true';
        if (!hasSeenOnboardingOffer) {
          setShowExclusiveOffer(true);
        }
        return;
      } else {
        // Actual SDK error
        logger.log('[Paywall] Purchase did not complete:', JSON.stringify(result));
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      }
    },
    onError: (error) => {
      logger.log('[Paywall] Purchase error:', error);
      setSubscribeError('Something went wrong. Please try again.');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    },
  });

  const restoreMutation = useMutation({
    mutationFn: restorePurchases,
    onSuccess: async (result) => {
      if (result.ok) {
        const subscriptionResult = await hasActiveSubscription();
        if (subscriptionResult.ok) {
          updateUser({ isPremium: subscriptionResult.data });
        }

        await syncTrialEndingNotification();

        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        queryClient.invalidateQueries({ queryKey: ['revenuecat'] });
        if (isEarlyOnboarding) {
          router.back();
        } else if (isFromOnboarding) {
          if (currentDevotionalId) {
            router.replace('/(tabs)/(today)');
          } else {
            router.replace('/generating');
          }
        } else {
          router.back();
        }
      } else {
        setSubscribeError('No active subscription found.');
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      }
    },
    onError: (error) => {
      logger.log('[Paywall] Restore error:', error);
      setSubscribeError('Could not restore purchases. Please try again.');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    },
  });

  const handleClose = () => {
    if (isPurchasing) return;

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (isEarlyOnboarding) {
      router.back();
    } else if (isFromOnboarding) {
      // If the user already has a generated devotional, go straight to home
      if (currentDevotionalId) {
        router.replace('/(tabs)/(today)');
      } else {
        router.replace('/generating');
      }
    } else {
      router.back();
    }
  };

  const [subscribeError, setSubscribeError] = useState('');

  const [isRetryingOfferings, setIsRetryingOfferings] = useState(false);

  const handleSubscribe = async () => {
    if (isPurchasing) return;
    setSubscribeError('');

    let pkg = selectedPlan === 'yearly' ? yearlyPackage : monthlyPackage;

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
      } catch (e) {
        logger.log('[Paywall] Refetch failed:', e);
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

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    purchaseMutation.mutate(pkg);
  };

  const handleRestore = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    restoreMutation.mutate();
  };

  const isPurchasing = purchaseMutation.isPending || restoreMutation.isPending || isRetryingOfferings;

  // Pull real prices from RevenueCat packages, fall back to hardcoded defaults
  const monthlyPrice = monthlyPackage?.product.priceString ?? '$9.99';
  const yearlyPrice = yearlyPackage?.product.priceString ?? '$59.99';
  const monthlyRaw = monthlyPackage?.product.price ?? 9.99;
  const yearlyRaw = yearlyPackage?.product.price ?? 59.99;
  // Extract currency symbol from locale-aware priceString (e.g., "$" from "$49.99", "€" from "49,99 €")
  const currencySymbol = (yearlyPrice.replace(/[\d.,\s]/g, '').trim()) || '$';
  const perMonthFromYearly = `${currencySymbol}${(yearlyRaw / 12).toFixed(2)}`;
  const savingsPercent = Math.round((1 - yearlyRaw / 12 / monthlyRaw) * 100);

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
      {/* Reversed embers — falling from top */}
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        <View style={{ flex: 1, transform: [{ scaleY: -1 }] }}>
          <GoldEmberField streakLevel={3} active />
        </View>
      </View>

      {/* Drag handle — sticky, above scroll content */}
      <View style={{ position: 'absolute', top: 6, left: 0, right: 0, zIndex: 10, alignItems: 'center', pointerEvents: 'none' }}>
        <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: colors.borderStrong }} />
      </View>

      {/* ─── Scrollable content ─── */}
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingBottom: Spacing['6'], paddingTop: 18 }}
        showsVerticalScrollIndicator={false}
      >
        <View style={{ paddingHorizontal: Spacing['7'], paddingTop: insets.top }}>
          {/* Unfold icon + close button row */}
          <Animated.View entering={FadeIn.duration(400)} style={{ flexDirection: 'row', alignItems: 'center', marginBottom: Spacing['6'] }}>
            <Image
              source={require('@/app/icon-paywall-light.png')}
              style={{ width: 28, height: 28, tintColor: colors.accent, opacity: 0.8 }}
              resizeMode="contain"
            />
          </Animated.View>

          {/* Hero — title + subtitle */}
          <Animated.View entering={FadeIn.duration(600)}>
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
                  entering={FadeInDown.duration(Duration.slow).delay(150 + index * 70)}
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
                    <Text
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
          <Animated.View entering={FadeInDown.duration(400).delay(600)} style={{ marginTop: Spacing['7'] }}>
            {/* Column headers */}
            <View style={{ flexDirection: 'row', marginBottom: 10, paddingLeft: 4 }}>
              <Text style={{ flex: 1, fontFamily: FontFamily.ui, fontSize: FontSize.xs, color: colors.textSubtle }}>
              </Text>
              <Text style={{ width: 70, fontFamily: FontFamily.uiMedium, fontSize: 11, color: colors.textSubtle, textAlign: 'center', letterSpacing: 0.5 }}>
                FREE
              </Text>
              <Text style={{ width: 80, fontFamily: FontFamily.uiSemiBold, fontSize: 11, color: colors.accent, textAlign: 'center', letterSpacing: 0.5 }}>
                PREMIUM
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
                <View style={{ width: 70, alignItems: 'center' }}>
                  {typeof row.free === 'boolean' ? (
                    row.free
                      ? <CheckIcon size={15} color={colors.textMuted} weight="bold" />
                      : <XCircleIcon size={15} color={colors.textSubtle} weight="light" />
                  ) : (
                    <Text style={{ fontFamily: FontFamily.ui, fontSize: FontSize.xs, color: colors.textMuted }}>
                      {row.free}
                    </Text>
                  )}
                </View>
                <View style={{ width: 80, alignItems: 'center' }}>
                  {typeof row.premium === 'boolean' ? (
                    <CheckIcon size={15} color={colors.accent} weight="bold" />
                  ) : (
                    <Text style={{ fontFamily: FontFamily.uiMedium, fontSize: FontSize.xs, color: colors.accent }}>
                      {row.premium}
                    </Text>
                  )}
                </View>
              </View>
            ))}
          </Animated.View>

          {/* ─── Trial timeline (when eligible) ─── */}
          {isTrialEligible && (
            <Animated.View entering={FadeInDown.duration(400).delay(700)} style={{ marginTop: Spacing['7'] }}>
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
                  <Text style={{ fontFamily: FontFamily.ui, fontSize: 10, color: colors.textMuted, textAlign: 'center' }}>We'll remind{'\n'}you</Text>
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
        <View style={{ gap: Spacing['2'], marginBottom: 14 }}>
          <TouchableOpacity
            activeOpacity={0.7}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              setSelectedPlan('yearly');
            }}
            accessibilityLabel={`Yearly plan, ${perMonthFromYearly} per month`}
            accessibilityRole="tab"
            accessibilityState={{ selected: selectedPlan === 'yearly' }}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              paddingVertical: 14,
              paddingHorizontal: 18,
              borderRadius: Radius.md,
              backgroundColor: selectedPlan === 'yearly' ? `${colors.accent}18` : 'rgba(255,255,255,0.04)',
              borderWidth: 1.5,
              borderColor: selectedPlan === 'yearly' ? colors.accent : 'rgba(255,255,255,0.15)',
            }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Text
                style={{
                  fontFamily: selectedPlan === 'yearly' ? FontFamily.uiSemiBold : FontFamily.ui,
                  fontSize: 15,
                  color: selectedPlan === 'yearly' ? colors.text : colors.textMuted,
                }}
              >
                Yearly
              </Text>
              {savingsPercent > 0 && (
                <View style={{ backgroundColor: `${colors.accent}30`, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 }}>
                  <Text style={{ fontFamily: FontFamily.uiSemiBold, fontSize: 10, color: colors.accent }}>
                    SAVE {savingsPercent}%
                  </Text>
                </View>
              )}
            </View>
            <Text
              style={{
                fontFamily: selectedPlan === 'yearly' ? FontFamily.uiSemiBold : FontFamily.ui,
                fontSize: 15,
                color: selectedPlan === 'yearly' ? colors.text : colors.textMuted,
              }}
            >
              {perMonthFromYearly}/mo
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            activeOpacity={0.7}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              setSelectedPlan('monthly');
            }}
            accessibilityLabel={`Monthly plan, ${monthlyPrice} per month`}
            accessibilityRole="tab"
            accessibilityState={{ selected: selectedPlan === 'monthly' }}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              paddingVertical: 14,
              paddingHorizontal: 18,
              borderRadius: Radius.md,
              backgroundColor: selectedPlan === 'monthly' ? `${colors.accent}18` : 'rgba(255,255,255,0.04)',
              borderWidth: 1.5,
              borderColor: selectedPlan === 'monthly' ? colors.accent : 'rgba(255,255,255,0.15)',
            }}
          >
            <Text
              style={{
                fontFamily: selectedPlan === 'monthly' ? FontFamily.uiSemiBold : FontFamily.ui,
                fontSize: 15,
                color: selectedPlan === 'monthly' ? colors.text : colors.textMuted,
              }}
            >
              Monthly
            </Text>
            <Text
              style={{
                fontFamily: selectedPlan === 'monthly' ? FontFamily.uiSemiBold : FontFamily.ui,
                fontSize: 15,
                color: selectedPlan === 'monthly' ? colors.text : colors.textMuted,
              }}
            >
              {monthlyPrice}/mo
            </Text>
          </TouchableOpacity>
        </View>

        {/* CTA button */}
        <TouchableOpacity
          activeOpacity={0.8}
          onPress={handleSubscribe}
          disabled={isPurchasing || isLoadingOfferings}
          accessibilityLabel={
            isLoadingOfferings
              ? 'Loading subscription plans'
              : isTrialEligible
                ? `Start your ${selectedTrialDuration} free trial`
                : 'Unlock Unfold Premium'
          }
          accessibilityRole="button"
          accessibilityState={{ disabled: isPurchasing || isLoadingOfferings }}
          style={{
            backgroundColor: colors.accent,
            paddingVertical: 17,
            paddingHorizontal: Spacing['8'],
            borderRadius: 28,
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: 4,
            opacity: (isPurchasing || isLoadingOfferings) ? 0.7 : 1,
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
              {isTrialEligible
                ? `Start My Free Trial`
                : selectedPlan === 'yearly'
                  ? `Unlock Premium \u2014 ${perMonthFromYearly}/mo`
                  : `Unlock Premium \u2014 ${monthlyPrice}/mo`}
            </Text>
          )}
        </TouchableOpacity>

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
            onPress={() => Linking.openURL('https://www.apple.com/legal/internet-services/itunes/dev/stdeula/')}
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
            onPress={() => Linking.openURL('https://unfoldapp.co/privacy')}
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

      {/* Close button — absolute, top right */}
      <TouchableOpacity
        activeOpacity={0.6}
        onPress={handleClose}
        disabled={isPurchasing}
        accessibilityLabel="Close paywall"
        accessibilityRole="button"
        accessibilityState={{ disabled: isPurchasing }}
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        style={{
          position: 'absolute',
          top: insets.top + 8,
          right: 16,
          padding: 8,
          opacity: isPurchasing ? 0.5 : 1,
          zIndex: 10,
        }}
      >
        <XIcon size={22} color={colors.textMuted} weight="light" />
      </TouchableOpacity>

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
