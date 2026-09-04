/**
 * The onboarding paywall used to be the one screen a person could not leave:
 * the stack disables the back gesture, there is no close control, and the only
 * exits were a purchase, a lucky restore, or force-quitting the app. These
 * cover the "I'll decide later" exit — final page only, every build, and
 * present even when offerings never loaded.
 */

import React from 'react';
import type { ColorTheme } from '@/constants/colors';

const renderer = require('react-test-renderer');
const { act } = renderer;

const mockIsQaToolsEnabled = jest.fn(() => false);

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
    Easing,
    runOnJS: (fn: unknown) => fn,
    cancelAnimation: () => undefined,
    useReducedMotion: () => true,
    useSharedValue: (initial: unknown) => ({ value: initial }),
    useAnimatedStyle: (fn: () => unknown) => {
      try {
        return fn();
      } catch {
        return {};
      }
    },
    withSpring: (toValue: unknown) => toValue,
    withTiming: (toValue: unknown) => toValue,
    withRepeat: (animation: unknown) => animation,
  };
});

jest.mock('react-native-gesture-handler', () => {
  const { View } = require('react-native');
  const chainableGesture = () => {
    const gesture: Record<string, unknown> = {};
    for (const method of [
      'activeOffsetY',
      'activeOffsetX',
      'failOffsetX',
      'failOffsetY',
      'shouldCancelWhenOutside',
      'onUpdate',
      'onEnd',
      'onFinalize',
      'onBegin',
      'enabled',
    ]) {
      gesture[method] = () => gesture;
    }
    return gesture;
  };
  return {
    Gesture: { Pan: chainableGesture, Tap: chainableGesture, Simultaneous: chainableGesture },
    GestureDetector: ({ children }: { children: React.ReactNode }) => children,
    TouchableOpacity: require('react-native').TouchableOpacity,
    View,
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
jest.mock('lottie-react-native', () => ({ __esModule: true, default: 'LottieView' }));
jest.mock('expo-video', () => ({
  useVideoPlayer: (_source: unknown, setup?: (player: unknown) => void) => {
    const player = {
      loop: false,
      muted: false,
      bufferOptions: {},
      play: jest.fn(),
      pause: jest.fn(),
      replace: jest.fn(),
      addListener: jest.fn(() => ({ remove: jest.fn() })),
    };
    setup?.(player);
    return player;
  },
  VideoView: 'VideoView',
}));

jest.mock('@/components/EmberSystem', () => ({ EmberSystem: () => null }));
jest.mock('@/components/ExclusiveOfferSheet', () => ({ ExclusiveOfferSheet: () => null }));
jest.mock('@/components/icons', () => ({ CheckIcon: () => null }));

// @/components/ui re-exports Button -> theme -> expo-system-ui (untransformed
// ESM in node_modules). Only alpha() is needed here.
jest.mock('@/components/ui', () => ({
  alpha: (color: string, opacity: number) => `${color}${opacity}`,
}));

jest.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ fetchQuery: jest.fn(), invalidateQueries: jest.fn() }),
}));

const mockPurchasePackage = jest.fn();
const mockRestorePurchases = jest.fn();
const mockWaitForUnfoldPremiumEntitlement = jest.fn();
const mockSyncTrialEndingNotification = jest.fn(() => Promise.resolve());

jest.mock('@/lib/revenuecatClient', () => ({
  POST_PURCHASE_ENTITLEMENT_WAIT_MS: 10_000,
  getOfferings: jest.fn(),
  purchasePackage: (...args: unknown[]) => mockPurchasePackage(...args),
  restorePurchases: (...args: unknown[]) => mockRestorePurchases(...args),
  waitForUnfoldPremiumEntitlement: (...args: unknown[]) => mockWaitForUnfoldPremiumEntitlement(...args),
}));

jest.mock('@/lib/trial-notification', () => ({
  syncTrialEndingNotification: () => mockSyncTrialEndingNotification(),
}));

jest.mock('@/lib/mmkv-storage', () => ({
  mmkvStorage: { getItem: jest.fn(() => null), setItem: jest.fn(), removeItem: jest.fn() },
}));

jest.mock('@/lib/qa-tools', () => ({ isQaToolsEnabled: () => mockIsQaToolsEnabled() }));

