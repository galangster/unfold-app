/**
 * The exclusive-offer sheet is a real purchase surface. Before this cover, a
 * purchase completed inside it only closed the sheet, so a person who paid
 * during onboarding stayed on the paywall. A grant must reach the host's
 * onPurchaseSuccess; a plain dismissal must keep the old behaviour.
 */

import React from 'react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ExclusiveOfferSheet } from '../ExclusiveOfferSheet';

const renderer = require('react-test-renderer');
const { act } = renderer;

const mockGetOfferings = jest.fn();
const mockPurchasePackage = jest.fn();
const mockRestorePurchases = jest.fn();
const mockUpdateUser = jest.fn();

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
      const [state, setState] = ReactModule.useState({ data: undefined, isLoading: true });
      ReactModule.useEffect(() => {
        if (enabled === false) return undefined;
        let cancelled = false;
        Promise.resolve(queryFn()).then((data: unknown) => {
          if (!cancelled) setState({ data, isLoading: false });
        });
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
  isRevenueCatEnabled: () => true,
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

jest.mock('expo-router', () => ({ useRouter: () => ({ push: jest.fn() }) }));

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

const OFFERINGS_OK = {
  ok: true as const,
  data: { current: { availablePackages: [ANNUAL_PACKAGE] }, all: {} },
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

async function renderSheet(props: {
  onDismiss: jest.Mock;
  onPurchaseSuccess?: jest.Mock;
}) {
  let tree: any;
  await act(async () => {
    tree = renderer.create(<ExclusiveOfferSheet visible context="onboarding" {...props} />);
  });
  // Wait until the offerings query resolved the target package — the CTA is a
  // no-op until it exists, which silently passed empty assertions before.
  mounted.push(tree);
  await waitFor(
    () => JSON.stringify(tree.toJSON()).includes('$59.99'),
    'offerings to resolve the annual package',
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

describe('ExclusiveOfferSheet purchase outcomes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetOfferings.mockResolvedValue(OFFERINGS_OK);
  });

  afterEach(async () => {
    await act(async () => {
      for (const tree of mounted.splice(0)) {
        tree.unmount();
      }
    });
  });

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
