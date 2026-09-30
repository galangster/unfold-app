/**
 * The journal writing desk (DESIGN.md, Journal, write): writing from a day's
 * reading puts that day on a source page beside the draft on an open Duo, or
 * above it upright. The draft keeps one tree position, so opening or closing
 * the device never remounts the editor, and a resize never saves.
 */
import React from 'react';

// react-test-renderer types are not installed in this app; keep this aligned
// with the existing component-test pattern.
const renderer = require('react-test-renderer');
const { act } = renderer;

const PHONE = { width: 390, height: 844, insetTop: 47, insetBottom: 34, insetLeft: 0, insetRight: 0 };
const OPEN_DUO = { width: 951, height: 669, insetTop: 24, insetBottom: 20, insetLeft: 0, insetRight: 0 };
// Reported content area of an open Duo held upright.
const UPRIGHT_DUO = { width: 669, height: 703, insetTop: 0, insetBottom: 0, insetLeft: 0, insetRight: 0 };
const IPAD_PORTRAIT = { width: 744, height: 1133, insetTop: 24, insetBottom: 20, insetLeft: 0, insetRight: 0 };
const mockWindow = { ...PHONE };
let mockReducedMotion = true;
const mockParams: { devotionalId?: string; dayNumber?: string } = { devotionalId: 'dev-1', dayNumber: '1' };