jest.mock('@/lib/push-notification-helpers', () => ({
  LEGAL_LINKS: { terms: 'https://example.test/terms', privacy: 'https://example.test/privacy' },
}));

// eslint-disable-next-line import/first -- component import must run after Jest module mocks are registered.
import { ThreeStepPaywall } from '../onboarding/ThreeStepPaywall';
// eslint-disable-next-line import/first -- same ordering constraint as above.
import {
  PAYWALL_ENTITLEMENT_PENDING_CUE,
  PAYWALL_ENTITLEMENT_PENDING_MESSAGE,
  PAYWALL_GENERIC_ERROR_MESSAGE,
  PAYWALL_PURCHASE_TIMEOUT_MESSAGE,
} from '@/lib/paywall-guardrails';
// eslint-disable-next-line import/first -- same ordering constraint as above.
import * as Haptics from 'expo-haptics';

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

const DECIDE_LATER_LABEL = "I'll decide later";

function baseProps(overrides: Record<string, unknown> = {}) {
  return {
    colors,
    isDark: true,
    yearlyPackage: undefined,
    monthlyPackage: undefined,
    yearlyPrice: '$59.99',
    monthlyPrice: '$9.99',
    yearlyRaw: 59.99,
    monthlyRaw: 9.99,
    trialDuration: '7 days',
    trialDays: 7,
    // hasFreeTrial false keeps the flow at two pages, so one CTA press reaches
    // the final page without depending on the trial-reminder screen.
    hasFreeTrial: false,
    offeringsReady: true,
    onRetryOfferings: jest.fn(),
    onPurchaseSuccess: jest.fn(),
    onSkip: jest.fn(),
    onDecideLater: jest.fn(),
    ...overrides,
  };
}

async function render(props: Record<string, unknown>) {
  let tree: any;
  await act(async () => {
    tree = renderer.create(<ThreeStepPaywall {...(props as any)} />);
  });
  return tree;
}

// TouchableOpacity is wrapped by nativewind's JSX interop and forwards its
// props down, so one control matches at several depths. `deep: false` keeps
// only the outermost match per control.
function findByLabel(tree: any, label: string) {
  return tree.root.findAll(
    (n: any) => n.props?.accessibilityLabel === label && typeof n.props?.onPress === 'function',
    { deep: false },
  );
}

// The primary CTA is the only pressable in the file with activeOpacity 0.7.
function pressPrimaryCTA(tree: any) {
  const cta = tree.root.findAll(
    (n: any) => n.props?.activeOpacity === 0.7 && typeof n.props?.onPress === 'function',
  )[0];
  if (!cta) throw new Error('primary CTA not found');
  return act(async () => {
    cta.props.onPress();
  });
}

const entitledCustomerInfo = {
  entitlements: { active: { 'Unfold Premium': { identifier: 'Unfold Premium' } } },
};
const unentitledCustomerInfo = { entitlements: { active: {} } };

function findText(tree: any, text: string) {
  return tree.root.findAll((n: any) => n.props?.children === text);
}

/** Style colour of the outermost Text node rendering exactly `text`. */
function textColor(tree: any, text: string): string | undefined {
  const node = findText(tree, text)[0];
  const style = node?.props?.style;
  return Array.isArray(style) ? style.find((s: any) => s?.color)?.color : style?.color;
}

function notificationHaptics(): unknown[] {
  return (Haptics.notificationAsync as jest.Mock).mock.calls.map((call) => call[0]);
}

/** A wait the test settles by hand, standing in for the SDK listener + poll. */
function deferredEntitlementWait() {
  let resolve!: (value: unknown) => void;
  const promise = new Promise<unknown>((r) => {
    resolve = r;
  });
  mockWaitForUnfoldPremiumEntitlement.mockReturnValue(promise);
  return {
    resolve: (value: unknown) => act(async () => {
      resolve(value);
    }),
    signal: (): AbortSignal => mockWaitForUnfoldPremiumEntitlement.mock.calls[0][1].signal,
  };
}

/**
 * Jordan (App Store 1.1.0): "after accepting the offer for the trial it takes
 * me back to the free trial page" / "I had to tap restore purchases to get
 * through it". The paywall had one exit and every other terminal branch of a
 * completed purchase left the person on it.
 */
