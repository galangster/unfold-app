/**
 * store.ts registers its persist-flush AppState listener at module load —
 * before any screen mounts — so on background it runs FIRST. The journal's
 * own listener then flushed its autosave into the store, and that set() only
 * re-armed the 1000 ms coalescing debounce (WR-23): a force-kill inside that
 * window lost the last typing locally, even though the app had been given a
 * chance to persist. The writing surfaces now flush the store's pending
 * persist themselves, at the end of their AppState handler.
 */
import React from 'react';
import { AppState, TextInput } from 'react-native';

// react-test-renderer types are not installed in this app; keep this aligned
// with the existing component-test pattern.
const renderer = require('react-test-renderer');
const { act } = renderer;

jest.mock('expo-router', () => ({
  useRouter: () => ({ back: jest.fn(), replace: jest.fn(), push: jest.fn() }),
  useLocalSearchParams: () => ({ devotionalId: 'dev-1', dayNumber: '1' }),
  // Today-flow mount: closeJournal reads segments + the enclosing stack state.
  useSegments: () => ['(tabs)', '(today)', 'journal'],
  useNavigation: () => ({ getState: () => ({ index: 1, routes: [] }) }),
}));

jest.mock('react-native-safe-area-context', () => {
  const { View } = require('react-native');
  return { SafeAreaView: View };
});

jest.mock('react-native-keyboard-controller', () => {
  const { ScrollView } = require('react-native');
  return { KeyboardAwareScrollView: ScrollView };
});

jest.mock('react-native-reanimated', () => {
  const { View, Text: RNText } = require('react-native');
  const chainable = () => {
    const anim: Record<string, unknown> = {};
    for (const method of ['duration', 'delay', 'easing', 'springify', 'damping', 'build']) {
      anim[method] = () => anim;
    }
    return anim;
  };
  return {
    __esModule: true,
    default: { View, Text: RNText, createAnimatedComponent: (c: unknown) => c },
    FadeIn: chainable(),
    FadeInDown: chainable(),
    FadeOut: chainable(),
    Easing: { out: () => 'out', in: () => 'in', inOut: () => 'inOut', cubic: 'cubic' },
    useSharedValue: (value: unknown) => ({ value }),
    useAnimatedStyle: () => ({}),
    withSpring: (value: unknown) => value,
    withTiming: (value: unknown) => value,
    withSequence: (value: unknown) => value,
    withDelay: (_delay: number, value: unknown) => value,
    interpolateColor: () => '#000000',
    useReducedMotion: () => true,
  };
});

jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(),
  notificationAsync: jest.fn(),
  ImpactFeedbackStyle: { Light: 'light', Medium: 'medium' },
  NotificationFeedbackType: { Success: 'success', Warning: 'warning', Error: 'error' },
}));

// Every icon renders as a host component named after itself.
jest.mock('@/components/icons', () =>
  new Proxy({}, { get: (_target, prop) => (typeof prop === 'string' ? prop : undefined) }),
);

jest.mock('@/lib/theme', () => ({
  useTheme: () => ({
    colors: new Proxy({}, { get: (_target, prop) => (typeof prop === 'string' ? '#888888' : undefined) }),
    isDark: true,
  }),
}));

jest.mock('@/lib/network-error-handler', () => ({ isOnline: jest.fn(async () => true) }));
jest.mock('@/lib/api-config', () => ({
  PRIMARY_BACKEND_URL: 'https://api.example.test',
  getAuthHeaders: jest.fn(async () => ({ 'Content-Type': 'application/json' })),
  sanitizeForPrompt: (value: string) => value,
}));
jest.mock('@/lib/rate-limit', () => ({
  checkRateLimit: jest.fn(async () => ({ allowed: true })),
  incrementRateLimit: jest.fn(),
}));
jest.mock('@/lib/logger', () => ({ logger: { log: jest.fn(), warn: jest.fn(), error: jest.fn() } }));
jest.mock('@/components/PremiumFeatureSheet', () => ({ PremiumFeatureSheet: () => null }));
jest.mock('@/components/ExclusiveOfferSheet', () => ({ ExclusiveOfferSheet: () => null }));
jest.mock('@/components/VoiceInputBar', () => ({ VoiceInputBar: () => null }));
jest.mock('@/components/ui', () => ({ alpha: (color: string) => color }));
jest.mock('@/hooks/useCreationGate', () => ({
  useCreationGate: () => ({ gate: () => true, showExclusiveOffer: false, dismissOffer: jest.fn() }),
}));
jest.mock('@/hooks/usePremiumAccessPolicy', () => ({ usePremiumAccessPolicy: () => 'granted' }));
jest.mock('@react-native-community/netinfo', () => ({ addEventListener: jest.fn(() => jest.fn()) }));
jest.mock('@/lib/bug-logger', () => ({ logBugError: jest.fn() }));
jest.mock('@/lib/sync-ids', () => ({
  newId: jest.fn(() => `test-id-${Math.random().toString(36).slice(2, 8)}`),
  compositeId: jest.fn((...parts: unknown[]) => parts.join(':')),
}));
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
    __store: store,
  };
});

