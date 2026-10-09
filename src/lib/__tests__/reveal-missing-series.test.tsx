/**
 * A ready push can reach a device before the series it names. The reveal
 * pulls that series once before it sends the reader to Today.
 */
import React from 'react';

// react-test-renderer types are not installed in this app; keep this aligned
// with the existing component-test pattern.
const renderer = require('react-test-renderer');
const { act } = renderer;

const mockRouterReplace = jest.fn();
let mockRevealParams: Record<string, string> = {};

jest.mock('expo-router', () => ({
  useRouter: () => ({ replace: mockRouterReplace, push: jest.fn() }),
  useLocalSearchParams: () => mockRevealParams,
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));

jest.mock('react-native-reanimated', () => {
  const { View, Text } = require('react-native');
  const chainable = () => {
    const anim: Record<string, unknown> = {};
    for (const method of ['duration', 'delay', 'easing']) anim[method] = () => anim;
    return anim;
  };
  return {
    __esModule: true,
    default: { View, Text },
    FadeIn: chainable(),
    Easing: { out: () => 'out', in: () => 'in', inOut: () => 'inOut', cubic: 'cubic', ease: 'ease' },
    useSharedValue: (value: unknown) => ({ value }),
    useAnimatedStyle: () => ({}),
    withRepeat: (value: unknown) => value,
    withTiming: (value: unknown) => value,
    withDelay: (_delay: number, value: unknown) => value,
    withSpring: (value: unknown) => value,
    runOnJS: (fn: (...args: unknown[]) => unknown) => fn,
    cancelAnimation: () => undefined,
  };
});

jest.mock('react-native-gesture-handler', () => {
  const pan = () => {
    const gesture: Record<string, unknown> = {};
    for (const method of ['enabled', 'onBegin', 'onUpdate', 'onEnd', 'onFinalize']) gesture[method] = () => gesture;
    return gesture;
  };
  return {
    Gesture: { Pan: pan },
    GestureDetector: ({ children }: { children: React.ReactNode }) => children,
  };
});

jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(),
  notificationAsync: jest.fn(),
  selectionAsync: jest.fn(),
  ImpactFeedbackStyle: { Light: 'light', Medium: 'medium' },
  NotificationFeedbackType: { Success: 'success' },
}));

jest.mock('@/components/icons', () => ({ CaretUp: () => null }));
jest.mock('@/components/ScatterTitle', () => ({ ScatterTitle: () => null }));
jest.mock('@/components/ShimmerText', () => ({ ShimmerText: () => null }));
jest.mock('@/components/reveal/RevealBackdrop', () => ({ RevealBackdrop: () => null }));
jest.mock('@/hooks/useSuccessRevealCue', () => ({ useSuccessRevealCue: () => undefined }));
jest.mock('@/hooks/useRevealActivity', () => ({ useRevealActivity: () => true }));
jest.mock('@/hooks/useAccessibility', () => ({ useAccessibleAnimation: () => ({ reducedMotion: true }) }));
jest.mock('@/lib/theme', () => ({
  useTheme: () => ({
    colors: new Proxy({}, { get: (_target, prop) => (typeof prop === 'string' ? '#888888' : undefined) }),
    isDark: true,
  }),
}));
jest.mock('@/lib/day-unlock-telemetry', () => ({ reportReadyPushForLockedDay: jest.fn() }));
// The reveal pulls a series it does not hold; the sync module reads the app version.
jest.mock('expo-application', () => ({ nativeApplicationVersion: '1.0.0', nativeBuildVersion: '1' }));
jest.mock('@/lib/logger', () => ({ logger: { log: jest.fn(), warn: jest.fn(), error: jest.fn() } }));
jest.mock('@/lib/bug-logger', () => ({ logBugError: jest.fn(), logBugEvent: jest.fn() }));
jest.mock('@/lib/mmkv-storage', () => {
  const store = new Map<string, string>();
  return {
    mmkvStorage: {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => { store.set(key, value); },
      removeItem: (key: string) => { store.delete(key); },
    },
    getDeviceId: () => 'test-device-id',
    getSharedEncryptionKey: () => 'test-key',
    isRecoverySession: () => false,
  };
});

const mockPullDevotionalContent = jest.fn();
const mockCommitDevotionalPullCursor = jest.fn();
jest.mock('@/lib/devotional-sync-pull', () => ({
  ...jest.requireActual('@/lib/devotional-sync-pull'),
  pullDevotionalContent: (...args: unknown[]) => mockPullDevotionalContent(...args),
  commitDevotionalPullCursor: (...args: unknown[]) => mockCommitDevotionalPullCursor(...args),
}));

/* eslint-disable import/first -- imports must run after the module mocks are registered. */
import RevealScreen from '../../app/reveal';
import { useUnfoldStore, type Devotional } from '@/lib/store';
import { REVEAL_SERIES_PULL_TIMEOUT_MS } from '@/lib/reveal-params';
/* eslint-enable import/first */

