jest.mock('@/app/onboarding', () => ({}), { virtual: true });

import type { CustomerInfo } from 'react-native-purchases';
import type { OnboardingData } from '@/app/onboarding';
import {
  DAY_MS,
  NEW_TRIAL_FUTURE_SKEW_MS,
  NEW_TRIAL_MAX_AGE_MS,
  type AllowedTrialDays,
  readTrialEntitlement,
  readTrialFacts,
  roundTrialDays,
} from '../trial-facts';

type MutuallyAssignable<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;

const allowedTrialDaysAssignability: MutuallyAssignable<
  AllowedTrialDays,
  3 | 7
> = true;
const onboardingLengthStillWider: MutuallyAssignable<
  OnboardingData['devotionalLength'],
  3 | 7 | 14 | 30
> = true;

function entitlement(overrides: Record<string, unknown> = {}) {
  return {
    periodType: 'TRIAL',
    store: 'APP_STORE',
    ownershipType: 'PURCHASED',
    productIdentifier: 'unfold_premium_monthly',
    isSandbox: true,
    ...overrides,
  };
}

function info(active: Record<string, unknown> | null): CustomerInfo {
  return {
    originalAppUserId: 'user-1',
    entitlements: {
      active: active ? { 'Unfold Premium': active } : {},
      all: {},
    },
  } as unknown as CustomerInfo;
}

const NOW_MS = 1_700_000_000_000;

function validTrialTimes(purchasedAtMs: number, durationMs = 3 * DAY_MS) {
  return {
    latestPurchaseDateMillis: purchasedAtMs,
    expirationDateMillis: purchasedAtMs + durationMs,
  };
}

describe('D1 roundTrialDays', () => {
  it('maps 1–6 whole days to 3, exactly 7 to 7, and anything else to null', () => {
    expect(roundTrialDays(120_000)).toBe(3);
    expect(roundTrialDays(3 * DAY_MS)).toBe(3);
    expect(roundTrialDays(4.49 * DAY_MS)).toBe(3);
    expect(roundTrialDays(5 * DAY_MS)).toBe(3);
    expect(roundTrialDays(6 * DAY_MS)).toBe(3);
    expect(roundTrialDays(6.99 * DAY_MS)).toBe(7);
    expect(roundTrialDays(7 * DAY_MS)).toBe(7);
    expect(roundTrialDays(8 * DAY_MS)).toBeNull();
    expect(roundTrialDays(13.49 * DAY_MS)).toBeNull();
    expect(roundTrialDays(14 * DAY_MS)).toBeNull();
    expect(roundTrialDays(30 * DAY_MS)).toBeNull();
    expect(roundTrialDays(365 * DAY_MS)).toBeNull();
    expect(roundTrialDays(0)).toBeNull();
    expect(roundTrialDays(-1)).toBeNull();
    expect(roundTrialDays(Number.NaN)).toBeNull();
  });
});

describe('D3 readTrialFacts happy path', () => {
  it('accepts purchase, offer, and lateGrant 3-day trials', () => {
    const purchasedAtMs = NOW_MS - 30_000;
    const customerInfo = info(entitlement(validTrialTimes(purchasedAtMs)));

    for (const source of ['purchase', 'offer', 'lateGrant'] as const) {
      const facts = readTrialFacts({
        customerInfo,
        source,
        platform: 'ios',
        nowMs: NOW_MS,
      });
      expect(facts.isNewTrial).toBe(true);
      expect(facts.rejectReason).toBeNull();
      expect(facts.trialDays).toBe(3);
      expect(facts.source).toBe(source);
    }
  });
});

