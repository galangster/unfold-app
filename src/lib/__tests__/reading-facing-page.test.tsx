/* eslint-disable import/first */
/**
 * The facing page (DESIGN.md, accepted 2026-09-14). On a paired window the
 * reflection questions and the response sit beside the reading. This file
 * drives the production reader, DevotionalContent, and InlineReflectionJournal
 * through a window change and checks what a person would see.
 */
import React from 'react';

const renderer = require('react-test-renderer');
const { act } = renderer;

const DEVOTIONAL_ID = 'devo-facing-page';
const QUESTION = 'Where did you notice rest today?';
const DRAFT = 'In the walk home, before the phone came out.';

const mockPush = jest.fn();
const mockWindow = { width: 390, height: 844, insetTop: 47, insetBottom: 34, insetLeft: 0, insetRight: 0 };

jest.mock('@/hooks/useAdaptiveLayout', () => ({
  useAdaptiveLayout: () => jest.requireActual('@/lib/adaptive-layout').resolveAdaptiveLayout(mockWindow),
}));

jest.mock('expo-notifications', () => ({
  __esModule: true,
  setNotificationHandler: jest.fn(),
  addNotificationResponseReceivedListener: jest.fn(() => ({ remove: jest.fn() })),
  getLastNotificationResponseAsync: jest.fn(async () => null),
  clearLastNotificationResponseAsync: jest.fn(async () => undefined),
  getPermissionsAsync: jest.fn(async () => ({ status: 'granted' })),
  requestPermissionsAsync: jest.fn(async () => ({ status: 'granted' })),
  scheduleNotificationAsync: jest.fn(async () => 'notif-id'),
  cancelScheduledNotificationAsync: jest.fn(async () => undefined),
  cancelAllScheduledNotificationsAsync: jest.fn(async () => undefined),
  getAllScheduledNotificationsAsync: jest.fn(async () => []),
  setNotificationCategoryAsync: jest.fn(async () => undefined),
  setNotificationChannelAsync: jest.fn(async () => undefined),
  AndroidImportance: { HIGH: 4, MAX: 5, DEFAULT: 3 },
  SchedulableTriggerInputTypes: { DAILY: 'daily', TIME_INTERVAL: 'time_interval', DATE: 'date' },
}));

jest.mock('expo-router', () => ({
  router: { replace: jest.fn(), push: jest.fn() },
  useRouter: () => ({
    canGoBack: () => true,
    replace: jest.fn(),
    push: mockPush,
    back: jest.fn(),
    setParams: jest.fn(),
  }),
  useLocalSearchParams: () => ({ devotionalId: DEVOTIONAL_ID, dayNumber: '1' }),
  useSegments: () => ['(tabs)', '(today)', 'reading'],
  useNavigation: () => ({ getState: () => ({ index: 1, routes: [] }), addListener: jest.fn(() => jest.fn()) }),
  useIsFocused: () => true,
  useFocusEffect: () => undefined,
}));

