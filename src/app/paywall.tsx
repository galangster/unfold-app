import { useState } from 'react';
import { View, Text, Pressable, ActivityIndicator, Linking, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { X, Check, Crown } from 'lucide-react-native';
import { useTheme } from '@/lib/theme';
import { FontFamily } from '@/constants/fonts';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getOfferings, purchasePackage, restorePurchases, isRevenueCatEnabled, hasActiveSubscription } from '@/lib/revenuecatClient';
import type { PurchasesPackage } from 'react-native-purchases';
import { useUnfoldStore } from '@/lib/store';

const FEATURES = [
  'Unlimited devotional journeys',
  'Custom themes & accent colors',
  'Premium reading fonts',
  'Wallpaper share styles',
  'AI-powered journal prompts',
  'Daily reminder notifications',
];

type PlanChoice = 'yearly' | 'monthly';

export default function PaywallScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const [selectedPlan, setSelectedPlan] = useState<PlanChoice>('yearly');
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
        router.back();
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
        router.back();
      }
    },
  });

  const handleClose = () => {
    // Prevent double-tap
    if (isPurchasing) return;
    
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.back();
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

  const yearlyPrice = yearlyPackage?.product?.priceString ?? '$38.99';
  const yearlyRaw = yearlyPackage?.product?.price ?? 38.99;
  const monthlyPrice = monthlyPackage?.product?.priceString ?? '$3.99';
  const perMonthFromYearly = `$${(yearlyRaw / 12).toFixed(2)}`;

  // Hard-coded high-contrast CTA colors (theme-independent for guaranteed readability)
  const btnBg = '#1C1710';
  const btnText = '#FFFFFF';
  const btnBorder = isDark ? 'rgba(245, 240, 235, 0.28)' : 'rgba(28, 23, 16, 0.22)';

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      {/* Close button — absolute positioned, always on top */}
      <Pressable
        onPress={handleClose}
        disabled={isPurchasing}
        accessibilityState={{ disabled: isPurchasing }}
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        style={{
          position: 'absolute',
          top: insets.top + 16,
          right: 16,
          zIndex: 10,
          padding: 8,
          opacity: isPurchasing ? 0.5 : 1,
        }}
      >
        <X size={22} color={colors.textSubtle} />
      </Pressable>

      {/* Top section — hero + features (takes available space) */}
      <View style={{ flex: 1, paddingTop: insets.top + 12, paddingHorizontal: 28, justifyContent: 'flex-start' }}>
        {/* Hero */}
        <Animated.View entering={FadeIn.duration(600)}>
          <View
            style={{
              width: 36,
              height: 1,
              backgroundColor: colors.accent,
              marginBottom: 20,
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
            Go deeper.
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
            Unlock the full Unfold experience.
          </Text>
        </Animated.View>

        {/* Feature list */}
        <Animated.View
          entering={FadeInDown.duration(500).delay(100)}
          style={{ marginTop: 20 }}
        >
          {FEATURES.map((feature) => (
            <View
              key={feature}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                paddingVertical: 7,
              }}
            >
              <Check size={15} color={colors.accent} strokeWidth={2.5} />
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
            </View>
          ))}
        </Animated.View>
      </View>

      {/* Bottom section — plans + subscribe + legal (fixed at bottom) */}
      <View style={{ paddingHorizontal: 28, paddingBottom: Math.max(insets.bottom, 12) }}>
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
          >
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                paddingHorizontal: 16,
                paddingVertical: 14,
                borderRadius: 14,
                borderWidth: selectedPlan === 'yearly' ? 1.5 : 1,
                borderColor: selectedPlan === 'yearly' ? colors.accent : colors.border,
                backgroundColor: selectedPlan === 'yearly'
                  ? (isDark ? 'rgba(200, 165, 92, 0.06)' : 'rgba(154, 123, 60, 0.04)')
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
                      backgroundColor: isDark ? 'rgba(200, 165, 92, 0.15)' : 'rgba(154, 123, 60, 0.1)',
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
                      Save 20%
                    </Text>
                  </View>
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
                  ? (isDark ? 'rgba(200, 165, 92, 0.06)' : 'rgba(154, 123, 60, 0.04)')
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
                <Text
                  style={{
                    fontFamily: FontFamily.uiMedium,
                    fontSize: 15,
                    color: colors.text,
                  }}
                >
                  Monthly
                </Text>
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

        {/* SUBSCRIBE BUTTON — large, impossible to miss */}
        <Animated.View entering={FadeInDown.duration(400).delay(300)}>
          <Pressable
            onPress={handleSubscribe}
            disabled={isPurchasing}
            style={({ pressed }) => ({
              backgroundColor: btnBg,
              paddingVertical: 18,
              borderRadius: 14,
              borderWidth: 1,
              borderColor: btnBorder,
              opacity: pressed ? 0.85 : 1,
            })}
          >
            {isPurchasing ? (
              <ActivityIndicator color={btnText} />
            ) : (
              <Text
                style={{
                  fontFamily: FontFamily.uiSemiBold,
                  fontSize: 17,
                  color: btnText,
                  textAlign: 'center',
                  letterSpacing: 0.2,
                }}
              >
                {selectedPlan === 'yearly' ? `Subscribe — ${yearlyPrice}/year` : `Subscribe — ${monthlyPrice}/month`}
              </Text>
            )}
          </Pressable>
        </Animated.View>

        {/* Restore + fine print */}
        <View style={{ alignItems: 'center', marginTop: 10 }}>
          <Pressable
            onPress={handleRestore}
            disabled={isPurchasing}
            style={({ pressed }) => ({
              padding: 6,
              opacity: pressed ? 0.5 : 1,
            })}
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
          </Pressable>

          <Text
            style={{
              fontFamily: FontFamily.ui,
              fontSize: 10,
              color: colors.textHint,
              textAlign: 'center',
              lineHeight: 15,
              marginTop: 4,
              paddingHorizontal: 8,
            }}
          >
            Cancel anytime. Auto-renews unless canceled 24h before period ends.
          </Text>

          <View
            style={{
              flexDirection: 'row',
              justifyContent: 'center',
              marginTop: 4,
              gap: 16,
            }}
          >
            <Pressable onPress={() => Linking.openURL('https://www.apple.com/legal/internet-services/itunes/dev/stdeula/')}>
              <Text
                style={{
                  fontFamily: FontFamily.ui,
                  fontSize: 10,
                  color: colors.textSubtle,
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
                  fontSize: 10,
                  color: colors.textSubtle,
                  textDecorationLine: 'underline',
                }}
              >
                Privacy Policy
              </Text>
            </Pressable>
          </View>
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