jest.mock('expo-router', () => ({
  useRouter: () => ({ canGoBack: () => true, back: jest.fn(), replace: jest.fn(), push: jest.fn() }),
  useLocalSearchParams: () => mockParams,
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

jest.mock('@/hooks/useAdaptiveLayout', () => ({
  useAdaptiveLayout: () => jest.requireActual('@/lib/adaptive-layout').resolveAdaptiveLayout(mockWindow),
}));

jest.mock('@/hooks/useAccessibility', () => ({
  useAccessibleAnimation: () => ({
    reducedMotion: mockReducedMotion,
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

jest.mock('@/lib/useReadingFont', () => ({ useReadingFont: () => ({ body: 'Body' }) }));
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
// The dictation bar sits beside the free-write field, so it mounts and
// unmounts with the draft: a count of its mounts shows a draft remount.
let mockDraftMounts = 0;
jest.mock('@/components/VoiceInputBar', () => ({
  VoiceInputBar: () => {
    require('react').useEffect(() => {
      mockDraftMounts += 1;
    }, []);
    return null;
  },
}));
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

import { Keyboard, LayoutAnimation } from 'react-native';
import JournalScreen from '../../app/(tabs)/(today)/journal';
import { FacingPanes } from '@/components/ui/FacingPanes';
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
      title: 'Still waters',
      scriptureReference: 'Psalm 23:2',
      scriptureText: 'He leads me beside still waters.',
      bodyText: 'x',
      quotableLine: 'Rest is where he leads.',
      isRead: true,
      reflectionQuestions: [],
    },
  ],
};

type Node = any;
type Window = typeof PHONE;

function setWindow(size: Window) {
  Object.assign(mockWindow, size);
}

const mounted: any[] = [];

function render(size: Window) {
  setWindow(size);
  let tree: any;
  act(() => {
    tree = renderer.create(<JournalScreen />);
  });
  mounted.push(tree);
  return tree;
}

function resize(tree: any, size: Window) {
  setWindow(size);
  act(() => {
    tree.update(<JournalScreen />);
  });
}

/** The first host view whose prop has the value. */
function host(tree: any, prop: string, value: unknown): Node {
  return tree.root.findAll((node: Node) => typeof node.type === 'string' && node.props[prop] === value)[0];
}

function editor(tree: any): Node {
  return host(tree, 'accessibilityLabel', 'Journal entry');
}

/** The FacingPanes host and the index of the slot that holds the node. */
function slotOf(tree: any, node: Node): { count: number; index: number } {
  const desk = host(tree, 'testID', 'journal-desk');
  let current: Node = node;
  while (current.parent && current.parent !== desk) current = current.parent;
  return { count: desk.children.length, index: desk.children.indexOf(current) };
}

function hasText(tree: any, value: string): boolean {
  return host(tree, 'children', value) !== undefined;
}

function hiddenFromAccessibility(node: Node): boolean {
  for (let current: Node = node; current; current = current.parent) {
    if (current.props?.accessibilityElementsHidden) return true;
  }
  return false;
}

function sourceScroll(tree: any): Node {
  return host(tree, 'testID', 'journal-source-page');
}

describe('journal writing desk', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    mockReducedMotion = true;
    mockDraftMounts = 0;
    Object.assign(mockParams, { devotionalId: 'dev-1', dayNumber: '1' });
    useUnfoldStore.getState().reset();
    useUnfoldStore.setState({ devotionals: [DEVOTIONAL], currentDevotionalId: 'dev-1' });
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    for (const tree of mounted.splice(0)) act(() => tree.unmount());
    act(() => { jest.runOnlyPendingTimers(); });
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('shows the source page beside the draft on an open Duo', () => {
    const tree = render(OPEN_DUO);
    const source = sourceScroll(tree);
    expect(tree.root.findByType(FacingPanes).props.panes).toMatchObject({ axis: 'row' });
    // Source, fold gutter, draft.
    expect(slotOf(tree, source)).toEqual({ count: 3, index: 0 });
    expect(slotOf(tree, editor(tree))).toEqual({ count: 3, index: 2 });
    expect(hasText(tree, 'Day 1 · Still waters')).toBe(true);
    expect(hasText(tree, 'Psalm 23:2')).toBe(true);
    expect(host(tree, 'testID', 'day-passage-text').props.children).toMatch(/^\u201CHe leads me beside still\s+waters\.\u201D$/);
    expect(hasText(tree, 'Rest is where he leads.')).toBe(true);
  });

  it('puts the source page above the draft on an upright Duo', () => {
    const tree = render(UPRIGHT_DUO);
    const source = sourceScroll(tree);
    expect(tree.root.findByType(FacingPanes).props.panes).toMatchObject({ axis: 'column' });
    expect(slotOf(tree, source)).toEqual({ count: 3, index: 0 });
    expect(slotOf(tree, editor(tree))).toEqual({ count: 3, index: 2 });
  });

  it('shows no source page on a phone', () => {
    const tree = render(PHONE);
    expect(sourceScroll(tree)).toBeUndefined();
    expect(slotOf(tree, editor(tree))).toEqual({ count: 1, index: 0 });
  });

  it('shows no source page for a freeform entry on an open Duo', () => {
    Object.assign(mockParams, { devotionalId: undefined, dayNumber: undefined });
    const tree = render(OPEN_DUO);
    expect(sourceScroll(tree)).toBeUndefined();
    expect(tree.root.findByType(FacingPanes).props.panes).toBeNull();
  });

  it('keeps the draft mounted across opening, turning, and closing', () => {
    const tree = render(PHONE);
    expect(mockDraftMounts).toBe(1);
    for (const size of [OPEN_DUO, UPRIGHT_DUO, OPEN_DUO, PHONE]) {
      resize(tree, size);
      expect(editor(tree)).toBeDefined();
      expect(mockDraftMounts).toBe(1);
    }
  });

  it.each([
    ['without an entry', false],
    ['with a saved entry', true],
  ])('saves nothing on a resize %s', (_label, withEntry) => {
    if (withEntry) {
      useUnfoldStore.getState().addJournalEntry({ devotionalId: 'dev-1', dayNumber: 1, content: 'kept', journalMode: 'freewrite' });
    }
    const tree = render(PHONE);
    act(() => { jest.runOnlyPendingTimers(); });
    const before = useUnfoldStore.getState().journalEntries;
    for (const size of [OPEN_DUO, UPRIGHT_DUO, PHONE]) {
      resize(tree, size);
      act(() => { jest.advanceTimersByTime(5000); });
    }
    expect(useUnfoldStore.getState().journalEntries).toBe(before);
    expect(before).toHaveLength(withEntry ? 1 : 0);
  });

  it('keeps the words being written across opening, turning, and closing', () => {
    const tree = render(PHONE);
    act(() => {
      editor(tree).props.onChangeText('Half a thought');
    });
    for (const size of [OPEN_DUO, UPRIGHT_DUO, PHONE]) {
      resize(tree, size);
      expect(editor(tree).props.value).toBe('Half a thought');
    }
    expect(mockDraftMounts).toBe(1);
  });

  it('follows a keyboard that changes size while shown', () => {
    const listeners = new Map<string, (event: unknown) => void>();
    jest.spyOn(Keyboard, 'addListener').mockImplementation(((event: string, listener: (event: unknown) => void) => {
      listeners.set(event, listener);
      return { remove: jest.fn() };
    }) as never);
    jest.spyOn(Keyboard, 'isVisible').mockReturnValue(true);
    const tree = render(IPAD_PORTRAIT);

    act(() => {
      listeners.get('keyboardWillShow')?.({ duration: 250, easing: 'keyboard', endCoordinates: { height: 300 } });
    });
    expect(tree.root.findByType(FacingPanes).props.panes).toMatchObject({ first: 0 });
    // A hardware keyboard leaves only its shortcut bar: the draft has room again.
    act(() => {
      listeners.get('keyboardWillChangeFrame')?.({ duration: 250, easing: 'keyboard', endCoordinates: { height: 69 } });
    });
    expect(tree.root.findByType(FacingPanes).props.panes).toMatchObject({ first: 522.5, gutter: 40 });
  });

  it('never folds the source on an open Duo', () => {
    const listeners = new Map<string, (event: unknown) => void>();
    jest.spyOn(Keyboard, 'addListener').mockImplementation(((event: string, listener: (event: unknown) => void) => {
      listeners.set(event, listener);
      return { remove: jest.fn() };
    }) as never);
    const tree = render(OPEN_DUO);
    act(() => {
      listeners.get('keyboardWillShow')?.({ duration: 250, easing: 'keyboard', endCoordinates: { height: 400 } });
    });
    expect(tree.root.findByType(FacingPanes).props.panes).toMatchObject({ axis: 'row', gutter: 40 });
    expect(hiddenFromAccessibility(sourceScroll(tree))).toBe(false);
  });

  it.each([
    ['with motion', false],
    ['under Reduce Motion', true],
  ])('folds the source away above the keyboard upright %s, keeping the header', (_label, reducedMotion) => {
    mockReducedMotion = reducedMotion;
    const configureNext = jest.spyOn(LayoutAnimation, 'configureNext').mockImplementation(() => undefined);
    const listeners = new Map<string, (event: unknown) => void>();
    jest.spyOn(Keyboard, 'addListener').mockImplementation(((event: string, listener: (event: unknown) => void) => {
      listeners.set(event, listener);
      return { remove: jest.fn() };
    }) as never);
    const tree = render(UPRIGHT_DUO);

    act(() => {
      listeners.get('keyboardWillShow')?.({ duration: 250, easing: 'keyboard', endCoordinates: { height: 300 } });
    });
    const panes = tree.root.findByType(FacingPanes).props.panes;
    expect(panes).toMatchObject({ axis: 'column', first: 0, gutter: 0, second: 703 });
    expect(sourceScroll(tree)).toBeDefined();
    expect(hiddenFromAccessibility(sourceScroll(tree))).toBe(true);
    const close = host(tree, 'accessibilityLabel', 'Close journal');
    expect(hiddenFromAccessibility(close)).toBe(false);
    expect(slotOf(tree, close).index).toBe(2);
    expect(mockDraftMounts).toBe(1);
    expect(configureNext).toHaveBeenCalledTimes(reducedMotion ? 0 : 1);

    act(() => {
      listeners.get('keyboardWillHide')?.({ duration: 250, easing: 'keyboard', endCoordinates: { height: 0 } });
    });
    expect(tree.root.findByType(FacingPanes).props.panes).toMatchObject({ axis: 'column', first: 331.5 });
    expect(hiddenFromAccessibility(sourceScroll(tree))).toBe(false);
    expect(configureNext).toHaveBeenCalledTimes(reducedMotion ? 0 : 2);
  });
});
