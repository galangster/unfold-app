import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ColorTheme } from '@/constants/colors';
import { getTrialPaywallTimeline } from '@/lib/trial-reminder-copy';

const MIDDAY_FALLBACK = { hour: 12, minute: 30 };

const renderer = require('react-test-renderer');
const { act } = renderer;

const mockGetOfferings = jest.fn();

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
  return {
    __esModule: true,
    default: { View, createAnimatedComponent: (c: unknown) => c },
    FadeIn: chainable(),
    FadeInDown: chainable(),
    Easing: {
      linear: easingFn,
      ease: easingFn,
      cubic: easingFn,
      out: () => easingFn,
      in: () => easingFn,
      inOut: () => easingFn,
      bezier: () => easingFn,
    },
    useReducedMotion: () => true,
    useSharedValue: (initial: unknown) => ({ value: initial }),
    useAnimatedStyle: () => ({}),
    withSpring: (v: unknown) => v,
    withTiming: (v: unknown) => v,
    withRepeat: (v: unknown) => v,
    cancelAnimation: () => undefined,
    runOnJS: (fn: unknown) => fn,
  };
});
jest.mock('react-native-gesture-handler', () => {
  const { TouchableOpacity, View } = require('react-native');
  const gesture: Record<string, unknown> = new Proxy({}, { get: () => () => gesture });
  return { TouchableOpacity, View, Gesture: { Pan: () => gesture, Tap: () => gesture }, GestureDetector: ({ children }: { children: unknown }) => children };
});
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(),
  notificationAsync: jest.fn(),
  ImpactFeedbackStyle: { Light: 'light' },
  NotificationFeedbackType: { Success: 'success', Warning: 'warning', Error: 'error' },
}));
jest.mock('expo-image', () => ({ Image: 'ExpoImage' }));
jest.mock('expo-linear-gradient', () => ({ LinearGradient: 'LinearGradient' }));
jest.mock('expo-application', () => ({ nativeApplicationVersion: '1.0.0', nativeBuildVersion: '1' }));
jest.mock('expo-constants', () => ({ default: { appOwnership: 'expo' } }));
jest.mock('@react-native-masked-view/masked-view', () => {
  const ReactNative = require('react-native');
  return { __esModule: true, default: ({ children }: { children: unknown }) => children ?? ReactNative.View };
});
jest.mock('lottie-react-native', () => ({ __esModule: true, default: 'LottieView' }));
jest.mock('expo-video', () => ({
  useVideoPlayer: () => ({ loop: false, muted: false, bufferOptions: {}, play: jest.fn(), pause: jest.fn(), replace: jest.fn(), addListener: jest.fn(() => ({ remove: jest.fn() })) }),
  VideoView: 'VideoView',
}));
jest.mock('expo-router', () => ({
  useRouter: () => ({ back: jest.fn(), replace: jest.fn() }),
  useLocalSearchParams: () => ({}),
  useFocusEffect: (cb: () => void) => {
    const ReactActual = require('react');
    ReactActual.useEffect(cb, [cb]);
  },
}));
jest.mock('@/components/EmberSystem', () => ({ EmberSystem: () => null }));
jest.mock('@/components/ExclusiveOfferSheet', () => ({ ExclusiveOfferSheet: () => null }));
jest.mock('@/components/icons', () => new Proxy({}, { get: () => () => null }));
jest.mock('@/components/ui', () => ({ alpha: (c: string) => c }));
jest.mock('@/lib/qa-tools', () => ({ isQaToolsEnabled: () => false, shouldRenderQaChrome: () => false }));
jest.mock('@/lib/mmkv-storage', () => ({
  mmkvStorage: { getItem: jest.fn(() => null), setItem: jest.fn(), removeItem: jest.fn() },
}));
jest.mock('@/lib/revenuecatClient', () => ({
  POST_PURCHASE_ENTITLEMENT_WAIT_MS: 10_000,
  getOfferings: (...args: unknown[]) => mockGetOfferings(...args),
  purchasePackage: jest.fn(),
  restorePurchases: jest.fn(),
  waitForUnfoldPremiumEntitlement: jest.fn(() => new Promise(() => {})),
  isRevenueCatEnabled: () => true,
  subscribeRevenueCatIdentityEpoch: () => () => undefined,
}));
jest.mock('@/lib/trial-notification', () => ({ syncTrialEndingNotification: jest.fn() }));
jest.mock('@/lib/push-notification-helpers', () => ({
  LEGAL_LINKS: { terms: 'https://example.test/terms', privacy: 'https://example.test/privacy' },
}));
jest.mock('@/lib/remote-config', () => ({ refreshRemoteConfig: jest.fn() }));
jest.mock('@/lib/auto-trial-exit', () => ({
  resolveLaterEntryExit: () => ({ kind: 'fallback', reason: 'switch_off' }),
}));
jest.mock('@/lib/notification-ask', () => ({ requestLaterEntryNotifyAsk: jest.fn() }));
jest.mock('@/lib/ui-state', () => ({
  useUIState: { getState: () => ({ setPendingPaywallGrant: jest.fn() }) },
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
jest.mock('@/lib/logger', () => ({ logger: { log: jest.fn(), warn: jest.fn(), error: jest.fn() } }));

const colors = {
  accent: '#C8A55C',
  background: '#111111',
  backgroundElevated: '#1A1712',
  text: '#F6EFE3',
  textMuted: '#B8AA96',
  textSubtle: '#8D806D',
  textHint: '#6B5F4E',
  border: '#3A3328',
  borderStrong: '#514635',
  error: '#D9534F',
} as unknown as ColorTheme;

jest.mock('@/lib/theme', () => ({
  useTheme: () => ({ colors }),
}));
jest.mock('@/lib/store', () => ({
  useUnfoldStore: (selector: (state: Record<string, unknown>) => unknown) =>
    selector({
      updateUser: jest.fn(),
      currentDevotionalId: null,
      user: { name: 'Test', isPremium: false },
    }),
}));

const mockCheckEligibility = jest.fn(async (..._args: unknown[]) => ({
  unfold_yearly: { status: 2 },
}));
jest.mock('react-native-purchases', () => ({
  __esModule: true,
  default: {
    checkTrialOrIntroductoryPriceEligibility: (...args: unknown[]) => mockCheckEligibility(...args),
  },
}));

import { ThreeStepPaywall } from '@/components/onboarding/ThreeStepPaywall';
import PaywallScreen from '@/app/paywall';

const mockGetPermissionsAsync = jest.fn(async (..._args: unknown[]) => ({ status: 'granted' }));
jest.mock('expo-notifications', () => ({
  getPermissionsAsync: (...args: unknown[]) => mockGetPermissionsAsync(...args),
  requestPermissionsAsync: jest.fn(async () => ({ status: 'granted' })),
  scheduleNotificationAsync: jest.fn(async () => 'id'),
  cancelScheduledNotificationAsync: jest.fn(async () => undefined),
  getAllScheduledNotificationsAsync: jest.fn(async () => []),
  setNotificationHandler: jest.fn(),
}));


function at(day: number, hour: number, minute: number): number {
  return new Date(2026, 0, day, hour, minute, 0, 0).getTime();
}

function flattenChildren(children: unknown): unknown {
  if (!Array.isArray(children)) return children;
  return children
    .map((child) => (typeof child === 'string' || typeof child === 'number' ? String(child) : '\u0000'))
    .join('');
}

function findText(tree: { root: { findAll: Function } }, text: string) {
  return tree.root.findAll(
    (node: { props?: { children?: unknown } }) => flattenChildren(node.props?.children) === text,
  );
}

function pressPrimaryCTA(tree: { root: { findAll: Function } }) {
  const cta = tree.root.findAll(
    (node: { props?: { activeOpacity?: number; onPress?: unknown } }) =>
      node.props?.activeOpacity === 0.7 && typeof node.props?.onPress === 'function',
  )[0];
  if (!cta) throw new Error('primary CTA not found');
  return act(async () => {
    cta.props.onPress();
  });
}

function leadCopy(lead: string | null): string {
  return lead
    ? `You'll get a notification ${lead} before your trial ends. No surprises, ever.`
    : "You'll get a notification before your trial ends. No surprises, ever.";
}

function yearlyPackage(intro: { periodNumberOfUnits: number; periodUnit: string } | null) {
  return {
    identifier: '$rc_annual',
    product: {
      identifier: 'unfold_yearly',
      priceString: '$59.99',
      price: 59.99,
      introPrice: intro
        ? { price: 0, periodNumberOfUnits: intro.periodNumberOfUnits, periodUnit: intro.periodUnit }
        : null,
    },
  };
}

function offerings(intro: { periodNumberOfUnits: number; periodUnit: string } | null) {
  return {
    ok: true as const,
    data: {
      current: {
        identifier: 'default',
        availablePackages: [
          yearlyPackage(intro),
          {
            identifier: '$rc_monthly',
            product: { identifier: 'unfold_monthly', priceString: '$9.99', price: 9.99, introPrice: null },
          },
        ],
      },
    },
  };
}

async function renderThreeStep(trialDays: number | null) {
  let tree: { root: { findAll: Function }; unmount: () => void };
  await act(async () => {
    tree = renderer.create(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <ThreeStepPaywall
          colors={colors}
          isDark
          yearlyPackage={undefined}
          monthlyPackage={undefined}
          yearlyPrice="$59.99"
          monthlyPrice="$9.99"
          yearlyRaw={59.99}
          monthlyRaw={9.99}
          trialDuration="3-day"
          trialDays={trialDays}
          hasFreeTrial
          offeringsReady
          onRetryOfferings={jest.fn()}
          onPurchaseSuccess={jest.fn()}
          onSkip={jest.fn()}
          onDecideLater={jest.fn()}
        />
      </QueryClientProvider>,
    );
  });
  await pressPrimaryCTA(tree!);
  return tree!;
}

async function renderPaywall(intro: { periodNumberOfUnits: number; periodUnit: string } | null) {
  mockGetOfferings.mockResolvedValue(offerings(intro));
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
      queryFn: async () => ({ unfold_yearly: { status: 2 } }),
    });
  });
  let tree: { root: { findAll: Function }; unmount: () => void };
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
    unmount: async () => {
      await act(async () => {
        tree.unmount();
        client.clear();
      });
    },
  };
}

