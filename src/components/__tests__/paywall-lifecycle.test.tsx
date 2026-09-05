/**
 * Standalone paywall lifecycle (MP-2 / MP-3).
 *
 * TanStack mutation.ts awaits options.onSuccess even after the observer
 * unsubscribes. These tests mount the actual screen, defer store work, and
 * unmount through navigation or identity reset — not source substring checks.
 */

import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  PAYWALL_ENTITLEMENT_PENDING_CUE,
  PAYWALL_ENTITLEMENT_PENDING_MESSAGE,
  PAYWALL_GENERIC_ERROR_MESSAGE,
} from '@/lib/paywall-guardrails';

const renderer = require('react-test-renderer');
const { act } = renderer;

const mockBack = jest.fn();
const mockReplace = jest.fn();
const mockUpdateUser = jest.fn();
const mockPurchasePackage = jest.fn();
const mockRestorePurchases = jest.fn();
const mockGetOfferings = jest.fn();
const mockWaitForUnfoldPremiumEntitlement = jest.fn();
const mockSyncTrialEndingNotification = jest.fn(() => Promise.resolve());
const mockIdentityListeners = new Set<(epoch: number) => void>();

jest.mock('react-native-reanimated', () => {
  const { View } = require('react-native');
  const chainable = () => {
    const anim: Record<string, unknown> = {};
    for (const method of ['duration', 'delay', 'easing', 'springify', 'build', 'withInitialValues']) {
      anim[method] = () => anim;
    }
    return anim;
  };
  const easingFn = () => 0;
  const Easing = {
    linear: easingFn,
    ease: easingFn,
    quad: easingFn,
    cubic: easingFn,
    sin: easingFn,
    bezier: () => ({ factory: () => easingFn }),
    in: () => easingFn,
    out: () => easingFn,
    inOut: () => easingFn,
  };
  return {
    __esModule: true,
    default: { View, createAnimatedComponent: (c: unknown) => c },
    FadeIn: chainable(),
    FadeInDown: chainable(),
    Easing,
    useReducedMotion: () => true,
  };
});

jest.mock('react-native-gesture-handler', () => {
  const { TouchableOpacity, View } = require('react-native');
  return {
    TouchableOpacity,
    View,
    Gesture: { Pan: () => ({}), Tap: () => ({}) },
    GestureDetector: ({ children }: { children: React.ReactNode }) => children,
  };
});

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(),
  notificationAsync: jest.fn(),
  ImpactFeedbackStyle: { Light: 'light', Medium: 'medium' },
  NotificationFeedbackType: { Success: 'success', Warning: 'warning', Error: 'error' },
}));

jest.mock('expo-image', () => ({ Image: 'ExpoImage' }));
jest.mock('expo-linear-gradient', () => ({ LinearGradient: 'LinearGradient' }));
jest.mock('expo-application', () => ({ nativeApplicationVersion: '1.0.0', nativeBuildVersion: '1' }));
jest.mock('expo-constants', () => ({ default: { appOwnership: 'expo' } }));
jest.mock('@react-native-masked-view/masked-view', () => {
  const ReactNative = require('react-native');
  return { __esModule: true, default: ({ children }: { children: React.ReactNode }) => children ?? ReactNative.View };
});

jest.mock('expo-router', () => ({
  useRouter: () => ({ back: mockBack, replace: mockReplace }),
  useLocalSearchParams: () => ({}),
}));

jest.mock('@/components/EmberSystem', () => ({ EmberSystem: () => null }));
jest.mock('@/components/ExclusiveOfferSheet', () => ({ ExclusiveOfferSheet: () => null }));
jest.mock('@/components/icons', () => {
  const icon = () => null;
  return new Proxy({}, { get: () => icon });
});
jest.mock('@/components/ui', () => ({
  alpha: (color: string, opacity: number) => `${color}${opacity}`,
}));

const colors = {
  accent: '#C8A55C',
  background: '#111111',
  backgroundElevated: '#1A1712',
  text: '#F6EFE3',
  textMuted: '#B8AA96',
  textSubtle: '#8D806D',
  border: '#3A3328',
  borderStrong: '#514635',
  error: '#D9534F',
};

jest.mock('@/lib/theme', () => ({
  useTheme: () => ({ colors }),
}));

