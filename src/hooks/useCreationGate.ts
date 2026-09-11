import { useCallback, useRef, useState } from 'react';
import { Alert, AccessibilityInfo } from 'react-native';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import type { ExclusiveOfferDismissInfo } from '@/components/ExclusiveOfferSheet';
import { usePremiumAccessPolicy } from '@/hooks/usePremiumAccessPolicy';
import type { VerifiedEntitlementExit } from '@/lib/auto-trial-exit';
import { resolveLaterEntryExit } from '@/lib/auto-trial-exit';
import { requestLaterEntryNotifyAsk } from '@/lib/notification-ask';
import {
  getChurnedCreationGateAction,
  shouldEmitPendingFeedback,
} from '@/lib/creation-gate-policy';
import { mmkvStorage } from '@/lib/mmkv-storage';

const EXCLUSIVE_OFFER_SEEN_KEY = '@unfold_exclusive_offer_seen';

export function useCreationGate() {
  const policy = usePremiumAccessPolicy();
  const isPremium = policy === 'granted';

  const [showExclusiveOffer, setShowExclusiveOffer] = useState(false);
  const router = useRouter();
  const lastPendingFeedbackAtRef = useRef(0);

  const notifyPendingSubscriptionCheck = useCallback(() => {
    const now = Date.now();
    if (!shouldEmitPendingFeedback(lastPendingFeedbackAtRef.current, now)) return;
    lastPendingFeedbackAtRef.current = now;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    AccessibilityInfo.announceForAccessibility(
      'Checking your subscription. Please try again in a moment.',
    );
    Alert.alert(
      'One moment',
      "We're checking your subscription. Please try again in a moment.",
    );
  }, []);

  const gate = useCallback((): boolean => {
    const hasSeenOffer = mmkvStorage.getItem(EXCLUSIVE_OFFER_SEEN_KEY) === 'true';
    const action = getChurnedCreationGateAction({
      policy,
      hasSeenExclusiveOffer: hasSeenOffer,
    });

    if (action === 'allow') return true;
    if (action === 'blocked') {
      notifyPendingSubscriptionCheck();
      return false;
    }
    if (action === 'exclusive-offer') {
      setShowExclusiveOffer(true);
      return false;
    }

    // NAVIGATE reuses the active paywall route under Expo Router 57.0.16.
    // PUSH would append a new key for every denied Journal text event.
    router.navigate('/paywall');
    return false;
  }, [policy, router, notifyPendingSubscriptionCheck]);

  // Burn the once-ever offer only when the sheet actually put one on screen.
  // Writing the flag unconditionally meant a sheet that failed to load a package
  // — say, after the winback SKU leaves sale — spent the person's single chance
  // the moment they tapped through to the full paywall.
  const dismissOffer = useCallback((info?: ExclusiveOfferDismissInfo) => {
    if (info?.offerShown) {
      mmkvStorage.setItem(EXCLUSIVE_OFFER_SEEN_KEY, 'true');
    }
    setShowExclusiveOffer(false);
  }, []);

  const handleOfferVerifiedExit = useCallback((exit: VerifiedEntitlementExit) => {
    dismissOffer({ offerShown: true });
    const decision = resolveLaterEntryExit(exit, 'churned_sheet');
    if (decision.kind === 'auto') {
      // This hook navigates (never pushes); the presentation contract test pins it.
      router.navigate('/generating');
      return;
    }
    void requestLaterEntryNotifyAsk(exit.customerInfo);
  }, [dismissOffer, router]);

  return {
    policy,
    isPremium,
    gate,
    showExclusiveOffer,
    dismissOffer,
    handleOfferVerifiedExit,
  };
}
