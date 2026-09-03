/**
 * On background, note-detail flushed its autosave with allowEmpty=true, which
 * read the note body by AWAITING the editor bridge (getCurrentEditorHtml) —
 * a round trip to the native view / WebView, started at the moment iOS is
 * suspending the app. latestHtmlRef already holds that text, so the flush now
 * reads the refs synchronously; explicit user actions (Back, Minimize, menu
 * actions) still ask the editor for the freshest HTML. This drives the REAL
 * NoteDetailScreen (iOS/native path).
 */
import React from 'react';
import { AppState, TextInput } from 'react-native';

// react-test-renderer types are not installed in this app; keep this aligned
// with the existing component-test pattern.
const renderer = require('react-test-renderer');
const { act } = renderer;

(globalThis as any).__noteParams = { noteId: 'note-1' };
(globalThis as any).__editorMounts = [] as string[];
(globalThis as any).__getHtmlImpl = () => new Promise(() => {});

jest.mock('expo-router', () => {
  const ReactActual = require('react');
  return {
    useRouter: () => ({ back: jest.fn(), replace: jest.fn(), push: jest.fn() }),
    useLocalSearchParams: () => (globalThis as any).__noteParams,
    useFocusEffect: (callback: () => void | (() => void)) => {
      ReactActual.useEffect(callback, [callback]);
    },
  };
});