describe('ThreeStepPaywall purchase advances exactly once', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockIsQaToolsEnabled.mockReturnValue(false);
    mockWaitForUnfoldPremiumEntitlement.mockReturnValue(new Promise(() => {}));
    mockSyncTrialEndingNotification.mockResolvedValue(undefined);
  });

  // hasFreeTrial false is two pages: one CTA press reaches the final page, the
  // next one purchases. yearlyPackage present keeps the handler off fetchQuery.
  async function renderOnFinalPage(overrides: Record<string, unknown> = {}) {
    const props = baseProps({ yearlyPackage: { identifier: '$rc_annual' }, ...overrides });
    const tree = await render(props);
    await pressPrimaryCTA(tree);
    return { tree, props };
  }

  it('advances once on an entitled result even when the notification sync rejects', async () => {
    mockPurchasePackage.mockResolvedValue({ ok: true, data: entitledCustomerInfo });
    mockSyncTrialEndingNotification.mockRejectedValue(new Error('getCustomerInfo hung'));
    const { tree, props } = await renderOnFinalPage();

    await pressPrimaryCTA(tree);

    expect(props.onPurchaseSuccess).toHaveBeenCalledTimes(1);
    expect(mockSyncTrialEndingNotification).toHaveBeenCalledTimes(1);
    expect(findText(tree, PAYWALL_GENERIC_ERROR_MESSAGE)).toHaveLength(0);
    expect(findText(tree, PAYWALL_ENTITLEMENT_PENDING_MESSAGE)).toHaveLength(0);
  });

  it('navigates before the notification sync starts, never after it', async () => {
    const order: string[] = [];
    mockPurchasePackage.mockResolvedValue({ ok: true, data: entitledCustomerInfo });
    mockSyncTrialEndingNotification.mockImplementation(() => {
      order.push('sync');
      return new Promise(() => {});
    });
    const { tree, props } = await renderOnFinalPage({
      onPurchaseSuccess: jest.fn(() => order.push('advance')),
    });

    await pressPrimaryCTA(tree);

    expect(props.onPurchaseSuccess).toHaveBeenCalledTimes(1);
    expect(order).toEqual(['advance', 'sync']);
  });

  it('advances only once when a restore lands after a successful purchase', async () => {
    mockPurchasePackage.mockResolvedValue({ ok: true, data: entitledCustomerInfo });
    mockRestorePurchases.mockResolvedValue({ ok: true, data: entitledCustomerInfo });
    const { tree, props } = await renderOnFinalPage();

    await pressPrimaryCTA(tree);
    await act(async () => {
      findByLabel(tree, 'Restore purchases')[0].props.onPress();
    });

    expect(props.onPurchaseSuccess).toHaveBeenCalledTimes(1);
  });

  it('shows the timeout copy as a neutral pending state, not the generic error, on a client-side timeout', async () => {
    mockPurchasePackage.mockResolvedValue({ ok: false, reason: 'timeout', error: new Error('timed out') });
    const wait = deferredEntitlementWait();
    const { tree, props } = await renderOnFinalPage();

    await pressPrimaryCTA(tree);

    expect(props.onPurchaseSuccess).not.toHaveBeenCalled();
    expect(findText(tree, PAYWALL_PURCHASE_TIMEOUT_MESSAGE).length).toBeGreaterThan(0);
    expect(textColor(tree, PAYWALL_PURCHASE_TIMEOUT_MESSAGE)).not.toBe(colors.error);
    expect(findText(tree, PAYWALL_ENTITLEMENT_PENDING_CUE).length).toBeGreaterThan(0);
    expect(findText(tree, PAYWALL_GENERIC_ERROR_MESSAGE)).toHaveLength(0);
    expect(notificationHaptics()).not.toContain('error');

    // The wait gave up: the timeout copy becomes the error-slot verdict.
    await wait.resolve(null);
    expect(findText(tree, PAYWALL_ENTITLEMENT_PENDING_CUE)).toHaveLength(0);
    expect(textColor(tree, PAYWALL_PURCHASE_TIMEOUT_MESSAGE)).toBe(colors.error);
    expect(props.onPurchaseSuccess).not.toHaveBeenCalled();
  });

  it('renders the pending grant as "finishing up", not as an error', async () => {
    mockPurchasePackage.mockResolvedValue({ ok: true, data: unentitledCustomerInfo });
    deferredEntitlementWait();
    const { tree, props } = await renderOnFinalPage();

    await pressPrimaryCTA(tree);

    expect(props.onPurchaseSuccess).not.toHaveBeenCalled();
    expect(findText(tree, PAYWALL_ENTITLEMENT_PENDING_CUE).length).toBeGreaterThan(0);
    expect(findText(tree, PAYWALL_ENTITLEMENT_PENDING_MESSAGE).length).toBeGreaterThan(0);
    expect(textColor(tree, PAYWALL_ENTITLEMENT_PENDING_MESSAGE)).toBe(colors.textMuted);
    expect(textColor(tree, PAYWALL_ENTITLEMENT_PENDING_MESSAGE)).not.toBe(colors.error);
    expect(notificationHaptics()).toEqual([]);
    expect(mockWaitForUnfoldPremiumEntitlement).toHaveBeenCalledTimes(1);
    expect(mockWaitForUnfoldPremiumEntitlement.mock.calls[0][0]).toBe(10_000);
  });

  it('advances without Restore when the entitlement arrives late through the bounded wait', async () => {
    mockPurchasePackage.mockResolvedValue({ ok: true, data: unentitledCustomerInfo });
    const wait = deferredEntitlementWait();
    const { tree, props } = await renderOnFinalPage();

    await pressPrimaryCTA(tree);
    expect(props.onPurchaseSuccess).not.toHaveBeenCalled();

    await wait.resolve(entitledCustomerInfo);

    expect(props.onPurchaseSuccess).toHaveBeenCalledTimes(1);
    expect(notificationHaptics()).toEqual(['success']);
    expect(findText(tree, PAYWALL_ENTITLEMENT_PENDING_CUE)).toHaveLength(0);
  });

  it('moves the pending copy to the error slot with its Restore guidance when the wait gives up', async () => {
    mockPurchasePackage.mockResolvedValue({ ok: true, data: unentitledCustomerInfo });
    const wait = deferredEntitlementWait();
    const { tree, props } = await renderOnFinalPage();

    await pressPrimaryCTA(tree);
    await wait.resolve(null);

    expect(props.onPurchaseSuccess).not.toHaveBeenCalled();
    expect(findText(tree, PAYWALL_ENTITLEMENT_PENDING_CUE)).toHaveLength(0);
    expect(findText(tree, PAYWALL_ENTITLEMENT_PENDING_MESSAGE).length).toBeGreaterThan(0);
    expect(PAYWALL_ENTITLEMENT_PENDING_MESSAGE).toContain('Restore purchases');
    expect(textColor(tree, PAYWALL_ENTITLEMENT_PENDING_MESSAGE)).toBe(colors.error);
    expect(notificationHaptics()).toEqual(['warning']);
    // One bounded wait only — nothing re-arms a listener after it gave up.
    expect(mockWaitForUnfoldPremiumEntitlement).toHaveBeenCalledTimes(1);
  });

  it('aborts the entitlement wait when the paywall unmounts, so no listener outlives it', async () => {
    mockPurchasePackage.mockResolvedValue({ ok: true, data: unentitledCustomerInfo });
    const wait = deferredEntitlementWait();
    const { tree, props } = await renderOnFinalPage();

    await pressPrimaryCTA(tree);
    expect(wait.signal().aborted).toBe(false);

    await act(async () => {
      tree.unmount();
    });

    expect(wait.signal().aborted).toBe(true);
    // A grant that lands after unmount must not advance a dead screen.
    await wait.resolve(entitledCustomerInfo);
    expect(props.onPurchaseSuccess).not.toHaveBeenCalled();
  });

  it('aborts the previous wait when a new purchase attempt starts', async () => {
    mockPurchasePackage.mockResolvedValueOnce({ ok: true, data: unentitledCustomerInfo });
    const wait = deferredEntitlementWait();
    const { tree } = await renderOnFinalPage();

    await pressPrimaryCTA(tree);
    const firstSignal = wait.signal();
    expect(firstSignal.aborted).toBe(false);

    // While the second attempt is still in flight the stale UI deadline is
    // already gone: purchasePackage listens for the grant itself.
    let resolveSecond!: (value: unknown) => void;
    mockPurchasePackage.mockReturnValueOnce(new Promise((r) => { resolveSecond = r; }));
    await pressPrimaryCTA(tree);
    expect(firstSignal.aborted).toBe(true);
    expect(findText(tree, PAYWALL_ENTITLEMENT_PENDING_CUE)).toHaveLength(0);

    await act(async () => {
      resolveSecond({ ok: true, data: unentitledCustomerInfo });
    });
    expect(mockWaitForUnfoldPremiumEntitlement).toHaveBeenCalledTimes(2);
    expect(mockWaitForUnfoldPremiumEntitlement.mock.calls[1][1].signal.aborted).toBe(false);
  });

  it('does not advance or wait on a plain SDK error', async () => {
    mockPurchasePackage.mockResolvedValue({ ok: false, reason: 'sdk_error', error: new Error('boom') });
    const { tree, props } = await renderOnFinalPage();

    await pressPrimaryCTA(tree);

    expect(props.onPurchaseSuccess).not.toHaveBeenCalled();
    expect(mockWaitForUnfoldPremiumEntitlement).not.toHaveBeenCalled();
    expect(findText(tree, PAYWALL_ENTITLEMENT_PENDING_CUE)).toHaveLength(0);
    expect(findText(tree, PAYWALL_GENERIC_ERROR_MESSAGE).length).toBeGreaterThan(0);
    expect(textColor(tree, PAYWALL_GENERIC_ERROR_MESSAGE)).toBe(colors.error);
    expect(notificationHaptics()).toEqual(['error']);
  });
});

