/**
 * Notebook search ran over the note's stored content, which is editor HTML —
 * so "div", "h2" or "br" matched every note while matching nothing the user
 * had written, and a word that only appeared inside markup was a false hit.
 * Search now runs over the plain text (memoised per note). This drives the
 * REAL hub screen.
 */
import React from 'react';
import { FlatList, TextInput, TouchableOpacity } from 'react-native';

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
import { useUnfoldStore, type Note } from '@/lib/store';

const T0 = '2026-09-01T12:00:00.000Z';

function note(over: Partial<Note>): Note {
  return {
    id: 'n',
    title: '',
    content: '',
    createdAt: T0,
    updatedAt: T0,
    category: 'general',
    tags: [],
    isFavorite: false,
    scriptureRefs: [],
    ...over,
  };
}

const NOTES: Note[] = [
  note({
    id: 'sermon',
    title: 'Sunday sermon',
    content: '<div><h2>Shepherd</h2><p>He restores my soul</p><br></div>',
  }),
  note({
    id: 'study',
    title: 'Word study',
    content: '<p>Grace upon grace</p>',
    tags: ['greek'],
    scriptureRefs: [{ reference: 'John 1:16', bookId: 43, chapter: 1, verse: 16 }],
  }),
];

/** Open the Notebook segment with the search field showing, and type `query`. */
function searchNotebook(tree: any, query: string) {
  const tab = tree.root.findAll(
    (node: any) => node.type === TouchableOpacity && node.props.accessibilityLabel === 'Notebook tab, 2 of 2',
  )[0];
  act(() => { tab.props.onPress(); });

  const searchToggle = tree.root.findAll(
    (node: any) =>
      node.type === TouchableOpacity &&
      node.findAll((child: any) => child.type === 'MagnifyingGlassIcon').length > 0,
  )[0];
  act(() => { searchToggle.props.onPress(); });

  const input = tree.root.findAll(
    (node: any) => node.type === TextInput && node.props.placeholder === 'Search entries...',
  )[0];
  act(() => { input.props.onChangeText(query); });
}

const listedNoteIds = (tree: any) =>
  (tree.root.findAllByType(FlatList)[0].props.data as Note[]).map((n) => n.id);

describe('notebook search', () => {
  beforeEach(() => {
    useUnfoldStore.getState().reset();
    useUnfoldStore.setState({ notes: NOTES });
  });

  // Only tags that do not also occur inside the prose: search is a substring
  // match, so 'p' legitimately hits "Shepherd" and "upon".
  it.each(['div', 'h2', 'br'])('does not match the HTML tag %p', (query) => {
    let tree: any;
    act(() => { tree = renderer.create(<JournalHubScreen />); });
    searchNotebook(tree, query);
    expect(listedNoteIds(tree)).toEqual([]);
    act(() => tree.unmount());
  });

  it('matches words the user actually wrote', () => {
    let tree: any;
    act(() => { tree = renderer.create(<JournalHubScreen />); });
    searchNotebook(tree, 'restores my soul');
    expect(listedNoteIds(tree)).toEqual(['sermon']);
    act(() => tree.unmount());
  });

  it('still matches on title, tags and scripture references', () => {
    let tree: any;
    act(() => { tree = renderer.create(<JournalHubScreen />); });

    searchNotebook(tree, 'Sunday');
    expect(listedNoteIds(tree)).toEqual(['sermon']);

    const input = tree.root.findAll(
      (node: any) => node.type === TextInput && node.props.placeholder === 'Search entries...',
    )[0];
    act(() => { input.props.onChangeText('greek'); });
    expect(listedNoteIds(tree)).toEqual(['study']);

    act(() => { input.props.onChangeText('John 1:16'); });
    expect(listedNoteIds(tree)).toEqual(['study']);
    act(() => tree.unmount());
  });

  it('matches text held in a heading, which stripping must keep', () => {
    let tree: any;
    act(() => { tree = renderer.create(<JournalHubScreen />); });
    searchNotebook(tree, 'shepherd');
    expect(listedNoteIds(tree)).toEqual(['sermon']);
    act(() => tree.unmount());
  });
});
