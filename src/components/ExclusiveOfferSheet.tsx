/**
 * ExclusiveOfferSheet -- One-time retention paywall for churned or onboarding-cancel users.
 *
 * Two contexts:
 * - 'onboarding': 50% OFF badge, purchases $rc_annual from default offering ($59.99/yr).
 * - 'churned': 25% OFF badge, fetches 'winback' offering and purchases its first package ($44.99/yr).
 *
 * Shown once per trigger. User will not see this offer again.
 */

import { useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, Modal, Linking } from 'react-native';
import { LEGAL_LINKS } from '@/lib/push-notification-helpers';
import { TouchableOpacity } from 'react-native-gesture-handler';
import Animated, { FadeIn, useReducedMotion } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { useQueryClient, useQuery, useMutation } from '@tanstack/react-query';
import {
  getOfferings,
  purchasePackage,
  restorePurchases,
  isRevenueCatEnabled,
} from '@/lib/revenuecatClient';
import type { PurchasesPackage } from 'react-native-purchases';
import { useUnfoldStore } from '@/lib/store';
import { useTheme } from '@/lib/theme';
import { FontFamily, FontSize } from '@/constants/fonts';
import { Spacing } from '@/constants/spacing';
import { Radius } from '@/constants/radius';
import { Duration, Ease } from '@/constants/animations';
import { Gift } from 'phosphor-react-native';
import { logger } from '@/lib/logger';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ExclusiveOfferSheetProps {
  visible: boolean;
  onDismiss: () => void;
  context: 'onboarding' | 'churned';
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ExclusiveOfferSheet({ visible, onDismiss, context }: ExclusiveOfferSheetProps) {
  const { colors, isDark } = useTheme();
  const reducedMotion = useReducedMotion();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const queryClient = useQueryClient();
  const updateUser = useUnfoldStore((s) => s.updateUser);

  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const isOnboarding = context === 'onboarding';
  const discountLabel = isOnboarding ? '50% OFF' : '25% OFF';

  // Fetch offerings
  const { data: offeringsResult, isLoading: isLoadingOfferings } = useQuery({
    queryKey: ['revenuecat', 'offerings'],
    queryFn: getOfferings,
    enabled: isRevenueCatEnabled() && visible,
    retry: 3,
    retryDelay: (attempt: number) => Math.min(1000 * 2 ** attempt, 8000),
    staleTime: 1000 * 60 * 10,
  });

  const offerings = offeringsResult?.ok ? offeringsResult.data : null;

  // Resolve the target package based on context
  const targetPackage: PurchasesPackage | undefined = isOnboarding
    ? offerings?.current?.availablePackages.find((pkg) => pkg.identifier === '$rc_annual')
    : offerings?.all?.['winback']?.availablePackages?.[0];

  // Build price string
  const priceString = targetPackage
    ? `${targetPackage.product.priceString}/year`
    : null;

  // Detect offering failure — loaded but target package missing
  const offeringFailed = !isLoadingOfferings && offeringsResult && !targetPackage;

  // Purchase mutation
  const purchaseMutation = useMutation({
    mutationFn: (pkg: PurchasesPackage) => purchasePackage(pkg),
    onSuccess: async (result) => {
      if (result.ok) {
        const hasPremium = Boolean(result.data.entitlements.active?.['Unfold Premium']);
        logger.log(
          '[ExclusiveOfferSheet] Purchase succeeded. Active entitlements:',
          JSON.stringify(Object.keys(result.data.entitlements.active ?? {})),
          'hasPremium:', hasPremium,
        );
        if (!hasPremium) {
          setErrorMessage('Purchase completed but premium was not activated. Please tap Restore.');
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
          return;
        }
        updateUser({ isPremium: true });
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        queryClient.invalidateQueries({ queryKey: ['revenuecat'] });
        setErrorMessage(null);
        onDismiss();
      } else if (result.reason === 'user_cancelled') {
        return;
      } else {
        logger.log('[ExclusiveOfferSheet] Purchase did not complete:', JSON.stringify(result));
        setErrorMessage('Something went wrong. Please try again.');
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      }
    },
    onError: (error) => {
      logger.log('[ExclusiveOfferSheet] Purchase error:', error);
      setErrorMessage('Something went wrong. Please try again.');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    },
  });

  // Restore mutation
  const restoreMutation = useMutation({
    mutationFn: restorePurchases,
    onSuccess: async (result) => {
      if (result.ok) {
        const hasPremium = Boolean(result.data.entitlements.active?.['Unfold Premium']);
        if (hasPremium) {
          updateUser({ isPremium: true });
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          queryClient.invalidateQueries({ queryKey: ['revenuecat'] });
          setErrorMessage(null);
          onDismiss();
        } else {
          setErrorMessage('No active subscription found.');
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
        }
      } else {
        setErrorMessage('No active subscription found.');
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      }
    },
    onError: (error) => {
      logger.log('[ExclusiveOfferSheet] Restore error:', error);
      setErrorMessage('Could not restore purchases. Please try again.');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    },
  });

  const isPurchasing = purchaseMutation.isPending || restoreMutation.isPending;

  const handleAcceptOffer = () => {
    if (isPurchasing || !targetPackage) return;
    setErrorMessage(null);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    purchaseMutation.mutate(targetPackage);
  };

  const handleFallbackPaywall = () => {
    onDismiss();
    router.push('/paywall');
  };

  const handleRestore = () => {
    if (isPurchasing) return;
    setErrorMessage(null);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    restoreMutation.mutate();
  };

  const bodyText = isOnboarding
    ? "Don\u2019t miss out on personalized devotionals and AI-powered spiritual growth."
    : 'Your devotionals and journal are still here. Pick up where you left off.';

  return (
    <Modal
      visible={visible}
      animationType="fade"
      transparent={false}
      onRequestClose={onDismiss}
    >
      <Animated.View
        entering={reducedMotion ? undefined : FadeIn.duration(Duration.normal).easing(Ease.out)}
        style={[styles.root, { backgroundColor: colors.background }]}
      >
        {/* Scrollable content area */}
        <View style={[styles.content, { paddingTop: insets.top + Spacing['12'] }]}>
          {/* Gift icon */}
          <View
            style={[
              styles.giftIconContainer,
              { backgroundColor: colors.accent + '26' },
            ]}
          >
            <Gift size={32} color={colors.accent} weight="fill" />
          </View>

          {/* Headline */}
          <Text style={[styles.headline, { color: colors.text }]}>
            Exclusive Offer
          </Text>

          {/* Body text */}
          <Text style={[styles.body, { color: colors.textMuted }]}>
            {bodyText}
          </Text>

          {/* Urgency line */}
          <Text style={[styles.urgencyText, { color: colors.textSubtle }]}>
            You will not see this offer again.
          </Text>

          {/* Plan pill — hidden when offering failed */}
          {!offeringFailed && (
            <View
              style={[
                styles.planPill,
                {
                  borderColor: colors.accent,
                  backgroundColor: colors.accent + '08',
                },
              ]}
            >
              {/* Discount badge */}
              <View style={[styles.discountBadge, { backgroundColor: colors.accent }]}>
                <Text style={[styles.discountBadgeText, { color: isDark ? '#0A0A0A' : '#FFFFFF' }]}>
                  {discountLabel}
                </Text>
              </View>

              <View style={styles.planPillContent}>
                <Text style={[styles.planLabel, { color: colors.text }]}>Yearly</Text>
                {priceString ? (
                  <Text style={[styles.planPrice, { color: colors.text }]}>
                    {priceString}
                  </Text>
                ) : (
                  <ActivityIndicator size="small" color={colors.textSubtle} />
                )}
              </View>
            </View>
          )}

          {/* Cancel anytime reassurance */}
          {!offeringFailed && (
            <View style={styles.reassuranceRow}>
              <Text style={[styles.reassuranceText, { color: colors.textMuted }]}>
                {'\u2713'} Cancel anytime
              </Text>
            </View>
          )}

          {/* Offering failed fallback */}
          {offeringFailed && (
            <Text style={[styles.body, { color: colors.textMuted, marginTop: Spacing['4'] }]}>
              This offer isn't available right now. You can still view our plans.
            </Text>
          )}

          {/* Error message */}
          {errorMessage && (
            <Text style={[styles.errorText, { color: colors.error }]}>
              {errorMessage}
            </Text>
          )}
        </View>

        {/* Bottom CTA area — pinned to bottom */}
        <View style={[styles.bottomArea, { paddingBottom: insets.bottom + Spacing['4'] }]}>
          {/* Accept Offer / Fallback CTA */}
          <TouchableOpacity
            activeOpacity={0.8}
            onPress={offeringFailed ? handleFallbackPaywall : handleAcceptOffer}
            disabled={!offeringFailed && (isPurchasing || isLoadingOfferings || !targetPackage)}
            accessibilityRole="button"
            accessibilityLabel={offeringFailed ? 'View Plans' : 'Accept Offer'}
            style={[
              styles.acceptButton,
              { backgroundColor: colors.accent },
              isPurchasing && styles.buttonDisabled,
            ]}
          >
            {isPurchasing ? (
              <ActivityIndicator color={isDark ? '#0A0A0A' : '#FFFFFF'} size="small" />
            ) : (
              <Text style={[styles.acceptButtonText, { color: isDark ? '#0A0A0A' : '#FFFFFF' }]}>
                {offeringFailed ? 'View Plans' : isLoadingOfferings ? 'Loading...' : 'Accept Offer'}
              </Text>
            )}
          </TouchableOpacity>

          {/* No thanks dismiss */}
          <TouchableOpacity
            activeOpacity={0.7}
            onPress={onDismiss}
            disabled={isPurchasing}
            accessibilityRole="button"
            accessibilityLabel="No thanks"
            style={styles.dismissButton}
          >
            <Text style={[styles.dismissText, { color: colors.textSubtle }]}>
              No thanks
            </Text>
          </TouchableOpacity>

          {/* Restore purchases */}
          <TouchableOpacity
            activeOpacity={0.7}
            onPress={handleRestore}
            disabled={isPurchasing}
            accessibilityRole="button"
            accessibilityLabel="Restore purchases"
            style={styles.restoreButton}
          >
            <Text style={[styles.restoreText, { color: colors.textSubtle }]}>
              Restore purchases
            </Text>
          </TouchableOpacity>

          {/* Legal links */}
          <View style={styles.legalRow}>
            <TouchableOpacity
              activeOpacity={0.7}
              onPress={() =>
                Linking.openURL(
                  LEGAL_LINKS.terms,
                )
              }
            >
              <Text style={[styles.legalText, { color: colors.textHint }]}>Terms</Text>
            </TouchableOpacity>
            <Text style={[styles.legalSeparator, { color: colors.textHint }]}>{'\u00B7'}</Text>
            <TouchableOpacity
              activeOpacity={0.7}
              onPress={() => Linking.openURL(LEGAL_LINKS.privacy)}
            >
              <Text style={[styles.legalText, { color: colors.textHint }]}>Privacy</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Animated.View>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  content: {
    flex: 1,
    paddingHorizontal: Spacing['6'],
    alignItems: 'center',
    justifyContent: 'center',
  },
  giftIconContainer: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing['5'],
  },
  headline: {
    fontFamily: FontFamily.display,
    fontSize: FontSize['4xl'],
    textAlign: 'center',
    letterSpacing: -0.5,
    marginBottom: Spacing['3'],
  },
  body: {
    fontFamily: FontFamily.body,
    fontSize: FontSize.base,
    textAlign: 'center',
    lineHeight: 24,
    paddingHorizontal: Spacing['4'],
    marginBottom: Spacing['3'],
  },
  urgencyText: {
    fontFamily: FontFamily.bodyItalic,
    fontSize: FontSize.sm,
    textAlign: 'center',
    marginBottom: Spacing['6'],
  },
  planPill: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'stretch',
    borderWidth: 1,
    borderRadius: Radius.card,
    paddingVertical: Spacing['4'],
    paddingHorizontal: Spacing['5'],
    marginHorizontal: Spacing['2'],
    marginBottom: Spacing['4'],
    position: 'relative',
    overflow: 'visible',
  },
  planPillContent: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  planLabel: {
    fontFamily: FontFamily.uiSemiBold,
    fontSize: FontSize.base,
  },
  planPrice: {
    fontFamily: FontFamily.uiMedium,
    fontSize: FontSize.base,
    fontVariant: ['tabular-nums'],
  },
  discountBadge: {
    position: 'absolute',
    top: -10,
    right: Spacing['4'],
    paddingHorizontal: Spacing['2'],
    paddingVertical: Spacing['0.5'],
    borderRadius: Radius.sm,
  },
  discountBadgeText: {
    fontFamily: FontFamily.uiSemiBold,
    fontSize: FontSize.xs,
    letterSpacing: 0.5,
  },
  reassuranceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing['3'],
  },
  reassuranceText: {
    fontFamily: FontFamily.ui,
    fontSize: FontSize.sm,
  },
  errorText: {
    fontFamily: FontFamily.ui,
    fontSize: FontSize.sm,
    textAlign: 'center',
    marginTop: Spacing['2'],
  },
  bottomArea: {
    paddingHorizontal: Spacing['7'],
    paddingTop: Spacing['4'],
  },
  acceptButton: {
    paddingVertical: Spacing['4'],
    borderRadius: Radius.card,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 52,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  acceptButtonText: {
    fontFamily: FontFamily.uiSemiBold,
    fontSize: FontSize.base,
    letterSpacing: 0.2,
  },
  dismissButton: {
    alignItems: 'center',
    paddingVertical: Spacing['3'],
    marginTop: Spacing['2'],
  },
  dismissText: {
    fontFamily: FontFamily.ui,
    fontSize: FontSize.sm,
  },
  restoreButton: {
    alignItems: 'center',
    paddingVertical: Spacing['2'],
  },
  restoreText: {
    fontFamily: FontFamily.ui,
    fontSize: FontSize.sm,
  },
  legalRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: Spacing['1'],
    gap: Spacing['2'],
  },
  legalText: {
    fontFamily: FontFamily.ui,
    fontSize: FontSize.xs,
  },
  legalSeparator: {
    fontFamily: FontFamily.ui,
    fontSize: FontSize.xs,
  },
});
