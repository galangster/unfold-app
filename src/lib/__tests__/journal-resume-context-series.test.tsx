/**
 * The journal screen saves a "Resume your reflection" pointer for Today. Today
 * opens it by making that series current, so a pointer to a paused series
 * read from the library switched the reader's active series and moved the
 * server's generation target. Only the current series may leave one, the same
 * rule reading.tsx applies to its own resume write. This drives the REAL
 * JournalScreen against the real store.
 */
import React from 'react';

// react-test-renderer types are not installed in this app; keep this aligned
// with the existing component-test pattern.
const renderer = require('react-test-renderer');
const { act } = renderer;

jest.mock('expo-router', () => ({
  useRouter: () => ({ canGoBack: () => true, back: jest.fn(), replace: jest.fn(), push: jest.fn() }),
  useLocalSearchParams: () => (globalThis as any).__journalParams,
  // Today-flow mount: closeJournal reads segments + the enclosing stack state.
  useSegments: () => ['(tabs)', '(today)', 'journal'],
  useNavigation: () => ({ getState: () => ({ index: 1, routes: [] }) }),
}));

jest.mock('react-native-safe-area-context', () => {
  const { View } = require('react-native');
  return {
    SafeAreaView: View,
    useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
  };
});

jest.mock('react-native-keyboard-controller', () => {
  const { ScrollView } = require('react-native');
  return { KeyboardAwareScrollView: ScrollView };
});

jest.mock('@/hooks/useAccessibility', () => ({
  useAccessibleAnimation: () => ({
    reducedMotion: true,
    entering: () => undefined,
    exiting: () => undefined,
  }),
}));

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

// The writing desk's source page reads the reader's passage.
jest.mock('@/lib/bible-api', () => ({
  fetchVerseLocal: jest.fn(async () => null),
  fetchVerse: jest.fn(async () => null),
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
  };
});

import JournalScreen from '../../app/(tabs)/(today)/journal';
import { useUnfoldStore } from '@/lib/store';

function series(id: string, title: string): any {
  return {
    id,
    title,
    totalDays: 7,
    currentDay: 3,
    createdAt: '2026-09-01T00:00:00.000Z',
    generationMode: 'progressive',
    userContext: { name: '', aboutMe: '', currentSituation: '', emotionalState: '' },
    days: [{
      id: `${id}-day-2`,
      devotionalId: id,
      dayNumber: 2,
      title: `${title} Day 2`,
      scriptureReference: 'Psalm 23',
      scriptureText: 'x',
      bodyText: 'x',
      quotableLine: 'x',
      isRead: true,
    }],
  };
}

describe('journal resume pointer', () => {
  beforeEach(() => {
    useUnfoldStore.getState().reset();
    useUnfoldStore.setState({
      devotionals: [series('active-series', 'Active'), { ...series('paused-series', 'Paused'), archivedAt: '2026-09-05T00:00:00.000Z', archivedStateAt: '2026-09-05T00:00:00.000Z' }],
      currentDevotionalId: 'active-series',
      resumeContext: null,
    });
  });

  it('is saved for the current series only, never for a paused one opened from the library', () => {
    let tree: any;
    (globalThis as any).__journalParams = { devotionalId: 'paused-series', dayNumber: '2' };
    act(() => { tree = renderer.create(<JournalScreen />); });
    expect(useUnfoldStore.getState().resumeContext).toBeNull();
    act(() => tree.unmount());

    (globalThis as any).__journalParams = { devotionalId: 'active-series', dayNumber: '2' };
    act(() => { tree = renderer.create(<JournalScreen />); });
    expect(useUnfoldStore.getState().resumeContext).toEqual({
      route: 'journal',
      devotionalId: 'active-series',
      dayNumber: 2,
      devotionalTitle: 'Active',
      dayTitle: 'Active Day 2',
    });
    expect(useUnfoldStore.getState().currentDevotionalId).toBe('active-series');
    act(() => tree.unmount());
  });
});
