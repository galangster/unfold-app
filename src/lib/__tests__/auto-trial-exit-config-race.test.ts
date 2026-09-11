/* eslint-disable import/first */
jest.mock('../api-config', () => ({
  PRIMARY_BACKEND_URL: 'https://example.test',
  getAuthHeaders: jest.fn(async () => ({ 'Content-Type': 'application/json' })),
}));

const mockIsQaToolsEnabled = jest.fn(() => true);
const mockTrackTrialStarted = jest.fn();
const mockTrackAutoTrialSkipped = jest.fn();
const mockCaptureAppError = jest.fn();

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
  getDeviceId: () => 'device-1',
  mmkvStorage: {
    getItem: jest.fn(() => null),
    setItem: jest.fn(),
    removeItem: jest.fn(),
  },
}));

jest.mock('../store', () => ({
  useUnfoldStore: { getState: () => mockStoreGetState() },
}));

import type { CustomerInfo } from 'react-native-purchases';
import { resolveVerifiedEntitlementExit } from '../auto-trial-exit';
import {
  readAutoTrialSwitchSnapshot,
  refreshRemoteConfig,
  resetRemoteConfigForTesting,
  type RemoteConfigV1,
} from '../remote-config';
import { DAY_MS } from '../trial-facts';
import { memoryIntentStorage } from './fixtures/memory-intent-storage';

const NOW_MS = 1_700_000_000_000;
const VALID_BODY: RemoteConfigV1 = {
  version: 1,
  autoTrialSeries: { enabled: true, platforms: ['ios'], maxTrialDays: 7 },
  source: 'db',
};

function jsonResponse(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response;
}

function entitlement() {
  const purchasedAtMs = NOW_MS - 30_000;
  return {
    periodType: 'TRIAL',
    store: 'APP_STORE',
    ownershipType: 'PURCHASED',
    productIdentifier: 'unfold_premium_yearly',
    isSandbox: true,
    latestPurchaseDateMillis: purchasedAtMs,
    expirationDateMillis: purchasedAtMs + 3 * DAY_MS,
  };
}

function info(active: Record<string, unknown>): CustomerInfo {
  return {
    originalAppUserId: 'user-1',
    entitlements: {
      active: { 'Unfold Premium': active },
      all: { 'Unfold Premium': active },
    },
  } as unknown as CustomerInfo;
}

function hangingFetch() {
  let release!: (value: Response) => void;
  const fetchImpl = jest.fn(() => new Promise<Response>((resolve) => {
    release = resolve;
  }));
  return {
    fetchImpl,
    release(body: unknown) {
      release(jsonResponse(body));
    },
  };
}

function exitInput(overrides: Record<string, unknown> = {}) {
  return {
    exit: { source: 'purchase' as const, customerInfo: info(entitlement()) },
    surface: 'onboarding_paywall' as const,
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

async function flushAuth() {
  await new Promise<void>((resolve) => {
    setTimeout(resolve, 0);
  });
}

describe('M1 purchase waits for remote config', () => {
  beforeEach(() => {
    resetRemoteConfigForTesting();
    mockTrackTrialStarted.mockReset();
    mockTrackAutoTrialSkipped.mockReset();
    mockCaptureAppError.mockReset();
    mockIsQaToolsEnabled.mockReturnValue(true);
  });

  it('creates an intent when a pending refresh resolves enabled within the window', async () => {
    const { fetchImpl, release } = hangingFetch();
    void refreshRemoteConfig({ fetchImpl, nowMs: NOW_MS });
    await flushAuth();
    const decideP = resolveVerifiedEntitlementExit(exitInput({
      fetchImpl,
      configTimeoutMs: 3_000,
    }));
    release(VALID_BODY);
    const decision = await decideP;
    expect(decision.kind).toBe('auto');
    if (decision.kind === 'auto') expect(decision.created).toBe(true);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('takes the setup flow when refresh resolves after the timeout and ignores the late value', async () => {
    const { fetchImpl, release } = hangingFetch();
    const decideP = resolveVerifiedEntitlementExit(exitInput({
      fetchImpl,
      configTimeoutMs: 30,
    }));
    const decision = await decideP;
    expect(decision).toEqual({ kind: 'fallback', reason: 'switch_off' });
    release(VALID_BODY);
    await flushAuth();
    await flushAuth();
    expect(decision).toEqual({ kind: 'fallback', reason: 'switch_off' });
    expect(readAutoTrialSwitchSnapshot(NOW_MS, 'ios').enabled).toBe(true);
  });

  it('stays off within the timeout when the snapshot is idle and there is no network', async () => {
    const fetchImpl = jest.fn(async () => {
      throw new Error('offline');
    });
    const decision = await resolveVerifiedEntitlementExit(exitInput({
      fetchImpl,
      configTimeoutMs: 30,
    }));
    expect(decision).toEqual({ kind: 'fallback', reason: 'switch_off' });
    expect(readAutoTrialSwitchSnapshot(NOW_MS, 'ios')).toMatchObject({
      enabled: false,
      reason: 'fetch_failed',
    });
  });

  it('creates an intent from an already-fresh snapshot without another fetch', async () => {
    const ok = jest.fn(async () => jsonResponse(VALID_BODY));
    await refreshRemoteConfig({ fetchImpl: ok, nowMs: NOW_MS });
    expect(ok).toHaveBeenCalledTimes(1);
    const decision = await resolveVerifiedEntitlementExit(exitInput({
      fetchImpl: ok,
      nowMs: NOW_MS + 1_000,
    }));
    expect(ok).toHaveBeenCalledTimes(1);
    expect(decision.kind).toBe('auto');
    if (decision.kind === 'auto') expect(decision.created).toBe(true);
  });
});