import JournalScreen from '../../app/(tabs)/(today)/journal';
import { STORE_PERSIST_DEBOUNCE_MS } from '@/lib/debounced-persist-storage';
import { useUnfoldStore } from '@/lib/store';
import { peekSyncOutbox } from '@/lib/sync-outbox';

const mmkv = (jest.requireMock('@/lib/mmkv-storage') as { __store: Map<string, string> }).__store;
const persistedBlob = () => mmkv.get('unfold-storage') ?? '';

const DEVOTIONAL: any = {
  id: 'dev-1',
  title: 'Test Series',
  totalDays: 3,
  currentDay: 1,
  createdAt: '2026-09-01T00:00:00.000Z',
  generationMode: 'batch',
  userContext: { name: '', aboutMe: '', currentSituation: '', emotionalState: '' },
  days: [
    {
      id: 'd1',
      devotionalId: 'dev-1',
      dayNumber: 1,
      title: 'Day 1',
      scriptureReference: 'Psalm 23',
      scriptureText: 'x',
      bodyText: 'x',
      quotableLine: 'x',
      isRead: true,
      reflectionQuestions: [],
    },
  ],
};

const TYPED = 'words typed just before the app was killed';

/** Every AppState listener, in registration order: store.ts first, then screens. */
const appStateListeners = () =>
  (AppState.addEventListener as jest.Mock).mock.calls.map((call: unknown[]) => call[1] as (s: string) => void);

describe('backgrounding the journal while typing', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    mmkv.clear();
    useUnfoldStore.getState().reset();
    useUnfoldStore.setState({ devotionals: [DEVOTIONAL], currentDevotionalId: 'dev-1' });
    act(() => { jest.advanceTimersByTime(STORE_PERSIST_DEBOUNCE_MS + 10); }); // settle the seeding writes
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('lands the last typing on disk before the app can be killed', () => {
    // store.ts registered its persist flush at module load, before any screen.
    expect(jest.isMockFunction(AppState.addEventListener)).toBe(true);
    expect(appStateListeners().length).toBeGreaterThanOrEqual(1);

    let tree: any;
    act(() => { tree = renderer.create(<JournalScreen />); });
    const input = tree.root.findAll(
      (node: any) => node.type === TextInput && node.props.accessibilityLabel === 'Journal entry',
    )[0];
    act(() => { input.props.onChangeText(TYPED); });
    act(() => { jest.advanceTimersByTime(100); }); // still inside the 800 ms autosave debounce
    expect(persistedBlob()).not.toContain(TYPED);

    // iOS 'inactive' → every listener runs, in registration order.
    act(() => { for (const listener of appStateListeners()) listener('inactive'); });

    expect(useUnfoldStore.getState().journalEntries[0]?.content).toBe(TYPED); // autosave flushed into the store
    expect(peekSyncOutbox().some((c) => c.table === 'journal_entries' && c.data.content === TYPED)).toBe(true);
    expect(persistedBlob()).toContain(TYPED); // …and onto disk, with no further debounce window
    act(() => tree.unmount());
  });

  it('writes nothing when neither the screen nor the store has anything pending', () => {
    let tree: any;
    act(() => { tree = renderer.create(<JournalScreen />); });
    // Let the mount's own store writes (resumeContext) settle to disk first.
    act(() => { jest.advanceTimersByTime(STORE_PERSIST_DEBOUNCE_MS + 10); });
    const before = persistedBlob();
    expect(before).not.toBe('');

    act(() => { for (const listener of appStateListeners()) listener('inactive'); });

    expect(persistedBlob()).toBe(before);
    expect(useUnfoldStore.getState().journalEntries).toHaveLength(0); // no empty entry created
    act(() => tree.unmount());
  });
});
