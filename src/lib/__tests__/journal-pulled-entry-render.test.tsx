/**
 * Render proof for the sync-restored journal entry: the REAL JournalScreen
 * and JournalDetailScreen must open an entry whose soap_responses column was
 * NULL on the server. Before the fix the pull mapped that column to `{}` and
 * both screens threw `.trim` on undefined into the root error boundary.
 */
import React from 'react';

// react-test-renderer types are not installed in this app; keep this aligned
// with the existing component-test pattern.
const renderer = require('react-test-renderer');
const { act } = renderer;

jest.mock('expo-router', () => ({
  useRouter: () => ({ back: jest.fn(), replace: jest.fn(), push: jest.fn() }),
  // JournalScreen reads devotionalId/dayNumber; JournalDetailScreen reads entryId.
  useLocalSearchParams: () => ({ devotionalId: 'dev-1', dayNumber: '1', entryId: 'journal-remote-1' }),
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
  };
});

import JournalScreen from '../../app/(tabs)/(today)/journal';
import JournalDetailScreen from '../../app/(tabs)/(today)/journal-detail';
import { applyPulledUserData } from '@/lib/full-sync-pull';
import { useUnfoldStore } from '@/lib/store';

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

/** A freewrite row exactly as /api/sync/pull returns it: soap_responses is NULL. */
const SERVER_FREEWRITE_ROW = {
  id: 'journal-remote-1',
  data: {
    id: 'journal-remote-1',
    clerkUserId: 'user-1',
    devotionalId: 'dev-1',
    dayNumber: 1,
    content: 'Restored freewrite text from the server',
    journalMode: 'freewrite',
    soapResponses: null,
    questionResponses: null,
    prayerRequests: null,
    deeperQuestions: null,
    createdAt: '2026-09-01T10:00:00.000Z',
    updatedAt: '2026-09-01T10:00:00.000Z',
    clientUpdatedAt: '2026-09-01T10:00:00.000Z',
    deletedAt: null,
  },
  updatedAt: '2026-09-01T10:00:00.000Z',
  deleted: false,
};

function pullServerEntry() {
  applyPulledUserData({
    changes: { journal_entries: [SERVER_FREEWRITE_ROW] },
    timestamp: '2026-09-01T10:00:01.000Z',
  });
}

describe('journal screens with a sync-restored entry', () => {
  let errorSpy: jest.SpyInstance;

  beforeEach(() => {
    useUnfoldStore.getState().reset();
    useUnfoldStore.setState({ devotionals: [DEVOTIONAL], currentDevotionalId: 'dev-1' });
    errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    errorSpy.mockRestore();
  });

  it('renders the editor for a locally created freewrite entry (control)', () => {
    useUnfoldStore.getState().addJournalEntry({
      devotionalId: 'dev-1',
      dayNumber: 1,
      content: 'local',
      journalMode: 'freewrite',
    });
    let tree: any;
    expect(() => act(() => { tree = renderer.create(<JournalScreen />); })).not.toThrow();
    act(() => tree.unmount());
  });

  it('renders the editor for the same entry restored via a sync pull', () => {
    pullServerEntry();
    let tree: any;
    expect(() => act(() => { tree = renderer.create(<JournalScreen />); })).not.toThrow();
    const input = tree.root.findAll(
      (node: any) => node.props.accessibilityLabel === 'Journal entry' && typeof node.type !== 'string',
    )[0];
    expect(input.props.value).toBe('Restored freewrite text from the server');
    act(() => tree.unmount());
  });

  it('keeps rendering when the pull lands while the editor is open', () => {
    let tree: any;
    act(() => { tree = renderer.create(<JournalScreen />); });
    expect(() => act(() => { pullServerEntry(); })).not.toThrow();
    act(() => tree.unmount());
  });

  it('renders journal-detail for the restored entry', () => {
    pullServerEntry();
    let tree: any;
    expect(() => act(() => { tree = renderer.create(<JournalDetailScreen />); })).not.toThrow();
    const texts = tree.root
      .findAll((node: any) => typeof node.type !== 'string' && node.props.children === 'Restored freewrite text from the server');
    expect(texts.length).toBeGreaterThan(0);
    act(() => tree.unmount());
  });
});