jest.mock('expo-device', () => ({ isDevice: false }));
jest.mock('expo-constants', () => ({
  __esModule: true,
  default: { expoConfig: { extra: { eas: { projectId: 'test-project' }, buildProfile: 'development' } } },
}));
jest.mock('../api-config', () => ({
  PRIMARY_BACKEND_URL: 'https://example.test',
  getAuthHeaders: jest.fn(async () => ({ 'Content-Type': 'application/json' })),
}));
jest.mock('../mmkv-storage', () => {
  const store = new Map<string, string>();
  return {
    mmkvStorage: {
      getItem: jest.fn((key: string) => store.get(key) ?? null),
      setItem: jest.fn((key: string, value: string) => {
        store.set(key, value);
      }),
      removeItem: jest.fn((key: string) => {
        store.delete(key);
      }),
    },
    getDeviceId: jest.fn(() => 'test-device-id'),
    getSharedEncryptionKey: jest.fn(() => 'test-key'),
    isRecoverySession: jest.fn(() => false),
  };
});
jest.mock('../auto-trial-intent', () => ({
  readAutoTrialIntent: jest.fn(() => null),
  transitionAutoTrialIntent: jest.fn(),
}));
jest.mock('../logger', () => ({ logger: { log: jest.fn(), warn: jest.fn(), error: jest.fn() } }));
jest.mock('../bug-logger', () => ({ logBugError: jest.fn(), logBugEvent: jest.fn() }));
jest.mock('../analytics', () => ({ logEvent: jest.fn(), AnalyticsEvents: {} }));
jest.mock('../sentry', () => ({ addAppBreadcrumb: jest.fn() }));
jest.mock('@react-native-community/netinfo', () => ({
  __esModule: true,
  default: {
    fetch: jest.fn(async () => ({ isConnected: true, isInternetReachable: true })),
    addEventListener: jest.fn(() => jest.fn()),
  },
}));
jest.mock('react-native-keyboard-controller', () => ({
  KeyboardStickyView: require('react-native').View,
}));
jest.mock('react-native-gesture-handler', () => {
  const { View } = require('react-native');
  const chain = () => {
    const api: Record<string, unknown> = {};
    for (const method of ['hitSlop', 'activeOffsetX', 'enabled', 'onStart', 'onUpdate', 'onEnd', 'onFinalize']) {
      api[method] = () => api;
    }
    return api;
  };
  return { Gesture: { Pan: () => chain() }, GestureDetector: View };
});
jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: require('react-native').View,
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(),
  notificationAsync: jest.fn(),
  selectionAsync: jest.fn(),
  ImpactFeedbackStyle: { Light: 'light', Medium: 'medium' },
  NotificationFeedbackType: { Success: 'success', Warning: 'warning', Error: 'error' },
}));
jest.mock('react-native-reanimated', () => {
  const { View, ScrollView } = require('react-native');
  const chain: Record<string, unknown> = {};
  chain.duration = () => chain;
  chain.delay = () => chain;
  chain.easing = () => chain;
  return {
    __esModule: true,
    default: { View, ScrollView, createAnimatedComponent: (component: unknown) => component },
    FadeIn: chain,
    FadeOut: chain,
    FadeInDown: chain,
    SlideInDown: chain,
    SlideOutDown: chain,
    Easing: { cubic: 'cubic', ease: 'ease', out: () => 'out', in: () => 'in', inOut: () => 'inOut', bezier: () => 'bezier' },
    useSharedValue: (value: unknown) => ({ value }),
    useAnimatedStyle: () => ({}),
    useAnimatedProps: (factory: () => unknown) => factory(),
    cancelAnimation: jest.fn(),
    useAnimatedScrollHandler: () => ({}),
    withTiming: (value: unknown) => value,
    withRepeat: (value: unknown) => value,
    withSequence: (value: unknown) => value,
    withSpring: (value: unknown) => value,
    withDelay: (_delay: number, value: unknown) => value,
    runOnJS: (fn: (...args: unknown[]) => void) => fn,
    useReducedMotion: () => true,
  };
});
jest.mock('@/lib/theme', () => ({
  useTheme: () => ({
    isDark: true,
    colors: new Proxy({}, { get: (_target, prop) => (typeof prop === 'string' ? '#888888' : undefined) }),
  }),
}));
jest.mock('@/components/icons', () => new Proxy({}, { get: () => () => null }));
jest.mock('@/components/UndoToast', () => ({ UndoToast: () => null }));
jest.mock('@/components/CompletionCelebration', () => ({ CompletionCelebration: () => null }));
jest.mock('@/components/reading/StudyMethodSheet', () => ({ StudyMethodSheet: () => null }));
jest.mock('@/components/reading/ReaderOutlineSheet', () => ({ ReaderOutlineSheet: () => null }));
jest.mock('@/components/ScriptureTapSheet', () => ({ ScriptureTapSheet: () => null }));
jest.mock('@/components/reading/DevotionalReaderPreferencesSheet', () => ({
  DevotionalReaderPreferencesSheet: () => null,
}));
jest.mock('@/components/PremiumFeatureSheet', () => ({ PremiumFeatureSheet: () => null }));
jest.mock('@/components/PremiumNudgeCard', () => ({ PremiumNudgeCard: () => null }));
jest.mock('@/components/ambient/AmbientMusicEntry', () => ({ AmbientMusicEntry: () => null }));
jest.mock('@/components/reading/TomorrowPreview', () => ({ TomorrowPreview: () => null }));
jest.mock('@/components/reading/ScripturePracticeSheet', () => ({
  ScripturePracticeSheet: () => null,
  buildPracticeBibleHref: () => '',
}));
jest.mock('@/components/reading/DevotionalWebView', () => ({ DevotionalWebView: () => null }));
jest.mock('@/lib/bible-api', () => ({
  fetchVerse: jest.fn(async () => null),
  fetchVerseLocal: jest.fn(async () => null),
}));
jest.mock('@/hooks/useGlobalAudioPlayer', () => ({
  useGlobalAudioPlayer: () => ({ startAudio: jest.fn(), stopAudio: jest.fn() }),
}));
jest.mock('@/hooks/useAutoHide', () => ({ useAutoHide: () => undefined }));
jest.mock('@/hooks/usePremiumNudge', () => ({
  usePremiumNudge: () => ({ nudge: null, onAction: jest.fn(), onDismiss: jest.fn() }),
}));
jest.mock('@/hooks/usePremiumAccessPolicy', () => ({ usePremiumAccessPolicy: () => 'granted' }));
jest.mock('@/hooks/useCrossTabBack', () => ({ useCrossTabBack: () => ({ handleBack: jest.fn() }) }));
jest.mock('@/hooks/useGeneratedDayWatch', () => ({
  useGeneratedDayWatch: () => ({
    state: { status: 'idle' },
    checkAgain: jest.fn(async () => undefined),
    retry: jest.fn(async () => undefined),
  }),
}));
jest.mock('@/lib/widget-bridge', () => ({
  syncWidgets: jest.fn(),
  startReadingSession: jest.fn(),
  endReadingSession: jest.fn(),
}));
jest.mock('@/lib/tts-service', () => ({
  getDefaultVoice: () => 'voice',
  prefetchDevotionalAudio: jest.fn(),
  streamDevotionalAudio: jest.fn(),
  buildTtsText: () => '',
}));
jest.mock('@/lib/day-completion-cue', () => ({ emitDayCompletionCueAfterSave: jest.fn() }));
jest.mock('@/lib/book-opening-capture', () => ({ markBookReaderReadyWithSnapshot: jest.fn() }));
jest.mock('@/lib/book-opening', () => ({ clearBookOpening: jest.fn(), markBookReaderReady: jest.fn() }));
jest.mock('@/lib/ambient-audio-feature', () => ({ isAmbientAudioEnabled: () => false }));
jest.mock('@/lib/scripture-practice-feature', () => ({ isScripturePracticeEnabled: () => false }));
jest.mock('@/lib/qa-tools', () => ({ isQaToolsEnabled: () => false }));
jest.mock('@/lib/useReadingFont', () => ({
  useReadingFont: () => ({ body: 'Body', bodyItalic: 'BodyItalic', display: 'Display', displayItalic: 'DisplayItalic' }),
}));
jest.mock('expo-linear-gradient', () => ({ LinearGradient: require('react-native').View }));
jest.mock('expo-blur', () => ({ BlurView: require('react-native').View }));
jest.mock('expo-file-system/legacy', () => ({
  documentDirectory: 'file:///documents/',
  cacheDirectory: 'file:///cache/',
  deleteAsync: jest.fn(async () => undefined),
  readDirectoryAsync: jest.fn(async () => []),
  getInfoAsync: jest.fn(async () => ({ exists: false })),
  makeDirectoryAsync: jest.fn(async () => undefined),
  downloadAsync: jest.fn(async () => ({ status: 200 })),
  createDownloadResumable: jest.fn(() => ({ downloadAsync: jest.fn(async () => ({ status: 200 })) })),
}));
jest.mock('expo-file-system', () => ({ File: jest.fn(), Paths: { cache: '' }, Directory: jest.fn() }));
jest.mock('expo-store-review', () => ({
  isAvailableAsync: jest.fn(async () => false),
  requestReview: jest.fn(async () => undefined),
}));
jest.mock('expo-application', () => ({ nativeApplicationVersion: '1.0.0', nativeBuildVersion: '1' }));
jest.mock('expo-widgets', () => ({
  createWidget: jest.fn(() => () => null),
  createLiveActivity: jest.fn(() => ({})),
}));
jest.mock('expo/fetch', () => ({ fetch: jest.fn() }));
jest.mock('expo-sqlite', () => ({ openDatabaseAsync: jest.fn(async () => ({})) }));
jest.mock('expo-asset', () => ({ Asset: { fromModule: jest.fn(() => ({ downloadAsync: jest.fn() })) } }));
jest.mock('@expo/ui/swift-ui', () => new Proxy({}, { get: () => () => null }));
jest.mock('react-native-purchases', () => ({
  __esModule: true,
  default: {
    getCustomerInfo: jest.fn(async () => ({ entitlements: { active: {} } })),
    addCustomerInfoUpdateListener: jest.fn(),
  },
}));

