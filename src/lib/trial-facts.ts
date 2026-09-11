import type { CustomerInfo } from 'react-native-purchases';

export const PREMIUM_ENTITLEMENT_ID = 'Unfold Premium';
export const DAY_MS = 86_400_000;
export const NEW_TRIAL_MAX_AGE_MS = 15 * 60_000;
export const NEW_TRIAL_FUTURE_SKEW_MS = 5 * 60_000;
export const QA_SIMULATED_TRIAL_APP_USER_ID = 'qa-simulated-trial';

export type AllowedTrialDays = 3 | 7 | 14 | 30;
export type EntitlementExitSource = 'purchase' | 'offer' | 'restore' | 'lateGrant';
export type TrialFactsRejectReason =
  | 'no_entitlement'
  | 'unsupported_platform'
  | 'restore_source'
  | 'not_trial'
  | 'not_app_store'
  | 'family_shared'
  | 'missing_expiration'
  | 'missing_purchase_date'
  | 'invalid_duration'
  | 'already_expired'
  | 'stale_purchase';

export interface TrialEntitlement {
  periodType: string;
  store: string;
  ownershipType: string;
  productIdentifier: string;
  isSandbox: boolean;
  purchasedAtMs: number | null;
  expiresAtMs: number | null;
  durationMs: number | null;
  trialDays: AllowedTrialDays | null;
}

export interface TrialFacts {
  isNewTrial: boolean;
  rejectReason: TrialFactsRejectReason | null;
  source: EntitlementExitSource;
  trialDays: AllowedTrialDays | null;
  purchasedAt: string | null;
  expiresAt: string | null;
  entitlement: TrialEntitlement | null;
}

type EntitlementLike = {
  periodType?: string;
  store?: string;
  ownershipType?: string;
  productIdentifier?: string;
  isSandbox?: boolean;
  latestPurchaseDateMillis?: number | null;
  latestPurchaseDate?: string | null;
  expirationDateMillis?: number | null;
  expirationDate?: string | null;
};

function parseTimestampMs(
  millis: number | null | undefined,
  iso: string | null | undefined,
): number | null {
  if (typeof millis === 'number' && Number.isFinite(millis)) return millis;
  if (typeof iso === 'string') {
    const parsed = Date.parse(iso);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function toIso(ms: number | null): string | null {
  return ms === null ? null : new Date(ms).toISOString();
}

export function isSimulatedTrialCustomerInfo(info: CustomerInfo): boolean {
  return info.originalAppUserId === QA_SIMULATED_TRIAL_APP_USER_ID;
}

export function roundTrialDays(durationMs: number): AllowedTrialDays | null {
  if (!Number.isFinite(durationMs) || durationMs <= 0) return null;
  const wholeDays = Math.round(durationMs / DAY_MS);
  if (wholeDays <= 6) return 3;
  if (wholeDays === 7) return 7;
  return null;
}

export function readTrialEntitlement(customerInfo: CustomerInfo): TrialEntitlement | null {
  const raw = customerInfo.entitlements.active?.[PREMIUM_ENTITLEMENT_ID] as
    | EntitlementLike
    | undefined;
  if (!raw) return null;

  const purchasedAtMs = parseTimestampMs(raw.latestPurchaseDateMillis, raw.latestPurchaseDate);
  const expiresAtMs = parseTimestampMs(raw.expirationDateMillis, raw.expirationDate);
  const durationMs =
    purchasedAtMs !== null && expiresAtMs !== null ? expiresAtMs - purchasedAtMs : null;
  const periodType = typeof raw.periodType === 'string' ? raw.periodType : '';

  return {
    periodType,
    store: typeof raw.store === 'string' ? raw.store : '',
    ownershipType: typeof raw.ownershipType === 'string' ? raw.ownershipType : '',
    productIdentifier: typeof raw.productIdentifier === 'string' ? raw.productIdentifier : '',
    isSandbox: raw.isSandbox === true,
    purchasedAtMs,
    expiresAtMs,
    durationMs,
    trialDays: periodType === 'TRIAL' && durationMs !== null ? roundTrialDays(durationMs) : null,
  };
}

function resolveRejectReason(
  entitlement: TrialEntitlement | null,
  i: { source: EntitlementExitSource; platform: string; nowMs: number },
): TrialFactsRejectReason | null {
  if (!entitlement) return 'no_entitlement';
  if (i.platform !== 'ios') return 'unsupported_platform';
  if (i.source === 'restore') return 'restore_source';
  if (entitlement.periodType !== 'TRIAL') return 'not_trial';
  if (entitlement.store !== 'APP_STORE') return 'not_app_store';
  if (entitlement.ownershipType === 'FAMILY_SHARED') return 'family_shared';
  if (entitlement.expiresAtMs === null) return 'missing_expiration';
  if (entitlement.purchasedAtMs === null) return 'missing_purchase_date';
  if (entitlement.durationMs === null || entitlement.durationMs <= 0) return 'invalid_duration';
  if (entitlement.expiresAtMs <= i.nowMs) return 'already_expired';
  if (
    entitlement.purchasedAtMs < i.nowMs - NEW_TRIAL_MAX_AGE_MS
    || entitlement.purchasedAtMs > i.nowMs + NEW_TRIAL_FUTURE_SKEW_MS
  ) {
    return 'stale_purchase';
  }
  return null;
}

export function readTrialFacts(i: {
  customerInfo: CustomerInfo;
  source: EntitlementExitSource;
  platform: string;
  nowMs: number;
}): TrialFacts {
  const entitlement = readTrialEntitlement(i.customerInfo);
  const rejectReason = resolveRejectReason(entitlement, i);
  return {
    isNewTrial: rejectReason === null,
    rejectReason,
    source: i.source,
    trialDays: entitlement?.trialDays ?? null,
    purchasedAt: toIso(entitlement?.purchasedAtMs ?? null),
    expiresAt: toIso(entitlement?.expiresAtMs ?? null),
    entitlement,
  };
}
