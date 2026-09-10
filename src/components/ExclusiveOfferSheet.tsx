/**
 * ExclusiveOfferSheet -- One-time retention paywall for churned or onboarding-cancel users.
 *
 * Two contexts:
 * - 'onboarding': 50% OFF badge, purchases $rc_annual from default offering ($59.99/yr).
 * - 'churned': 25% OFF badge, fetches 'winback' offering and purchases its first package ($44.99/yr).
 *   This churned path is disabled by default for v1 via EXPO_PUBLIC_ENABLE_CHURNED_WINBACK_OFFER.
 *   When the winback SKU is off sale RevenueCat still returns the offering with an
 *   empty availablePackages, so the churned path falls back to $rc_annual and shows
 *   that package's badge instead of the winback 25%.
 *
 * Shown once per trigger, and only burned once a real offer reaches the screen:
 * a sheet that could not load a package leaves the one-time chance intact.
 */

import { useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, Modal, Linking, ScrollView } from 'react-native';
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
import { Gift } from '@/components/icons';
import { logger } from '@/lib/logger';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * What the sheet reports back when it closes without granting premium.
 * `offerShown` is true only when a purchasable package actually reached the
 * screen, so hosts can burn their once-ever offer flag on a real presentation
 * and leave it alone when the sheet only managed to render its failure state.
 */
export interface ExclusiveOfferDismissInfo {
  offerShown: boolean;
}

interface ExclusiveOfferSheetProps {
  visible: boolean;
  onDismiss: (info?: ExclusiveOfferDismissInfo) => void;
  /**
   * Called instead of onDismiss when a purchase or restore INSIDE this sheet
   * grants premium. Onboarding passes the same callback its main CTA uses so a
   * purchase made here advances the flow rather than dropping the person back
   * on the paywall. Optional: callers that only need to close fall back to
   * onDismiss, which is the pre-existing behaviour.
   */
  onPurchaseSuccess?: () => void;
  context: 'onboarding' | 'churned';
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ExclusiveOfferSheet({
  visible,
  onDismiss,
  onPurchaseSuccess,
  context,
}: ExclusiveOfferSheetProps) {
  const { colors, isDark } = useTheme();
  const reducedMotion = useReducedMotion();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const queryClient = useQueryClient();
  const updateUser = useUnfoldStore((s) => s.updateUser);

  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const isOnboarding = context === 'onboarding';

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

  const standardAnnualPackage = offerings?.current?.availablePackages.find(
    (pkg) => pkg.identifier === '$rc_annual',
  );
  const winbackPackage = offerings?.all?.['winback']?.availablePackages?.[0];

  // The churned path falls back to the standard annual package: pulling
  // unfold_yearly_winback from sale leaves the winback offering present but
  // empty, and without this fallback the sheet had nothing to sell and could
  // only render its failure state.
  const usingWinback = !isOnboarding && winbackPackage !== undefined;
  const targetPackage: PurchasesPackage | undefined = usingWinback
    ? winbackPackage
    : standardAnnualPackage;

  // The badge follows the package that is actually for sale. Advertising the
  // winback 25% over a $rc_annual fallback would be a false discount claim.
  const discountLabel = usingWinback ? '25% OFF' : '50% OFF';

  // Build price string
  const priceString = targetPackage
    ? `${targetPackage.product.priceString}/year`
    : null;

  // No package, and none is still coming. react-query reports isLoading only
  // while a fetch is genuinely in flight, so this one term covers a disabled,
  // paused, errored or settled-but-empty query alike.
  const offeringFailed = !targetPackage && !isLoadingOfferings;

  // Every close routes through here so the host learns whether a purchasable
  // offer was on screen. It takes no arguments on purpose: passed straight to
  // onPress and onRequestClose, a React Native event would land in the info slot.
  const handleDismiss = () => onDismiss({ offerShown: Boolean(targetPackage) });

  // Single exit for "premium is now active", shared by purchase and restore.
  // Hands off to onPurchaseSuccess when the caller supplied one so the host
  // flow can advance; otherwise it just closes, as it always did.
  const handleEntitlementGranted = () => {
    updateUser({ isPremium: true });
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    queryClient.invalidateQueries({ queryKey: ['revenuecat'] });
    setErrorMessage(null);
    if (onPurchaseSuccess) {
      onPurchaseSuccess();
      return;
    }
    handleDismiss();
  };

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
        handleEntitlementGranted();
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
          handleEntitlementGranted();
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

  // Reached only from the failure state, so handleDismiss reports offerShown
  // false and the host keeps the person's one shot at the offer.
  const handleFallbackPaywall = () => {
    handleDismiss();
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
      onRequestClose={handleDismiss}
    >
      <Animated.View
        entering={reducedMotion ? undefined : FadeIn.duration(Duration.normal).easing(Ease.out)}
        style={[styles.root, { backgroundColor: colors.background }]}
      >
        {/* Scrollable content area */}
        <ScrollView style={{ flex: 1 }} contentContainerStyle={[styles.content, { paddingTop: insets.top + Spacing['6'], paddingBottom: Spacing['6'] }]}>
          {/* Gift icon */}
          <View
            style={[
              styles.giftIconContainer,
              { backgroundColor: colors.accent + '26' },
            ]}
          >
            <Gift size={32} color={colors.accent} weight="fill" />
          </View>

          {/* Headline — never claim an exclusive offer the sheet could not load */}
          <Text style={[styles.headline, { color: colors.text }]}>
            {offeringFailed ? 'Unfold Premium' : 'Exclusive Offer'}
          </Text>

          {/* Body text */}
          <Text style={[styles.body, { color: colors.textMuted }]}>
            {bodyText}
          </Text>

          {/* Urgency line — the host leaves the one-time flag unburned when the
              offer failed, so this promise would not hold */}
          {!offeringFailed && (
            <Text style={[styles.urgencyText, { color: colors.textSubtle }]}>
              You will not see this offer again.
            </Text>
          )}

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
              {/* Discount badge — held back until a package resolves, so a churned
                  sheet cannot flash the fallback 50% before the winback 25% lands */}
              {targetPackage && (
                <View style={[styles.discountBadge, { backgroundColor: colors.accent }]}>
                  <Text style={[styles.discountBadgeText, { color: isDark ? '#0A0A0A' : '#FFFFFF' }]}>
                    {discountLabel}
                  </Text>
                </View>
              )}

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
        </ScrollView>

        {/* Bottom CTA area — pinned to bottom */}
        <View style={[styles.bottomArea, { paddingBottom: insets.bottom + Spacing['4'] }]}>
          {/* Accept Offer / Fallback CTA */}
          <TouchableOpacity
            activeOpacity={0.8}
            onPress={offeringFailed ? handleFallbackPaywall : handleAcceptOffer}
            disabled={isPurchasing || (!offeringFailed && !targetPackage)}
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
            onPress={handleDismiss}
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
    flexGrow: 1,
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
    fontSize: 32,
    textAlign: 'center',
    letterSpacing: -0.15,
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
    flexWrap: 'wrap',
    gap: Spacing['2'],
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