jest.mock('react-native-safe-area-context', () => {
  const { View } = require('react-native');
  return {
    SafeAreaView: View,
    useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
  };
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
    LinearTransition: chainable(),
    Easing: {
      out: () => 'out',
      in: () => 'in',
      inOut: () => 'inOut',
      cubic: 'cubic',
      quad: 'quad',
      linear: 'linear',
      ease: 'ease',
      bezier: () => 'bezier',
    },
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

// The native editor: records every mount's initialHtml (the native view
// applies initialHtml exactly once per mount — a reload IS a remount).
jest.mock('unfold-editor', () => {
  const ReactActual = require('react');
  const { View } = require('react-native');
  const UnfoldEditor = ReactActual.forwardRef(function UnfoldEditorMock(props: any, ref: any) {
    ReactActual.useImperativeHandle(ref, () => ({
      getHtml: () => (globalThis as any).__getHtmlImpl(),
      focus: async () => {},
      blur: async () => {},
      getSelectionState: async () => ({
        bold: false, italic: false, underline: false, strikethrough: false, code: false,
        hasLink: false, linkUrl: null, blockType: 'p', listType: null, start: 0, end: 0,
      }),
    }));
    ReactActual.useEffect(() => {
      (globalThis as any).__editorMounts.push(props.initialHtml);
    }, []);
    return ReactActual.createElement(View, { testID: 'unfold-editor-mock', ...props });
  });
  return { UnfoldEditor };
});

// tentap is inert on the native path but its hooks still run.
jest.mock('@10play/tentap-editor', () => {
  const editor = {
    getHTML: async () => '',
    setContent: jest.fn(),
    focus: jest.fn(),
    blur: jest.fn(),
    injectCSS: jest.fn(),
    injectJS: jest.fn(),
    updateScrollThresholdAndMargin: jest.fn(),
    undo: jest.fn(),
    redo: jest.fn(),
    toggleBold: jest.fn(),
    toggleItalic: jest.fn(),
    toggleBulletList: jest.fn(),
    toggleOrderedList: jest.fn(),
    toggleTaskList: jest.fn(),
    toggleHeading: jest.fn(),
    lift: jest.fn(),
    sink: jest.fn(),
  };
  return {
    useEditorBridge: () => editor,
    useBridgeState: () => ({ isReady: false }),
    useKeyboard: () => ({ keyboardHeight: 0, isKeyboardUp: false }),
    RichText: () => null,
    TenTapStartKit: [],
    TaskListBridge: {},
    HeadingBridge: {},
    ListItemBridge: {},
    BlockquoteBridge: {},
    PlaceholderBridge: { configureExtension: () => ({}) },
  };
});

jest.mock('@/lib/theme', () => ({
  useTheme: () => ({
    colors: new Proxy({}, { get: (_target, prop) => (typeof prop === 'string' ? '#888888' : undefined) }),
    isDark: true,
  }),
}));
jest.mock('@/lib/logger', () => ({ logger: { log: jest.fn(), warn: jest.fn(), error: jest.fn() } }));
jest.mock('@/components/notebook/ScriptureRefPill', () => ({ ScriptureRefPill: () => null }));
jest.mock('@/components/notebook/ScriptureSearchSheet', () => ({ ScriptureSearchSheet: () => null }));
jest.mock('@/components/notebook/MoveFolderSheet', () => ({ MoveFolderSheet: () => null }));
jest.mock('@/components/notebook/CreateFolderSheet', () => ({ CreateFolderSheet: () => null }));
jest.mock('@/components/notebook/NoteDetailSaveIndicator', () => ({ NoteDetailSaveIndicator: () => null }));
jest.mock('@/components/ExclusiveOfferSheet', () => ({ ExclusiveOfferSheet: () => null }));
jest.mock('@/components/ui', () => ({ alpha: (color: string) => color }));
jest.mock('@/hooks/useCreationGate', () => ({
  useCreationGate: () => ({
    policy: 'granted',
    isPremium: true,
    gate: () => true,
    showExclusiveOffer: false,
    dismissOffer: jest.fn(),
  }),
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
    __store: store,
  };
});

import NoteDetailScreen from '../../app/(tabs)/(journal)/note-detail';
import { STORE_PERSIST_DEBOUNCE_MS } from '@/lib/debounced-persist-storage';
import { useUnfoldStore, type Note } from '@/lib/store';

const mmkv = (jest.requireMock('@/lib/mmkv-storage') as { __store: Map<string, string> }).__store;
const persistedBlob = () => mmkv.get('unfold-storage') ?? '';

const T0 = '2026-09-01T12:00:00.000Z';
const NOTE: Note = {
  id: 'note-1',
  title: 'Sermon notes',
  content: '<p>earlier text</p>',
  createdAt: T0,
  updatedAt: T0,
  category: 'general',
  tags: [],
  isFavorite: false,
  scriptureRefs: [],
};

const TYPED = '<p>the last sentence before the app was killed</p>';

/** Every AppState listener, in registration order: store.ts first, then the screen. */
const appStateListeners = () =>
  (AppState.addEventListener as jest.Mock).mock.calls.map((call: unknown[]) => call[1] as (s: string) => void);

function editorNode(tree: any) {
  return tree.root.findAll(
    (node: any) => node.props.testID === 'unfold-editor-mock' && typeof node.type === 'string',
  )[0];
}

describe('note-detail: backgrounding while the editor bridge is unavailable', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    (globalThis as any).__editorMounts = [];
    // The bridge never answers — the app is suspending.
    (globalThis as any).__getHtmlImpl = () => new Promise(() => {});
    (globalThis as any).__noteParams = { noteId: 'note-1' };
    mmkv.clear();
    useUnfoldStore.getState().reset();
    useUnfoldStore.setState({ notes: [NOTE] });
    act(() => { jest.advanceTimersByTime(STORE_PERSIST_DEBOUNCE_MS + 10); }); // settle seeding writes
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('saves the last edit from its refs, without waiting for the editor', () => {
    let tree: any;
    act(() => { tree = renderer.create(<NoteDetailScreen />); });
    act(() => { editorNode(tree).props.onChangeHtml({ nativeEvent: { html: TYPED } }); });

    // Background before the 800 ms autosave debounce fires.
    act(() => { for (const listener of appStateListeners()) listener('inactive'); });

    expect(useUnfoldStore.getState().notes[0].content).toBe(TYPED);
    expect(persistedBlob()).toContain('the last sentence before the app was killed');
    act(() => tree.unmount());
  });

  it('saves a title-only edit the same way', () => {
    let tree: any;
    act(() => { tree = renderer.create(<NoteDetailScreen />); });
    const titleInput = tree.root.findAll(
      (node: any) => node.type === TextInput && node.props.testID === 'note-title-input',
    )[0];
    act(() => { titleInput.props.onChangeText('Renamed while leaving'); });

    act(() => { for (const listener of appStateListeners()) listener('inactive'); });

    expect(useUnfoldStore.getState().notes[0].title).toBe('Renamed while leaving');
    act(() => tree.unmount());
  });

  it('still asks the editor for the freshest HTML on an explicit save', async () => {
    (globalThis as any).__getHtmlImpl = async () => '<p>freshest from the bridge</p>';
    let tree: any;
    act(() => { tree = renderer.create(<NoteDetailScreen />); });

    const backButton = tree.root.findAll(
      (node: any) => node.props.accessibilityLabel === 'Go back' && typeof node.type !== 'string',
    )[0];
    await act(async () => { await backButton.props.onPress(); });

    expect(useUnfoldStore.getState().notes[0].content).toBe('<p>freshest from the bridge</p>');
    act(() => tree.unmount());
  });
});
