/**
 * The exclusive-offer sheet is a real purchase surface. Before this cover, a
 * purchase completed inside it only closed the sheet, so a person who paid
 * during onboarding stayed on the paywall. A grant must reach the host's
 * onPurchaseSuccess; a plain dismissal must keep the old behaviour.
 *
 * The churned/winback half had no cover at all. It now pins down the three
 * dormant faults that flag would have shipped: no fallback when the winback SKU
 * is off sale, a failure path that still burned the once-ever offer under
 * offer-shaped copy, and a failure state that stayed unreachable so the sheet
 * spun forever.
 */

import React from 'react';
import { ActivityIndicator } from 'react-native';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ExclusiveOfferSheet } from '../ExclusiveOfferSheet';

const renderer = require('react-test-renderer');
const { act } = renderer;

const mockGetOfferings = jest.fn();
const mockPurchasePackage = jest.fn();
const mockRestorePurchases = jest.fn();
const mockUpdateUser = jest.fn();
const mockRouterPush = jest.fn();

// Flipped per test to exercise the query-disabled dead end.
let mockRevenueCatEnabled = true;

// A real QueryClient keeps cache timers alive past the test and stops the Jest
// worker exiting. These fakes run the same queryFn/mutationFn -> onSuccess path
// the component depends on, with nothing scheduled.
jest.mock('@tanstack/react-query', () => {
  const ReactModule = require('react');
  return {
    useQueryClient: () => ({ invalidateQueries: jest.fn(), fetchQuery: jest.fn() }),
    useQuery: ({
      queryFn,
      enabled,
    }: {
      queryFn: () => Promise<unknown>;
      enabled?: boolean;
    }) => {
      // react-query v5 leaves a disabled query pending with isLoading false, and
      // clears isLoading on rejection too. The sheet's failure state keys off
      // exactly that, so the fake has to reproduce both.
      const [state, setState] = ReactModule.useState(() => ({
        data: undefined,
        isLoading: enabled !== false,
      }));
      ReactModule.useEffect(() => {
        if (enabled === false) return undefined;
        let cancelled = false;
        Promise.resolve(queryFn()).then(
          (data: unknown) => {
            if (!cancelled) setState({ data, isLoading: false });
          },
          () => {
            if (!cancelled) setState({ data: undefined, isLoading: false });
          },
        );
        return () => {
          cancelled = true;
        };
      }, [enabled]);
      return state;
    },
    useMutation: ({
      mutationFn,
      onSuccess,
      onError,
    }: {
      mutationFn: (vars: unknown) => Promise<unknown>;
      onSuccess?: (result: unknown) => unknown;
      onError?: (error: unknown) => unknown;
    }) => {
      const [isPending, setIsPending] = ReactModule.useState(false);
      const mutate = async (vars?: unknown) => {
        setIsPending(true);
        try {
          const result = await mutationFn(vars);
          await onSuccess?.(result);
        } catch (error) {
          onError?.(error);
        } finally {
          setIsPending(false);
        }
      };
      return { mutate, isPending };
    },
  };
});

jest.mock('@/lib/revenuecatClient', () => ({
  getOfferings: (...args: unknown[]) => mockGetOfferings(...args),
  purchasePackage: (...args: unknown[]) => mockPurchasePackage(...args),
  restorePurchases: (...args: unknown[]) => mockRestorePurchases(...args),
  isRevenueCatEnabled: () => mockRevenueCatEnabled,
}));

jest.mock('@/lib/store', () => ({
  useUnfoldStore: (selector: (state: { updateUser: jest.Mock }) => unknown) =>
    selector({ updateUser: mockUpdateUser }),
}));

jest.mock('@/lib/push-notification-helpers', () => ({
  LEGAL_LINKS: { terms: 'https://example.test/terms', privacy: 'https://example.test/privacy' },
}));

jest.mock('@/lib/theme', () => ({
  useTheme: () => ({
    isDark: true,
    colors: {
      accent: '#C8A55C',
      background: '#111111',
      text: '#F6EFE3',
      textMuted: '#B8AA96',
      textSubtle: '#8D806D',
      textHint: '#6B5F4E',
      error: '#D9534F',
    },
  }),
}));

