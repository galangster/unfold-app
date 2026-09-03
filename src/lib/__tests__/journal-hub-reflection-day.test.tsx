/**
 * The Journal hub reflects on the LAST READ day (currentDayData), not on
 * `currentDevotional.currentDay`, which has already advanced to the next day
 * once a day is finished. The questions, counts and "Write today" card
 * already used currentDayData; the "N more reflections" row pushed the next
 * day's editor and the COMPLETED/CONTINUE badge looked for the next day's
 * entry, so after finishing day 1 the row opened day 2 and the badge never
 * left REFLECT. This drives the REAL hub screen.
 */
import React from 'react';
import { Text, TouchableOpacity } from 'react-native';

// react-test-renderer types are not installed in this app; keep this aligned
// with the existing component-test pattern.
const renderer = require('react-test-renderer');
const { act } = renderer;

const mockPush = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({
    push: (...args: unknown[]) => mockPush(...args),
    back: jest.fn(),
    replace: jest.fn(),
  }),
}));

jest.mock('react-native-safe-area-context', () => {
  const { View } = require('react-native');
  return {
    SafeAreaView: View,
    useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
  };
});

jest.mock('react-native-reanimated', () => {
  const { View, Text: RNText, FlatList, ScrollView } = require('react-native');
  const chainable = () => {
    const anim: Record<string, unknown> = {};
    for (const method of ['duration', 'delay', 'easing', 'springify', 'damping', 'build']) {
      anim[method] = () => anim;
    }
    return anim;
  };
  return {
    __esModule: true,
    default: { View, Text: RNText, FlatList, ScrollView, createAnimatedComponent: (c: unknown) => c },
    FadeIn: chainable(),
    FadeInDown: chainable(),
    FadeOut: chainable(),
    Easing: { out: () => 'out', in: () => 'in', inOut: () => 'inOut', cubic: 'cubic' },
    runOnJS: (fn: unknown) => fn,
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

jest.mock('react-native-gesture-handler', () => {
  const chainable = (): any => {
    const chain: any = new Proxy({}, { get: (_target, prop) => (prop === 'then' ? undefined : () => chain) });
    return chain;
  };
  return {
    Gesture: { Pan: () => chainable(), Fling: () => chainable(), Exclusive: () => chainable() },
    GestureDetector: ({ children }: { children: React.ReactNode }) => children,
    Directions: { LEFT: 1, RIGHT: 2 },
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

jest.mock('@/components/notebook/NoteCard', () => ({ NoteCard: () => null }));
jest.mock('@/components/notebook/SwipeableNoteCard', () => ({ SwipeableNoteCard: () => null }));
jest.mock('@/components/notebook/FolderChips', () => ({ FolderChips: () => null }));
jest.mock('@/components/notebook/CreateFolderSheet', () => ({ CreateFolderSheet: () => null }));
jest.mock('@/components/notebook/MoveFolderSheet', () => ({ MoveFolderSheet: () => null }));
jest.mock('@/components/UndoToast', () => ({ UndoToast: () => null }));
jest.mock('@/components/ExclusiveOfferSheet', () => ({ ExclusiveOfferSheet: () => null }));
jest.mock('@/components/ui', () => ({ alpha: (color: string) => color, Sheet: () => null }));
jest.mock('@/hooks/useCreationGate', () => ({
  useCreationGate: () => ({ gate: () => true, showExclusiveOffer: false, dismissOffer: jest.fn() }),
}));
jest.mock('@/lib/api-config', () => ({
  PRIMARY_BACKEND_URL: 'https://api.example.test',
  getAuthHeaders: jest.fn(async () => ({ 'Content-Type': 'application/json' })),
}));
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

import JournalHubScreen from '../../app/(tabs)/(journal)/index';
import { useUnfoldStore } from '@/lib/store';

const DAY_1_QUESTIONS = ['Q1: What stood out to you?', 'Q1: Where do you need rest?', 'Q1: Who can you encourage?'];
const DAY_2_QUESTIONS = ['Q2: What is next?', 'Q2: What do you fear?', 'Q2: What would change?'];

function day(dayNumber: number, isRead: boolean, reflectionQuestions: string[]) {
  return {
    id: `d${dayNumber}`,
    devotionalId: 'dev-1',
    dayNumber,
    title: `Day ${dayNumber}`,
    scriptureReference: 'Psalm 23',
    scriptureText: 'x',
    bodyText: 'x',
    quotableLine: 'x',
    isRead,
    reflectionQuestions,
  };
}

// Day 1 has been read and currentDay already advanced to 2.
const DEVOTIONAL: any = {
  id: 'dev-1',
  title: 'Test Series',
  totalDays: 3,
  currentDay: 2,
  createdAt: '2026-09-01T00:00:00.000Z',
  generationMode: 'batch',
  userContext: { name: '', aboutMe: '', currentSituation: '', emotionalState: '' },
  days: [day(1, true, DAY_1_QUESTIONS), day(2, false, DAY_2_QUESTIONS)],
};

const textOf = (node: any) => [].concat(node.props.children).join('');

function findTouchable(tree: any, predicate: (node: any) => boolean) {
  return tree.root.findAll((node: any) => node.type === TouchableOpacity && predicate(node))[0];
}

describe('journal hub: the day the reflections row and badge point at', () => {
  beforeEach(() => {
    mockPush.mockClear();
    useUnfoldStore.getState().reset();
    useUnfoldStore.setState({
      devotionals: [DEVOTIONAL],
      currentDevotionalId: 'dev-1',
      journalEntries: [
        {
          id: 'journal-day-1',
          devotionalId: 'dev-1',
          dayNumber: 1,
          content: '',
          createdAt: '2026-09-01T08:00:00.000Z',
          updatedAt: '2026-09-01T08:00:00.000Z',
          questionResponses: [{ question: DAY_1_QUESTIONS[0], response: 'One answered' }],
        },
      ],
    });
  });

  it('"N more reflections" opens the last read day, focused on its first unanswered question', () => {
    let tree: any;
    act(() => { tree = renderer.create(<JournalHubScreen />); });

    const row = findTouchable(tree, (node) =>
      node.findAll((child: any) => child.type === Text && /more reflections? to explore/.test(textOf(child))).length > 0,
    );
    expect(row).toBeTruthy();
    act(() => { row.props.onPress(); });

    expect(mockPush).toHaveBeenCalledTimes(1);
    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/(tabs)/(journal)/entry',
      params: { devotionalId: 'dev-1', dayNumber: '1', focusQuestion: '1' },
    });
    act(() => tree.unmount());
  });

  it('the reflection card knows the last read day already has an entry', () => {
    let tree: any;
    act(() => { tree = renderer.create(<JournalHubScreen />); });

    expect(findTouchable(tree, (node) => node.props.accessibilityLabel === "Continue today's reflection")).toBeTruthy();
    expect(findTouchable(tree, (node) => node.props.accessibilityLabel === "Start today's reflection")).toBeUndefined();
    const badges = tree.root.findAll((node: any) => node.type === Text && textOf(node) === 'CONTINUE');
    expect(badges.length).toBe(1);
    act(() => tree.unmount());
  });
});
