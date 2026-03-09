import { useState, useMemo, useEffect } from 'react';
import { View, Text, Pressable, ActivityIndicator, Linking, Image, ScrollView } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeIn, FadeInDown, useSharedValue, useAnimatedStyle, withRepeat, withTiming, withDelay, Easing } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { XIcon, CheckIcon, CrownIcon, ShieldCheckIcon, SparkleIcon, ClockIcon } from 'phosphor-react-native';
import { useTheme } from '@/lib/theme';
import { FontFamily } from '@/constants/fonts';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getOfferings, purchasePackage, restorePurchases, isRevenueCatEnabled, hasActiveSubscription } from '@/lib/revenuecatClient';
import type { PurchasesPackage } from 'react-native-purchases';
import Purchases from 'react-native-purchases';
import { useUnfoldStore } from '@/lib/store';

const FEATURES = [
  'Unlimited devotional journeys',
  'AI voice narration with voice selection',
  'AI-powered journal prompts',
  'Custom themes & accent colors',
  'Premium reading fonts',
  'Premium Bible translations',
  'Wallpaper share styles',
  'Unlimited streak freezes',
];

type PlanChoice = 'yearly' | 'monthly';

/** Determine if a package has a free trial intro offer */
function packageHasFreeTrial(pkg: PurchasesPackage | undefined | null): boolean {
  if (!pkg) return false;
  const intro = pkg.product.introPrice;
  if (!intro) return false;
  // A free trial has price === 0
  return intro.price === 0;
}