const LOCAL_ID = 'local-series';
const PULLED_ID = 'other-device-series';
const NOW = '2026-10-09T08:00:00.000Z';

const localSeries = {
  id: LOCAL_ID,
  title: 'Series here',
  totalDays: 7,
  currentDay: 1,
  createdAt: NOW,
  seriesStartDate: NOW,
  updatedAt: NOW,
  generationMode: 'progressive',
  userContext: { name: '', aboutMe: '', currentSituation: '', emotionalState: '' },
  days: [],
} as unknown as Devotional;

// What the server holds: the series another device started, with Day 1.
function pulledSeries() {
  return {
    devotional: {
      id: PULLED_ID,
      title: 'Series from the other device',
      totalDays: 7,
      currentDay: 1,
      createdAt: NOW,
      seriesStartDate: NOW,
      updatedAt: NOW,
      generationMode: 'progressive' as const,
    },
    days: [{
      id: `${PULLED_ID}-day-1`,
      devotionalId: PULLED_ID,
      dayNumber: 1,
      title: 'Day 1',
      scriptureReference: 'Psalm 23',
      scriptureText: 'x',
      bodyText: 'x',
      quotableLine: 'x',
      isRead: false,
    }],
    timestamp: NOW,
  };
}

function nothingPulled() {
  return { days: [], timestamp: NOW };
}

async function settle() {
  await act(async () => {
    for (let i = 0; i < 6; i++) await Promise.resolve();
  });
}

let tree: any = null;

async function openReadyPush(devotionalId: string, dayNumber = '1') {
  mockRevealParams = {
    devotionalId,
    dayNumber,
    seriesTitle: 'Series from the other device',
    dayTitle: 'Day 1',
    totalDays: '7',
  };
  await act(async () => { tree = renderer.create(<RevealScreen />); });
  await settle();
}

function pressReveal() {
  act(() => tree.root.findByProps({ accessibilityLabel: "Reveal today's reading" }).props.onPress());
}

describe('reveal for a series this device does not hold yet', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useUnfoldStore.getState().reset();
    useUnfoldStore.setState({ devotionals: [localSeries], currentDevotionalId: LOCAL_ID, resumeContext: null });
  });

  afterEach(() => {
    if (tree) act(() => tree.unmount());
    tree = null;
  });

  it('pulls the series and opens its reading', async () => {
    let resolvePull: (value: ReturnType<typeof pulledSeries>) => void = () => {};
    mockPullDevotionalContent.mockImplementation(() => new Promise((resolve) => { resolvePull = resolve; }));
    await openReadyPush(PULLED_ID);

    expect(mockPullDevotionalContent).toHaveBeenCalledTimes(1);
    expect(mockPullDevotionalContent).toHaveBeenCalledWith(PULLED_ID, { timeoutMs: REVEAL_SERIES_PULL_TIMEOUT_MS });
    // The curtain holds while the pull is out.
    pressReveal();
    expect(mockRouterReplace).not.toHaveBeenCalled();

    await act(async () => { resolvePull(pulledSeries()); });
    await settle();
    expect(useUnfoldStore.getState().devotionals.some((row) => row.id === PULLED_ID)).toBe(true);
    expect(mockCommitDevotionalPullCursor).toHaveBeenCalledTimes(1);
    expect(mockRouterReplace).not.toHaveBeenCalled();

    pressReveal();
    expect(mockRouterReplace).toHaveBeenCalledTimes(1);
    expect(mockRouterReplace.mock.calls[0][0]).toEqual(expect.objectContaining({
      pathname: '/(tabs)/(today)/reading',
      params: expect.objectContaining({ devotionalId: PULLED_ID, dayNumber: '1' }),
    }));
  });

  it('sends the reader to Today once when the pull fails or finds nothing', async () => {
    mockPullDevotionalContent.mockRejectedValueOnce(new Error('Network request failed'));
    await openReadyPush(PULLED_ID);
    expect(mockPullDevotionalContent).toHaveBeenCalledTimes(1);
    expect(mockRouterReplace.mock.calls).toEqual([['/(tabs)/(today)']]);
    act(() => tree.unmount());
    tree = null;

    jest.clearAllMocks();
    mockPullDevotionalContent.mockResolvedValueOnce(nothingPulled());
    await openReadyPush(PULLED_ID);
    expect(mockPullDevotionalContent).toHaveBeenCalledTimes(1);
    expect(mockCommitDevotionalPullCursor).toHaveBeenCalledTimes(1);
    expect(mockRouterReplace.mock.calls).toEqual([['/(tabs)/(today)']]);
  });

  it('does not pull for a series already here whose day is out of range', async () => {
    await openReadyPush(LOCAL_ID, '99');
    expect(mockPullDevotionalContent).not.toHaveBeenCalled();
    expect(mockRouterReplace.mock.calls).toEqual([['/(tabs)/(today)']]);
  });
});
