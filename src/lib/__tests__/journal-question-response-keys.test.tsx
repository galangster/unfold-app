/**
 * Question responses are persisted by QUESTION TEXT (store.updateQuestionResponse)
 * but the editor kept its local map by INDEX into whichever list it rendered:
 * the day's reflection questions in the focusQuestion flow, the AI "Go
 * Deeper" prompts otherwise. An answer to reflection question 0 therefore
 * rendered as the answer to AI prompt 0 (and counted as complete), and the
 * reader's "answer question 1" deep link expanded AI prompt 1 and wrote the
 * text under the wrong question. This drives the REAL JournalScreen.
 */
import React from 'react';
import { Text, TextInput, TouchableOpacity } from 'react-native';

// react-test-renderer types are not installed in this app; keep this aligned
// with the existing component-test pattern.
const renderer = require('react-test-renderer');
const { act } = renderer;

(globalThis as any).__journalParams = { devotionalId: 'dev-1', dayNumber: '1' };

jest.mock('expo-router', () => ({
  useRouter: () => ({ back: jest.fn(), replace: jest.fn(), push: jest.fn() }),
  useLocalSearchParams: () => (globalThis as any).__journalParams,
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
import { useUnfoldStore } from '@/lib/store';

const RQ = ['RQ0: What stood out to you?', 'RQ1: Where do you need rest?', 'RQ2: Who can you encourage?'];
const AI = ['AI0: What does it feel like when you slow down?', 'AI1: Where in your day could this land?', 'AI2: What if you believed this?'];
const RQ0_ANSWER = 'MY ANSWER ABOUT WHAT STOOD OUT';

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
      reflectionQuestions: RQ,
    },
  ],
};

/** Day 1 entry: RQ0 answered from the reader's inline journal, AI prompts persisted by Go Deeper. */
function seed() {
  useUnfoldStore.getState().reset();
  useUnfoldStore.setState({
    devotionals: [DEVOTIONAL],
    currentDevotionalId: 'dev-1',
    journalEntries: [
      {
        id: 'journal-1',
        devotionalId: 'dev-1',
        dayNumber: 1,
        content: 'A freewrite entry long enough for Go Deeper',
        journalMode: 'freewrite',
        createdAt: '2026-09-01T00:00:00.000Z',
        updatedAt: '2026-09-01T00:00:00.000Z',
        questionResponses: [{ question: RQ[0], response: RQ0_ANSWER }],
        deeperQuestions: AI,
      },
    ],
  });
}

const textOf = (node: any) => [].concat(node.props.children).join('');
const promptRows = (tree: any) =>
  tree.root.findAll((node: any) => node.type === TouchableOpacity && /^Reflection prompt/.test(node.props.accessibilityLabel ?? ''));
const editPreviews = (tree: any) =>
  tree.root.findAll((node: any) => node.type === TouchableOpacity && /^Edit your response to prompt/.test(node.props.accessibilityLabel ?? ''));
const progressText = (tree: any) =>
  tree.root.findAllByType(Text).map(textOf).find((text: string) => /of 3 complete/.test(text));

describe('journal question responses are keyed by question text', () => {
  beforeEach(() => {
    seed();
    (globalThis as any).__journalParams = { devotionalId: 'dev-1', dayNumber: '1' };
  });

  it('does not show a reflection question answer under the AI prompt at the same index', () => {
    let tree: any;
    act(() => { tree = renderer.create(<JournalScreen />); });

    // The rendered list is the AI prompts…
    expect(promptRows(tree).map((node: any) => node.props.accessibilityLabel)).toEqual(
      AI.map((prompt, index) => `Reflection prompt ${index + 1}: ${prompt}`),
    );
    // …none of which has been answered.
    expect(editPreviews(tree)).toHaveLength(0);
    expect(tree.root.findAllByType(Text).some((node: any) => textOf(node) === RQ0_ANSWER)).toBe(false);
    expect(progressText(tree)).toBe('0 of 3 complete');
    act(() => tree.unmount());
  });

  it('a focusQuestion deep link targets the reflection questions even when AI prompts exist', () => {
    (globalThis as any).__journalParams = { devotionalId: 'dev-1', dayNumber: '1', focusQuestion: '1' };
    let tree: any;
    act(() => { tree = renderer.create(<JournalScreen />); });

    expect(promptRows(tree).map((node: any) => node.props.accessibilityLabel)).toEqual(
      RQ.map((question, index) => `Reflection prompt ${index + 1}: ${question}`),
    );
    const expanded = promptRows(tree).filter((node: any) => node.props.accessibilityState?.expanded === true);
    expect(expanded.map((node: any) => node.props.accessibilityLabel)).toEqual([`Reflection prompt 2: ${RQ[1]}`]);

    // RQ0's persisted answer shows under RQ0.
    const preview = editPreviews(tree)[0];
    expect(preview.props.accessibilityLabel).toBe('Edit your response to prompt 1');
    expect(preview.findAllByType(Text).map(textOf).join('')).toBe(RQ0_ANSWER);
    expect(progressText(tree)).toBe('1 of 3 complete');
    act(() => tree.unmount());
  });

  it('typing into the focused reflection question persists under that question text', () => {
    (globalThis as any).__journalParams = { devotionalId: 'dev-1', dayNumber: '1', focusQuestion: '1' };
    let tree: any;
    act(() => { tree = renderer.create(<JournalScreen />); });

    const input = tree.root.findAll(
      (node: any) => node.type === TextInput && node.props.placeholder === 'Write your response...',
    )[0];
    expect(input).toBeTruthy();
    act(() => { input.props.onChangeText('typed answer'); });

    const persisted = useUnfoldStore.getState().journalEntries[0].questionResponses ?? [];
    expect(persisted).toContainEqual({ question: RQ[1], response: 'typed answer' });
    expect(persisted.some((qr) => AI.includes(qr.question))).toBe(false);
    expect(progressText(tree)).toBe('2 of 3 complete');
    act(() => tree.unmount());
  });
});
