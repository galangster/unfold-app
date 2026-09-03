/**
 * The notebook FAB wrote its Reanimated shared value straight from the render
 * body when `visible` changed — a side effect during render, which Reanimated
 * warns about and React may run more than once or discard. Its sibling
 * SegmentedControl had already moved the same write into an effect; the FAB
 * now matches. The animation itself is unchanged: hidden slides to 200,
 * shown back to 0.
 */
import fs from 'fs';
import path from 'path';
import React from 'react';
import { FlatList, TouchableOpacity } from 'react-native';

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
    useSharedValue: (initial: unknown) => {
      const shared = { _value: initial } as Record<string, unknown>;
      Object.defineProperty(shared, 'value', {
        get: () => shared._value,
        set: (next: unknown) => {
          shared._value = next;
          ((globalThis as any).__sharedWrites as unknown[]).push(next);
        },
      });
      return shared;
    },
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

const HUB_SOURCE = fs.readFileSync(
  path.join(__dirname, '../../app/(tabs)/(journal)/index.tsx'),
  'utf8',
);

const sharedWrites = () => (globalThis as any).__sharedWrites as unknown[];

const NOTES: Note[] = Array.from({ length: 8 }, (_, i) => ({
  id: `n${i}`,
  title: `Note ${i}`,
  content: '<p>body</p>',
  createdAt: '2026-09-01T12:00:00.000Z',
  updatedAt: '2026-09-01T12:00:00.000Z',
  category: 'general' as const,
  tags: [],
  isFavorite: false,
  scriptureRefs: [],
}));

/** The FAB only exists on the Notebook segment. */
function openNotebook(tree: any) {
  const tab = tree.root.findAll(
    (node: any) => node.type === TouchableOpacity && node.props.accessibilityLabel === 'Notebook tab, 2 of 2',
  )[0];
  act(() => { tab.props.onPress(); });
}

function scrollTo(tree: any, y: number) {
  const list = tree.root.findAllByType(FlatList)[0];
  act(() => { list.props.onScroll({ nativeEvent: { contentOffset: { y } } }); });
}

describe('notebook FAB visibility animation', () => {
  beforeEach(() => {
    (globalThis as any).__sharedWrites = [];
    useUnfoldStore.getState().reset();
    useUnfoldStore.setState({ notes: NOTES });
  });

  it('writes the shared value from an effect, never from the render body', () => {
    // The write is a side effect: React can render a component twice, or throw
    // the render away, so a shared-value assignment must be committed.
    const fab = HUB_SOURCE.slice(HUB_SOURCE.indexOf('function FloatingActionButton'));
    const fabBody = fab.slice(0, fab.indexOf('const animatedStyle'));
    expect(fabBody).toContain('useEffect(');
    expect(fabBody).toMatch(/useEffect\([\s\S]*prevVisible\.current !== visible[\s\S]*\}, \[/);
    // …and not as a bare conditional in the render body.
    expect(fabBody).not.toMatch(/\n {2}if \(prevVisible\.current !== visible\) \{/);
  });

  it('still hides on scroll down and comes back on scroll up', () => {
    let tree: any;
    act(() => { tree = renderer.create(<JournalHubScreen />); });
    openNotebook(tree);
    sharedWrites().length = 0;

    scrollTo(tree, 120); // scrolling down, past the 50px threshold
    expect(sharedWrites()).toContain(200);

    sharedWrites().length = 0;
    scrollTo(tree, 0); // back to the top
    expect(sharedWrites()).toContain(0);
    act(() => tree.unmount());
  });

  it('does not rewrite the shared value when visibility is unchanged', () => {
    let tree: any;
    act(() => { tree = renderer.create(<JournalHubScreen />); });
    openNotebook(tree);
    scrollTo(tree, 120);
    sharedWrites().length = 0;

    scrollTo(tree, 200); // still scrolling down; the FAB is already hidden
    expect(sharedWrites()).not.toContain(200);
    act(() => tree.unmount());
  });
});
