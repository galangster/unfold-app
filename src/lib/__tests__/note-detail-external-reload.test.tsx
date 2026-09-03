/**
 * note-detail reads the note's content into the editor once per mount
 * (initialHtml on the native editor, initialContent on tentap). When the
 * store's copy changes underneath an open note — a push conflict resolved
 * to the server's version, or a pull — the screen kept showing the stale
 * text, and its next autosave wrote that stale text back over the server's.
 * The editor now reloads from the store when updatedAt changes and no local
 * edit is pending. This drives the REAL NoteDetailScreen (iOS/native path).
 */
import React from 'react';
import { TextInput } from 'react-native';

// react-test-renderer types are not installed in this app; keep this aligned
// with the existing component-test pattern.
const renderer = require('react-test-renderer');
const { act } = renderer;

(globalThis as any).__noteParams = { noteId: 'note-1' };
(globalThis as any).__editorMounts = [] as string[];

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
      getHtml: () => new Promise(() => {}),
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
  };
});

import NoteDetailScreen from '../../app/(tabs)/(journal)/note-detail';
import { resolveExternalNoteReload } from '@/lib/note-detail-editor';
import { AUTOSAVE_DEBOUNCE_MS } from '@/lib/autosave-controller';
import { useUnfoldStore, type Note } from '@/lib/store';

const T0 = '2026-09-01T12:00:00.000Z';
const T1 = '2026-09-01T12:00:30.000Z';

const NOTE: Note = {
  id: 'note-1',
  title: 'Shared note',
  content: '<p>DEVICE A VERSION</p>',
  createdAt: T0,
  updatedAt: T0,
  category: 'general',
  tags: [],
  isFavorite: false,
  scriptureRefs: [],
};

const editorMounts = () => (globalThis as any).__editorMounts as string[];

function landServerVersion(content: string, title = NOTE.title) {
  // What a resolved push conflict / a pull writes into the store.
  useUnfoldStore.setState((state) => ({
    notes: state.notes.map((n) => (n.id === NOTE.id ? { ...n, content, title, updatedAt: T1 } : n)),
  }));
}

function editorNode(tree: any) {
  return tree.root.findAll((node: any) => node.props.testID === 'unfold-editor-mock' && typeof node.type === 'string')[0];
}

function titleInput(tree: any) {
  return tree.root.findAll((node: any) => node.type === TextInput && node.props.testID === 'note-title-input')[0];
}

describe('note-detail: an external version of the open note', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    (globalThis as any).__editorMounts = [];
    useUnfoldStore.getState().reset();
    useUnfoldStore.setState({ notes: [NOTE] });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('reloads the editor and title when the store changes and nothing local is pending', () => {
    let tree: any;
    act(() => { tree = renderer.create(<NoteDetailScreen />); });
    expect(editorMounts()).toEqual(['<p>DEVICE A VERSION</p>']);
    expect(titleInput(tree).props.value).toBe('Shared note');

    act(() => { landServerVersion('<p>DEVICE B VERSION (newer)</p>', 'Shared note (B)'); });

    expect(editorMounts()).toEqual(['<p>DEVICE A VERSION</p>', '<p>DEVICE B VERSION (newer)</p>']);
    expect(titleInput(tree).props.value).toBe('Shared note (B)');
    act(() => tree.unmount());
  });

  it('does not reload while a local edit is pending, and the edit still saves', () => {
    let tree: any;
    act(() => { tree = renderer.create(<NoteDetailScreen />); });

    act(() => {
      editorNode(tree).props.onChangeHtml({ nativeEvent: { html: '<p>typing on A</p>' } });
    });
    act(() => { landServerVersion('<p>DEVICE B VERSION</p>'); });
    expect(editorMounts()).toHaveLength(1);

    act(() => { jest.advanceTimersByTime(AUTOSAVE_DEBOUNCE_MS + 10); });
    expect(useUnfoldStore.getState().notes[0].content).toBe('<p>typing on A</p>');
    expect(editorMounts()).toHaveLength(1);
    act(() => tree.unmount());
  });

  it('does not reload on its own save (updatedAt moves, content already matches)', () => {
    let tree: any;
    act(() => { tree = renderer.create(<NoteDetailScreen />); });

    act(() => {
      editorNode(tree).props.onChangeHtml({ nativeEvent: { html: '<p>own edit</p>' } });
    });
    act(() => { jest.advanceTimersByTime(AUTOSAVE_DEBOUNCE_MS + 200); });
    expect(useUnfoldStore.getState().notes[0].content).toBe('<p>own edit</p>');
    expect(editorMounts()).toHaveLength(1);
    act(() => tree.unmount());
  });
});

describe('resolveExternalNoteReload', () => {
  const base = { storeTitle: 'T', storeHtml: '<p>a</p>', editorTitle: 'T', editorHtml: '<p>a</p>', hasPendingEdit: false };

  it('is null while an edit is pending or when the store already matches the editor', () => {
    expect(resolveExternalNoteReload({ ...base, storeHtml: '<p>b</p>', hasPendingEdit: true })).toBeNull();
    expect(resolveExternalNoteReload(base)).toBeNull();
    // Visually-empty HTML on either side is the same empty note.
    expect(resolveExternalNoteReload({ ...base, storeHtml: '<p></p>', editorHtml: '' })).toBeNull();
  });

  it('returns only the parts that differ', () => {
    expect(resolveExternalNoteReload({ ...base, storeHtml: '<p>b</p>' })).toEqual({ html: '<p>b</p>' });
    expect(resolveExternalNoteReload({ ...base, storeTitle: 'New' })).toEqual({ title: 'New' });
    expect(resolveExternalNoteReload({ ...base, storeTitle: 'New', storeHtml: '<p>b</p>' })).toEqual({
      title: 'New',
      html: '<p>b</p>',
    });
  });
});
