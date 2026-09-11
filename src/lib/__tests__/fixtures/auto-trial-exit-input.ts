import type { CustomerInfo } from 'react-native-purchases';
import type { AutoTrialSurface } from '@/lib/auto-trial-exit';
import { DAY_MS } from '@/lib/trial-facts';
import { memoryIntentStorage } from './memory-intent-storage';

export const NOW_MS = 1_700_000_000_000;

export function entitlement(overrides: Record<string, unknown> = {}) {
  const purchasedAtMs = NOW_MS - 30_000;
  return {
    periodType: 'TRIAL',
    store: 'APP_STORE',
    ownershipType: 'PURCHASED',
    productIdentifier: 'unfold_premium_yearly',
    isSandbox: true,
    latestPurchaseDateMillis: purchasedAtMs,
    expirationDateMillis: purchasedAtMs + 3 * DAY_MS,
    ...overrides,
  };
}

export function info(
  active: Record<string, unknown> | null,
  originalAppUserId = 'user-1',
): CustomerInfo {
  return {
    originalAppUserId,
    entitlements: {
      active: active ? { 'Unfold Premium': active } : {},
      all: active ? { 'Unfold Premium': active } : {},
    },
  } as unknown as CustomerInfo;
}

export function exitInput(overrides: Record<string, unknown> = {}) {
  return {
    exit: { source: 'purchase' as const, customerInfo: info(entitlement()) },
    surface: 'onboarding_paywall' as AutoTrialSurface,
    deviceId: 'device-1',
    nowMs: NOW_MS,
    platform: 'ios',
    timeZone: 'America/Chicago',
    profile: { hasCompletedOnboarding: false },
    devotionalIds: [] as string[],
    storage: memoryIntentStorage(),
    ...overrides,
  };
}
