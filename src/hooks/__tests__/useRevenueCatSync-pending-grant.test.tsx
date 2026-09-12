import React from 'react';
import type { CustomerInfo } from 'react-native-purchases';

const renderer = jest.requireActual('react-test-renderer');
const { act } = renderer;

const mockUpdateUser = jest.fn();
const mockPush = jest.fn();
const mockResolveLaterEntryExit = jest.fn();
const mockHandleVerifiedEntitlementExit = jest.fn();
const mockRequestLaterEntryNotifyAsk = jest.fn();
const mockSetPendingPaywallGrant = jest.fn();
let mockPendingPaywallGrant: {
  surface: string;
  entry: string;
  setAtMs: number;
} | null = null;

jest.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({
    prefetchQuery: jest.fn(() => Promise.resolve()),
    getQueryData: jest.fn(() => undefined),
  }),
}));
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: (...args: unknown[]) => mockPush(...args) }),
  useSegments: () => [],
  useNavigation: () => ({ getState: () => ({ index: 1, routes: [] }) }),
}));
jest.mock('@/lib/store', () => {
  const state = {
    updateUser: (...args: unknown[]) => mockUpdateUser(...args),
    user: { hasCompletedOnboarding: true },
    devotionals: [],
  };
  const useUnfoldStore = Object.assign(
    (selector: (s: typeof state) => unknown) => selector(state),
    { getState: () => state },
  );
  return { useUnfoldStore };
});
jest.mock('@/lib/ui-state', () => ({
  useUIState: {
    getState: () => ({
      pendingPaywallGrant: mockPendingPaywallGrant,
      setPendingPaywallGrant: (value: typeof mockPendingPaywallGrant) => {
        mockPendingPaywallGrant = value;
        mockSetPendingPaywallGrant(value);
      },
      setRevenueCatResolved: jest.fn(),
      revenueCatResolved: true,
    }),
  },
}));
jest.mock('@/lib/revenuecatClient', () => ({
  addCustomerInfoUpdateListener: jest.fn(async () => ({ ok: false })),
  getCustomerInfo: jest.fn(async () => ({ ok: false })),
  getOfferings: jest.fn(async () => ({ ok: false })),
  hasRevenueCatConfigurationAttemptFailed: () => false,
  isRevenueCatEnabled: () => true,
  isRevenueCatIdentityVerified: () => true,
  retryRevenueCatIdentitySync: jest.fn(),
  subscribeRevenueCatIdentityEpoch: () => () => undefined,
  subscribeRevenueCatIdentityVerified: (cb: () => void) => {
    cb();
    return () => undefined;
  },
}));
jest.mock('@/lib/auto-trial-exit', () => ({
  resolveLaterEntryExit: (...args: unknown[]) => mockResolveLaterEntryExit(...args),
  resolveVerifiedEntitlementExit: (...args: unknown[]) => mockHandleVerifiedEntitlementExit(...args),
  handleVerifiedEntitlementExit: (...args: unknown[]) => mockHandleVerifiedEntitlementExit(...args),
}));
jest.mock('@/lib/notification-ask', () => ({
  requestLaterEntryNotifyAsk: (...args: unknown[]) => mockRequestLaterEntryNotifyAsk(...args),
}));
jest.mock('@/lib/trial-notification', () => ({
  syncTrialEndingNotification: jest.fn(),
}));
jest.mock('@/lib/listener-registration', () => ({
  createSingleListenerGuard: (fn: () => Promise<unknown>) => ({
    ensure: () => fn(),
    dispose: jest.fn(),
  }),
}));
jest.mock('@/lib/sync-session-fence', () => ({
  isLocalResetInProgress: () => false,
  subscribeLocalResetIdle: () => () => undefined,
}));
jest.mock('@/lib/mmkv-storage', () => ({ getDeviceId: () => 'device-1' }));
jest.mock('@/lib/device-timezone', () => ({ getDeviceTimezone: () => 'America/Chicago' }));
jest.mock('@/lib/remote-config', () => ({
  readAutoTrialSwitchSnapshot: () => ({ enabled: true, maxTrialDays: 7, fetchedAtMs: 1, reason: 'ok' }),
}));
jest.mock('@/lib/logger', () => ({ logger: { log: jest.fn() } }));

import { useRevenueCatSync } from '../useRevenueCatSync';
import { getCustomerInfo } from '@/lib/revenuecatClient';

const TRIAL_INFO = {
  entitlements: {
    active: {
      'Unfold Premium': {
        identifier: 'Unfold Premium',
        periodType: 'TRIAL',
        latestPurchaseDateMillis: Date.now(),
      },
    },
  },
} as unknown as CustomerInfo;

function HookProbe() {
  useRevenueCatSync();
  return null;
}

async function renderHook() {
  await act(async () => {
    renderer.create(<HookProbe />);
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe('F9 useRevenueCatSync pending grant', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPendingPaywallGrant = null;
    (getCustomerInfo as jest.Mock).mockResolvedValue({ ok: true, data: TRIAL_INFO });
    mockResolveLaterEntryExit.mockReturnValue({
      kind: 'auto',
      created: true,
      intent: { intentId: 'intent-1' },
    });
  });

  it('never creates an intent from an active TRIAL without a pendingPaywallGrant marker', async () => {
    await renderHook();
    expect(mockResolveLaterEntryExit).not.toHaveBeenCalled();
    expect(mockHandleVerifiedEntitlementExit).not.toHaveBeenCalled();
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('decides once with lateGrant for a fresh marker and clears it', async () => {
    mockPendingPaywallGrant = {
      surface: 'paywall_route',
      entry: 'later',
      setAtMs: Date.now(),
    };
    await renderHook();
    expect(mockResolveLaterEntryExit).toHaveBeenCalledTimes(1);
    expect(mockResolveLaterEntryExit.mock.calls[0][0]).toEqual({
      source: 'lateGrant',
      customerInfo: TRIAL_INFO,
    });
    expect(mockPendingPaywallGrant).toBeNull();
    expect(mockPush).toHaveBeenCalledWith('/generating');
  });

  it('clears a marker older than 15 minutes with no decision', async () => {
    mockPendingPaywallGrant = {
      surface: 'paywall_route',
      entry: 'later',
      setAtMs: Date.now() - (15 * 60_000 + 1),
    };
    await renderHook();
    expect(mockResolveLaterEntryExit).not.toHaveBeenCalled();
    expect(mockPendingPaywallGrant).toBeNull();
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('does not start an auto series when the Apple transaction is stale_purchase', async () => {
    mockPendingPaywallGrant = {
      surface: 'paywall_route',
      entry: 'later',
      setAtMs: Date.now(),
    };
    mockResolveLaterEntryExit.mockReturnValue({ kind: 'fallback', reason: 'stale_purchase' });
    await renderHook();
    expect(mockPush).not.toHaveBeenCalled();
    expect(mockRequestLaterEntryNotifyAsk).toHaveBeenCalledWith(TRIAL_INFO);
  });

  it('keeps the marker session-only and does not persist it', async () => {
    expect(mockPendingPaywallGrant).toBeNull();
    mockPendingPaywallGrant = {
      surface: 'onboarding_paywall',
      entry: 'onboarding',
      setAtMs: Date.now(),
    };
    mockHandleVerifiedEntitlementExit.mockReturnValue({
      kind: 'auto',
      created: true,
      intent: { intentId: 'intent-onboarding' },
    });
    await renderHook();
    expect(mockPendingPaywallGrant).toBeNull();
    expect(mockSetPendingPaywallGrant).toHaveBeenCalledWith(null);
  });
});
