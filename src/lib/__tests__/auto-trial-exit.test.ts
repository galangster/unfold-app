/* eslint-disable import/first */
const mockIsQaToolsEnabled = jest.fn(() => true);
const mockTrackTrialStarted = jest.fn();
const mockTrackAutoTrialSkipped = jest.fn();
const mockCaptureAppError = jest.fn();
const mockGetDeviceId = jest.fn(() => 'device-1');
const mockStoreGetState = jest.fn();

jest.mock('../qa-tools', () => ({ isQaToolsEnabled: () => mockIsQaToolsEnabled() }));
jest.mock('../auto-trial-telemetry', () => ({
  trackTrialStarted: (...args: unknown[]) => mockTrackTrialStarted(...args),
  trackAutoTrialSkipped: (...args: unknown[]) => mockTrackAutoTrialSkipped(...args),
  trackAutoTrialAbandoned: jest.fn(),
  trackAutoTrialLanded: jest.fn(),
}));
jest.mock('../sentry', () => ({
  captureAppError: (...args: unknown[]) => mockCaptureAppError(...args),
}));
jest.mock('../mmkv-storage', () => ({
  getDeviceId: () => mockGetDeviceId(),
  mmkvStorage: {
    getItem: jest.fn(() => null),
    setItem: jest.fn(),
    removeItem: jest.fn(),
  },
}));
jest.mock('../remote-config', () => ({
  readAutoTrialSwitchSnapshot: jest.fn(() => ({
    enabled: true,
    maxTrialDays: 7,
    fetchedAtMs: 1_700_000_000_000,
    reason: 'on',
  })),
}));
jest.mock('../store', () => ({
  useUnfoldStore: { getState: () => mockStoreGetState() },
}));

import type { CustomerInfo } from 'react-native-purchases';
import {
  handleVerifiedEntitlementExit,
  resolveLaterEntryExit,
  type AutoTrialSurface,
} from '../auto-trial-exit';
import {
  type AutoTrialIntentV1,
} from '../auto-trial-intent';
import { DAY_MS, QA_SIMULATED_TRIAL_APP_USER_ID } from '../trial-facts';
import type { AutoTrialSwitchSnapshot } from '../remote-config';
import { memoryIntentStorage } from './fixtures/memory-intent-storage';

const NOW_MS = 1_700_000_000_000;

