import { useState, useMemo, useEffect } from 'react';
import { View, Text, ActivityIndicator, Linking, Image, ScrollView } from 'react-native';
import { TouchableOpacity } from 'react-native-gesture-handler';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeIn, FadeInDown, useSharedValue, useAnimatedStyle, withRepeat, withTiming, withDelay, Easing } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { XIcon, CrownIcon, ShieldCheckIcon, SparkleIcon, ClockIcon, PathIcon, HeartIcon, SunIcon, SpeakerHighIcon, PaletteIcon, BookOpenTextIcon, PencilSimpleLineIcon, FireIcon, CheckIcon } from 'phosphor-react-native';
import { useTheme } from '@/lib/theme';
import { FontFamily } from '@/constants/fonts';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getOfferings, purchasePackage, restorePurchases, isRevenueCatEnabled, hasActiveSubscription } from '@/lib/revenuecatClient';
import type { PurchasesPackage } from 'react-native-purchases';
import Purchases from 'react-native-purchases';
import { useUnfoldStore } from '@/lib/store';
import { getThemeById } from '@/constants/devotional-types';
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

/** Build identity statements from whatever user data we have */
function buildIdentityStatements(
  userName: string | undefined,
  currentSituation: string | undefined,
  emotionalState: string | undefined,
  spiritualSeeking: string | undefined,
  selectedTheme: ThemeCategory | undefined,
): { icon: typeof PathIcon; text: string }[] {
  const statements: { icon: typeof PathIcon; text: string }[] = [];
  const name = userName?.split(' ')[0]; // First name only

  // Statement 1: Anchor on their theme / seeking — who they're becoming
  if (selectedTheme) {
    const themeInfo = getThemeById(selectedTheme);
    const identityPhrase = getThemeIdentityPhrase(selectedTheme);
    if (name) {
      statements.push({
        icon: PathIcon,
        text: `${name}, you chose ${themeInfo?.name.toLowerCase() ?? selectedTheme} for a reason. Premium helps you become ${identityPhrase}.`,
      });
    } else {
      statements.push({
        icon: PathIcon,
        text: `You chose ${themeInfo?.name.toLowerCase() ?? selectedTheme} for a reason. Premium helps you become ${identityPhrase}.`,
      });
    }
  } else if (spiritualSeeking) {
    // Trim to keep it conversational
    const seeking = spiritualSeeking.length > 80
      ? spiritualSeeking.slice(0, 77).replace(/\s+\S*$/, '') + '...'
      : spiritualSeeking;
    statements.push({
      icon: PathIcon,
      text: name
        ? `${name}, you said you\u2019re looking for "${seeking}" \u2014 Premium gives you the space to actually find it.`
        : `You\u2019re looking for "${seeking}" \u2014 Premium gives you the space to actually find it.`,
    });
  } else {
    statements.push({
      icon: PathIcon,
      text: name
        ? `${name}, this is the version of you that follows through \u2014 the one that doesn\u2019t just start, but stays.`
        : 'This is the version of you that follows through \u2014 the one that doesn\u2019t just start, but stays.',
    });
  }

  // Statement 2: Emotional resonance — we see what you're carrying
  if (emotionalState && emotionalState.length > 10) {
    statements.push({
      icon: HeartIcon,
      text: 'You opened up about something real. Premium means your devotionals keep meeting you exactly where you are \u2014 not where an algorithm guesses.',
    });
  } else {
    statements.push({
      icon: HeartIcon,
      text: 'Devotionals that know your story, a voice that reads to you, journaling that goes deeper \u2014 all without limits.',
    });
  }

  // Statement 3: Forward-looking — the daily rhythm
  statements.push({
    icon: SunIcon,
    text: 'Every morning, something waiting for you that actually matters. Not content. Conversation.',
  });

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
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const [selectedPlan, setSelectedPlan] = useState<PlanChoice>('yearly');
  const updateUser = useUnfoldStore((s) => s.updateUser);

  // Pull user's onboarding data for personalization
  const userName = useUnfoldStore((s) => s.user?.name);
  const currentSituation = useUnfoldStore((s) => s.user?.currentSituation);
  const emotionalState = useUnfoldStore((s) => s.user?.emotionalState);
  const spiritualSeeking = useUnfoldStore((s) => s.user?.spiritualSeeking);
  const selectedTheme = useUnfoldStore((s) => s.user?.selectedTheme);

  const firstName = userName?.split(' ')[0];

  // Build the personalized identity statements
  const identityStatements = useMemo(
    () => buildIdentityStatements(userName, currentSituation, emotionalState, spiritualSeeking, selectedTheme),
    [userName, currentSituation, emotionalState, spiritualSeeking, selectedTheme],
  );

  const { data: offeringsResult, isLoading } = useQuery({
    queryKey: ['revenuecat', 'offerings'],
    queryFn: getOfferings,
    enabled: isRevenueCatEnabled(),
  });

  const offerings = offeringsResult?.ok ? offeringsResult.data : null;
  const monthlyPackage = offerings?.current?.availablePackages.find(
    (pkg) => pkg.identifier === '$rc_monthly'
  );
  const yearlyPackage = offerings?.current?.availablePackages.find(
    (pkg) => pkg.identifier === '$rc_annual'
  );

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
  const yearlyTrialDuration = getTrialDuration(yearlyPackage) ?? '14-day';
  const monthlyTrialDuration = getTrialDuration(monthlyPackage) ?? '14-day';
  const selectedTrialDuration = selectedPlan === 'yearly' ? yearlyTrialDuration : monthlyTrialDuration;

  const purchaseMutation = useMutation({
    mutationFn: (pkg: PurchasesPackage) => purchasePackage(pkg),
    onSuccess: async (result) => {
      if (result.ok) {
        const subscriptionResult = await hasActiveSubscription();
        if (subscriptionResult.ok) {
          updateUser({ isPremium: subscriptionResult.data });
        }

        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        queryClient.invalidateQueries({ queryKey: ['revenuecat'] });
        if (isEarlyOnboarding) {
          router.back();
        } else if (isFromOnboarding) {
          router.replace('/generating');
        } else {
          router.back();
        }
      }
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

        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        queryClient.invalidateQueries({ queryKey: ['revenuecat'] });
        if (isEarlyOnboarding) {
          router.back();
        } else if (isFromOnboarding) {
          router.replace('/generating');
        } else {
          router.back();
        }
      }
    },
  });

  const handleClose = () => {
    if (isPurchasing) return;

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (isEarlyOnboarding) {
      router.back();
    } else if (isFromOnboarding) {
      router.replace('/generating');
    } else {
      router.back();
    }
  };

  const [subscribeError, setSubscribeError] = useState('');

  const handleSubscribe = () => {
    if (isPurchasing) return;
    setSubscribeError('');

    const pkg = selectedPlan === 'yearly' ? yearlyPackage : monthlyPackage;
    if (!pkg) {
      console.log('[Paywall] No package available for plan:', selectedPlan, 'offerings:', JSON.stringify(offerings?.current?.availablePackages?.map(p => p.identifier)));
      setSubscribeError('Subscription not available yet. Try again in a moment.');
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

  const isPurchasing = purchaseMutation.isPending || restoreMutation.isPending;

  // Pulsing glow animation for subscribe button
  const glowOpacity = useSharedValue(0.4);
  const glowScale = useSharedValue(1);

  useEffect(() => {
    glowOpacity.value = withDelay(
      800,
      withRepeat(
        withTiming(1, { duration: 1800, easing: Easing.inOut(Easing.ease) }),
        -1,
        true
      )
    );
    glowScale.value = withDelay(
      800,
      withRepeat(
        withTiming(1.02, { duration: 1800, easing: Easing.inOut(Easing.ease) }),
        -1,
        true
      )
    );
  }, []);

  const glowStyle = useAnimatedStyle(() => ({
    shadowOpacity: glowOpacity.value * 0.7,
    shadowRadius: 16 + glowOpacity.value * 12,
    transform: [{ scale: glowScale.value }],
  }));

  // Pull real prices from RevenueCat packages, fall back to hardcoded defaults
  const monthlyPrice = monthlyPackage?.product.priceString ?? '$5.99';
  const yearlyPrice = yearlyPackage?.product.priceString ?? '$49.99';
  const yearlyRaw = yearlyPackage?.product.price ?? 49.99;
  const perMonthFromYearly = `$${(yearlyRaw / 12).toFixed(2)}`;

  // Personalized hero copy
  const heroTitle = isFromOnboarding
    ? firstName
      ? `${firstName}, you\u2019re ready.`
      : 'You\u2019re ready.'
    : firstName
      ? `${firstName}, keep going.`
      : 'Keep going.';

  const heroSubtitle = isFromOnboarding
    ? 'You just told us what matters to you. Premium means your devotionals never stop growing with you.'
    : isTrialEligible
      ? 'You\u2019ve already started something real. See what it looks like without limits.'
      : 'You\u2019ve already started something real. Go all the way in.';

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingBottom: Math.max(insets.bottom, 16) + 8 }}
        showsVerticalScrollIndicator={false}
        bounces={false}
      >
        {/* Close button row */}
        <View style={{ flexDirection: 'row', justifyContent: 'flex-end', paddingHorizontal: 16, paddingTop: 8 }}>
          <TouchableOpacity
            activeOpacity={0.6}
            onPress={handleClose}
            disabled={isPurchasing}
            accessibilityLabel="Close paywall"
            accessibilityRole="button"
            accessibilityState={{ disabled: isPurchasing }}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            style={{
              padding: 8,
              opacity: isPurchasing ? 0.5 : 1,
            }}
          >
            <XIcon size={22} color={colors.textSubtle} weight="light" />
          </TouchableOpacity>
        </View>

        {/* Hero section */}
        <View style={{ paddingTop: 4, paddingHorizontal: 28 }}>
          <Animated.View entering={FadeIn.duration(600)}>
            {/* App Icon */}
            <View
              style={{
                width: 72,
                height: 72,
                borderRadius: 16,
                backgroundColor: colors.inputBackground,
                justifyContent: 'center',
                alignItems: 'center',
                marginBottom: 16,
                borderWidth: 1,
                borderColor: colors.border,
              }}
            >
              <Image
                source={isDark ? require('./icon-paywall.png') : require('./icon-paywall-light.png')}
                style={{ width: 40, height: 40 }}
                resizeMode="contain"
              />
            </View>

            <View
              style={{
                width: 36,
                height: 1,
                backgroundColor: colors.accent,
                marginBottom: 16,
                borderRadius: 1,
                opacity: 0.6,
              }}
            />
            <Text
              style={{
                fontFamily: FontFamily.display,
                fontSize: 36,
                color: colors.text,
                letterSpacing: -1,
                lineHeight: 42,
              }}
            >
              {heroTitle}
            </Text>
            <Text
              style={{
                fontFamily: FontFamily.bodyItalic,
                fontSize: 16,
                color: colors.textMuted,
                marginTop: 10,
                lineHeight: 24,
              }}
            >
              {heroSubtitle}
            </Text>
          </Animated.View>

          {/* Identity statements — replaces feature checklist */}
          <View style={{ marginTop: 24, gap: 20 }}>
            {identityStatements.map((statement, index) => {
              const IconComponent = statement.icon;
              return (
                <Animated.View
                  key={statement.text.slice(0, 40)}
                  entering={FadeInDown.duration(500).delay(200 + index * 150)}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'flex-start',
                  }}
                >
                  <View
                    style={{
                      width: 32,
                      height: 32,
                      borderRadius: 8,
                      backgroundColor: `${colors.accent}14`,
                      justifyContent: 'center',
                      alignItems: 'center',
                      marginRight: 14,
                      marginTop: 2,
                    }}
                  >
                    <IconComponent size={18} color={colors.accent} weight="light" />
                  </View>
                  <Text
                    style={{
                      flex: 1,
                      fontFamily: FontFamily.body,
                      fontSize: 15,
                      color: colors.text,
                      lineHeight: 23,
                    }}
                  >
                    {statement.text}
                  </Text>
                </Animated.View>
              );
            })}
          </View>

          {/* What's included in Premium */}
          <Animated.View
            entering={FadeInDown.duration(500).delay(600)}
            style={{ marginTop: 28 }}
          >
            <Text
              style={{
                fontFamily: FontFamily.uiMedium,
                fontSize: 10.5,
                color: colors.textSubtle,
                letterSpacing: 2,
                textTransform: 'uppercase',
                marginBottom: 16,
              }}
            >
              Everything in Premium
            </Text>
            {[
              { icon: BookOpenTextIcon, label: 'Unlimited devotional series' },
              { icon: SpeakerHighIcon, label: 'AI-narrated audio for every reading' },
              { icon: PencilSimpleLineIcon, label: 'AI-powered journal reflections' },
              { icon: PaletteIcon, label: 'Custom themes, fonts, and accent colors' },
              { icon: FireIcon, label: 'Unlimited streak freezes' },
            ].map((item) => (
              <View
                key={item.label}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  marginBottom: 14,
                }}
              >
                <CheckIcon size={16} color={colors.accent} weight="bold" style={{ marginRight: 12 }} />
                <Text
                  style={{
                    fontFamily: FontFamily.body,
                    fontSize: 14,
                    color: colors.text,
                    flex: 1,
                  }}
                >
                  {item.label}
                </Text>
              </View>
            ))}
          </Animated.View>

          {/* Trial timeline — only show when eligible */}
          {isTrialEligible && (
            <Animated.View
              entering={FadeInDown.duration(500).delay(700)}
              style={{
                marginTop: 24,
                padding: 16,
                borderRadius: 12,
                backgroundColor: `${colors.accent}0D`,
                borderWidth: 1,
                borderColor: `${colors.accent}1A`,
              }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
                <ClockIcon size={16} color={colors.accent} weight="light" style={{ marginRight: 8 }} />
                <Text
                  style={{
                    fontFamily: FontFamily.uiSemiBold,
                    fontSize: 13,
                    color: colors.accent,
                    textTransform: 'uppercase',
                    letterSpacing: 0.5,
                  }}
                >
                  How your trial works
                </Text>
              </View>

              {/* During trial */}
              <View style={{ flexDirection: 'row', alignItems: 'flex-start', marginBottom: 10 }}>
                <SparkleIcon size={16} color={colors.accent} weight="light" style={{ marginRight: 10, marginTop: 2 }} />
                <View style={{ flex: 1 }}>
                  <Text style={{
                    fontFamily: FontFamily.uiMedium,
                    fontSize: 13,
                    color: colors.text,
                    marginBottom: 2,
                  }}>
                    During your {selectedTrialDuration} free trial
                  </Text>
                  <Text style={{
                    fontFamily: FontFamily.ui,
                    fontSize: 12,
                    color: colors.textMuted,
                    lineHeight: 18,
                  }}>
                    Full access to everything. No charge. No strings.
                  </Text>
                </View>
              </View>

              {/* After trial */}
              <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
                <CrownIcon size={16} color={colors.textMuted} weight="light" style={{ marginRight: 10, marginTop: 2 }} />
                <View style={{ flex: 1 }}>
                  <Text style={{
                    fontFamily: FontFamily.uiMedium,
                    fontSize: 13,
                    color: colors.text,
                    marginBottom: 2,
                  }}>
                    After your trial ends
                  </Text>
                  <Text style={{
                    fontFamily: FontFamily.ui,
                    fontSize: 12,
                    color: colors.textMuted,
                    lineHeight: 18,
                  }}>
                    {selectedPlan === 'yearly'
                      ? `${perMonthFromYearly}/mo (billed ${yearlyPrice}/year)`
                      : `${monthlyPrice}/month`}
                    . Cancel anytime.
                  </Text>
                </View>
              </View>
            </Animated.View>
          )}

          {/* Separator */}
          <View
            style={{
              height: 1,
              backgroundColor: colors.border,
              marginVertical: 20,
            }}
          />
        </View>

        {/* Plans + subscribe + legal */}
        <View style={{ paddingHorizontal: 28, paddingBottom: 8, paddingTop: 8 }}>
          {/* Plan selection */}
          <Animated.View
            entering={FadeInDown.duration(500).delay(200)}
            style={{ gap: 8, marginBottom: 12 }}
          >
            {/* Yearly */}
            <TouchableOpacity
              activeOpacity={0.7}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setSelectedPlan('yearly');
              }}
              accessibilityLabel={`Yearly plan, ${perMonthFromYearly} per month, billed ${yearlyPrice} per year${yearlyHasTrial ? `, includes ${yearlyTrialDuration} free trial` : ''}`}
            >
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  paddingHorizontal: 16,
                  paddingVertical: 14,
                  borderRadius: 14,
                  borderWidth: selectedPlan === 'yearly' ? 2 : 1,
                  borderColor: selectedPlan === 'yearly' ? colors.accent : colors.border,
                  backgroundColor: selectedPlan === 'yearly'
                    ? `${colors.accent}1F`
                    : 'transparent',
                }}
              >
                <View
                  style={{
                    width: 20,
                    height: 20,
                    borderRadius: 10,
                    borderWidth: selectedPlan === 'yearly' ? 6 : 1.5,
                    borderColor: selectedPlan === 'yearly' ? colors.accent : colors.border,
                    marginRight: 14,
                  }}
                />
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Text
                      style={{
                        fontFamily: FontFamily.uiMedium,
                        fontSize: 15,
                        color: colors.text,
                      }}
                    >
                      Yearly
                    </Text>
                    <View
                      style={{
                        backgroundColor: `${colors.accent}26`,
                        paddingHorizontal: 7,
                        paddingVertical: 2,
                        borderRadius: 5,
                      }}
                    >
                      <Text
                        style={{
                          fontFamily: FontFamily.uiSemiBold,
                          fontSize: 10,
                          color: colors.accent,
                          textTransform: 'uppercase',
                          letterSpacing: 0.5,
                        }}
                      >
                        Save 30%
                      </Text>
                    </View>
                    {yearlyHasTrial && (
                      <View
                        style={{
                          backgroundColor: `${colors.accent}14`,
                          paddingHorizontal: 7,
                          paddingVertical: 2,
                          borderRadius: 5,
                          borderWidth: 1,
                          borderColor: `${colors.accent}26`,
                        }}
                      >
                        <Text
                          style={{
                            fontFamily: FontFamily.uiSemiBold,
                            fontSize: 10,
                            color: colors.accent,
                            letterSpacing: 0.3,
                          }}
                        >
                          {yearlyTrialDuration} free trial
                        </Text>
                      </View>
                    )}
                  </View>
                  <Text
                    style={{
                      fontFamily: FontFamily.ui,
                      fontSize: 12,
                      color: colors.textMuted,
                      marginTop: 2,
                    }}
                  >
                    {perMonthFromYearly}/mo · billed {yearlyPrice}/year
                  </Text>
                </View>
              </View>
            </TouchableOpacity>

            {/* Monthly */}
            <TouchableOpacity
              activeOpacity={0.7}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setSelectedPlan('monthly');
              }}
              accessibilityLabel={`Monthly plan, ${monthlyPrice} per month${monthlyHasTrial ? `, includes ${monthlyTrialDuration} free trial` : ''}`}
            >
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  paddingHorizontal: 16,
                  paddingVertical: 14,
                  borderRadius: 14,
                  borderWidth: selectedPlan === 'monthly' ? 1.5 : 1,
                  borderColor: selectedPlan === 'monthly' ? colors.accent : colors.border,
                  backgroundColor: selectedPlan === 'monthly'
                    ? `${colors.accent}0F`
                    : 'transparent',
                }}
              >
                <View
                  style={{
                    width: 20,
                    height: 20,
                    borderRadius: 10,
                    borderWidth: selectedPlan === 'monthly' ? 6 : 1.5,
                    borderColor: selectedPlan === 'monthly' ? colors.accent : colors.border,
                    marginRight: 14,
                  }}
                />
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Text
                      style={{
                        fontFamily: FontFamily.uiMedium,
                        fontSize: 15,
                        color: colors.text,
                      }}
                    >
                      Monthly
                    </Text>
                    {monthlyHasTrial && (
                      <View
                        style={{
                          backgroundColor: `${colors.accent}14`,
                          paddingHorizontal: 7,
                          paddingVertical: 2,
                          borderRadius: 5,
                          borderWidth: 1,
                          borderColor: `${colors.accent}26`,
                        }}
                      >
                        <Text
                          style={{
                            fontFamily: FontFamily.uiSemiBold,
                            fontSize: 10,
                            color: colors.accent,
                            letterSpacing: 0.3,
                          }}
                        >
                          {monthlyTrialDuration} free trial
                        </Text>
                      </View>
                    )}
                  </View>
                  <Text
                    style={{
                      fontFamily: FontFamily.ui,
                      fontSize: 12,
                      color: colors.textMuted,
                      marginTop: 2,
                    }}
                  >
                    {monthlyPrice}/month
                  </Text>
                </View>
              </View>
            </TouchableOpacity>
          </Animated.View>

          {/* SUBSCRIBE BUTTON with glow */}
          <View style={{ marginTop: 8, marginBottom: 4 }}>
            <Animated.View
              style={[
                {
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  right: 0,
                  bottom: 0,
                  borderRadius: 28,
                  backgroundColor: colors.accent,
                  shadowColor: colors.accent,
                  shadowOffset: { width: 0, height: 4 },
                },
                glowStyle,
              ]}
            />
            <TouchableOpacity
              activeOpacity={0.8}
              onPress={handleSubscribe}
              disabled={isPurchasing}
              accessibilityLabel={isTrialEligible ? `Start your ${selectedTrialDuration} free trial` : 'Subscribe now'}
              accessibilityRole="button"
              accessibilityState={{ disabled: isPurchasing }}
              style={{
                backgroundColor: colors.accent,
                paddingVertical: 18,
                paddingHorizontal: 32,
                borderRadius: 28,
                alignItems: 'center',
                justifyContent: 'center',
                opacity: isPurchasing ? 0.7 : 1,
              }}
            >
              {isPurchasing ? (
                <ActivityIndicator color={colors.background} size="small" />
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
                    ? `Start Your ${selectedTrialDuration} Free Trial`
                    : selectedPlan === 'yearly'
                      ? `Subscribe \u2014 ${yearlyPrice}/year`
                      : `Subscribe \u2014 ${monthlyPrice}/month`}
                </Text>
              )}
            </TouchableOpacity>
          </View>

          {/* Error message */}
          {subscribeError ? (
            <Text
              style={{
                fontFamily: FontFamily.ui,
                fontSize: 13,
                color: '#E85C5C',
                textAlign: 'center',
                marginTop: 8,
                marginBottom: 4,
              }}
            >
              {subscribeError}
            </Text>
          ) : null}

          {/* Cancel anytime reassurance */}
          {isTrialEligible && (
            <Animated.View entering={FadeInDown.duration(400).delay(300)}>
              <View style={{ flexDirection: 'row', justifyContent: 'center', alignItems: 'center', marginTop: 8, marginBottom: 4 }}>
                <ShieldCheckIcon size={14} color={colors.textSubtle} weight="light" style={{ marginRight: 6 }} />
                <Text
                  style={{
                    fontFamily: FontFamily.ui,
                    fontSize: 12,
                    color: colors.textSubtle,
                    textAlign: 'center',
                  }}
                >
                  Try everything free for {selectedTrialDuration.replace('-', ' ')}s. Cancel anytime.
                </Text>
              </View>
            </Animated.View>
          )}

          {/* Restore + Legal at bottom */}
          <View style={{ alignItems: 'center', marginTop: 16, marginBottom: 8 }}>
            <TouchableOpacity
              activeOpacity={0.6}
              onPress={handleRestore}
              disabled={isPurchasing}
              accessibilityLabel="Restore purchases"
              accessibilityRole="button"
              accessibilityState={{ disabled: isPurchasing }}
              style={{
                padding: 6,
                opacity: isPurchasing ? 0.5 : 1,
              }}
            >
              <Text
                style={{
                  fontFamily: FontFamily.ui,
                  fontSize: 13,
                  color: colors.textSubtle,
                  textAlign: 'center',
                }}
              >
                Restore purchases
              </Text>
            </TouchableOpacity>
          </View>

          {/* Skip for onboarding flow */}
          {isFromOnboarding && (
            <TouchableOpacity
              activeOpacity={0.6}
              onPress={handleClose}
              style={{
                padding: 12,
                alignSelf: 'center',
              }}
            >
              <Text
                style={{
                  fontFamily: FontFamily.ui,
                  fontSize: 14,
                  color: colors.textSubtle,
                  textAlign: 'center',
                }}
              >
                Maybe later
              </Text>
            </TouchableOpacity>
          )}

          {/* Legal links at bottom */}
          <View
            style={{
              flexDirection: 'row',
              justifyContent: 'center',
              marginTop: 8,
              gap: 16,
            }}
          >
            <TouchableOpacity activeOpacity={0.6} onPress={() => Linking.openURL('https://www.apple.com/legal/internet-services/itunes/dev/stdeula/')} accessibilityRole="link" accessibilityLabel="Terms of Use">
              <Text
                style={{
                  fontFamily: FontFamily.ui,
                  fontSize: 11,
                  color: colors.textHint,
                  textDecorationLine: 'underline',
                }}
              >
                Terms of Use
              </Text>
            </TouchableOpacity>
            <TouchableOpacity activeOpacity={0.6} onPress={() => Linking.openURL('https://unfoldapp.co/privacy')} accessibilityRole="link" accessibilityLabel="Privacy Policy">
              <Text
                style={{
                  fontFamily: FontFamily.ui,
                  fontSize: 11,
                  color: colors.textHint,
                  textDecorationLine: 'underline',
                }}
              >
                Privacy Policy
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>

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
              backgroundColor: colors.inputBackground,
              borderRadius: 16,
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
    </View>
  );
}
