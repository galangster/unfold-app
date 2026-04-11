/**
 * TrialExpiredOverlay -- Full-screen blocking paywall for expired subscriptions.
 *
 * Shown when isPremium is false AND hasCompletedOnboarding is true.
 * Blocks Today, Companion, and Journal tabs. Bible tab stays accessible.
 * User data is preserved -- resubscribing restores everything.
 *
 * Design: warm, premium, not aggressive. Gold accent CTA, Instrument Serif
 * headline, critically-damped springs only.
 */

import { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  Image,
  Linking,
} from 'react-native';
import { TouchableOpacity } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { EmberParticles } from '@/components/EmberParticles';
import * as Haptics from 'expo-haptics';
import { useQueryClient, useQuery, useMutation } from '@tanstack/react-query';
import {
  getOfferings,
  purchasePackage,
  restorePurchases,
  isRevenueCatEnabled,
  hasActiveSubscription,
} from '@/lib/revenuecatClient';
import type { PurchasesPackage } from 'react-native-purchases';
import { useUnfoldStore } from '@/lib/store';
import { useTheme } from '@/lib/theme';
import { FontFamily, FontSize } from '@/constants/fonts';
import { Spacing } from '@/constants/spacing';
import { Radius } from '@/constants/radius';
import { logger } from '@/lib/logger';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function TrialExpiredOverlay() {
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const router = useRouter();
  const updateUser = useUnfoldStore((s) => s.updateUser);
  const userName = useUnfoldStore((s) => s.user?.name);

  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const firstName = userName?.split(' ')[0];

  // Fetch offerings
  const { data: offeringsResult, isLoading: isLoadingOfferings } = useQuery({
    queryKey: ['revenuecat', 'offerings'],
    queryFn: getOfferings,
    enabled: isRevenueCatEnabled(),
    retry: 3,
    retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 8000),
    staleTime: 1000 * 60 * 10,
  });

  const offerings = offeringsResult?.ok ? offeringsResult.data : null;
  // Prefer yearly, fall back to monthly
  const yearlyPackage = offerings?.current?.availablePackages.find(
    (pkg) => pkg.identifier === '$rc_annual',
  );
  const monthlyPackage = offerings?.current?.availablePackages.find(
    (pkg) => pkg.identifier === '$rc_monthly',
  );
  const primaryPackage = yearlyPackage ?? monthlyPackage;

  const hasTrial = packageHasFreeTrial(primaryPackage);
  const trialDuration = getTrialDuration(primaryPackage) ?? '7-day';

  // Build price string
  const priceString = primaryPackage
    ? primaryPackage.identifier === '$rc_annual'
      ? `${primaryPackage.product.priceString}/year`
      : `${primaryPackage.product.priceString}/month`
    : null;

  // Purchase mutation
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
        setErrorMessage(null);
      } else if (result.reason === 'user_cancelled') {
        return;
      } else {
        logger.log('[TrialExpiredOverlay] Purchase did not complete:', JSON.stringify(result));
        setErrorMessage('Something went wrong. Please try again.');
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      }
    },
    onError: (error) => {
      logger.log('[TrialExpiredOverlay] Purchase error:', error);
      setErrorMessage('Something went wrong. Please try again.');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    },
  });

  // Restore mutation
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
        setErrorMessage(null);
      } else {
        setErrorMessage('No active subscription found.');
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      }
    },
    onError: (error) => {
      logger.log('[TrialExpiredOverlay] Restore error:', error);
      setErrorMessage('Could not restore purchases. Please try again.');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    },
  });

  const isPurchasing = purchaseMutation.isPending || restoreMutation.isPending;

  const handleSubscribe = () => {
    if (isPurchasing || !primaryPackage) return;
    setErrorMessage(null);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    purchaseMutation.mutate(primaryPackage);
  };

  const handleRestore = () => {
    if (isPurchasing) return;
    setErrorMessage(null);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    restoreMutation.mutate();
  };

  // Escape hatch to the free Bible tab. The paywall is hosted inside a
  // <Modal presentationStyle="overFullScreen"> for z-order correctness,
  // which covers the tab bar — without this, a churned user landing on
  // Today/Ask/Journal has no way to reach the still-free Bible tab.
  const handleGoToBible = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.replace('/(tabs)/(bible)');
  };

  // Build CTA label
  const ctaLabel = hasTrial
    ? `Start ${trialDuration} free trial`
    : priceString
      ? `Subscribe ${priceString}`
      : 'Subscribe';

  // Gold gradient tones for the accent bar
  const goldAccent = colors.accent;

  return (
    <View
      style={[
        styles.root,
        {
          backgroundColor: colors.background,
        },
      ]}
    >
      {/* Ambient ember particles — subtle background animation */}
      <EmberParticles color={goldAccent} count={18} bidirectional />

      {/* Gradient fade at bottom — warmth behind the CTA */}
      <LinearGradient
        colors={['transparent', `${goldAccent}15`, `${goldAccent}30`]}
        style={styles.bottomGradient}
        pointerEvents="none"
      />

      {/* Content block — left aligned, lifted toward center */}
      <View style={[styles.content, { paddingTop: insets.top + Spacing['12'] }]}>
        {/* App icon */}
        <Image
          source={require('../../assets/icon-paywall.png')}
          style={[styles.appIcon, { tintColor: goldAccent, opacity: 0.9 }]}
          resizeMode="contain"
        />

        {/* Headline */}
        <Text style={[styles.headline, { color: colors.text }]}>
          {firstName ? `Welcome back,\n${firstName}` : 'Welcome back'}
        </Text>

        {/* Body text */}
        <Text style={[styles.body, { color: colors.textMuted }]}>
          Your subscription has ended, but everything you've built is still here
          {'\u2009\u2014\u2009'}your devotionals, journal entries, and highlights.
        </Text>

        <Text style={[styles.body, { color: colors.textMuted, marginTop: Spacing['3'] }]}>
          Resubscribe to pick up right where you left off.
        </Text>

        {/* Value props */}
        <View style={styles.valueProps}>
          <ValuePropRow
            text="Personalized daily devotionals"
            accentColor={goldAccent}
            textColor={colors.textMuted}
          />
          <ValuePropRow
            text="AI companion for deeper study"
            accentColor={goldAccent}
            textColor={colors.textMuted}
          />
          <ValuePropRow
            text="Guided journaling & reflection"
            accentColor={goldAccent}
            textColor={colors.textMuted}
          />
        </View>

        {/* Price hint below value props */}
        {priceString && !hasTrial && (
          <Text style={[styles.priceHint, { color: colors.textSubtle }]}>
            {priceString}
          </Text>
        )}
        {hasTrial && priceString && (
          <Text style={[styles.priceHint, { color: colors.textSubtle }]}>
            Free for {trialDuration}, then {priceString}
          </Text>
        )}

        {/* Error message */}
        {errorMessage && (
          <Text style={[styles.errorText, { color: colors.error }]}>
            {errorMessage}
          </Text>
        )}
      </View>

      {/* Bottom CTA area — lowered near tab bar */}
      <View style={[styles.bottomArea, { paddingBottom: Spacing['4'] }]}>
        {/* Subscribe button */}
        <TouchableOpacity
          activeOpacity={0.8}
          onPress={handleSubscribe}
          disabled={isPurchasing || isLoadingOfferings || !primaryPackage}
          accessibilityRole="button"
          accessibilityLabel={ctaLabel}
          style={[
            styles.subscribeButton,
            { backgroundColor: goldAccent },
            isPurchasing && styles.buttonDisabled,
          ]}
        >
          {isPurchasing ? (
            <ActivityIndicator color={colors.background} size="small" />
          ) : (
            <Text style={[styles.subscribeText, { color: isDark ? '#0A0A0A' : '#FFFFFF' }]}>
              {isLoadingOfferings ? 'Loading...' : ctaLabel}
            </Text>
          )}
        </TouchableOpacity>

        {/* Secondary actions row — restore and free-tab escape */}
        <View style={styles.secondaryRow}>
          <TouchableOpacity
            activeOpacity={0.7}
            onPress={handleRestore}
            disabled={isPurchasing}
            accessibilityRole="button"
            accessibilityLabel="Restore purchases"
            style={styles.secondaryButton}
          >
            <Text style={[styles.restoreText, { color: colors.textSubtle }]}>
              Restore purchases
            </Text>
          </TouchableOpacity>
          <Text style={[styles.legalSeparator, { color: colors.textHint }]}>{'\u00B7'}</Text>
          <TouchableOpacity
            activeOpacity={0.7}
            onPress={handleGoToBible}
            accessibilityRole="button"
            accessibilityLabel="Continue to Bible"
            style={styles.secondaryButton}
          >
            <Text style={[styles.restoreText, { color: colors.textSubtle }]}>
              Continue to Bible
            </Text>
          </TouchableOpacity>
        </View>

        {/* Legal links */}
        <View style={styles.legalRow}>
          <TouchableOpacity
            activeOpacity={0.7}
            onPress={() => Linking.openURL('https://www.apple.com/legal/internet-services/itunes/dev/stdeula/')}
          >
            <Text style={[styles.legalText, { color: colors.textHint }]}>Terms</Text>
          </TouchableOpacity>
          <Text style={[styles.legalSeparator, { color: colors.textHint }]}>{'\u00B7'}</Text>
          <TouchableOpacity
            activeOpacity={0.7}
            onPress={() => Linking.openURL('https://useunfold.com/privacy')}
          >
            <Text style={[styles.legalText, { color: colors.textHint }]}>Privacy</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Value prop row sub-component
// ---------------------------------------------------------------------------

function ValuePropRow({
  text,
  accentColor,
  textColor,
}: {
  text: string;
  accentColor: string;
  textColor: string;
}) {
  return (
    <View style={styles.valuePropRow}>
      <View style={[styles.valuePropDot, { backgroundColor: accentColor }]} />
      <Text style={[styles.valuePropText, { color: textColor }]}>{text}</Text>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  root: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 80, // Leave space for tab bar
    zIndex: 50, // Below tab bar (which is at absolute bottom)
    overflow: 'hidden',
  },
  bottomGradient: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 350,
  },
  content: {
    flex: 1,
    paddingHorizontal: Spacing['6'],
  },
  appIcon: {
    width: 40,
    height: 40,
    marginBottom: Spacing['5'],
  },
  headline: {
    fontFamily: FontFamily.display,
    fontSize: FontSize['4xl'],
    textAlign: 'left',
    letterSpacing: -0.5,
    marginBottom: Spacing['4'],
    lineHeight: 40,
  },
  body: {
    fontFamily: FontFamily.body,
    fontSize: FontSize.base,
    textAlign: 'left',
    lineHeight: 24,
  },
  valueProps: {
    alignSelf: 'flex-start',
    gap: Spacing['2.5'],
    marginTop: Spacing['6'],
  },
  valuePropRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  valuePropDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    marginRight: Spacing['3'],
  },
  valuePropText: {
    fontFamily: FontFamily.body,
    fontSize: FontSize.sm,
    lineHeight: 20,
  },
  priceHint: {
    fontFamily: FontFamily.ui,
    fontSize: FontSize.xs,
    textAlign: 'left',
    marginTop: Spacing['5'],
  },
  errorText: {
    fontFamily: FontFamily.ui,
    fontSize: FontSize.sm,
    textAlign: 'left',
    marginTop: Spacing['3'],
  },
  bottomArea: {
    paddingHorizontal: Spacing['7'],
    paddingTop: Spacing['4'],
  },
  subscribeButton: {
    paddingVertical: Spacing['4'],
    borderRadius: Radius.card,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 52,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  subscribeText: {
    fontFamily: FontFamily.uiSemiBold,
    fontSize: FontSize.base,
    letterSpacing: 0.2,
  },
  secondaryRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: Spacing['2'],
    marginTop: Spacing['2'],
  },
  secondaryButton: {
    alignItems: 'center',
    paddingVertical: Spacing['3'],
    paddingHorizontal: Spacing['2'],
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
