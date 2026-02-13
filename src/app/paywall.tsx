import { useState } from 'react';
import { View, Text, Pressable, ActivityIndicator, Linking, Platform, Image } from 'react-native';
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

  // Hardcoded new pricing (update in RevenueCat dashboard later)
  const monthlyPrice = '$3.99';
  const yearlyPrice = '$29.99';
  const yearlyRaw = 29.99;
  const perMonthFromYearly = '$2.50';

  // Hard-coded high-contrast CTA colors (theme-independent for guaranteed readability)
  const btnBg = '#1C1710';
  const btnText = '#FFFFFF';
  const btnBorder = isDark ? 'rgba(245, 240, 235, 0.28)' : 'rgba(28, 23, 16, 0.22)';

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      {/* Close button — higher position */}
      <Pressable
        onPress={handleClose}
        disabled={isPurchasing}
        accessibilityState={{ disabled: isPurchasing }}
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        style={{
          position: 'absolute',
          top: insets.top + 4,
          right: 16,
          zIndex: 10,
          padding: 8,
          opacity: isPurchasing ? 0.5 : 1,
        }}
      >
        <X size={22} color={colors.textSubtle} />
      </Pressable>

      {/* Top section — hero + features */}
      <View style={{ paddingTop: insets.top + 2, paddingHorizontal: 28 }}>
        {/* Hero */}
        <Animated.View entering={FadeIn.duration(600)}>
          {/* App Icon */}
          <View
            style={{
              width: 72,
              height: 72,
              borderRadius: 16,
              backgroundColor: isDark ? '#1C1710' : '#F5F5F3',
              justifyContent: 'center',
              alignItems: 'center',
              marginBottom: 16,
              borderWidth: 1,
              borderColor: colors.border,
            }}
          >
            {/* Icon placeholder - add images to assets folder and use require */}
            <View style={{ width: 40, height: 40, backgroundColor: colors.accent, borderRadius: 8 }} />
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
          style={{ marginTop: 16 }}
        >
          {FEATURES.map((feature) => (
            <View
              key={feature}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                paddingVertical: 4,
              }}
            >
              <Check size={18} color={colors.accent} strokeWidth={2.5} />
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
        
        {/* Separator */}
        <View
          style={{
            height: 1,
            backgroundColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)',
            marginVertical: 20,
          }}
        />
      </View>

      {/* Plans + subscribe + legal */}
      <View style={{ flex: 1, paddingHorizontal: 28, paddingBottom: 8, paddingTop: 8 }}>
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
                borderWidth: selectedPlan === 'yearly' ? 2 : 1,
                borderColor: selectedPlan === 'yearly' ? colors.accent : colors.border,
                backgroundColor: selectedPlan === 'yearly'
                  ? (isDark ? 'rgba(200, 165, 92, 0.12)' : 'rgba(200, 165, 92, 0.08)')
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
                      Save 25%
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
        <Animated.View entering={FadeInDown.duration(400).delay(300)} style={{ marginTop: 24 }}>
          <Pressable
            onPress={handleSubscribe}
            disabled={isPurchasing}
            style={({ pressed }) => ({
              backgroundColor: '#C8A55C',
              paddingVertical: 18,
              borderRadius: 14,
              shadowColor: '#C8A55C',
              shadowOffset: { width: 0, height: 4 },
              shadowOpacity: 0.4,
              shadowRadius: 10,
              elevation: 8,
              opacity: pressed ? 0.9 : 1,
              transform: [{ scale: pressed ? 0.98 : 1 }],
            })}
          >
            {isPurchasing ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text
                style={{
                  fontFamily: FontFamily.uiSemiBold,
                  fontSize: 17,
                  color: '#fff',
                  textAlign: 'center',
                  letterSpacing: 0.2,
                }}
              >
                {selectedPlan === 'yearly' ? `Subscribe — ${yearlyPrice}/year` : `Subscribe — ${monthlyPrice}/month`}
              </Text>
            )}
          </Pressable>
        </Animated.View>

        {/* Restore + Legal at bottom */}
        <View style={{ flex: 1 }} />
        <View style={{ alignItems: 'center', marginBottom: 8 }}>
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
        </View>

        {/* Legal links at bottom */}
        <View
          style={{
            flexDirection: 'row',
            justifyContent: 'center',
            marginTop: 8,
            paddingBottom: Math.max(insets.bottom, 8),
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