jest.mock('@/lib/store', () => ({
  useUnfoldStore: (selector: (state: Record<string, unknown>) => unknown) =>
    selector({
      updateUser: mockUpdateUser,
      currentDevotionalId: null,
      user: { name: 'Test', isPremium: false },
    }),
}));

jest.mock('@/lib/revenuecatClient', () => ({
  POST_PURCHASE_ENTITLEMENT_WAIT_MS: 10_000,
  getOfferings: (...args: unknown[]) => mockGetOfferings(...args),
  isRevenueCatEnabled: () => true,
  purchasePackage: (...args: unknown[]) => mockPurchasePackage(...args),
  restorePurchases: (...args: unknown[]) => mockRestorePurchases(...args),
  subscribeRevenueCatIdentityEpoch: (listener: (epoch: number) => void) => {
    mockIdentityListeners.add(listener);
    return () => {
      mockIdentityListeners.delete(listener);
    };
  },
  waitForUnfoldPremiumEntitlement: (...args: unknown[]) => mockWaitForUnfoldPremiumEntitlement(...args),
}));

jest.mock('@/lib/trial-notification', () => ({
  syncTrialEndingNotification: () => mockSyncTrialEndingNotification(),
}));

jest.mock('@/lib/paywall-diagnostics', () => ({
  isPaywallDiagnosticsEnabled: () => false,
  recordPaywallDiagnosticLazy: jest.fn(),
  summarizeCustomerInfo: (value: unknown) => value,
  summarizeDiagnosticIdentifier: (value: unknown) => value,
  summarizeOfferings: (value: unknown) => value,
  summarizePackage: (value: unknown) => value,
  summarizeRevenueCatError: (value: unknown) => value,
}));

jest.mock('@/lib/mmkv-storage', () => ({
  mmkvStorage: { getItem: jest.fn(() => 'true'), setItem: jest.fn(), removeItem: jest.fn() },
}));

jest.mock('@/lib/logger', () => ({
  logger: { log: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

jest.mock('@/lib/push-notification-helpers', () => ({
  LEGAL_LINKS: { terms: 'https://example.test/terms', privacy: 'https://example.test/privacy' },
}));

jest.mock('react-native-purchases', () => ({
  __esModule: true,
  default: {
    checkTrialOrIntroductoryPriceEligibility: jest.fn(async () => ({})),
  },
}));

// eslint-disable-next-line import/first -- component import must run after Jest module mocks are registered.
import PaywallScreen from '../../app/paywall';

const entitledCustomerInfo = {
  entitlements: { active: { 'Unfold Premium': { identifier: 'Unfold Premium' } } },
};
const unentitledCustomerInfo = { entitlements: { active: {} } };

function yearlyPackage() {
  return {
    identifier: '$rc_annual',
    product: {
      identifier: 'unfold_yearly',
      priceString: '$59.99',
      price: 59.99,
      introPrice: null,
    },
  };
}

function monthlyPackage() {
  return {
    identifier: '$rc_monthly',
    product: {
      identifier: 'unfold_monthly',
      priceString: '$9.99',
      price: 9.99,
      introPrice: null,
    },
  };
}

function offeringsWithPackages() {
  return {
    ok: true as const,
    data: {
      current: {
        identifier: 'default',
        availablePackages: [yearlyPackage(), monthlyPackage()],
      },
    },
  };
}

function emptyOfferings() {
  return {
    ok: true as const,
    data: { current: { identifier: 'default', availablePackages: [] } },
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return {
    promise,
    resolve: (value: T) => act(async () => {
      resolve(value);
    }),
    reject: (error: unknown) => act(async () => {
      reject(error);
    }),
  };
}

function fireIdentityEpoch(epoch = 1) {
  return act(async () => {
    for (const listener of mockIdentityListeners) {
      listener(epoch);
    }
  });
}

function findByLabel(tree: { root: { findAll: Function } }, label: string) {
  return tree.root.findAll(
    (node: { props?: { accessibilityLabel?: string; onPress?: unknown } }) =>
      node.props?.accessibilityLabel === label && typeof node.props?.onPress === 'function',
  );
}

function findText(tree: { root: { findAll: Function } }, text: string) {
  return tree.root.findAll((node: { props?: { children?: unknown } }) => node.props?.children === text);
}

function closeButton(tree: { root: { findAll: Function } }) {
  const node = findByLabel(tree, 'Close')[0];
  if (!node) throw new Error('Close control not found');
  return node;
}

async function renderPaywall() {
  // removable.ts:16-18 schedules GC only when isValidTimeout(gcTime).
  // utils.ts:93-95: Infinity is not a valid timeout, so no 5-minute GC timer.
  // mutationCache.clear() does not destroy mutations, so mutation gcTime
  // Infinity is what prevents an unowned timer after the observer unsubscribes.
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: Infinity },
      mutations: { retry: false, gcTime: Infinity },
    },
  });
  await act(async () => {
    await client.prefetchQuery({
      queryKey: ['revenuecat', 'offerings'],
      queryFn: () => mockGetOfferings(),
    });
    await client.prefetchQuery({
      queryKey: ['revenuecat', 'trialEligibility'],
      queryFn: async () => ({}),
    });
  });
  let tree: { root: { findAll: Function }; unmount: () => void };
  let unmounted = false;
  await act(async () => {
    tree = renderer.create(
      <QueryClientProvider client={client}>
        <PaywallScreen />
      </QueryClientProvider>,
    );
  });
  await act(async () => {
    await new Promise<void>((resolve) => {
      setImmediate(resolve);
    });
  });
  return {
    tree: tree!,
    client,
    unmount: async () => {
      if (unmounted) return;
      unmounted = true;
      await act(async () => {
        tree.unmount();
        client.clear();
        await new Promise<void>((resolve) => {
          setTimeout(resolve, 0);
        });
      });
    },
  };
}

async function press(tree: { root: { findAll: Function } }, label: string) {
  const node = findByLabel(tree, label)[0];
  if (!node) throw new Error(`${label} not found`);
  await act(async () => {
    await node.props.onPress();
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 0);
    });
  });
}

