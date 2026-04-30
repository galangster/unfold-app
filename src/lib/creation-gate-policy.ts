import type { PremiumAccessPolicy } from '@/lib/premium-state';

export const CHURNED_WINBACK_OFFER_ENABLED =
  process.env.EXPO_PUBLIC_ENABLE_CHURNED_WINBACK_OFFER === '1';

export type ChurnedCreationGateAction = 'allow' | 'blocked' | 'exclusive-offer' | 'paywall';

export function getChurnedCreationGateAction({
  policy,
  hasSeenExclusiveOffer,
  winbackOfferEnabled = CHURNED_WINBACK_OFFER_ENABLED,
}: {
  policy: PremiumAccessPolicy;
  hasSeenExclusiveOffer: boolean;
  winbackOfferEnabled?: boolean;
}): ChurnedCreationGateAction {
  if (policy === 'granted') return 'allow';
  if (policy === 'unknown') return 'blocked';
  if (winbackOfferEnabled && !hasSeenExclusiveOffer) return 'exclusive-offer';
  return 'paywall';
}