jest.mock('@/constants/fonts', () => ({
  FontFamily: {
    body: 'Body',
    bodyItalic: 'Body-Italic',
    display: 'Display',
    ui: 'System',
    uiMedium: 'System-Medium',
    uiSemiBold: 'System-Semibold',
  },
  FontSize: { xs: 12, sm: 14, base: 16 },
}));

jest.mock('@/constants/spacing', () => ({
  Spacing: {
    '0.5': 2,
    '1': 4,
    '2': 8,
    '3': 12,
    '4': 16,
    '5': 20,
    '6': 24,
    '7': 28,
    '12': 48,
  },
}));

jest.mock('@/constants/radius', () => ({ Radius: { sm: 6, card: 16 } }));

jest.mock('@/constants/animations', () => ({
  Duration: { normal: 220 },
  Ease: { out: jest.fn() },
}));

jest.mock('@/components/icons', () => ({ Gift: () => null }));

jest.mock('react-native-reanimated', () => ({
  __esModule: true,
  default: { View: 'Animated.View' },
  FadeIn: { duration: () => ({ easing: () => undefined }) },
  useReducedMotion: () => true,
}));

jest.mock('react-native-gesture-handler', () => ({
  TouchableOpacity: require('react-native').TouchableOpacity,
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

jest.mock('expo-router', () => ({
  useRouter: () => ({ canGoBack: () => true, push: (...args: unknown[]) => mockRouterPush(...args) }),
  useSegments: () => [],
  useNavigation: () => ({ getState: () => ({ index: 1, routes: [] }) }),
}));

jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(),
  notificationAsync: jest.fn(),
  ImpactFeedbackStyle: { Light: 'light', Medium: 'medium' },
  NotificationFeedbackType: { Success: 'success', Warning: 'warning', Error: 'error' },
}));

const ANNUAL_PACKAGE = {
  identifier: '$rc_annual',
  product: { priceString: '$59.99' },
};

// The winback SKU sells through its own offering, one price below the standard
// annual. Same package identifier — the churned branch takes availablePackages[0],
// not a name — so only the price tells the two apart on screen.
const WINBACK_PACKAGE = {
  identifier: '$rc_annual',
  product: { priceString: '$44.99' },
};

const OFFERINGS_OK = {
  ok: true as const,
  data: { current: { availablePackages: [ANNUAL_PACKAGE] }, all: {} },
};

const OFFERINGS_WITH_WINBACK = {
  ok: true as const,
  data: {
    current: { availablePackages: [ANNUAL_PACKAGE] },
    all: { winback: { availablePackages: [WINBACK_PACKAGE] } },
  },
};

// What RevenueCat returns once unfold_yearly_winback is pulled from sale: the
// offering survives, its package list does not.
const OFFERINGS_EMPTY_WINBACK = {
  ok: true as const,
  data: {
    current: { availablePackages: [ANNUAL_PACKAGE] },
    all: { winback: { availablePackages: [] } },
  },
};

// Nothing purchasable anywhere — the only genuine failure state left.
const OFFERINGS_NOTHING = {
  ok: true as const,
  data: { current: null, all: { winback: { availablePackages: [] } } },
};

function premiumCustomerInfo() {
  return { ok: true as const, data: { entitlements: { active: { 'Unfold Premium': {} } } } };
}

// The offerings query and the purchase mutation both settle asynchronously.
// Polling beats a fixed number of microtask ticks, which was flaky under the
// full suite's parallel load.
async function waitFor(check: () => boolean, label: string) {
  for (let attempt = 0; attempt < 50; attempt++) {
    if (check()) return;
    // Microtasks only. React Native's Jest environment mocks timers, so a
    // setTimeout/setImmediate-based flush can hang instead of settling.
    // eslint-disable-next-line no-await-in-loop -- sequential settling is the point.
    await act(async () => {
      for (let tick = 0; tick < 10; tick++) {
        // eslint-disable-next-line no-await-in-loop
        await Promise.resolve();
      }
    });
  }
  if (!check()) throw new Error(`Timed out waiting for: ${label}`);
}

// Unmounted in afterEach so nothing survives into the next test.
const mounted: any[] = [];

function textOf(tree: any) {
  return JSON.stringify(tree.toJSON());
}