async function startPress(tree: { root: { findAll: Function } }, label: string) {
  const node = findByLabel(tree, label)[0];
  if (!node) throw new Error(`${label} not found`);
  await act(async () => {
    void node.props.onPress();
    await Promise.resolve();
  });
}

describe('standalone PaywallScreen lifecycle', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockIdentityListeners.clear();
    mockGetOfferings.mockResolvedValue(offeringsWithPackages());
    mockWaitForUnfoldPremiumEntitlement.mockReturnValue(new Promise(() => {}));
    mockSyncTrialEndingNotification.mockResolvedValue(undefined);
  });

  it('advances exactly once on a same-session entitled purchase and restore', async () => {
    mockPurchasePackage.mockResolvedValue({ ok: true, data: entitledCustomerInfo });
    mockRestorePurchases.mockResolvedValue({ ok: true, data: entitledCustomerInfo });
    const { tree, unmount } = await renderPaywall();

    await press(tree, 'Unlock Unfold Premium');
    expect(mockBack).toHaveBeenCalledTimes(1);
    expect(mockUpdateUser).toHaveBeenCalledTimes(1);
    expect(mockUpdateUser).toHaveBeenCalledWith({ isPremium: true });

    await press(tree, 'Restore purchases');
    expect(mockBack).toHaveBeenCalledTimes(1);
    expect(mockUpdateUser).toHaveBeenCalledTimes(1);
    expect(findText(tree, PAYWALL_GENERIC_ERROR_MESSAGE)).toHaveLength(0);
    await unmount();
  });

  it('keeps verified navigation after optional notification rejection', async () => {
    mockPurchasePackage.mockResolvedValue({ ok: true, data: entitledCustomerInfo });
    mockSyncTrialEndingNotification.mockImplementation(async () => {
      throw new Error('getCustomerInfo failed');
    });
    const { tree, unmount } = await renderPaywall();

    await press(tree, 'Unlock Unfold Premium');
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mockBack).toHaveBeenCalledTimes(1);
    expect(mockUpdateUser).toHaveBeenCalledWith({ isPremium: true });
    expect(findText(tree, PAYWALL_GENERIC_ERROR_MESSAGE)).toHaveLength(0);
    expect(findText(tree, 'Could not restore purchases. Please try again.')).toHaveLength(0);
    await unmount();
  });

  it('advances exactly once when restore lands during a late entitlement wait', async () => {
    mockPurchasePackage.mockResolvedValue({ ok: true, data: unentitledCustomerInfo });
    mockRestorePurchases.mockResolvedValue({ ok: true, data: entitledCustomerInfo });
    const wait = deferred<typeof entitledCustomerInfo | null>();
    mockWaitForUnfoldPremiumEntitlement.mockReturnValue(wait.promise);
    const { tree, unmount } = await renderPaywall();

    await press(tree, 'Unlock Unfold Premium');
    expect(findText(tree, PAYWALL_ENTITLEMENT_PENDING_CUE).length).toBeGreaterThan(0);
    expect(closeButton(tree).props.disabled).toBe(false);
    expect(findByLabel(tree, 'Restore purchases')[0].props.disabled).toBeFalsy();

    await press(tree, 'Restore purchases');
    expect(mockBack).toHaveBeenCalledTimes(1);
    expect(mockUpdateUser).toHaveBeenCalledTimes(1);

    await wait.resolve(entitledCustomerInfo);
    expect(mockBack).toHaveBeenCalledTimes(1);
    expect(mockUpdateUser).toHaveBeenCalledTimes(1);
    await unmount();
  });

  it('advances once when a delayed verified entitlement arrives in the same session', async () => {
    mockPurchasePackage.mockResolvedValue({ ok: true, data: unentitledCustomerInfo });
    const wait = deferred<typeof entitledCustomerInfo | null>();
    mockWaitForUnfoldPremiumEntitlement.mockReturnValue(wait.promise);
    const { tree, unmount } = await renderPaywall();

    await press(tree, 'Unlock Unfold Premium');
    expect(mockBack).not.toHaveBeenCalled();
    expect(mockUpdateUser).not.toHaveBeenCalled();

    await wait.resolve(entitledCustomerInfo);
    expect(mockBack).toHaveBeenCalledTimes(1);
    expect(mockUpdateUser).toHaveBeenCalledWith({ isPremium: true });
    await unmount();
  });

  it('does not treat Close during a pending mutation as the unmount path', async () => {
    const purchase = deferred<{ ok: true; data: typeof entitledCustomerInfo }>();
    mockPurchasePackage.mockReturnValue(purchase.promise);
    const { tree, unmount } = await renderPaywall();

    await press(tree, 'Unlock Unfold Premium');
    expect(closeButton(tree).props.disabled).toBe(true);

    await act(async () => {
      closeButton(tree).props.onPress();
    });
    expect(mockBack).not.toHaveBeenCalled();

    await purchase.resolve({ ok: true, data: entitledCustomerInfo });
    expect(mockBack).toHaveBeenCalledTimes(1);
    await unmount();
  });

  it('ignores a direct mutation success after navigation unmount', async () => {
    const purchase = deferred<{ ok: true; data: typeof entitledCustomerInfo }>();
    mockPurchasePackage.mockReturnValue(purchase.promise);
    const { tree, unmount } = await renderPaywall();

    await press(tree, 'Unlock Unfold Premium');
    expect(closeButton(tree).props.disabled).toBe(true);

    await unmount();
    await purchase.resolve({ ok: true, data: entitledCustomerInfo });

    expect(mockBack).not.toHaveBeenCalled();
    expect(mockReplace).not.toHaveBeenCalled();
    expect(mockUpdateUser).not.toHaveBeenCalled();
  });

  it('ignores a mutation error after navigation unmount', async () => {
    const purchase = deferred<{ ok: true; data: typeof entitledCustomerInfo }>();
    mockPurchasePackage.mockReturnValue(purchase.promise);
    const { tree, unmount } = await renderPaywall();

    await press(tree, 'Unlock Unfold Premium');
    await unmount();
    await purchase.reject(new Error('store failed'));

    expect(mockBack).not.toHaveBeenCalled();
    expect(mockUpdateUser).not.toHaveBeenCalled();
  });

  it('lets Close run during the entitlement wait and ignores a later grant after unmount', async () => {
    mockPurchasePackage.mockResolvedValue({ ok: true, data: unentitledCustomerInfo });
    const wait = deferred<typeof entitledCustomerInfo | null>();
    mockWaitForUnfoldPremiumEntitlement.mockReturnValue(wait.promise);
    const { tree, unmount } = await renderPaywall();

    await press(tree, 'Unlock Unfold Premium');
    expect(closeButton(tree).props.disabled).toBe(false);
    expect(findText(tree, PAYWALL_ENTITLEMENT_PENDING_MESSAGE).length).toBeGreaterThan(0);

    await act(async () => {
      closeButton(tree).props.onPress();
    });
    expect(mockBack).toHaveBeenCalledTimes(1);

    await unmount();
    await wait.resolve(entitledCustomerInfo);

    expect(mockBack).toHaveBeenCalledTimes(1);
    expect(mockUpdateUser).not.toHaveBeenCalled();
  });

  it('ignores a late entitlement while Close has started and the screen is still mounted', async () => {
    mockPurchasePackage.mockResolvedValue({ ok: true, data: unentitledCustomerInfo });
    const wait = deferred<typeof entitledCustomerInfo | null>();
    mockWaitForUnfoldPremiumEntitlement.mockReturnValue(wait.promise);
    const { tree, unmount } = await renderPaywall();

    await press(tree, 'Unlock Unfold Premium');
    expect(closeButton(tree).props.disabled).toBe(false);
    expect(findText(tree, PAYWALL_ENTITLEMENT_PENDING_MESSAGE).length).toBeGreaterThan(0);

    await act(async () => {
      closeButton(tree).props.onPress();
    });
    expect(mockBack).toHaveBeenCalledTimes(1);

    await wait.resolve(entitledCustomerInfo);
    const callsDuringClosingTransition = mockBack.mock.calls.length;
    await unmount();
    expect(callsDuringClosingTransition).toBe(1);
    expect(mockUpdateUser).not.toHaveBeenCalled();
  });

  it('clears identity-epoch wait state so the current screen is not left disabled', async () => {
    mockPurchasePackage.mockResolvedValue({ ok: true, data: unentitledCustomerInfo });
    const wait = deferred<typeof entitledCustomerInfo | null>();
    mockWaitForUnfoldPremiumEntitlement.mockReturnValue(wait.promise);
    const { tree, unmount } = await renderPaywall();

    await press(tree, 'Unlock Unfold Premium');
    expect(findText(tree, PAYWALL_ENTITLEMENT_PENDING_CUE).length).toBeGreaterThan(0);

    await fireIdentityEpoch(2);
    expect(findText(tree, PAYWALL_ENTITLEMENT_PENDING_CUE)).toHaveLength(0);
    expect(findText(tree, PAYWALL_ENTITLEMENT_PENDING_MESSAGE)).toHaveLength(0);
    expect(closeButton(tree).props.disabled).toBe(false);
    expect(findByLabel(tree, 'Unlock Unfold Premium')[0].props.disabled).toBe(false);

    await wait.resolve(entitledCustomerInfo);
    expect(mockBack).not.toHaveBeenCalled();
    expect(mockUpdateUser).not.toHaveBeenCalled();
    await unmount();
  });

  it('does not start a purchase after a stale offerings refetch', async () => {
    const refetch = deferred<ReturnType<typeof offeringsWithPackages>>();
    mockGetOfferings
      .mockResolvedValueOnce(emptyOfferings())
      .mockReturnValue(refetch.promise);
    const { tree, unmount } = await renderPaywall();

    await startPress(tree, 'Loading subscription plans');
    expect(mockPurchasePackage).not.toHaveBeenCalled();

    await unmount();
    await refetch.resolve(offeringsWithPackages());

    expect(mockPurchasePackage).not.toHaveBeenCalled();
    expect(mockUpdateUser).not.toHaveBeenCalled();
  });

  it('does not start a purchase when identity resets during offerings refetch', async () => {
    const refetch = deferred<ReturnType<typeof offeringsWithPackages>>();
    mockGetOfferings
      .mockResolvedValueOnce(emptyOfferings())
      .mockReturnValue(refetch.promise);
    const { tree, unmount } = await renderPaywall();

    await startPress(tree, 'Loading subscription plans');
    await fireIdentityEpoch(3);
    await refetch.resolve(offeringsWithPackages());

    expect(mockPurchasePackage).not.toHaveBeenCalled();
    expect(mockUpdateUser).not.toHaveBeenCalled();
    expect(closeButton(tree).props.disabled).toBe(false);
    await unmount();
  });
});