describe('D4 readTrialEntitlement dates', () => {
  it('prefers millis over ISO and falls back when millis are missing', () => {
    const purchasedAtMs = NOW_MS - 30_000;
    const expiresAtMs = purchasedAtMs + 3 * DAY_MS;
    const millisWin = readTrialEntitlement(info(entitlement({
      latestPurchaseDateMillis: purchasedAtMs,
      expirationDateMillis: expiresAtMs,
      latestPurchaseDate: '2000-01-01T00:00:00.000Z',
      expirationDate: '2000-01-08T00:00:00.000Z',
    })));
    expect(millisWin?.purchasedAtMs).toBe(purchasedAtMs);
    expect(millisWin?.expiresAtMs).toBe(expiresAtMs);

    const isoFallback = readTrialEntitlement(info(entitlement({
      latestPurchaseDate: new Date(purchasedAtMs).toISOString(),
      expirationDate: new Date(expiresAtMs).toISOString(),
    })));
    expect(isoFallback?.purchasedAtMs).toBe(purchasedAtMs);
    expect(isoFallback?.expiresAtMs).toBe(expiresAtMs);
  });

  it('returns null dates when neither millis nor ISO parse', () => {
    const parsed = readTrialEntitlement(info(entitlement({
      latestPurchaseDate: 'not-a-date',
      expirationDate: 'also-bad',
    })));
    expect(parsed?.purchasedAtMs).toBeNull();
    expect(parsed?.expiresAtMs).toBeNull();
  });

  it('still returns dates for a restored trial', () => {
    const purchasedAtMs = NOW_MS - 30_000;
    const expiresAtMs = purchasedAtMs + 3 * DAY_MS;
    const facts = readTrialFacts({
      customerInfo: info(entitlement(validTrialTimes(purchasedAtMs))),
      source: 'restore',
      platform: 'ios',
      nowMs: NOW_MS,
    });
    expect(facts.rejectReason).toBe('restore_source');
    expect(facts.purchasedAt).toBe(new Date(purchasedAtMs).toISOString());
    expect(facts.expiresAt).toBe(new Date(expiresAtMs).toISOString());
    expect(facts.entitlement?.purchasedAtMs).toBe(purchasedAtMs);
    expect(facts.entitlement?.expiresAtMs).toBe(expiresAtMs);
  });
});

describe('D5 stale guard', () => {
  it('rejects purchases older than 15 minutes or more than 5 minutes in the future', () => {
    const stalePast = readTrialFacts({
      customerInfo: info(entitlement(validTrialTimes(NOW_MS - NEW_TRIAL_MAX_AGE_MS - 60_000))),
      source: 'purchase',
      platform: 'ios',
      nowMs: NOW_MS,
    });
    expect(stalePast.rejectReason).toBe('stale_purchase');

    const okPast = readTrialFacts({
      customerInfo: info(entitlement(validTrialTimes(NOW_MS - NEW_TRIAL_MAX_AGE_MS + 60_000))),
      source: 'purchase',
      platform: 'ios',
      nowMs: NOW_MS,
    });
    expect(okPast.rejectReason).toBeNull();

    const staleFuture = readTrialFacts({
      customerInfo: info(entitlement(validTrialTimes(NOW_MS + NEW_TRIAL_FUTURE_SKEW_MS + 60_000))),
      source: 'purchase',
      platform: 'ios',
      nowMs: NOW_MS,
    });
    expect(staleFuture.rejectReason).toBe('stale_purchase');

    const okFuture = readTrialFacts({
      customerInfo: info(entitlement(validTrialTimes(NOW_MS + NEW_TRIAL_FUTURE_SKEW_MS - 60_000))),
      source: 'purchase',
      platform: 'ios',
      nowMs: NOW_MS,
    });
    expect(okFuture.rejectReason).toBeNull();
  });
});

