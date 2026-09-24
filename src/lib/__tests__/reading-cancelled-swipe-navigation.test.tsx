/* eslint-disable import/first */
/**
 * Reader cancellation regression harness.
 *
 * This file drives the production reader gesture callback with synthetic
 * content and a Honolulu calendar. It does not re-implement navigation logic.
 */
import React from 'react';

const renderer = require('react-test-renderer');
const { act } = renderer;

const DEVOTIONAL_ID = 'devo-reader-cancel';
const SERIES_TITLE = 'Still Waters';
const DAY_3_QUESTION = 'What stayed with you today?';
const DAY_4_QUESTION = 'What will you carry tomorrow?';
const DRAFT = 'A synthetic reflection draft.';
const DAY_3_COMPLETED_AT = '2026-09-15T04:46:34.000Z';
const TYPING_AT = '2026-09-15T04:47:00.000Z';
const DAY_4_FINISHED_AT = '2026-09-15T04:48:24.000Z';

const mockExpoNotif: {
  handleNotification: ((notification: unknown) => Promise<{
    shouldShowBanner?: boolean;
    shouldShowAlert?: boolean;
    shouldShowList?: boolean;
  }>) | null;
  responseListener: ((response: unknown) => void) | null;
} = {
  handleNotification: null,
  responseListener: null,
};

const mockReplace = jest.fn();
const mockWithTiming = jest.fn(
  (value: unknown, _config?: unknown, callback?: (finished: boolean) => void) => {
    callback?.(true);
    return value;
  },
);
const mockPanGesture = {
  enabledValues: [] as boolean[],
  onStart: null as null | ((event: { translationX: number }) => void),
  onUpdate: null as null | ((event: { translationX: number }) => void),
  onEnd: null as null | ((event: { translationX: number }, success: boolean) => void),
  onFinalize: null as null | ((event: { translationX: number }, success: boolean) => void),
};
const routeParams: { devotionalId: string; dayNumber?: string } = {
  devotionalId: DEVOTIONAL_ID,
  dayNumber: '3',
};

const mockExpoNotifApi = {
  getLastNotificationResponseAsync: jest.fn(async () => null),
  clearLastNotificationResponseAsync: jest.fn(async () => undefined),
};

