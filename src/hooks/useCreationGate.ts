import { useCallback, useState } from 'react';
import { useRouter } from 'expo-router';
import { mmkvStorage } from '@/lib/mmkv-storage';
import { usePremiumAccessPolicy } from '@/hooks/usePremiumAccessPolicy';

const EXCLUSIVE_OFFER_SEEN_KEY = '@unfold_exclusive_offer_seen';

export function useCreationGate() {
  const policy = usePremiumAccessPolicy();
  const isPremium = policy === 'granted';

  const [showExclusiveOffer, setShowExclusiveOffer] = useState(false);
  const router = useRouter();

  const gate = useCallback((): boolean => {
    if (policy === 'granted') return true;
    if (policy === 'unknown') return false;

    const hasSeenOffer = mmkvStorage.getItem(EXCLUSIVE_OFFER_SEEN_KEY) === 'true';
    if (!hasSeenOffer) {
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