describe('D2 reject precedence', () => {
  const purchasedAtMs = NOW_MS - 30_000;

  it('uses the first matching reject row', () => {
    expect(readTrialFacts({
      customerInfo: info(null),
      source: 'purchase',
      platform: 'ios',
      nowMs: NOW_MS,
    }).rejectReason).toBe('no_entitlement');

    expect(readTrialFacts({
      customerInfo: info(entitlement(validTrialTimes(purchasedAtMs))),
      source: 'purchase',
      platform: 'android',
      nowMs: NOW_MS,
    }).rejectReason).toBe('unsupported_platform');

    expect(readTrialFacts({
      customerInfo: info(entitlement(validTrialTimes(purchasedAtMs))),
      source: 'restore',
      platform: 'ios',
      nowMs: NOW_MS,
    }).rejectReason).toBe('restore_source');

    expect(readTrialFacts({
      customerInfo: info(entitlement({
        ...validTrialTimes(purchasedAtMs),
        periodType: 'NORMAL',
      })),
      source: 'purchase',
      platform: 'ios',
      nowMs: NOW_MS,
    }).rejectReason).toBe('not_trial');

    expect(readTrialFacts({
      customerInfo: info(entitlement({
        ...validTrialTimes(purchasedAtMs),
        store: 'PLAY_STORE',
      })),
      source: 'purchase',
      platform: 'ios',
      nowMs: NOW_MS,
    }).rejectReason).toBe('not_app_store');

    expect(readTrialFacts({
      customerInfo: info(entitlement({
        ...validTrialTimes(purchasedAtMs),
        ownershipType: 'FAMILY_SHARED',
      })),
      source: 'purchase',
      platform: 'ios',
      nowMs: NOW_MS,
    }).rejectReason).toBe('family_shared');

    expect(readTrialFacts({
      customerInfo: info(entitlement({
        latestPurchaseDateMillis: purchasedAtMs,
      })),
      source: 'purchase',
      platform: 'ios',
      nowMs: NOW_MS,
    }).rejectReason).toBe('missing_expiration');

    expect(readTrialFacts({
      customerInfo: info(entitlement({
        expirationDateMillis: purchasedAtMs + 3 * DAY_MS,
      })),
      source: 'purchase',
      platform: 'ios',
      nowMs: NOW_MS,
    }).rejectReason).toBe('missing_purchase_date');

    expect(readTrialFacts({
      customerInfo: info(entitlement({
        latestPurchaseDateMillis: purchasedAtMs,
        expirationDateMillis: purchasedAtMs,
      })),
      source: 'purchase',
      platform: 'ios',
      nowMs: NOW_MS,
    }).rejectReason).toBe('invalid_duration');

    expect(readTrialFacts({
      customerInfo: info(entitlement({
        latestPurchaseDateMillis: NOW_MS - 2 * DAY_MS,
        expirationDateMillis: NOW_MS,
      })),
      source: 'purchase',
      platform: 'ios',
      nowMs: NOW_MS,
    }).rejectReason).toBe('already_expired');

    expect(readTrialFacts({
      customerInfo: info(entitlement(validTrialTimes(NOW_MS - NEW_TRIAL_MAX_AGE_MS - 1))),
      source: 'purchase',
      platform: 'ios',
      nowMs: NOW_MS,
    }).rejectReason).toBe('stale_purchase');
  });

  it('keeps restore ahead of NORMAL and android ahead of restore', () => {
    expect(readTrialFacts({
      customerInfo: info(entitlement({
        ...validTrialTimes(purchasedAtMs),
        periodType: 'NORMAL',
      })),
      source: 'restore',
      platform: 'ios',
      nowMs: NOW_MS,
    }).rejectReason).toBe('restore_source');

    expect(readTrialFacts({
      customerInfo: info(entitlement(validTrialTimes(purchasedAtMs))),
      source: 'restore',
      platform: 'android',
      nowMs: NOW_MS,
    }).rejectReason).toBe('unsupported_platform');
  });

  it('sets rejectReason null exactly when isNewTrial', () => {
    const accepted = readTrialFacts({
      customerInfo: info(entitlement(validTrialTimes(purchasedAtMs))),
      source: 'purchase',
      platform: 'ios',
      nowMs: NOW_MS,
    });
    expect(accepted.isNewTrial).toBe(true);
    expect(accepted.rejectReason).toBeNull();

    const rejected = readTrialFacts({
      customerInfo: info(null),
      source: 'purchase',
      platform: 'ios',
      nowMs: NOW_MS,
    });
    expect(rejected.isNewTrial).toBe(false);
    expect(rejected.rejectReason).not.toBeNull();
  });
});

describe('D6 AllowedTrialDays', () => {
  it('is 3 | 7 after OI-2 and leaves series length on the wider onboarding union', () => {
    expect(allowedTrialDaysAssignability).toBe(true);
    expect(onboardingLengthStillWider).toBe(true);
  });
});