/** Get human-readable trial duration from a package */
function getTrialDuration(pkg: PurchasesPackage | undefined | null): string | null {
  if (!pkg) return null;
  const intro = pkg.product.introPrice;
  if (!intro || intro.price !== 0) return null;

  const count = intro.periodNumberOfUnits;
  const unit = intro.periodUnit.toLowerCase();

  // Normalize unit
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
  const [selectedPlan, setSelectedPlan] = useState<PlanChoice>('yearly'); // Default yearly for better conversion
  const updateUser = useUnfoldStore((s) => s.updateUser);

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
  // Primary: use SDK eligibility check. Fallback: check introPrice on product.
  const isTrialEligible = useMemo(() => {
    const selectedPkg = selectedPlan === 'yearly' ? yearlyPackage : monthlyPackage;
    if (!selectedPkg) return false;

    // If we have eligibility data from the SDK, use it
    if (trialEligibility) {
      const eligibility = trialEligibility[selectedPkg.product.identifier];
      if (eligibility) {
        // status 2 = ELIGIBLE, status 1 = INELIGIBLE
        if (eligibility.status === 2) return true;
        if (eligibility.status === 1) return false;
        // status 0 = UNKNOWN, fall through to introPrice check
      }
    }

    // Fallback: if the product has a free trial introPrice, show trial UI
    return packageHasFreeTrial(selectedPkg);
  }, [selectedPlan, yearlyPackage, monthlyPackage, trialEligibility]);

  // Check if either plan has a trial (for the badge on plan cards)
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
        // Immediately update the Zustand store
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
        // Immediately update the Zustand store
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
    // Prevent double-tap
    if (isPurchasing) return;

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (isEarlyOnboarding) {
      // Early onboarding paywall — just go back to resume onboarding
      router.back();
    } else if (isFromOnboarding) {
      router.replace('/generating');
    } else {
      router.back();
    }
  };

  const handleSubscribe = () => {
    // Prevent double-tap - already handled by disabled prop but extra safety
    if (isPurchasing) return;

    const pkg = selectedPlan === 'yearly' ? yearlyPackage : monthlyPackage;
    if (!pkg) return;
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

  // Hardcoded pricing (update in RevenueCat dashboard later)
  const monthlyPrice = '$5.99';
  const yearlyPrice = '$49.99';
  const yearlyRaw = 49.99;
  const perMonthFromYearly = '$4.17';

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      {/* Close button -- pinned near top of modal sheet */}
      <Pressable
        onPress={handleClose}
        disabled={isPurchasing}
        accessibilityState={{ disabled: isPurchasing }}
        accessibilityLabel="Close paywall"
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        style={{
          position: 'absolute',
          top: 16,
          right: 16,
          zIndex: 10,
          padding: 8,
          opacity: isPurchasing ? 0.5 : 1,
        }}
      >
        <XIcon size={22} color={colors.textSubtle} weight="light" />
      </Pressable>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingBottom: Math.max(insets.bottom, 16) + 8 }}
        showsVerticalScrollIndicator={false}
        bounces={false}
      >
        {/* Top section -- hero + features */}
        <View style={{ paddingTop: 20, paddingHorizontal: 28 }}>
          {/* Hero */}
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
              {/* Icon - switches based on theme */}
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
              {isFromOnboarding ? 'Start with everything.' : 'Go deeper.'}
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
              {isFromOnboarding
                ? 'Your journey is ready. Try 7 days free — cancel anytime.'
                : isTrialEligible
                  ? 'Try the full Unfold experience, free.'
                  : 'Unlock the full Unfold experience.'}
            </Text>
          </Animated.View>

          {/* Feature list -- staggered entrance */}
          <View style={{ marginTop: 16 }}>
            {FEATURES.map((feature, index) => (
              <Animated.View
                key={feature}
                entering={FadeInDown.duration(400).delay(100 + index * 60)}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  paddingVertical: 4,
                }}
              >
                <CheckIcon size={18} color={colors.accent} weight="bold" />
                <Text
                  style={{
                    fontFamily: FontFamily.ui,
                    fontSize: 14,
                    color: colors.text,
                    marginLeft: 12,
                  }}
                >
                  {feature}
                </Text>
              </Animated.View>
            ))}
          </View>

          {/* Trial timeline -- only show when eligible */}
          {isTrialEligible && (
            <Animated.View
              entering={FadeInDown.duration(500).delay(600)}
              style={{
                marginTop: 20,
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
                    Full access to every premium feature. No charge.
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
            <Pressable
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
            </Pressable>

            {/* Monthly */}
            <Pressable
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
            </Pressable>
          </Animated.View>

          {/* SUBSCRIBE BUTTON with glow */}
          <Animated.View
            style={[
              {
                marginTop: 8,
                marginBottom: 4,
                borderRadius: 28,
                shadowColor: colors.accent,
                shadowOffset: { width: 0, height: 4 },
              },
              glowStyle,
            ]}
          >
            <Pressable
              onPress={handleSubscribe}
              disabled={isPurchasing}
              accessibilityLabel={isTrialEligible ? `Start your ${selectedTrialDuration} free trial` : 'Subscribe now'}
              accessibilityRole="button"
              style={{
                backgroundColor: colors.accent,
                paddingVertical: 18,
                paddingHorizontal: 32,
                borderRadius: 28,
                alignItems: 'center',
                justifyContent: 'center',
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
                      ? `Subscribe — ${yearlyPrice}/year`
                      : `Subscribe — ${monthlyPrice}/month`}
                </Text>
              )}
            </Pressable>
          </Animated.View>

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
            <Pressable
              onPress={handleRestore}
              disabled={isPurchasing}
              accessibilityLabel="Restore purchases"
              style={{
                padding: 6,
              }}
            >
              {({ pressed }) => (
                <Text
                  style={{
                    fontFamily: FontFamily.ui,
                    fontSize: 13,
                    color: colors.textSubtle,
                    textAlign: 'center',
                    opacity: pressed ? 0.5 : 1,
                  }}
                >
                  Restore purchases
                </Text>
              )}
            </Pressable>
          </View>

          {/* Skip for onboarding flow */}
          {isFromOnboarding && (
            <Pressable
              onPress={handleClose}
              style={{
                padding: 12,
                alignSelf: 'center',
              }}
            >
              {({ pressed }) => (
                <Text
                  style={{
                    fontFamily: FontFamily.ui,
                    fontSize: 14,
                    color: colors.textSubtle,
                    textAlign: 'center',
                    opacity: pressed ? 0.5 : 1,
                  }}
                >
                  Maybe later
                </Text>
              )}
            </Pressable>
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
            <Pressable onPress={() => Linking.openURL('https://www.apple.com/legal/internet-services/itunes/dev/stdeula/')}>
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
            </Pressable>
            <Pressable onPress={() => Linking.openURL('https://unfoldapp.co/privacy')}>
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
            </Pressable>
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
