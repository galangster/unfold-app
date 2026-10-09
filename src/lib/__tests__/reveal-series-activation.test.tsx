/**
 * A "Day N is ready" push can outlive the series it names: iOS keeps it in
 * Notification Center after the reader starts another series. Tapping it made
 * that series current, and for an archived series it also unarchived it, so
 * the server generated the old series and refused the reader's live one.
 * The reveal may activate only the current series or the strict active winner
 * (a series that just landed). Anything else opens as a paused, read-only
 * view. This drives the REAL RevealScreen against the real store.
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

/* eslint-disable import/first -- imports must run after the module mocks are registered. */
import RevealScreen from '../../app/reveal';
import { useUnfoldStore, type Devotional } from '@/lib/store';
import { peekSyncOutbox, replaceSyncOutbox } from '@/lib/sync-outbox';
/* eslint-enable import/first */

const LIVE_ID = 'live-series';
const ARCHIVED_AT = '2026-09-19T12:00:00.000Z';

function series(id: string, createdAt: string, currentDay: number, overrides: Partial<Devotional> = {}): Devotional {
  return {
    id,
    title: `Series ${id}`,
    totalDays: 7,
    currentDay,
    createdAt,
    seriesStartDate: createdAt,
    updatedAt: createdAt,
    generationMode: 'progressive',
    userContext: { name: '', aboutMe: '', currentSituation: '', emotionalState: '' },
    days: Array.from({ length: currentDay }, (_, index) => ({
      id: `${id}-day-${index + 1}`,
      devotionalId: id,
      dayNumber: index + 1,
      title: `Day ${index + 1}`,
      scriptureReference: 'Psalm 23',
      scriptureText: 'x',
      bodyText: 'x',
      quotableLine: 'x',
      isRead: index + 1 < currentDay,
      ...(index + 1 < currentDay ? { readAt: createdAt } : {}),
    })),
    ...overrides,
  } as Devotional;
}

const FIXTURES = {
  // The series the reader left with "Start a new series".
  archived: series('archived-series', '2026-08-01T00:00:00.000Z', 5, { archivedAt: ARCHIVED_AT, archivedStateAt: ARCHIVED_AT }),
  // Left unarchived when the next series started from the completion card.
  outranked: series('outranked-series', '2026-08-01T00:00:00.000Z', 5),
  current: series(LIVE_ID, '2026-09-20T00:00:00.000Z', 2),
  // Created on another device after the live series; the server picks it.
  landed: series('landed-series', '2026-10-06T00:00:00.000Z', 1),
};

function openReadyPush(target: Devotional) {
  replaceSyncOutbox([]);
  mockRouterReplace.mockClear();
  useUnfoldStore.setState({
    devotionals: Object.values(FIXTURES),
    currentDevotionalId: LIVE_ID,
    resumeContext: null,
  });
  mockRevealParams = {
    devotionalId: target.id,
    dayNumber: String(target.currentDay),
    seriesTitle: target.title,
    dayTitle: `Day ${target.currentDay}`,
    totalDays: String(target.totalDays),
  };
  let tree: any;
  act(() => { tree = renderer.create(<RevealScreen />); });
  act(() => tree.root.findByProps({ accessibilityLabel: "Reveal today's reading" }).props.onPress());
  act(() => tree.unmount());
  const state = useUnfoldStore.getState();
  return {
    currentDevotionalId: state.currentDevotionalId,
    archivedAt: state.devotionals.find((row) => row.id === target.id)?.archivedAt,
    queuedSeries: peekSyncOutbox().filter((change) => change.table === 'devotionals').map((change) => change.id),
    resumeSeries: state.resumeContext?.devotionalId ?? null,
    route: mockRouterReplace.mock.calls.at(-1)?.[0],
  };
}

function readingRoute(target: Devotional, readOnly?: '1') {
  return {
    pathname: '/(tabs)/(today)/reading',
    params: { devotionalId: target.id, dayNumber: String(target.currentDay), ...(readOnly ? { readOnly } : {}) },
  };
}

describe('reveal series activation', () => {
  beforeEach(() => {
    useUnfoldStore.getState().reset();
  });

  it('activates a ready push only for the current series or the strict active winner', () => {
    expect(openReadyPush(FIXTURES.archived)).toEqual({
      currentDevotionalId: LIVE_ID,
      archivedAt: ARCHIVED_AT,
      queuedSeries: [],
      resumeSeries: null,
      route: readingRoute(FIXTURES.archived, '1'),
    });
    expect(openReadyPush(FIXTURES.outranked)).toEqual({
      currentDevotionalId: LIVE_ID,
      archivedAt: undefined,
      queuedSeries: [],
      resumeSeries: null,
      route: readingRoute(FIXTURES.outranked, '1'),
    });
    expect(openReadyPush(FIXTURES.current)).toEqual({
      currentDevotionalId: LIVE_ID,
      archivedAt: undefined,
      queuedSeries: [],
      resumeSeries: LIVE_ID,
      route: readingRoute(FIXTURES.current),
    });
    expect(openReadyPush(FIXTURES.landed)).toEqual({
      currentDevotionalId: FIXTURES.landed.id,
      archivedAt: undefined,
      queuedSeries: [],
      resumeSeries: FIXTURES.landed.id,
      route: readingRoute(FIXTURES.landed),
    });
  });
});