import type { Devotional, UserProfile } from '@/lib/store';
const { ReadingScreen } = require('@/app/(tabs)/(today)/reading');
const { useUnfoldStore } = require('@/lib/store') as typeof import('@/lib/store');
const { DevotionalContent } = require('@/components/reading/DevotionalContent');

type Node = {
  type: unknown;
  props: Record<string, unknown>;
  findAllByProps: (props: Record<string, unknown>) => Node[];
  findByType: (type: unknown) => Node;
};
type ReaderTree = { root: Node; update: (element: React.ReactElement) => void; unmount: () => void };

const PHONE = { width: 390, height: 844, insetTop: 47, insetBottom: 34, insetLeft: 0, insetRight: 0 };
const DUO_OPEN = { width: 951, height: 669, insetTop: 24, insetBottom: 20, insetLeft: 0, insetRight: 0 };
const DUO_UPRIGHT = { width: 669, height: 951, insetTop: 24, insetBottom: 20, insetLeft: 0, insetRight: 0 };

function seedReader() {
  useUnfoldStore.setState({
    user: { name: 'Ada', fontSize: 'medium', isPremium: true, hasCompletedOnboarding: true } as unknown as UserProfile,
    devotionals: [{
      id: DEVOTIONAL_ID,
      title: 'Rest',
      totalDays: 7,
      currentDay: 1,
      createdAt: '2026-09-20T12:00:00.000Z',
      days: [{
        id: `${DEVOTIONAL_ID}-1`,
        devotionalId: DEVOTIONAL_ID,
        dayNumber: 1,
        title: 'Room to breathe',
        scriptureReference: 'Matthew 11:28',
        scriptureText: 'Come to me.',
        bodyText: 'Body',
        quotableLine: 'Quote',
        closingPrayer: 'Teach me to rest in you.',
        isRead: false,
        reflectionQuestions: [QUESTION],
      }],
    } as unknown as Devotional],
    currentDevotionalId: DEVOTIONAL_ID,
    journalEntries: [],
    bookmarks: [],
    highlights: [],
  });
}

