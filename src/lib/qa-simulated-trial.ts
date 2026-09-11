import type { CustomerInfo } from 'react-native-purchases';
import type { VerifiedEntitlementExit } from '@/lib/auto-trial-exit';
import { isQaToolsEnabled } from '@/lib/qa-tools';
import {
  PREMIUM_ENTITLEMENT_ID,
  QA_SIMULATED_TRIAL_APP_USER_ID,
  isSimulatedTrialCustomerInfo,
} from '@/lib/trial-facts';

export { QA_SIMULATED_TRIAL_APP_USER_ID, isSimulatedTrialCustomerInfo };

export const QA_TRIAL_LENGTH_OPTIONS = [
  { label: '3-day trial', trialLengthMs: 259_200_000 },
  { label: '7-day trial', trialLengthMs: 604_800_000 },
  { label: 'Sandbox trial (3 min)', trialLengthMs: 180_000 },
] as const;

export function buildSimulatedTrialCustomerInfo(i: {
  now: Date;
  trialLengthMs: number;
}): CustomerInfo {
  const purchasedAtMs = i.now.getTime();
  const expiresAtMs = purchasedAtMs + i.trialLengthMs;
  const latestPurchaseDate = new Date(purchasedAtMs).toISOString();
  const expirationDate = new Date(expiresAtMs).toISOString();
  const entitlement = {
    identifier: PREMIUM_ENTITLEMENT_ID,
    isActive: true,
    willRenew: true,
    periodType: 'TRIAL',
    latestPurchaseDate,
    latestPurchaseDateMillis: purchasedAtMs,
    expirationDate,
    expirationDateMillis: expiresAtMs,
    store: 'APP_STORE',
    ownershipType: 'PURCHASED',
    productIdentifier: 'unfold_premium_yearly',
    isSandbox: true,
  };
  return {
    originalAppUserId: QA_SIMULATED_TRIAL_APP_USER_ID,
    requestDate: latestPurchaseDate,
    entitlements: {
      active: { [PREMIUM_ENTITLEMENT_ID]: entitlement },
      all: { [PREMIUM_ENTITLEMENT_ID]: entitlement },
    },
  } as unknown as CustomerInfo;
}

export function simulateTrialPurchase(i: {
  trialLengthMs: number;
  now?: Date;
  handle: (exit: VerifiedEntitlementExit) => void;
}): { ok: true } | { ok: false; reason: 'qa-disabled' } {
  if (!isQaToolsEnabled()) return { ok: false, reason: 'qa-disabled' };
  const now = i.now ?? new Date();
  i.handle({
    source: 'purchase',
    customerInfo: buildSimulatedTrialCustomerInfo({ now, trialLengthMs: i.trialLengthMs }),
  });
  return { ok: true };
}
