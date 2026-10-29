/**
 * The crisis resources card on the real JournalScreen: it appears while the
 * reader's writing names suicide, self-harm or abuse, and goes away when the
 * words are gone.
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

import { Linking } from 'react-native';
import JournalScreen from '../../app/(tabs)/(today)/journal';
import { mmkvStorage } from '@/lib/mmkv-storage';
import { useUnfoldStore } from '@/lib/store';
import { OUTBOX_KEY } from '@/lib/sync-outbox';

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

const findCard = (tree: any) =>
  tree.root.findAll((node: any) => node.props.testID === 'journal-crisis-card' && typeof node.type !== 'string');

const findInput = (tree: any) =>
  tree.root.findAll(
    (node: any) => node.props.accessibilityLabel === 'Journal entry' && typeof node.type !== 'string',
  )[0];

const hasText = (tree: any, text: string) =>
  tree.root.findAll((node: any) => typeof node.type !== 'string' && node.props.label === text).length > 0;

describe('journal crisis resources card', () => {
  let tree: any;

  beforeEach(() => {
    useUnfoldStore.getState().reset();
    mmkvStorage.removeItem(OUTBOX_KEY);
    useUnfoldStore.setState({ devotionals: [DEVOTIONAL], currentDevotionalId: 'dev-1' });
    jest.useFakeTimers();
    act(() => { tree = renderer.create(<JournalScreen />); });
  });

  afterEach(() => {
    act(() => tree.unmount());
    jest.useRealTimers();
  });

  const type = (text: string) => act(() => { findInput(tree).props.onChangeText(text); });

  it('stays hidden for ordinary writing', () => {
    type('A quiet morning with Psalm 23.');
    expect(findCard(tree)).toHaveLength(0);
  });

  it('appears with 988 and 741741 when the writing turns suicidal, and leaves when the words go', () => {
    type('Some nights I feel suicidal.');
    expect(findCard(tree)).toHaveLength(1);
    expect(hasText(tree, 'Call or text 988')).toBe(true);
    expect(hasText(tree, 'Text HOME to 741741')).toBe(true);
    expect(hasText(tree, 'Call 1-800-799-7233')).toBe(false);

    type('Some nights are hard.');
    expect(findCard(tree)).toHaveLength(0);
  });

  it('adds the domestic violence hotline when the writing names abuse', () => {
    type('My husband hits me when he drinks.');
    expect(findCard(tree)).toHaveLength(1);
    expect(hasText(tree, 'Call 1-800-799-7233')).toBe(true);
  });

  it('opens the phone to 988', () => {
    const openURL = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
    type('I keep thinking about killing myself.');
    const call = tree.root.findAll(
      (node: any) => typeof node.type !== 'string' && node.props.label === 'Call or text 988' && node.props.onPress,
    )[0];
    act(() => { call.props.onPress(); });
    expect(openURL).toHaveBeenCalledWith('tel:988');
    openURL.mockRestore();
  });

  it('still saves what the reader wrote', () => {
    type('I feel suicidal.');
    act(() => { jest.runOnlyPendingTimers(); });
    const entries = useUnfoldStore.getState().journalEntries ?? [];
    expect(entries.some((entry: any) => entry.content === 'I feel suicidal.')).toBe(true);
  });
});

describe('journal crisis resources card in the other fields', () => {
  let tree: any;

  beforeEach(() => {
    useUnfoldStore.getState().reset();
    mmkvStorage.removeItem(OUTBOX_KEY);
    useUnfoldStore.setState({ devotionals: [DEVOTIONAL], currentDevotionalId: 'dev-1' });
    jest.useFakeTimers();
  });

  afterEach(() => {
    act(() => tree.unmount());
    jest.useRealTimers();
  });

  const byLabel = (label: string) =>
    tree.root.findAll((node: any) => node.props.accessibilityLabel === label && typeof node.type !== 'string')[0];

  it('appears for a SOAP field', () => {
    useUnfoldStore.getState().addJournalEntry({ devotionalId: 'dev-1', dayNumber: 1, content: '', journalMode: 'soap' });
    act(() => { tree = renderer.create(<JournalScreen />); });
    act(() => { byLabel('Scripture journal entry').props.onChangeText('I want to end my own life.'); });
    expect(findCard(tree)).toHaveLength(1);
  });

  it('appears for a prayer request being written', () => {
    act(() => { tree = renderer.create(<JournalScreen />); });
    const label = tree.root.findAll(
      (node: any) => typeof node.type === 'string' && node.props.children === 'Add a prayer request',
    )[0];
    let add = label.parent;
    while (add && !add.props.onPress) add = add.parent;
    act(() => { add.props.onPress(); });
    act(() => { byLabel('New prayer request').props.onChangeText('Pray for me, I feel suicidal.'); });
    expect(findCard(tree)).toHaveLength(1);
  });
});
