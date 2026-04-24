export type PremiumAccessPolicy = 'granted' | 'denied' | 'unknown';

export function canUsePremiumFeature(policy: PremiumAccessPolicy): boolean {
  return policy === 'granted';
}