function responseInputs(root: Node) {
  return root.findAllByProps({ accessibilityLabel: `Your response to: ${QUESTION}` })
    .filter((node) => typeof node.type === 'string' && typeof node.props.onChangeText === 'function');
}

function isInsideFacingPage(root: Node, input: Node) {
  return root.findAllByProps({ testID: 'reflection-facing-page' })
    .some((page) => page.findAllByProps({ accessibilityLabel: input.props.accessibilityLabel }).includes(input));
}

async function renderAt(window: typeof PHONE): Promise<ReaderTree> {
  Object.assign(mockWindow, window);
  let tree: ReaderTree;
  await act(async () => {
    tree = renderer.create(<ReadingScreen />);
  });
  return tree!;
}

async function resizeTo(tree: ReaderTree, window: typeof PHONE) {
  Object.assign(mockWindow, window);
  await act(async () => {
    tree.update(<ReadingScreen />);
  });
}

describe('reader facing page', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useUnfoldStore.getState().reset();
    seedReader();
  });

  afterEach(() => {
    useUnfoldStore.getState().reset();
  });

  it('keeps reflection inline on a phone', async () => {
    const tree = await renderAt(PHONE);
    expect(tree.root.findAllByProps({ testID: 'reflection-facing-page' })).toHaveLength(0);
    expect(tree.root.findAllByProps({ testID: 'reading-reflection-section' }).length).toBeGreaterThan(0);
    expect(responseInputs(tree.root)).toHaveLength(1);
    act(() => tree.unmount());
  });

  it.each([
    ['open', DUO_OPEN],
    ['upright', DUO_UPRIGHT],
  ])('moves the one reflection journal to the facing page on a Duo %s', async (_label, window) => {
    const tree = await renderAt(window);
    expect(tree.root.findAllByProps({ testID: 'reading-reflection-section' })).toHaveLength(0);
    const inputs = responseInputs(tree.root);
    expect(inputs).toHaveLength(1);
    expect(isInsideFacingPage(tree.root, inputs[0])).toBe(true);
    act(() => tree.unmount());
  });

  it('reflows the reading once when pairing starts and once when it ends', async () => {
    const tree = await renderAt(PHONE);
    const generation = () => tree.root.findByType(DevotionalContent).props.layoutGeneration as number;
    const start = generation();
    await resizeTo(tree, DUO_OPEN);
    expect(generation()).toBe(start + 1);
    await resizeTo(tree, PHONE);
    expect(generation()).toBe(start + 2);
    act(() => tree.unmount());
  });

  it('carries an unsaved draft across opening and closing the device', async () => {
    // An earlier answer is saved, so the incoming journal starts from the store.
    const store = useUnfoldStore.getState();
    const entryId = store.addJournalEntry({ devotionalId: DEVOTIONAL_ID, dayNumber: 1, content: '' });
    store.updateQuestionResponse(entryId, QUESTION, 'In the walk home.');
    const tree = await renderAt(PHONE);
    const phoneInput = responseInputs(tree.root)[0] as unknown as { props: { onFocus?: () => void; onChangeText: (text: string) => void } };
    act(() => {
      phoneInput.props.onFocus?.();
      phoneInput.props.onChangeText(DRAFT);
    });

    await resizeTo(tree, DUO_OPEN);
    const facingInputs = responseInputs(tree.root);
    expect(facingInputs).toHaveLength(1);
    expect(isInsideFacingPage(tree.root, facingInputs[0])).toBe(true);
    expect(facingInputs[0].props.value).toBe(DRAFT);
    expect(
      useUnfoldStore.getState().getJournalEntry(DEVOTIONAL_ID, 1)?.questionResponses?.[0]?.response,
    ).toBe(DRAFT);

    await resizeTo(tree, PHONE);
    const inlineInputs = responseInputs(tree.root);
    expect(inlineInputs).toHaveLength(1);
    expect(isInsideFacingPage(tree.root, inlineInputs[0])).toBe(false);
    expect(inlineInputs[0].props.value).toBe(DRAFT);
    act(() => tree.unmount());
  });

  it('opens the prayer session for the day being read', async () => {
    const tree = await renderAt(PHONE);
    const [stay] = tree.root.findAllByProps({ accessibilityHint: 'Opens this prayer on its own, full screen' })
      .filter((node) => typeof node.props.onPress === 'function');
    act(() => {
      (stay.props.onPress as () => void)();
    });
    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/stay',
      params: { devotionalId: DEVOTIONAL_ID, dayNumber: '1' },
    });
    act(() => tree.unmount());
  });
});