jest.mock('expo-notifications', () => ({
  __esModule: true,
  setNotificationHandler: (config: { handleNotification: (notification: unknown) => Promise<unknown> }) => {
    mockExpoNotif.handleNotification = config.handleNotification as typeof mockExpoNotif.handleNotification;
  },
  addNotificationResponseReceivedListener: jest.fn((listener: (response: unknown) => void) => {
    mockExpoNotif.responseListener = listener;
    return { remove: jest.fn() };
  }),
  getLastNotificationResponseAsync: () => mockExpoNotifApi.getLastNotificationResponseAsync(),
  clearLastNotificationResponseAsync: () => mockExpoNotifApi.clearLastNotificationResponseAsync(),
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
  router: { replace: (...args: unknown[]) => mockReplace(...args), push: jest.fn() },
  useRouter: () => ({
    canGoBack: () => true,
    replace: mockReplace,
    push: jest.fn(),
    back: jest.fn(),
    setParams: jest.fn(),
  }),
  useLocalSearchParams: () => routeParams,
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

jest.mock('../copy-variation', () => ({
  copySeed: () => 'test-install',
  copyVariationFor: () => ({ seed: 'test-install', dayIndex: 20_000 }),
}));

jest.mock('../trial-notification', () => ({
  readTrialCheckInSkipDate: jest.fn(() => null),
}));

jest.mock('../logger', () => ({
  logger: { log: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

jest.mock('../bug-logger', () => ({
  logBugError: jest.fn(),
  logBugEvent: jest.fn(),
}));

jest.mock('../analytics', () => ({
  logEvent: jest.fn(),
  AnalyticsEvents: {},
}));

jest.mock('../sentry', () => ({
  addAppBreadcrumb: jest.fn(),
}));

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
    api.hitSlop = () => api;
    api.activeOffsetX = () => api;
    api.enabled = (enabled: boolean) => {
      mockPanGesture.enabledValues.push(enabled);
      return api;
    };
    api.onStart = (callback: typeof mockPanGesture.onStart) => {
      mockPanGesture.onStart = callback;
      return api;
    };
    api.onUpdate = (callback: typeof mockPanGesture.onUpdate) => {
      mockPanGesture.onUpdate = callback;
      return api;
    };
    api.onEnd = (callback: typeof mockPanGesture.onEnd) => {
      mockPanGesture.onEnd = callback;
      return api;
    };
    api.onFinalize = (callback: typeof mockPanGesture.onFinalize) => {
      mockPanGesture.onFinalize = callback;
      return api;
    };
    return api;
  };
  return {
    Gesture: { Pan: () => chain() },
    GestureDetector: View,
  };
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
    withTiming: mockWithTiming,
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
jest.mock('@/components/reading/DevotionalWebView', () => ({
  DevotionalWebView: () => null,
}));

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
jest.mock('@/hooks/usePremiumAccessPolicy', () => ({
  usePremiumAccessPolicy: () => 'granted',
}));
jest.mock('@/hooks/useCrossTabBack', () => ({
  useCrossTabBack: () => ({ handleBack: jest.fn() }),
}));
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
jest.mock('@/lib/book-opening', () => ({
  clearBookOpening: jest.fn(),
  markBookReaderReady: jest.fn(),
}));
jest.mock('@/lib/ambient-audio-feature', () => ({
  isAmbientAudioEnabled: () => false,
}));
jest.mock('@/lib/scripture-practice-feature', () => ({
  isScripturePracticeEnabled: () => false,
}));
jest.mock('@/lib/qa-tools', () => ({
  isQaToolsEnabled: () => false,
}));
jest.mock('@/lib/useReadingFont', () => ({
  useReadingFont: () => ({
    body: 'Body',
    bodyItalic: 'BodyItalic',
    display: 'Display',
    displayItalic: 'DisplayItalic',
  }),
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
jest.mock('expo-application', () => ({
  nativeApplicationVersion: '1.0.0',
  nativeBuildVersion: '1',
}));
jest.mock('expo-widgets', () => ({
  createWidget: jest.fn(() => () => null),
  createLiveActivity: jest.fn(() => ({})),
}));
jest.mock('expo/fetch', () => ({ fetch: jest.fn() }));
jest.mock('expo-sqlite', () => ({ openDatabaseAsync: jest.fn(async () => ({})) }));
jest.mock('expo-asset', () => ({
  Asset: { fromModule: jest.fn(() => ({ downloadAsync: jest.fn() })) },
}));
jest.mock('@expo/ui/swift-ui', () => new Proxy({}, { get: () => () => null }));
jest.mock('react-native-purchases', () => ({
  __esModule: true,
  default: {
    getCustomerInfo: jest.fn(async () => ({ entitlements: { active: {} } })),
    addCustomerInfoUpdateListener: jest.fn(),
  },
}));

import type { Devotional, DevotionalDay, UserProfile } from '@/lib/store';
const { ReadingScreen } = require('@/app/(tabs)/(today)/reading');
const { canonicalGeneratedDayId } = require('@/lib/devotional-canonical-days');
const { useUnfoldStore } = require('@/lib/store') as typeof import('@/lib/store');

type ReaderTree = {
  root: {
    findByProps: (props: Record<string, unknown>) => { props: Record<string, unknown> };
    findAllByProps: (props: Record<string, unknown>) => Array<{ props: Record<string, unknown> }>;
  };
  unmount: () => void;
};

function makeDay(dayNumber: number, overrides: Partial<DevotionalDay> = {}): DevotionalDay {
  return {
    id: canonicalGeneratedDayId(DEVOTIONAL_ID, dayNumber),
    devotionalId: DEVOTIONAL_ID,
    dayNumber,
    title: dayNumber === 3 ? 'The day Reader is writing' : 'The next morning',
    scriptureReference: dayNumber === 3 ? 'Psalm 46:10' : 'Lamentations 3:22-23',
    scriptureText: 'Scripture',
    bodyText: 'Body',
    quotableLine: 'Quote',
    isRead: dayNumber === 3,
    reflectionQuestions: [dayNumber === 3 ? DAY_3_QUESTION : DAY_4_QUESTION],
    ...overrides,
  };
}

function seedReader(): { nextDay: DevotionalDay; seriesStartDate: string } {
  const seriesStartDate = '2026-09-11T17:47:57.590Z';
  const day3 = makeDay(3, {
    isRead: true,
    readAt: DAY_3_COMPLETED_AT,
    updatedAt: DAY_3_COMPLETED_AT,
  });
  const series = {
    id: DEVOTIONAL_ID,
    title: SERIES_TITLE,
    totalDays: 7,
    currentDay: 3,
    createdAt: seriesStartDate,
    updatedAt: DAY_3_COMPLETED_AT,
    generationMode: 'progressive',
    seriesStartDate,
    days: [
      makeDay(1, { isRead: true, readAt: '2026-09-12T22:01:52.051Z' }),
      makeDay(2, { isRead: true, readAt: '2026-09-13T17:41:46.414Z' }),
      day3,
    ],
    userContext: {
      name: 'Reader',
      aboutMe: '',
      currentSituation: '',
      emotionalState: '',
    },
  } as unknown as Devotional;

  useUnfoldStore.setState({
    user: {
      name: 'Reader',
      fontSize: 'medium',
      isPremium: true,
      hasCompletedOnboarding: true,
      reminderTime: '8:00 AM',
      dailyReminderEnabled: true,
    } as unknown as UserProfile,
    devotionals: [series],
    currentDevotionalId: DEVOTIONAL_ID,
    journalEntries: [],
    bookmarks: [],
    highlights: [],
  });

  return {
    nextDay: makeDay(4, { isRead: false, updatedAt: DAY_4_FINISHED_AT }),
    seriesStartDate,
  };
}

function readerSnapshot(tree: ReaderTree) {
  const dayChrome = tree.root.findAllByProps({ accessibilityLabel: 'Day 3 of 7' });
  const nextDayChrome = tree.root.findAllByProps({ accessibilityLabel: 'Day 4 of 7' });
  const day3Question = tree.root.findAllByProps({
    accessibilityLabel: `Reflection question 1: ${DAY_3_QUESTION}`,
  });
  const day4Question = tree.root.findAllByProps({
    accessibilityLabel: `Reflection question 1: ${DAY_4_QUESTION}`,
  });
  const draftInput = tree.root.findAllByProps({ accessibilityLabel: `Your response to: ${DAY_3_QUESTION}` });
  const toolbar = tree.root.findAllByProps({ testID: 'reflection-keyboard-toolbar' });
  const questionNode = day3Question[0] ?? day4Question[0];
  return {
    dayLabel: dayChrome[0]?.props.accessibilityLabel ?? nextDayChrome[0]?.props.accessibilityLabel ?? null,
    question: questionNode?.props.accessibilityLabel ?? null,
    questionExpanded: (questionNode?.props.accessibilityState as { expanded?: boolean } | undefined)?.expanded ?? null,
    toolbarFocused: toolbar.length > 0,
    draft: draftInput[0]?.props.value ?? null,
  };
}

function expectedDay3Draft() {
  return {
    dayLabel: 'Day 3 of 7',
    question: `Reflection question 1: ${DAY_3_QUESTION}`,
    questionExpanded: true,
    toolbarFocused: true,
    draft: DRAFT,
  };
}

function expandAndFocusReflection(tree: ReaderTree) {
  const question = tree.root.findByProps({
    accessibilityLabel: `Reflection question 1: ${DAY_3_QUESTION}`,
  }) as { props: { onPress: () => void; accessibilityState?: { expanded?: boolean } } };
  if (question.props.accessibilityState?.expanded !== true) {
    act(() => {
      question.props.onPress();
    });
  }
  const draftInput = tree.root.findByProps({
    accessibilityLabel: `Your response to: ${DAY_3_QUESTION}`,
  }) as { props: { onFocus?: () => void; onChangeText: (text: string) => void } };
  act(() => {
    draftInput.props.onFocus?.();
  });
  return draftInput;
}

describe('reader swipe cancellation', () => {
  beforeEach(() => {
    jest.useFakeTimers({ now: new Date(TYPING_AT), advanceTimers: true });
    jest.clearAllMocks();
    routeParams.devotionalId = DEVOTIONAL_ID;
    routeParams.dayNumber = '3';
    mockPanGesture.enabledValues.length = 0;
    mockPanGesture.onStart = null;
    mockPanGesture.onUpdate = null;
    mockPanGesture.onEnd = null;
    mockPanGesture.onFinalize = null;
    useUnfoldStore.getState().reset();
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
    useUnfoldStore.getState().reset();
  });

  async function renderWithDayFour() {
    const { nextDay } = seedReader();
    useUnfoldStore.setState((state) => ({
      devotionals: state.devotionals.map((devotional) => devotional.id === DEVOTIONAL_ID
        ? { ...devotional, currentDay: 4, days: [...devotional.days, nextDay] }
        : devotional),
    }));

    let tree: ReaderTree;
    await act(async () => {
      tree = renderer.create(<ReadingScreen />);
    });
    return tree!;
  }

  it('unlocks the next reading when the mounted reader crosses local midnight', async () => {
    const midnight = new Date(TYPING_AT);
    midnight.setHours(24, 0, 0, 0);
    jest.setSystemTime(new Date(midnight.getTime() - 1000));
    const tree = await renderWithDayFour();
    act(() => { mockPanGesture.onEnd?.({ translationX: -100 }, true); });
    expect(readerSnapshot(tree).dayLabel).toBe('Day 3 of 7');
    await act(async () => { jest.advanceTimersByTime(1500); });
    act(() => { mockPanGesture.onEnd?.({ translationX: -100 }, true); });
    expect(readerSnapshot(tree).dayLabel).toBe('Day 4 of 7');
    act(() => tree.unmount());
  });

  it('keeps the focused Day 3 reflection stable when an active swipe is cancelled', async () => {
    const tree = await renderWithDayFour();
    const draftInput = expandAndFocusReflection(tree);
    act(() => {
      draftInput.props.onChangeText(DRAFT);
    });

    expect(readerSnapshot(tree)).toEqual(expectedDay3Draft());
    expect(mockPanGesture.onEnd).toEqual(expect.any(Function));
    expect(mockPanGesture.onFinalize).toEqual(expect.any(Function));

    mockWithTiming.mockClear();
    act(() => {
      mockPanGesture.onUpdate?.({ translationX: -100 });
      mockPanGesture.onEnd?.({ translationX: -100 }, false);
    });
    expect(mockWithTiming).not.toHaveBeenCalled();
    act(() => {
      mockPanGesture.onFinalize?.({ translationX: -100 }, false);
    });

    expect(readerSnapshot(tree)).toEqual(expectedDay3Draft());
    expect(mockWithTiming).toHaveBeenCalledWith(0, { duration: 250 });
    act(() => tree.unmount());
  });

  it('cleans up a pan that fails before activation without invoking navigation', async () => {
    const tree = await renderWithDayFour();

    expect(mockPanGesture.onFinalize).toEqual(expect.any(Function));
    mockWithTiming.mockClear();
    act(() => {
      mockPanGesture.onFinalize?.({ translationX: -10 }, false);
    });

    expect(readerSnapshot(tree).dayLabel).toBe('Day 3 of 7');
    expect(mockWithTiming).toHaveBeenCalledWith(0, { duration: 250 });
    act(() => tree.unmount());
  });

  it('does not claim a page swipe while a reflection field is focused', async () => {
    const tree = await renderWithDayFour();
    expandAndFocusReflection(tree);

    expect(mockPanGesture.enabledValues.at(-1)).toBe(false);
    act(() => tree.unmount());
  });

  it('preserves an intentional forward swipe outside reflection editing', async () => {
    const tomorrow = new Date(TYPING_AT);
    tomorrow.setHours(24, 1, 0, 0);
    jest.setSystemTime(tomorrow);
    const tree = await renderWithDayFour();

    expect(mockPanGesture.enabledValues.at(-1)).toBe(true);
    expect(mockPanGesture.onEnd).toEqual(expect.any(Function));
    expect(mockPanGesture.onFinalize).toEqual(expect.any(Function));
    mockWithTiming.mockClear();
    act(() => {
      mockPanGesture.onEnd?.({ translationX: -100 }, true);
    });

    expect(readerSnapshot(tree).dayLabel).toBe('Day 4 of 7');
    const timingCallsAfterSuccessfulEnd = mockWithTiming.mock.calls.length;
    act(() => {
      mockPanGesture.onFinalize?.({ translationX: -100 }, true);
    });
    expect(mockWithTiming).toHaveBeenCalledTimes(timingCallsAfterSuccessfulEnd);
    act(() => tree.unmount());
  });
});
