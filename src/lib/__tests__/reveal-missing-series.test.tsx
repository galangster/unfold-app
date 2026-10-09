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

// Each detector renders a marker that carries whether its swipe is enabled:
// the curtain's first, then the prompt's nested inside it.
jest.mock('react-native-gesture-handler', () => {
  // Bracket access keeps the NativeWind transform off this factory.
  const mockReact = require('react');
  const pan = () => {
    const gesture: Record<string, unknown> = {};
    for (const method of ['onBegin', 'onUpdate', 'onEnd', 'onFinalize']) gesture[method] = () => gesture;
    gesture.enabled = (value: boolean) => {
      gesture.isEnabled = value;
      return gesture;
    };
    return gesture;
  };
  return {
    Gesture: { Pan: pan },
    GestureDetector: ({ gesture, children }: { gesture: { isEnabled?: boolean }; children: React.ReactNode }) => (
      mockReact['createElement']('reveal-pan', { testID: 'reveal-pan', gestureEnabled: gesture.isEnabled === true }, children)
    ),
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
const mockFlushStore = jest.fn(async () => true);
jest.mock('@/lib/store', () => ({
  ...jest.requireActual('@/lib/store'),
  flushUnfoldStorePersistAsync: () => mockFlushStore(),
}));
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

// A pull that also carries the account's series rows.
function pulledWithSeries(rows: {
  id: string;
  createdAt: string;
  archivedAt?: string | null;
  archivedStateAt?: string;
  generationMode?: 'progressive' | 'batch';
}[]) {
  // The pulled series started after the one here (a pulled shell dates
  // itself by its start).
  const pulled = pulledSeries();
  pulled.devotional.createdAt = '2026-10-09T09:00:00.000Z';
  pulled.devotional.seriesStartDate = '2026-10-09T09:00:00.000Z';
  return {
    ...pulled,
    canonicalSeries: rows.map((row) => ({ generationMode: 'progressive' as const, ...row, updatedAt: row.createdAt })),
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

function panStates(): boolean[] {
  return tree.root
    .findAll((node: any) => node.props.testID === 'reveal-pan' && typeof node.type === 'string')
    .map((node: any) => node.props.gestureEnabled);
}

function layOut(viewport: number, content: number) {
  const scroll = tree.root.findAll((node: any) => typeof node.props.onContentSizeChange === 'function')[0];
  act(() => {
    scroll.props.onLayout({ nativeEvent: { layout: { height: viewport } } });
    scroll.props.onContentSizeChange(0, content);
  });
}

function pressReveal() {
  act(() => tree.root.findByProps({ accessibilityLabel: "Reveal today's reading" }).props.onPress());
}

describe('reveal for a series this device does not hold yet', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockFlushStore.mockImplementation(async () => true);
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

  it('makes the pulled series current only when the server would pick it', async () => {
    // The pull brings a series newer than the one here: it is the winner.
    mockPullDevotionalContent.mockResolvedValueOnce(pulledWithSeries([
      { id: LOCAL_ID, createdAt: NOW },
      { id: PULLED_ID, createdAt: '2026-10-09T09:00:00.000Z' },
    ]));
    await openReadyPush(PULLED_ID);
    pressReveal();
    expect(useUnfoldStore.getState().currentDevotionalId).toBe(PULLED_ID);
    expect(mockRouterReplace.mock.calls[0][0].params.readOnly).toBeUndefined();
    act(() => tree.unmount());
    tree = null;

    // An older push: the account has a newer series this device lacks, so the
    // pulled one opens read-only and Today keeps its series.
    jest.clearAllMocks();
    useUnfoldStore.setState({ devotionals: [localSeries], currentDevotionalId: LOCAL_ID, resumeContext: null });
    mockPullDevotionalContent.mockResolvedValueOnce(pulledWithSeries([
      { id: LOCAL_ID, createdAt: NOW },
      { id: PULLED_ID, createdAt: '2026-10-09T09:00:00.000Z' },
      { id: 'newest-series', createdAt: '2026-10-09T10:00:00.000Z' },
    ]));
    await openReadyPush(PULLED_ID);
    pressReveal();
    expect(useUnfoldStore.getState().currentDevotionalId).toBe(LOCAL_ID);
    expect(mockRouterReplace.mock.calls[0][0]).toEqual({
      pathname: '/(tabs)/(today)/reading',
      params: { devotionalId: PULLED_ID, dayNumber: '1', readOnly: '1' },
    });
  });

  it('keeps Today on a held series that was resumed elsewhere after the pushed one began', async () => {
    // This device holds a paused series. Another device resumed it after the
    // pushed series started; only the pull carries that newer clock.
    const paused = {
      ...localSeries,
      id: 'paused-series',
      createdAt: '2026-10-08T06:00:00.000Z',
      seriesStartDate: '2026-10-08T06:00:00.000Z',
      archivedAt: '2026-10-08T07:00:00.000Z',
      archivedStateAt: '2026-10-08T07:00:00.000Z',
    } as unknown as Devotional;
    useUnfoldStore.setState({ devotionals: [localSeries, paused], currentDevotionalId: LOCAL_ID, resumeContext: null });
    mockPullDevotionalContent.mockResolvedValueOnce(pulledWithSeries([
      { id: LOCAL_ID, createdAt: NOW },
      { id: PULLED_ID, createdAt: '2026-10-09T09:00:00.000Z' },
      { id: 'paused-series', createdAt: '2026-10-08T06:00:00.000Z', archivedAt: null, archivedStateAt: '2026-10-09T10:00:00.000Z' },
    ]));
    await openReadyPush(PULLED_ID);
    pressReveal();

    expect(useUnfoldStore.getState().currentDevotionalId).toBe(LOCAL_ID);
    expect(mockRouterReplace.mock.calls[0][0].params.readOnly).toBe('1');
  });

  it('keeps the pulled rows when saving the pull fails', async () => {
    mockFlushStore.mockImplementation(async () => { throw new Error('disk full'); });
    mockPullDevotionalContent.mockResolvedValueOnce(pulledWithSeries([
      { id: LOCAL_ID, createdAt: NOW },
      { id: PULLED_ID, createdAt: '2026-10-09T09:00:00.000Z' },
      { id: 'newest-series', createdAt: '2026-10-09T10:00:00.000Z' },
    ]));
    await openReadyPush(PULLED_ID);
    pressReveal();

    expect(mockCommitDevotionalPullCursor).not.toHaveBeenCalled();
    expect(useUnfoldStore.getState().currentDevotionalId).toBe(LOCAL_ID);
    expect(mockRouterReplace.mock.calls[0][0].params.readOnly).toBe('1');
  });

  it.each([['batch' as const], [undefined]])('judges the pushed series by the server copy (mode %s), not the shell built from it', async (generationMode) => {
    // The server holds it as a batch series, or without a mode; the shell
    // from the pull is marked progressive. Only a progressive series can
    // become current.
    mockPullDevotionalContent.mockResolvedValueOnce(pulledWithSeries([
      { id: LOCAL_ID, createdAt: NOW },
      { id: PULLED_ID, createdAt: '2026-10-09T09:00:00.000Z', generationMode },
    ]));
    await openReadyPush(PULLED_ID);
    pressReveal();

    expect(useUnfoldStore.getState().currentDevotionalId).toBe(LOCAL_ID);
    expect(mockRouterReplace.mock.calls[0][0].params.readOnly).toBe('1');
  });

  it('judges the pushed series by a newer resume a sync lands after the pull', async () => {
    // The pull saw the series paused; a full sync then lands its newer resume
    // before the reader lifts the curtain.
    const pausedAt = '2026-10-09T10:00:00.000Z';
    const pulled = pulledWithSeries([
      { id: LOCAL_ID, createdAt: NOW },
      { id: PULLED_ID, createdAt: '2026-10-09T09:00:00.000Z', archivedAt: pausedAt, archivedStateAt: pausedAt },
    ]);
    Object.assign(pulled.devotional, { archivedAt: pausedAt, archivedStateAt: pausedAt });
    mockPullDevotionalContent.mockResolvedValueOnce(pulled);
    await openReadyPush(PULLED_ID);
    act(() => {
      useUnfoldStore.setState((state) => ({
        devotionals: state.devotionals.map((row) => (row.id === PULLED_ID
          ? { ...row, archivedAt: null, archivedStateAt: '2026-10-09T11:00:00.000Z' }
          : row)),
      }));
    });
    pressReveal();

    expect(useUnfoldStore.getState().currentDevotionalId).toBe(PULLED_ID);
    expect(mockRouterReplace.mock.calls[0][0].params.readOnly).toBeUndefined();
  });

  it('holds both swipes while the pull is out, then frees the one the layout uses', async () => {
    let resolvePull: (value: ReturnType<typeof pulledSeries>) => void = () => {};
    mockPullDevotionalContent.mockImplementation(() => new Promise((resolve) => { resolvePull = resolve; }));
    await openReadyPush(PULLED_ID);
    expect(panStates()).toEqual([false, false]);

    // Content taller than the screen moves the swipe to the prompt.
    layOut(500, 900);
    expect(panStates()).toEqual([false, false]);

    await act(async () => { resolvePull(pulledSeries()); });
    await settle();
    expect(panStates()).toEqual([false, true]);

    layOut(500, 300);
    expect(panStates()).toEqual([true, false]);
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