async function mountSheet(props: {
  onDismiss: jest.Mock;
  onPurchaseSuccess?: jest.Mock;
  context?: 'onboarding' | 'churned';
  surface?: 'onboarding_paywall' | 'paywall_route' | 'churned_sheet';
}) {
  const { context = 'onboarding', ...rest } = props;
  let tree: any;
  await act(async () => {
    tree = renderer.create(<ExclusiveOfferSheet visible context={context} {...rest} />);
  });
  mounted.push(tree);
  return tree;
}

async function renderSheet(props: {
  onDismiss: jest.Mock;
  onPurchaseSuccess?: jest.Mock;
  context?: 'onboarding' | 'churned';
  surface?: 'onboarding_paywall' | 'paywall_route' | 'churned_sheet';
  expectPrice?: string;
}) {
  const { expectPrice = '$59.99', ...rest } = props;
  const tree = await mountSheet(rest);
  // The CTA is a no-op until the query resolves a package, so wait for its price.
  await waitFor(
    () => textOf(tree).includes(expectPrice),
    `offerings to resolve the package priced ${expectPrice}`,
  );
  return tree;
}

function pressByLabel(tree: any, label: string) {
  const node = tree.root.findAll(
    (n: any) => n.props?.accessibilityLabel === label && typeof n.props?.onPress === 'function',
  )[0];
  if (!node) throw new Error(`No pressable found with accessibilityLabel "${label}"`);
  return act(async () => {
    node.props.onPress();
    await Promise.resolve();
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockRevenueCatEnabled = true;
  mockGetOfferings.mockResolvedValue(OFFERINGS_OK);
});

afterEach(async () => {
  await act(async () => {
    for (const tree of mounted.splice(0)) {
      tree.unmount();
    }
  });
});

describe('ExclusiveOfferSheet purchase outcomes', () => {
  it('calls onPurchaseSuccess when a purchase inside the sheet grants premium', async () => {
    mockPurchasePackage.mockResolvedValue(premiumCustomerInfo());
    const onDismiss = jest.fn();
    const onPurchaseSuccess = jest.fn();

    const tree = await renderSheet({ onDismiss, onPurchaseSuccess });
    await pressByLabel(tree, 'Accept Offer');
    await waitFor(() => onPurchaseSuccess.mock.calls.length > 0, 'purchase to settle');

    expect(mockPurchasePackage).toHaveBeenCalledTimes(1);
    expect(mockUpdateUser).toHaveBeenCalledWith({ isPremium: true });
    expect(onPurchaseSuccess).toHaveBeenCalledTimes(1);
    expect(onDismiss).not.toHaveBeenCalled();
  });

  it('calls onPurchaseSuccess when a restore inside the sheet finds premium', async () => {
    mockRestorePurchases.mockResolvedValue(premiumCustomerInfo());
    const onDismiss = jest.fn();
    const onPurchaseSuccess = jest.fn();

    const tree = await renderSheet({ onDismiss, onPurchaseSuccess });
    await pressByLabel(tree, 'Restore purchases');
    await waitFor(() => onPurchaseSuccess.mock.calls.length > 0, 'restore to settle');

    expect(mockUpdateUser).toHaveBeenCalledWith({ isPremium: true });
    expect(onPurchaseSuccess).toHaveBeenCalledTimes(1);
    expect(onDismiss).not.toHaveBeenCalled();
  });

  it('only dismisses when the person declines the offer', async () => {
    const onDismiss = jest.fn();
    const onPurchaseSuccess = jest.fn();

    const tree = await renderSheet({ onDismiss, onPurchaseSuccess });
    await pressByLabel(tree, 'No thanks');

    expect(onDismiss).toHaveBeenCalledTimes(1);
    expect(onPurchaseSuccess).not.toHaveBeenCalled();
    expect(mockPurchasePackage).not.toHaveBeenCalled();
    expect(mockUpdateUser).not.toHaveBeenCalled();
  });

  it('falls back to onDismiss for callers that pass no success callback', async () => {
    mockPurchasePackage.mockResolvedValue(premiumCustomerInfo());
    const onDismiss = jest.fn();

    const tree = await renderSheet({ onDismiss });
    await pressByLabel(tree, 'Accept Offer');
    await waitFor(() => onDismiss.mock.calls.length > 0, 'purchase to settle');

    expect(onDismiss).toHaveBeenCalledTimes(1);
  });
});

describe('ExclusiveOfferSheet churned winback path', () => {
  beforeEach(() => {
    mockGetOfferings.mockResolvedValue(OFFERINGS_WITH_WINBACK);
  });

  it('sells the winback package at its own price and badge while the SKU is live', async () => {
    mockPurchasePackage.mockResolvedValue(premiumCustomerInfo());
    const onDismiss = jest.fn();

    const tree = await renderSheet({ onDismiss, context: 'churned', expectPrice: '$44.99' });

    expect(textOf(tree)).toContain('25% OFF');
    expect(textOf(tree)).not.toContain('50% OFF');

    await pressByLabel(tree, 'Accept Offer');
    await waitFor(() => mockPurchasePackage.mock.calls.length > 0, 'purchase to be attempted');
    expect(mockPurchasePackage).toHaveBeenCalledWith(WINBACK_PACKAGE);
  });

  it('reports a shown offer when the person declines a real one', async () => {
    const onDismiss = jest.fn();

    const tree = await renderSheet({ onDismiss, context: 'churned', expectPrice: '$44.99' });
    await pressByLabel(tree, 'No thanks');

    expect(onDismiss).toHaveBeenCalledWith({ offerShown: true });
  });

  it('falls back to the standard annual package when the winback offering is empty', async () => {
    // Pulling unfold_yearly_winback from sale leaves the offering in place with
    // nothing in it. Without the fallback the sheet rendered only its failure
    // state, so a churned person was shown no offer at all.
    mockGetOfferings.mockResolvedValue(OFFERINGS_EMPTY_WINBACK);
    mockPurchasePackage.mockResolvedValue(premiumCustomerInfo());
    const onDismiss = jest.fn();

    const tree = await renderSheet({ onDismiss, context: 'churned', expectPrice: '$59.99' });

    expect(textOf(tree)).not.toContain('View Plans');
    // The badge has to follow the package on sale, not the context.
    expect(textOf(tree)).toContain('50% OFF');
    expect(textOf(tree)).not.toContain('25% OFF');

    await pressByLabel(tree, 'Accept Offer');
    await waitFor(() => mockPurchasePackage.mock.calls.length > 0, 'purchase to be attempted');
    expect(mockPurchasePackage).toHaveBeenCalledWith(ANNUAL_PACKAGE);
  });
});

describe('ExclusiveOfferSheet offering-failure state', () => {
  beforeEach(() => {
    mockGetOfferings.mockResolvedValue(OFFERINGS_NOTHING);
  });

  async function renderFailedSheet(onDismiss: jest.Mock) {
    const tree = await mountSheet({ onDismiss, context: 'churned' });
    await waitFor(() => textOf(tree).includes('View Plans'), 'the failure state to be reachable');
    return tree;
  }

  it('drops the offer copy when there is no offer to make', async () => {
    const tree = await renderFailedSheet(jest.fn());
    const rendered = textOf(tree);

    expect(rendered).not.toContain('Exclusive Offer');
    expect(rendered).not.toContain('You will not see this offer again.');
    expect(rendered).not.toContain('25% OFF');
    expect(rendered).not.toContain('50% OFF');
    expect(rendered).toContain('Unfold Premium');
  });

  it('leaves the once-ever offer unburned when it routes to the full paywall', async () => {
    // "View Plans" on a sheet that never made an offer used to spend the
    // person's single chance at it forever.
    const onDismiss = jest.fn();
    const tree = await renderFailedSheet(onDismiss);

    await pressByLabel(tree, 'View Plans');

    expect(onDismiss).toHaveBeenCalledTimes(1);
    expect(onDismiss).toHaveBeenCalledWith({ offerShown: false });
    expect(mockRouterPush).toHaveBeenCalledWith('/paywall');
  });

  it('escapes instead of spinning when the offerings query never runs', async () => {
    // The old check read `offeringsResult`, which is undefined for a disabled
    // query — falsy, so the sheet spun on an ActivityIndicator with the CTA
    // disabled and no escape hatch.
    mockRevenueCatEnabled = false;
    const onDismiss = jest.fn();

    const tree = await mountSheet({ onDismiss, context: 'churned' });

    expect(mockGetOfferings).not.toHaveBeenCalled();
    expect(textOf(tree)).toContain('View Plans');
    expect(tree.root.findAllByType(ActivityIndicator)).toHaveLength(0);
  });

  it('escapes when the offerings query fails outright', async () => {
    mockGetOfferings.mockRejectedValue(new Error('offerings unavailable'));
    const onDismiss = jest.fn();

    const tree = await mountSheet({ onDismiss, context: 'churned' });
    await waitFor(() => textOf(tree).includes('View Plans'), 'the failed query to surface an escape');

    expect(tree.root.findAllByType(ActivityIndicator)).toHaveLength(0);
  });
});

describe('F5 ExclusiveOfferSheet entitlement exits', () => {
  it('sends offer on purchase and restore on a plain restore', async () => {
    mockPurchasePackage.mockResolvedValue(premiumCustomerInfo());
    mockRestorePurchases.mockResolvedValue(premiumCustomerInfo());
    const onPurchaseSuccess = jest.fn();

    const purchaseTree = await renderSheet({ onDismiss: jest.fn(), onPurchaseSuccess });
    await pressByLabel(purchaseTree, 'Accept Offer');
    await waitFor(() => onPurchaseSuccess.mock.calls.length > 0, 'purchase to settle');
    expect(onPurchaseSuccess).toHaveBeenCalledWith({
      source: 'offer',
      customerInfo: premiumCustomerInfo().data,
    });

    onPurchaseSuccess.mockClear();
    const restoreTree = await renderSheet({ onDismiss: jest.fn(), onPurchaseSuccess });
    await pressByLabel(restoreTree, 'Restore purchases');
    await waitFor(() => onPurchaseSuccess.mock.calls.length > 0, 'restore to settle');
    expect(onPurchaseSuccess).toHaveBeenCalledWith({
      source: 'restore',
      customerInfo: premiumCustomerInfo().data,
    });
  });

  it('sends lateGrant when restore follows a not-activated purchase on the same mount', async () => {
    mockPurchasePackage.mockResolvedValue({
      ok: true as const,
      data: { entitlements: { active: {} } },
    });
    mockRestorePurchases.mockResolvedValue(premiumCustomerInfo());
    const onPurchaseSuccess = jest.fn();

    const tree = await renderSheet({ onDismiss: jest.fn(), onPurchaseSuccess });
    await pressByLabel(tree, 'Accept Offer');
    await waitFor(
      () => textOf(tree).includes('Purchase completed but premium was not activated'),
      'not-activated copy',
    );
    expect(onPurchaseSuccess).not.toHaveBeenCalled();

    await pressByLabel(tree, 'Restore purchases');
    await waitFor(() => onPurchaseSuccess.mock.calls.length > 0, 'late grant restore');
    expect(onPurchaseSuccess).toHaveBeenCalledWith({
      source: 'lateGrant',
      customerInfo: premiumCustomerInfo().data,
    });
  });

  it('writes pendingPaywallGrant on dismiss after not-activated when surface is set', async () => {
    const { useUIState } = require('@/lib/ui-state');
    useUIState.getState().setPendingPaywallGrant(null);
    mockPurchasePackage.mockResolvedValue({
      ok: true as const,
      data: { entitlements: { active: {} } },
    });
    const onDismiss = jest.fn();

    const tree = await renderSheet({
      onDismiss,
      surface: 'churned_sheet',
      context: 'churned',
    });
    await pressByLabel(tree, 'Accept Offer');
    await waitFor(
      () => textOf(tree).includes('Purchase completed but premium was not activated'),
      'not-activated copy',
    );
    await pressByLabel(tree, 'No thanks');

    const marker = useUIState.getState().pendingPaywallGrant;
    expect(marker).toMatchObject({
      surface: 'churned_sheet',
      entry: 'later',
    });
    expect(typeof marker?.setAtMs).toBe('number');
    expect(onDismiss).toHaveBeenCalled();
  });
});

describe('ThreeStepPaywall exclusive-offer wiring', () => {
  it('passes onPurchaseSuccess through to the exclusive-offer sheet', () => {
    const source = readFileSync(
      join(__dirname, '..', 'onboarding', 'ThreeStepPaywall.tsx'),
      'utf8',
    );
    const sheetUsage = source.slice(source.indexOf('<ExclusiveOfferSheet'));

    expect(sheetUsage).toContain('onPurchaseSuccess=');
    expect(source).toContain('handleExclusiveOfferPurchaseSuccess');
  });
});