describe('I7 paywall timeline copy', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('matches the plan lead and reminderDay for 3-day, 7-day, sandbox/5/6-as-3', async () => {
    const cases: Array<{ trialDays: number; nowMs: number; intro: { periodNumberOfUnits: number; periodUnit: string } }> = [
      { trialDays: 3, nowMs: at(5, 7, 30), intro: { periodNumberOfUnits: 3, periodUnit: 'day' } },
      { trialDays: 3, nowMs: at(5, 8, 0), intro: { periodNumberOfUnits: 3, periodUnit: 'day' } },
      { trialDays: 7, nowMs: at(5, 6, 0), intro: { periodNumberOfUnits: 1, periodUnit: 'week' } },
    ];

    for (const { trialDays, nowMs, intro } of cases) {
      jest.spyOn(Date, 'now').mockReturnValue(nowMs);
      const plan = getTrialPaywallTimeline({
        trialDays,
        nowMs,
        middaySlot: MIDDAY_FALLBACK,
      });

      const three = await renderThreeStep(trialDays);
      expect(findText(three, leadCopy(plan.reminderLeadLabel)).length).toBeGreaterThan(0);
      await act(async () => three.unmount());

      const paywall = await renderPaywall(intro);
      if (plan.reminderDay != null) {
        expect(findText(paywall.tree, `Day ${plan.reminderDay}`).length).toBeGreaterThan(0);
      }
      await paywall.unmount();
    }

    const sizedAsThree = [
      { trialDays: 3 / (24 * 60), nowMs: at(5, 10, 0) },
      { trialDays: 5, nowMs: at(5, 10, 0) },
      { trialDays: 6, nowMs: at(5, 10, 0) },
    ];
    for (const { trialDays, nowMs } of sizedAsThree) {
      jest.spyOn(Date, 'now').mockReturnValue(nowMs);
      const plan = getTrialPaywallTimeline({
        trialDays: 3,
        nowMs,
        middaySlot: MIDDAY_FALLBACK,
      });
      const three = await renderThreeStep(trialDays);
      expect(findText(three, leadCopy(plan.reminderLeadLabel)).length).toBeGreaterThan(0);
      await act(async () => three.unmount());
    }
  });

  it('never uses auto-path copy for 8, 14, or 30 days', async () => {
    const nowMs = at(5, 10, 0);
    jest.spyOn(Date, 'now').mockReturnValue(nowMs);
    for (const trialDays of [8, 14, 30]) {
      const three = await renderThreeStep(trialDays);
      expect(findText(three, leadCopy(null)).length).toBeGreaterThan(0);
      expect(findText(three, leadCopy('1 day'))).toHaveLength(0);
      await act(async () => three.unmount());

      const paywall = await renderPaywall({ periodNumberOfUnits: trialDays, periodUnit: 'day' });
      expect(findText(paywall.tree, 'Day 3')).toHaveLength(0);
      expect(findText(paywall.tree, 'Day 4')).toHaveLength(0);
      await paywall.unmount();
    }
  });

  it('renders the timeless line and no day numbers for a MONTH intro', async () => {
    const nowMs = at(5, 10, 0);
    jest.spyOn(Date, 'now').mockReturnValue(nowMs);
    const three = await renderThreeStep(null);
    expect(findText(three, leadCopy(null)).length).toBeGreaterThan(0);
    expect(findText(three, 'Day 3')).toHaveLength(0);
    expect(findText(three, 'Day 4')).toHaveLength(0);
    await act(async () => three.unmount());

    const paywall = await renderPaywall({ periodNumberOfUnits: 1, periodUnit: 'month' });
    expect(findText(paywall.tree, 'Day 3')).toHaveLength(0);
    expect(findText(paywall.tree, 'Day 4')).toHaveLength(0);
    await paywall.unmount();
  });
});