describe('ThreeStepPaywall decide-later exit', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockIsQaToolsEnabled.mockReturnValue(false);
  });

  it('does not render the decide-later control on a non-final page', async () => {
    const tree = await render(baseProps());

    expect(findByLabel(tree, DECIDE_LATER_LABEL)).toHaveLength(0);
  });

  it('renders the decide-later control on the final page and calls onDecideLater when pressed', async () => {
    const props = baseProps();
    const tree = await render(props);

    await pressPrimaryCTA(tree);

    const controls = findByLabel(tree, DECIDE_LATER_LABEL);
    expect(controls).toHaveLength(1);
    expect(controls[0].props.accessibilityRole).toBe('button');

    await act(async () => {
      controls[0].props.onPress();
    });

    expect(props.onDecideLater).toHaveBeenCalledTimes(1);
    expect(props.onSkip).not.toHaveBeenCalled();
    expect(props.onPurchaseSuccess).not.toHaveBeenCalled();
  });

  it('renders the decide-later control in a non-QA build, separately from the QA skip button', async () => {
    const tree = await render(baseProps());
    await pressPrimaryCTA(tree);

    expect(findByLabel(tree, DECIDE_LATER_LABEL)).toHaveLength(1);
    expect(findByLabel(tree, 'Continue without premium for QA')).toHaveLength(0);
  });

  it('still renders the decide-later control when offerings failed to load', async () => {
    // The most trapped person of all: no price on screen, no way out.
    const tree = await render(baseProps({ offeringsReady: false }));
    await pressPrimaryCTA(tree);

    expect(findByLabel(tree, 'Tap to retry loading plans')).toHaveLength(1);
    expect(findByLabel(tree, DECIDE_LATER_LABEL)).toHaveLength(1);
  });

  it('styles the control as a quiet muted text link with no background or border', async () => {
    const tree = await render(baseProps());
    await pressPrimaryCTA(tree);

    const control = findByLabel(tree, DECIDE_LATER_LABEL)[0];
    const flat = [control.props.style].flat(Infinity).filter(Boolean);
    for (const entry of flat) {
      expect(entry).not.toHaveProperty('backgroundColor');
      expect(entry).not.toHaveProperty('borderWidth');
    }

    const usesMutedInk = control
      .findAllByType(require('react-native').Text)
      .some((node: any) =>
        [node.props.style]
          .flat(Infinity)
          .filter(Boolean)
          .some((entry: any) => entry.color === colors.textMuted),
      );
    expect(usesMutedInk).toBe(true);
  });
});
