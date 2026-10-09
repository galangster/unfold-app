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
  useRouter: () => ({ canGoBack: () => true, back: jest.fn(), replace: jest.fn(), push: jest.fn() }),
  // JournalScreen reads devotionalId/dayNumber; JournalDetailScreen reads entryId.
  useLocalSearchParams: () => ({ devotionalId: 'dev-1', dayNumber: '1', entryId: 'journal-remote-1' }),
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
import JournalDetailScreen from '../../app/(tabs)/(today)/journal-detail';
import { applyPulledUserData } from '@/lib/full-sync-pull';
import { mmkvStorage } from '@/lib/mmkv-storage';
import { useUnfoldStore } from '@/lib/store';
import { OUTBOX_KEY } from '@/lib/sync-outbox';
import { canonicalJournalEntryId } from '@/lib/journal-entry-merge';

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
    // A real reset clears the store and the outbox together.
    useUnfoldStore.getState().reset();
    mmkvStorage.removeItem(OUTBOX_KEY);
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

describe('the journal editor when a merge moves its entry', () => {
  beforeEach(() => {
    // A real reset clears the store and the outbox together.
    useUnfoldStore.getState().reset();
    mmkvStorage.removeItem(OUTBOX_KEY);
    useUnfoldStore.setState({ devotionals: [DEVOTIONAL], currentDevotionalId: 'dev-1' });
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('saves typing still pending when the entry moved to its canonical id, and keeps the merged-in writing', () => {
    const legacyId = useUnfoldStore.getState().addJournalEntry({
      devotionalId: 'dev-1',
      dayNumber: 1,
      content: 'Before the merge.',
      journalMode: 'freewrite',
    });
    let tree: any;
    act(() => { tree = renderer.create(<JournalScreen />); });
    const input = tree.root.findAll(
      (node: any) => node.props.accessibilityLabel === 'Journal entry' && typeof node.type !== 'string',
    )[0];

    act(() => { input.props.onChangeText('Before the merge, and more.'); });
    // A pull's collapse moves the day's entry to its canonical id and folds
    // in the other device's writing.
    act(() => {
      useUnfoldStore.setState((state) => ({
        journalEntries: state.journalEntries.map((entry) => (
          entry.id === legacyId
            ? { ...entry, id: 'journal-canonical-1', content: 'Before the merge.\n\nFrom the other device.' }
            : entry
        )),
      }));
    });
    act(() => { jest.advanceTimersByTime(2_000); });

    const entries = useUnfoldStore.getState().journalEntries
      .filter((entry) => entry.devotionalId === 'dev-1' && entry.dayNumber === 1);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      id: 'journal-canonical-1',
      content: 'Before the merge, and more.\n\nFrom the other device.',
    });
    act(() => tree.unmount());
  });

  // 2026-10-09 release audit round 2: the editor opened before the day had an
  // entry, and a pull brought another device's entry before autosave ran.
  it('keeps a pending draft when the day\'s first entry arrives from another device', () => {
    let tree: any;
    act(() => { tree = renderer.create(<JournalScreen />); });
    const input = tree.root.findAll(
      (node: any) => node.props.accessibilityLabel === 'Journal entry' && typeof node.type !== 'string',
    )[0];

    act(() => { input.props.onChangeText('Typed here first.'); });
    act(() => {
      useUnfoldStore.setState((state) => ({
        journalEntries: [...state.journalEntries, {
          id: canonicalJournalEntryId('dev-1', 1),
          devotionalId: 'dev-1',
          dayNumber: 1,
          content: 'From the other device.',
          journalMode: 'freewrite',
          createdAt: '2026-10-09T08:00:00.000Z',
          updatedAt: '2026-10-09T08:00:00.000Z',
        }],
      }));
    });
    act(() => { jest.advanceTimersByTime(2_000); });

    const entries = useUnfoldStore.getState().journalEntries
      .filter((entry) => entry.devotionalId === 'dev-1' && entry.dayNumber === 1);
    expect(entries).toHaveLength(1);
    expect(entries[0].content).toBe('From the other device.\n\nTyped here first.');
    act(() => tree.unmount());
  });

  // 2026-10-09 release audit: ids are day-derived, so a pull can fold another
  // device's writing in without moving the entry.
  it('saves typing still pending when a pull folds writing into the same entry, and keeps that writing', () => {
    const id = useUnfoldStore.getState().addJournalEntry({
      devotionalId: 'dev-1',
      dayNumber: 1,
      content: 'Before the merge.',
      journalMode: 'freewrite',
    });
    let tree: any;
    act(() => { tree = renderer.create(<JournalScreen />); });
    const input = tree.root.findAll(
      (node: any) => node.props.accessibilityLabel === 'Journal entry' && typeof node.type !== 'string',
    )[0];

    act(() => { input.props.onChangeText('Before the merge, and more.'); });
    act(() => {
      useUnfoldStore.setState((state) => ({
        journalEntries: state.journalEntries.map((entry) => (
          entry.id === id ? { ...entry, content: 'Before the merge.\n\nFrom the other device.' } : entry
        )),
      }));
    });
    act(() => { jest.advanceTimersByTime(2_000); });

    const day = useUnfoldStore.getState().journalEntries.find((entry) => entry.id === id);
    expect(day?.content).toBe('Before the merge, and more.\n\nFrom the other device.');
    // The save coming back from the store leaves the editor's text as it is.
    const shown = tree.root.findAll(
      (node: any) => node.props.accessibilityLabel === 'Journal entry' && typeof node.type !== 'string',
    )[0];
    expect(shown.props.value).toBe('Before the merge, and more.\n\nFrom the other device.');
    act(() => tree.unmount());
  });

  it('shows an answer a pull merged before the next keystroke can replace it', () => {
    const question = 'What do you notice?';
    const id = useUnfoldStore.getState().addJournalEntry({
      devotionalId: 'dev-1',
      dayNumber: 1,
      content: '',
      journalMode: 'freewrite',
    });
    const setAnswer = (response: string) => useUnfoldStore.setState((state) => ({
      journalEntries: state.journalEntries.map((entry) => (
        entry.id === id
          ? { ...entry, deeperQuestions: [question], questionResponses: [{ question, response }] }
          : entry
      )),
    }));
    setAnswer('Mine.');
    let tree: any;
    act(() => { tree = renderer.create(<JournalScreen />); });
    const byLabel = (label: string) => tree.root.findAll(
      (node: any) => node.props.accessibilityLabel === label && typeof node.type !== 'string',
    )[0];
    act(() => { byLabel(`Reflection prompt 1: ${question}`).props.onPress(); });
    expect(byLabel('Response to prompt 1').props.value).toBe('Mine.');

    act(() => { setAnswer('Mine.\n\nFrom the other device.'); });

    expect(byLabel('Response to prompt 1').props.value).toBe('Mine.\n\nFrom the other device.');

    // The next keystroke saves onto the merged answer, and its own save
    // coming back leaves the answer as typed.
    act(() => { byLabel('Response to prompt 1').props.onChangeText('Mine.\n\nFrom the other device. More.'); });
    expect(byLabel('Response to prompt 1').props.value).toBe('Mine.\n\nFrom the other device. More.');
    const saved = useUnfoldStore.getState().journalEntries.find((entry) => entry.id === id);
    expect(saved?.questionResponses).toEqual([{ question, response: 'Mine.\n\nFrom the other device. More.' }]);
    act(() => tree.unmount());
  });

  it('keeps a SOAP field the merge filled while another field has a pending edit', () => {
    const legacyId = useUnfoldStore.getState().addJournalEntry({
      devotionalId: 'dev-1',
      dayNumber: 1,
      content: '',
      journalMode: 'soap',
    });
    useUnfoldStore.setState((state) => ({
      journalEntries: state.journalEntries.map((entry) => (
        entry.id === legacyId
          ? { ...entry, soapResponses: { scripture: 'The verse I chose.', observation: '', application: '', prayer: '' } }
          : entry
      )),
    }));
    let tree: any;
    act(() => { tree = renderer.create(<JournalScreen />); });
    const byLabel = (label: string) => tree.root.findAll(
      (node: any) => node.props.accessibilityLabel === label && typeof node.type !== 'string',
    )[0];

    act(() => { byLabel('Scripture section').props.onPress(); });
    act(() => { byLabel('Scripture journal entry').props.onChangeText('The verse I chose, and why.'); });
    act(() => {
      useUnfoldStore.setState((state) => ({
        journalEntries: state.journalEntries.map((entry) => (
          entry.id === legacyId
            ? {
              ...entry,
              id: 'journal-canonical-1',
              soapResponses: {
                scripture: 'The verse I chose.',
                observation: 'Noticed on the other device.',
                application: '',
                prayer: '',
              },
            }
            : entry
        )),
      }));
    });
    act(() => { jest.advanceTimersByTime(2_000); });

    const day = useUnfoldStore.getState().journalEntries.find((entry) => entry.id === 'journal-canonical-1');
    expect(day?.soapResponses).toMatchObject({
      scripture: 'The verse I chose, and why.',
      observation: 'Noticed on the other device.',
    });
    act(() => tree.unmount());
  });
});
