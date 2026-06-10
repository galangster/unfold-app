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

/**
 * Pending-feedback throttle for blocked-while-unknown creation actions.
 * Pure (receives `now`) per vault: deterministic paths receive now as a
 * parameter.
 */
export const PENDING_FEEDBACK_THROTTLE_MS = 30_000;

export function shouldEmitPendingFeedback(lastEmittedAt: number, now: number): boolean {
  return now - lastEmittedAt >= PENDING_FEEDBACK_THROTTLE_MS;
}