function entitlement(overrides: Record<string, unknown> = {}) {
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

function info(active: Record<string, unknown> | null, originalAppUserId = 'user-1'): CustomerInfo {
  return {
    originalAppUserId,
    entitlements: {
      active: active ? { 'Unfold Premium': active } : {},
      all: active ? { 'Unfold Premium': active } : {},
    },
  } as unknown as CustomerInfo;
}

const ON_SNAPSHOT: AutoTrialSwitchSnapshot = {
  enabled: true,
  maxTrialDays: 7,
  fetchedAtMs: NOW_MS,
  reason: 'on',
};

function exitArgs(overrides: Record<string, unknown> = {}) {
  return {
    exit: { source: 'purchase' as const, customerInfo: info(entitlement()) },
    surface: 'onboarding_paywall' as AutoTrialSurface,
    deviceId: 'device-1',
    nowMs: NOW_MS,
    platform: 'ios',
    timeZone: 'America/Chicago',
    switchSnapshot: ON_SNAPSHOT,
    profile: { hasCompletedOnboarding: false },
    devotionalIds: [] as string[],
    storage: memoryIntentStorage(),
    ...overrides,
  };
}

describe('F2 created intent', () => {
  beforeEach(() => {
    mockTrackTrialStarted.mockReset();
    mockTrackAutoTrialSkipped.mockReset();
    mockIsQaToolsEnabled.mockReturnValue(true);
  });

  it('copies the snapshot, assigns a UUID requestId, and derives entry from surface', () => {
    const purchasedAt = '2026-09-09T05:00:00.000Z';
    const purchasedAtMs = Date.parse(purchasedAt);
    const storage = memoryIntentStorage();
    const decision = handleVerifiedEntitlementExit(exitArgs({
      storage,
      nowMs: purchasedAtMs + 60_000,
      exit: {
        source: 'offer',
        customerInfo: info(entitlement({
          latestPurchaseDateMillis: purchasedAtMs,
          expirationDateMillis: purchasedAtMs + 3 * DAY_MS,
          isSandbox: false,
        })),
      },
      surface: 'churned_sheet',
      profile: { hasCompletedOnboarding: true },
      simulated: true,
    }));

    expect(decision.kind).toBe('auto');
    if (decision.kind !== 'auto') return;
    expect(decision.created).toBe(true);
    expect(decision.intent.switchEnabledAtPurchase).toBe(true);
    expect(decision.intent.switchFetchedAt).toBe(new Date(NOW_MS).toISOString());
    expect(decision.intent.requestId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
    const local = new Date(purchasedAt);
    const expectedDate = `${local.getFullYear()}-${String(local.getMonth() + 1).padStart(2, '0')}-${String(local.getDate()).padStart(2, '0')}`;
    expect(decision.intent.purchaseLocalDate).toBe(expectedDate);
    expect(decision.intent.simulated).toBe(true);
    expect(decision.intent.entry).toBe('later');
    expect(decision.intent.surface).toBe('churned_sheet');
    expect(decision.intent.source).toBe('offer');
  });

  it('sets simulated only when that flag is passed', () => {
    const withFlag = handleVerifiedEntitlementExit(exitArgs({ simulated: true }));
    const withoutFlag = handleVerifiedEntitlementExit(exitArgs({ storage: memoryIntentStorage() }));
    expect(withFlag.kind === 'auto' && withFlag.intent.simulated).toBe(true);
    expect(withoutFlag.kind === 'auto' && withoutFlag.intent.simulated).toBe(false);
  });
});

describe('F1 precedence', () => {
  beforeEach(() => {
    mockTrackTrialStarted.mockReset();
    mockTrackAutoTrialSkipped.mockReset();
    mockCaptureAppError.mockReset();
    mockIsQaToolsEnabled.mockReturnValue(true);
  });

  it('reuses an existing purchased intent even for restore and does not re-read facts', () => {
    const storage = memoryIntentStorage();
    const first = handleVerifiedEntitlementExit(exitArgs({ storage }));
    expect(first.kind).toBe('auto');
    if (first.kind !== 'auto') return;
    (storage.setItem as jest.Mock).mockClear();
    const restore = handleVerifiedEntitlementExit(exitArgs({
      storage,
      exit: { source: 'restore', customerInfo: info(entitlement({ periodType: 'NORMAL' })) },
    }));
    expect(restore).toEqual({ kind: 'auto', intent: first.intent, created: false });
    expect(storage.setItem).not.toHaveBeenCalled();
    expect(mockTrackTrialStarted).toHaveBeenCalledTimes(1);
    expect(mockTrackAutoTrialSkipped).not.toHaveBeenCalled();
  });

  it('abandons an expired purchased intent then returns intent_exists', () => {
    const storage = memoryIntentStorage();
    const created = handleVerifiedEntitlementExit(exitArgs({
      storage,
      nowMs: NOW_MS,
      exit: {
        source: 'purchase',
        customerInfo: info(entitlement({
          latestPurchaseDateMillis: NOW_MS - 30_000,
          expirationDateMillis: NOW_MS + 3 * DAY_MS,
          isSandbox: false,
        })),
      },
    }));
    expect(created.kind).toBe('auto');
    const expired = handleVerifiedEntitlementExit(exitArgs({
      storage,
      nowMs: NOW_MS + 4 * DAY_MS,
      exit: { source: 'purchase', customerInfo: info(entitlement()) },
    }));
    expect(expired).toEqual({ kind: 'fallback', reason: 'intent_exists' });
    const stored = JSON.parse(storage.raw() ?? '{}') as AutoTrialIntentV1;
    expect(stored.status).toBe('abandoned');
    expect(stored.abandonReason).toBe('trial_expired_before_submit');
  });

  it('rejects a simulated CustomerInfo when QA is off (P3)', () => {
    mockIsQaToolsEnabled.mockReturnValue(false);
    const storage = memoryIntentStorage();
    const decision = handleVerifiedEntitlementExit(exitArgs({
      storage,
      exit: {
        source: 'purchase',
        customerInfo: info(entitlement(), QA_SIMULATED_TRIAL_APP_USER_ID),
      },
    }));
    expect(decision).toEqual({ kind: 'fallback', reason: 'simulated_without_qa' });
    expect(storage.raw()).toBeNull();
  });

  it('returns the first matching fallback and writes nothing', () => {
    const cases: Array<[Record<string, unknown>, string]> = [
      [{ exit: { source: 'purchase', customerInfo: info(null) } }, 'no_entitlement'],
      [{ platform: 'android' }, 'unsupported_platform'],
      [{ exit: { source: 'restore', customerInfo: info(entitlement()) } }, 'restore_source'],
      [{ deviceId: 'ephemeral-locked' }, 'ephemeral_device_id'],
      [{ timeZone: '' }, 'missing_time_zone'],
      [{ switchSnapshot: { ...ON_SNAPSHOT, enabled: false, reason: 'flag_off' } }, 'switch_off'],
      [{
        surface: 'paywall_route',
        profile: { hasCompletedOnboarding: false },
      }, 'no_completed_profile'],
      [{
        surface: 'paywall_route',
        profile: { hasCompletedOnboarding: true },
        devotionalIds: ['real-series-1'],
      }, 'has_real_series'],
    ];
    for (const [overrides, reason] of cases) {
      const storage = memoryIntentStorage();
      const decision = handleVerifiedEntitlementExit(exitArgs({ storage, ...overrides }));
      expect(decision).toEqual({ kind: 'fallback', reason });
      expect(storage.raw()).toBeNull();
    }
  });

  it('rounds length cases per OI-2', () => {
    const lengths: Array<[number, 'auto' | 'trial_length_not_allowed', number?]> = [
      [180_000, 'auto', 3],
      [5 * DAY_MS, 'auto', 3],
      [6 * DAY_MS, 'auto', 3],
      [7 * DAY_MS, 'auto', 7],
      [8 * DAY_MS, 'trial_length_not_allowed'],
      [14 * DAY_MS, 'trial_length_not_allowed'],
      [30 * DAY_MS, 'trial_length_not_allowed'],
    ];
    for (const [durationMs, expected, trialDays] of lengths) {
      const storage = memoryIntentStorage();
      const purchasedAtMs = NOW_MS - 30_000;
      const decision = handleVerifiedEntitlementExit(exitArgs({
        storage,
        exit: {
          source: 'purchase',
          customerInfo: info(entitlement({
            latestPurchaseDateMillis: purchasedAtMs,
            expirationDateMillis: purchasedAtMs + durationMs,
          })),
        },
      }));
      if (expected === 'auto') {
        expect(decision.kind).toBe('auto');
        if (decision.kind === 'auto') expect(decision.intent.trialDays).toBe(trialDays);
      } else {
        expect(decision).toEqual({ kind: 'fallback', reason: 'trial_length_not_allowed' });
        expect(storage.raw()).toBeNull();
      }
    }
  });

  it('returns internal_error when setItem throws and when later-entry store reads throw', () => {
    const storage = memoryIntentStorage();
    (storage.setItem as jest.Mock).mockImplementation(() => {
      throw new Error('disk');
    });
    expect(handleVerifiedEntitlementExit(exitArgs({ storage }))).toEqual({
      kind: 'fallback',
      reason: 'internal_error',
    });
    expect(storage.raw()).toBeNull();
    expect(mockCaptureAppError).toHaveBeenCalled();

    mockStoreGetState.mockImplementation(() => {
      throw new Error('store down');
    });
    expect(resolveLaterEntryExit(
      { source: 'purchase', customerInfo: info(entitlement()) },
      'paywall_route',
    )).toEqual({ kind: 'fallback', reason: 'internal_error' });
  });

  it('still returns auto when telemetry throws after a successful write', () => {
    mockTrackTrialStarted.mockImplementation(() => {
      throw new Error('sink');
    });
    const storage = memoryIntentStorage();
    const decision = handleVerifiedEntitlementExit(exitArgs({ storage }));
    expect(decision.kind).toBe('auto');
    if (decision.kind === 'auto') expect(decision.created).toBe(true);
    expect(storage.raw()).not.toBeNull();
  });
});

describe('F3 telemetry', () => {
  beforeEach(() => {
    mockTrackTrialStarted.mockReset();
    mockTrackAutoTrialSkipped.mockReset();
    mockIsQaToolsEnabled.mockReturnValue(true);
  });

  it('emits one trial_started on create and nothing on reuse, including restore reuse', () => {
    const storage = memoryIntentStorage();
    const first = handleVerifiedEntitlementExit(exitArgs({ storage }));
    expect(mockTrackTrialStarted).toHaveBeenCalledTimes(1);
    expect(mockTrackTrialStarted).toHaveBeenCalledWith(expect.objectContaining({
      auto_trial: true,
      entry: 'onboarding',
      surface: 'onboarding_paywall',
      purchase_source: 'purchase',
    }));
    expect(mockTrackAutoTrialSkipped).not.toHaveBeenCalled();

    handleVerifiedEntitlementExit(exitArgs({ storage }));
    handleVerifiedEntitlementExit(exitArgs({
      storage,
      exit: { source: 'restore', customerInfo: info(entitlement()) },
    }));
    expect(mockTrackTrialStarted).toHaveBeenCalledTimes(1);
    expect(mockTrackAutoTrialSkipped).not.toHaveBeenCalled();
    expect(first.kind).toBe('auto');
  });

  it('emits skipped plus at most one trial_started false for eligible fallbacks, never for restore', () => {
    const skipped = handleVerifiedEntitlementExit(exitArgs({
      storage: memoryIntentStorage(),
      deviceId: 'ephemeral-locked',
    }));
    expect(skipped).toEqual({ kind: 'fallback', reason: 'ephemeral_device_id' });
    expect(mockTrackAutoTrialSkipped).toHaveBeenCalledTimes(1);
    expect(mockTrackTrialStarted).toHaveBeenCalledWith(expect.objectContaining({
      auto_trial: false,
      purchase_source: 'purchase',
    }));

    mockTrackTrialStarted.mockClear();
    mockTrackAutoTrialSkipped.mockClear();
    handleVerifiedEntitlementExit(exitArgs({
      storage: memoryIntentStorage(),
      exit: { source: 'restore', customerInfo: info(entitlement()) },
    }));
    expect(mockTrackAutoTrialSkipped).toHaveBeenCalledTimes(1);
    expect(mockTrackTrialStarted).not.toHaveBeenCalled();
  });

  it('allows purchase_source lateGrant on create', () => {
    handleVerifiedEntitlementExit(exitArgs({
      storage: memoryIntentStorage(),
      exit: { source: 'lateGrant', customerInfo: info(entitlement()) },
    }));
    expect(mockTrackTrialStarted).toHaveBeenCalledWith(expect.objectContaining({
      purchase_source: 'lateGrant',
      auto_trial: true,
    }));
  });
});

describe('resolveLaterEntryExit guards', () => {
  beforeEach(() => {
    mockIsQaToolsEnabled.mockReturnValue(true);
    mockStoreGetState.mockReset();
    mockStoreGetState.mockReturnValue({
      user: { hasCompletedOnboarding: true },
      devotionals: [],
    });
    mockGetDeviceId.mockReturnValue('device-1');
  });

  it('returns no_completed_profile and has_real_series from the live store', () => {
    const now = Date.now();
    const customerInfo = info(entitlement({
      latestPurchaseDateMillis: now - 30_000,
      expirationDateMillis: now - 30_000 + 3 * DAY_MS,
    }));
    mockStoreGetState.mockReturnValue({
      user: { hasCompletedOnboarding: false },
      devotionals: [],
    });
    expect(resolveLaterEntryExit(
      { source: 'purchase', customerInfo },
      'paywall_route',
    )).toEqual({ kind: 'fallback', reason: 'no_completed_profile' });

    mockStoreGetState.mockReturnValue({
      user: { hasCompletedOnboarding: true },
      devotionals: [{ id: 'real-series-1' }],
    });
    expect(resolveLaterEntryExit(
      { source: 'purchase', customerInfo },
      'churned_sheet',
    )).toEqual({ kind: 'fallback', reason: 'has_real_series' });
  });
});
