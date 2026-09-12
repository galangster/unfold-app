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

const renderer = jest.requireActual('react-test-renderer');
const { act } = renderer;

const mockBack = jest.fn();
const mockReplace = jest.fn();
const mockUpdateUser = jest.fn();
const mockPurchasePackage = jest.fn();
const mockRestorePurchases = jest.fn();
const mockGetOfferings = jest.fn();
const mockWaitForUnfoldPremiumEntitlement = jest.fn();
const mockSyncTrialEndingNotification = jest.fn((..._args: unknown[]) => Promise.resolve());
const mockIdentityListeners = new Set<(epoch: number) => void>();

jest.mock('react-native-reanimated', () => {
  const { View } = jest.requireActual('react-native');
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
  const { TouchableOpacity, View } = jest.requireActual('react-native');
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

jest.mock('expo-notifications', () => ({
  getPermissionsAsync: jest.fn(async () => ({ status: 'granted' })),
  requestPermissionsAsync: jest.fn(async () => ({ status: 'granted' })),
  scheduleNotificationAsync: jest.fn(async () => 'id'),
  cancelScheduledNotificationAsync: jest.fn(async () => undefined),
  getAllScheduledNotificationsAsync: jest.fn(async () => []),
  setNotificationHandler: jest.fn(),
}));
jest.mock('expo-image', () => ({ Image: 'ExpoImage' }));
jest.mock('expo-linear-gradient', () => ({ LinearGradient: 'LinearGradient' }));
jest.mock('expo-application', () => ({ nativeApplicationVersion: '1.0.0', nativeBuildVersion: '1' }));
jest.mock('expo-constants', () => ({ default: { appOwnership: 'expo' } }));
jest.mock('@react-native-masked-view/masked-view', () => {
  const ReactNative = jest.requireActual('react-native');
  return { __esModule: true, default: ({ children }: { children: React.ReactNode }) => children ?? ReactNative.View };
});

let mockPaywallSearchParams: Record<string, string> = {};
jest.mock('expo-router', () => ({
  useRouter: () => ({ canGoBack: () => true, back: mockBack, replace: mockReplace }),
  useSegments: () => [],
  useNavigation: () => ({ getState: () => ({ index: 1, routes: [] }) }),
  useLocalSearchParams: () => mockPaywallSearchParams,
  useFocusEffect: (cb: () => void) => {
    const ReactActual = require('react');
    ReactActual.useEffect(cb, [cb]);
  },
}));

jest.mock('@/components/EmberSystem', () => ({ EmberSystem: () => null }));
let paywallOfferProps: { onPurchaseSuccess?: (exit: unknown) => void } | null = null;
jest.mock('@/components/ExclusiveOfferSheet', () => ({
  ExclusiveOfferSheet: (props: { onPurchaseSuccess?: (exit: unknown) => void }) => {
    paywallOfferProps = props;
    return null;
  },
}));
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
  syncTrialEndingNotification: (...args: unknown[]) => mockSyncTrialEndingNotification(...args),
}));
const mockResolveLaterEntryExit = jest.fn((..._args: unknown[]) => ({ kind: 'fallback', reason: 'switch_off' }));
const mockRequestLaterEntryNotifyAsk = jest.fn();
jest.mock('@/lib/auto-trial-exit', () => ({
  resolveLaterEntryExit: (...args: unknown[]) => mockResolveLaterEntryExit(...args),
}));
jest.mock('@/lib/notification-ask', () => ({
  requestLaterEntryNotifyAsk: (...args: unknown[]) => mockRequestLaterEntryNotifyAsk(...args),
}));
jest.mock('@/lib/remote-config', () => ({
  refreshRemoteConfig: jest.fn(),
}));
const mockSetPendingPaywallGrant = jest.fn();
jest.mock('@/lib/ui-state', () => ({
  useUIState: {
    getState: () => ({ setPendingPaywallGrant: mockSetPendingPaywallGrant }),
  },
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
    mockPaywallSearchParams = {};
    paywallOfferProps = null;
    mockResolveLaterEntryExit.mockReturnValue({ kind: 'fallback', reason: 'switch_off' });
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
    expect(closeButton(tree).props.disabled).toBe(true);
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

  it('blocks Close during the entitlement wait so a later grant can still complete', async () => {
    mockPurchasePackage.mockResolvedValue({ ok: true, data: unentitledCustomerInfo });
    const wait = deferred<typeof entitledCustomerInfo | null>();
    mockWaitForUnfoldPremiumEntitlement.mockReturnValue(wait.promise);
    const { tree, unmount } = await renderPaywall();

    await press(tree, 'Unlock Unfold Premium');
    expect(closeButton(tree).props.disabled).toBe(true);
    expect(findText(tree, PAYWALL_ENTITLEMENT_PENDING_MESSAGE).length).toBeGreaterThan(0);

    await act(async () => {
      closeButton(tree).props.onPress();
    });
    expect(mockBack).not.toHaveBeenCalled();

    await wait.resolve(entitledCustomerInfo);
    expect(mockResolveLaterEntryExit).toHaveBeenCalledTimes(1);
    expect(mockResolveLaterEntryExit).toHaveBeenCalledWith(
      { source: 'lateGrant', customerInfo: entitledCustomerInfo },
      'paywall_route',
    );
    expect(mockUpdateUser).toHaveBeenCalledWith({ isPremium: true });
    await unmount();
  });

  it('keeps a blocked Close from racing a late grant while the screen is still mounted', async () => {
    mockPurchasePackage.mockResolvedValue({ ok: true, data: unentitledCustomerInfo });
    const wait = deferred<typeof entitledCustomerInfo | null>();
    mockWaitForUnfoldPremiumEntitlement.mockReturnValue(wait.promise);
    const { tree, unmount } = await renderPaywall();

    await press(tree, 'Unlock Unfold Premium');
    expect(closeButton(tree).props.disabled).toBe(true);
    expect(findText(tree, PAYWALL_ENTITLEMENT_PENDING_MESSAGE).length).toBeGreaterThan(0);

    await act(async () => {
      closeButton(tree).props.onPress();
    });
    expect(mockBack).not.toHaveBeenCalled();

    await wait.resolve(entitledCustomerInfo);
    expect(mockResolveLaterEntryExit).toHaveBeenCalledTimes(1);
    expect(mockUpdateUser).toHaveBeenCalledWith({ isPremium: true });
    await unmount();
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

describe('F6 /paywall auto-trial exits', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPaywallSearchParams = {};
    paywallOfferProps = null;
    mockIdentityListeners.clear();
    mockGetOfferings.mockResolvedValue(offeringsWithPackages());
    mockWaitForUnfoldPremiumEntitlement.mockReturnValue(new Promise(() => {}));
    mockSyncTrialEndingNotification.mockResolvedValue(undefined);
    mockResolveLaterEntryExit.mockReturnValue({ kind: 'fallback', reason: 'switch_off' });
  });

  it('threads purchase, lateGrant, and restore sources, and restore after wait is lateGrant', async () => {
    mockPurchasePackage.mockResolvedValue({ ok: true, data: entitledCustomerInfo });
    const purchased = await renderPaywall();
    await press(purchased.tree, 'Unlock Unfold Premium');
    expect(mockResolveLaterEntryExit).toHaveBeenCalledWith(
      { source: 'purchase', customerInfo: entitledCustomerInfo },
      'paywall_route',
    );
    await purchased.unmount();

    mockPurchasePackage.mockResolvedValue({ ok: true, data: unentitledCustomerInfo });
    const wait = deferred<typeof entitledCustomerInfo | null>();
    mockWaitForUnfoldPremiumEntitlement.mockReturnValue(wait.promise);
    const late = await renderPaywall();
    await press(late.tree, 'Unlock Unfold Premium');
    await wait.resolve(entitledCustomerInfo);
    expect(mockResolveLaterEntryExit).toHaveBeenCalledWith(
      { source: 'lateGrant', customerInfo: entitledCustomerInfo },
      'paywall_route',
    );
    await late.unmount();

    mockRestorePurchases.mockResolvedValue({ ok: true, data: entitledCustomerInfo });
    const restored = await renderPaywall();
    await press(restored.tree, 'Restore purchases');
    expect(mockResolveLaterEntryExit).toHaveBeenCalledWith(
      { source: 'restore', customerInfo: entitledCustomerInfo },
      'paywall_route',
    );
    await restored.unmount();

    mockPurchasePackage.mockResolvedValue({ ok: true, data: unentitledCustomerInfo });
    const armedWait = deferred<typeof entitledCustomerInfo | null>();
    mockWaitForUnfoldPremiumEntitlement.mockReturnValue(armedWait.promise);
    const armed = await renderPaywall();
    await press(armed.tree, 'Unlock Unfold Premium');
    await press(armed.tree, 'Restore purchases');
    expect(mockResolveLaterEntryExit).toHaveBeenCalledWith(
      { source: 'lateGrant', customerInfo: entitledCustomerInfo },
      'paywall_route',
    );
    await armed.unmount();
  });

  it('replaces to generating on an auto decision and asks on fallback', async () => {
    mockPurchasePackage.mockResolvedValue({ ok: true, data: entitledCustomerInfo });
    mockResolveLaterEntryExit.mockReturnValue({
      kind: 'auto',
      created: true,
      intent: { intentId: 'intent-auto' },
    } as never);
    const auto = await renderPaywall();
    await press(auto.tree, 'Unlock Unfold Premium');
    expect(mockReplace).toHaveBeenCalledWith('/generating');
    expect(mockRequestLaterEntryNotifyAsk).not.toHaveBeenCalled();
    await auto.unmount();

    mockResolveLaterEntryExit.mockReturnValue({ kind: 'fallback', reason: 'switch_off' });
    const fallback = await renderPaywall();
    await press(fallback.tree, 'Unlock Unfold Premium');
    expect(mockBack).toHaveBeenCalled();
    expect(mockRequestLaterEntryNotifyAsk).toHaveBeenCalledWith(entitledCustomerInfo);
    await fallback.unmount();
  });

  it('skips the later-entry handler when opened from onboarding', async () => {
    mockPaywallSearchParams = { source: 'onboarding' };
    mockPurchasePackage.mockResolvedValue({ ok: true, data: entitledCustomerInfo });
    const { tree, unmount } = await renderPaywall();
    await press(tree, 'Unlock Unfold Premium');
    expect(mockResolveLaterEntryExit).not.toHaveBeenCalled();
    expect(mockRequestLaterEntryNotifyAsk).not.toHaveBeenCalled();
    await unmount();
  });

  it('advances once from the offer sheet and writes the seen flag', async () => {
    mockPurchasePackage.mockResolvedValue({ ok: false, reason: 'user_cancelled' });
    const { mmkvStorage } = require('@/lib/mmkv-storage');
    mmkvStorage.getItem.mockReturnValue(null);
    const { tree, unmount } = await renderPaywall();
    await press(tree, 'Unlock Unfold Premium');
    expect(paywallOfferProps?.onPurchaseSuccess).toEqual(expect.any(Function));
    await act(async () => {
      paywallOfferProps?.onPurchaseSuccess?.({
        source: 'offer',
        customerInfo: entitledCustomerInfo,
      });
    });
    expect(mmkvStorage.setItem).toHaveBeenCalledWith('@unfold_onboarding_offer_seen', 'true');
    expect(mockResolveLaterEntryExit).toHaveBeenCalledTimes(1);
    await unmount();
  });

  it('still navigates back with no generic error copy when the decision throws', async () => {
    mockPurchasePackage.mockResolvedValue({ ok: true, data: entitledCustomerInfo });
    mockResolveLaterEntryExit.mockImplementation(() => {
      throw new Error('decision failed');
    });
    const { tree, unmount } = await renderPaywall();
    await press(tree, 'Unlock Unfold Premium');
    expect(mockBack).toHaveBeenCalled();
    expect(findText(tree, PAYWALL_GENERIC_ERROR_MESSAGE)).toHaveLength(0);
    await unmount();
  });
});
