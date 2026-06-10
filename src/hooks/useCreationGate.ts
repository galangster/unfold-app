import { useCallback, useRef, useState } from 'react';
import { Alert, AccessibilityInfo } from 'react-native';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { mmkvStorage } from '@/lib/mmkv-storage';
import { usePremiumAccessPolicy } from '@/hooks/usePremiumAccessPolicy';
import {
  getChurnedCreationGateAction,
  shouldEmitPendingFeedback,
} from '@/lib/creation-gate-policy';

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

    router.push('/paywall');
    return false;
  }, [policy, router, notifyPendingSubscriptionCheck]);

  const dismissOffer = useCallback(() => {
    mmkvStorage.setItem(EXCLUSIVE_OFFER_SEEN_KEY, 'true');
    setShowExclusiveOffer(false);
  }, []);

  return {
    policy,
    isPremium,
    gate,
    showExclusiveOffer,
    dismissOffer,
  };
}
