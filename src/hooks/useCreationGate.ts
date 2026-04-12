import { useCallback, useState } from 'react';
import { useRouter } from 'expo-router';
import { useUnfoldStore } from '@/lib/store';
import { useUIState } from '@/lib/ui-state';
import { mmkvStorage } from '@/lib/mmkv-storage';

const EXCLUSIVE_OFFER_SEEN_KEY = '@unfold_exclusive_offer_seen';

export function useCreationGate() {
  const isPremium = useUnfoldStore((s) => s.user?.isPremium ?? false);
  const debugForceTrialExpired = useUIState((s) => s.debugForceTrialExpired);
  const effectivePremium = debugForceTrialExpired ? false : __DEV__ ? true : isPremium;

  const [showExclusiveOffer, setShowExclusiveOffer] = useState(false);
  const router = useRouter();

  const gate = useCallback((): boolean => {
    if (effectivePremium) return true;

    const hasSeenOffer = mmkvStorage.getItem(EXCLUSIVE_OFFER_SEEN_KEY) === 'true';
    if (!hasSeenOffer) {
      setShowExclusiveOffer(true);
      return false;
    }
    router.push('/paywall');
    return false;
  }, [effectivePremium, router]);

  const dismissOffer = useCallback(() => {
    mmkvStorage.setItem(EXCLUSIVE_OFFER_SEEN_KEY, 'true');
    setShowExclusiveOffer(false);
  }, []);

  return {
    isPremium: effectivePremium,
    gate,
    showExclusiveOffer,
    dismissOffer,
  };
}
