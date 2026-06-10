import { useCallback, useState } from 'react';
import { Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { mmkvStorage } from '@/lib/mmkv-storage';
import { usePremiumAccessPolicy } from '@/hooks/usePremiumAccessPolicy';
import { getChurnedCreationGateAction } from '@/lib/creation-gate-policy';

const EXCLUSIVE_OFFER_SEEN_KEY = '@unfold_exclusive_offer_seen';

export function useCreationGate() {
  const policy = usePremiumAccessPolicy();
  const isPremium = policy === 'granted';

  const [showExclusiveOffer, setShowExclusiveOffer] = useState(false);
  const router = useRouter();

  const gate = useCallback((): boolean => {
    const hasSeenOffer = mmkvStorage.getItem(EXCLUSIVE_OFFER_SEEN_KEY) === 'true';
    const action = getChurnedCreationGateAction({
      policy,
      hasSeenExclusiveOffer: hasSeenOffer,
    });

    if (action === 'allow') return true;
    if (action === 'blocked') {
      Alert.alert(
        'One moment',
        "We’re still confirming your subscription. Check your connection and try again in a few seconds.",
      );
      return false;
    }
    if (action === 'exclusive-offer') {
      setShowExclusiveOffer(true);
      return false;
    }

    router.push('/paywall');
    return false;
  }, [policy, router]);

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
