/* eslint-disable import/first */
/**
 * Reader cancellation regression harness.
 *
 * This file drives the production reader gesture callback with synthetic
 * content and a Honolulu calendar. It does not re-implement navigation logic.
 */
import React from 'react';
import { Alert } from 'react-native';

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
const mockNavigate = jest.fn();
const mockSetParams = jest.fn((params: Partial<typeof routeParams>) => Object.assign(routeParams, params));
let mockFocused = true;
const mockPullDevotionalContent = jest.fn();
const mockDailyCheckAgain = jest.fn(async () => undefined);
const mockDailyRetry = jest.fn(async () => undefined);
const mockLogBugError = jest.fn();
const mockCaptureAppError = jest.fn();
let mockDailyGenerationState: Record<string, unknown> = { status: 'idle' };
let mockUseRealGeneratedDayWatch = false;
const mockFindDayJob = jest.fn();
const mockPollJobStatus = jest.fn();
const mockSubmitGenerationJob = jest.fn();
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
const routeParams: { devotionalId: string; dayNumber?: string; readOnly?: string } = {
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
    navigate: mockNavigate,
    push: jest.fn(),
    back: jest.fn(),
    setParams: mockSetParams,
  }),
  useLocalSearchParams: () => routeParams,
  useSegments: () => ['(tabs)', '(today)', 'reading'],
  useNavigation: () => ({ getState: () => ({ index: 1, routes: [] }), addListener: jest.fn(() => jest.fn()) }),
  useIsFocused: () => mockFocused,
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

jest.mock('@/lib/generation-api', () => {
  const actual = jest.requireActual('@/lib/generation-api') as Record<string, unknown>;
  return {
    ...actual,
    findDayJob: (...args: unknown[]) => mockFindDayJob(...args),
    pollJobStatus: (...args: unknown[]) => mockPollJobStatus(...args),
    submitGenerationJob: (...args: unknown[]) => mockSubmitGenerationJob(...args),
  };
});

jest.mock('@/lib/devotional-sync-pull', () => {
  const actual = jest.requireActual('@/lib/devotional-sync-pull');
  return {
    ...actual,
    commitDevotionalPullCursor: jest.fn(),
    pullDevotionalContent: (...args: unknown[]) => mockPullDevotionalContent(...args),
  };
});

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
  logBugError: (...args: unknown[]) => mockLogBugError(...args),
  logBugEvent: jest.fn(),
}));

jest.mock('../analytics', () => ({
  logEvent: jest.fn(),
  AnalyticsEvents: {},
}));

jest.mock('../sentry', () => ({
  addAppBreadcrumb: jest.fn(),
  captureAppError: (...args: unknown[]) => mockCaptureAppError(...args),
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
const mockWebViewProps: { current: { commandRef?: { current: unknown }; day?: { id: string; dayNumber: number; bodyText: string } } | null } = { current: null };
jest.mock('@/components/reading/DevotionalWebView', () => ({
  DevotionalWebView: (props: { commandRef?: { current: unknown }; day?: { id: string; dayNumber: number; bodyText: string } }) => {
    mockWebViewProps.current = props;
    return null;
  },
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
jest.mock('@/hooks/useGeneratedDayWatch', () => {
  const actual = jest.requireActual('@/hooks/useGeneratedDayWatch') as typeof import('@/hooks/useGeneratedDayWatch');
  return {
    ...actual,
    useGeneratedDayWatch: (options: Parameters<typeof actual.useGeneratedDayWatch>[0]) => (
      mockUseRealGeneratedDayWatch
        ? actual.useGeneratedDayWatch(options)
        : {
            state: mockDailyGenerationState,
            checkAgain: mockDailyCheckAgain,
            retry: mockDailyRetry,
          }
    ),
  };
});

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
const {
  noteReadBudgetRateLimited,
  resetReadBudgetForTests,
  SyncPullRateLimitedError,
} = require('@/lib/sync-pull-backoff') as typeof import('@/lib/sync-pull-backoff');
const {
  resetGeneratedDayWatchDiscoveryThrottleForTests,
} = require('@/hooks/useGeneratedDayWatch') as typeof import('@/hooks/useGeneratedDayWatch');
const {
  resetDailyGenerationRecoveryForTesting,
} = require('@/lib/daily-generation-recovery') as typeof import('@/lib/daily-generation-recovery');
const { ApiError } = require('@/lib/generation-api') as typeof import('@/lib/generation-api');
const { replaceSyncOutbox, resetDrainStateForTesting } = jest.requireActual('@/lib/sync-outbox') as typeof import('@/lib/sync-outbox');
const originalFetch = globalThis.fetch;
let mockAcceptedResume: { id: string; archivedAt: string | null; archivedStateAt: string } | undefined;
const { beginLocalResetSession, endLocalResetSession } = jest.requireActual('@/lib/sync-session-fence') as typeof import('@/lib/sync-session-fence');

const ACTIVE_DEVOTIONAL_ID = 'devo-active-today';

type ReaderTree = {
  root: {
    findByProps: (props: Record<string, unknown>) => { props: Record<string, unknown> };
    findAllByProps: (props: Record<string, unknown>) => Array<{ props: Record<string, unknown> }>;
    findAll: (predicate: (node: { props: Record<string, unknown> }) => boolean) => Array<{ props: Record<string, unknown> }>;
  };
  toJSON: () => unknown;
  update: (element: React.ReactElement) => void;
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

function seedPausedMissingDay(): void {
  seedReader();
  useUnfoldStore.setState((state) => {
    const paused = state.devotionals[0];
    const active = {
      ...paused,
      id: ACTIVE_DEVOTIONAL_ID,
      title: 'Today series',
      currentDay: 1,
      days: paused.days.slice(0, 1).map((day) => ({
        ...day,
        id: canonicalGeneratedDayId(ACTIVE_DEVOTIONAL_ID, day.dayNumber),
        devotionalId: ACTIVE_DEVOTIONAL_ID,
      })),
    };
    return {
      devotionals: [paused, active],
      currentDevotionalId: ACTIVE_DEVOTIONAL_ID,
    };
  });
  routeParams.devotionalId = DEVOTIONAL_ID;
  routeParams.dayNumber = '4';
}

function seedShelleyMissingDay(): void {
  seedPausedMissingDay();
  useUnfoldStore.setState((state) => ({
    devotionals: state.devotionals.map((series) => series.id === DEVOTIONAL_ID
      ? { ...series, currentDay: 2, days: series.days.slice(0, 1).map((day) => ({
        ...day, bodyText: 'Shelley fixture: canonical Day 1 content.',
      })) }
      : series),
  }));
  // These are the params sent by Library's SeriesArcScreen.handleDayPress.
  routeParams.dayNumber = '2';
  routeParams.readOnly = '1';
  mockDailyGenerationState = { status: 'idle', discovered: true };
}

function emptyPull() {
  return {
    days: [],
    timestamp: '2026-09-15T04:47:00.000Z',
  };
}

async function flushEffects(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
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
    delete routeParams.readOnly;
    mockFocused = true;
    mockPanGesture.enabledValues.length = 0;
    mockPanGesture.onStart = null;
    mockPanGesture.onUpdate = null;
    mockPanGesture.onEnd = null;
    mockPanGesture.onFinalize = null;
    mockDailyGenerationState = { status: 'idle' };
    mockUseRealGeneratedDayWatch = false;
    mockFindDayJob.mockResolvedValue(null);
    mockPollJobStatus.mockResolvedValue({ status: 'processing' });
    mockSubmitGenerationJob.mockResolvedValue({ jobId: 'job-resumed-day-2', status: 'pending', devotionalId: DEVOTIONAL_ID });
    mockAcceptedResume = undefined;
    mockPullDevotionalContent.mockImplementation(async () => ({ ...emptyPull(), devotional: mockAcceptedResume }));
    globalThis.fetch = jest.fn(async (_url, init) => {
      const { changes } = JSON.parse(init!.body as string);
      const resumed = changes.find((change: { table: string }) => change.table === 'devotionals');
      if (resumed) mockAcceptedResume = { id: resumed.id, archivedAt: resumed.data.archivedAt, archivedStateAt: resumed.data.archivedStateAt };
      return { ok: true, json: async () => ({ results: changes.map((change: { table: string; id: string }) => ({
        table: change.table, id: change.id, status: 'accepted', serverUpdatedAt: new Date().toISOString(),
      })) }) } as Response;
    });
    resetReadBudgetForTests();
    resetGeneratedDayWatchDiscoveryThrottleForTests();
    resetDailyGenerationRecoveryForTesting();
    useUnfoldStore.getState().reset();
    replaceSyncOutbox([]);
    resetDrainStateForTesting();
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
    resetReadBudgetForTests();
    resetGeneratedDayWatchDiscoveryThrottleForTests();
    resetDailyGenerationRecoveryForTesting();
    useUnfoldStore.getState().reset();
    globalThis.fetch = originalFetch;
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

  it('places an open selection bar again after a scroll the reader ran itself, not after a fling', async () => {
    const tree = await renderWithDayFour();
    const refreshSelectionBar = jest.fn();
    const commandRef = mockWebViewProps.current?.commandRef;
    if (!commandRef) throw new Error('the reader did not pass a command ref to the web view');
    commandRef.current = { applyInverse: jest.fn(), scrollToHighlight: jest.fn(), refreshSelectionBar };
    const end = { nativeEvent: { contentOffset: { x: 0, y: 240 } } };
    type ScrollHandlers = Record<'onScrollBeginDrag' | 'onMomentumScrollBegin', () => void>
      & Record<'onScrollEndDrag' | 'onMomentumScrollEnd', (event: typeof end) => void>;
    const [scrollView] = tree.root.findAll((node) => typeof node.props.onMomentumScrollEnd === 'function'
      && typeof node.props.onMomentumScrollBegin === 'function');
    const scroll = scrollView.props as unknown as ScrollHandlers;

    // A fling the person started keeps the bar where it is.
    act(() => {
      scroll.onScrollBeginDrag();
      scroll.onScrollEndDrag(end);
      scroll.onMomentumScrollBegin();
      scroll.onMomentumScrollEnd(end);
    });
    expect(refreshSelectionBar).not.toHaveBeenCalled();

    // RN ends the reader's own scrollTo (a reflow restore, a jump) as a
    // momentum end with no drag or momentum start before it.
    act(() => {
      scroll.onMomentumScrollEnd(end);
    });
    expect(refreshSelectionBar).toHaveBeenCalledTimes(1);
    act(() => tree.unmount());
  });

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

  it.each(['(today)', '(study)'] as const)(
    'keeps the Day 1 fallback selected after sync, refocus and repeated taps in %s', async (hostTab) => {
      seedShelleyMissingDay();
      let tree: ReaderTree;
      await act(async () => {
        tree = renderer.create(<ReadingScreen hostTab={hostTab} />);
        await flushEffects();
      });
      expect(JSON.stringify(tree!.toJSON())).toContain('Day 2 wasn’t prepared');
      const fallback = tree!.root.findByProps({ accessibilityLabel: 'Go back to day 1' });
      const pressFallback = fallback.props.onPress as () => void;
      await act(async () => {
        pressFallback();
        pressFallback();
        await flushEffects();
      });
      await act(async () => {
        const series = useUnfoldStore.getState().devotionals.find((row) => row.id === DEVOTIONAL_ID)!;
        useUnfoldStore.getState().updateDevotionalDays(DEVOTIONAL_ID, series.days.map((day) => ({ ...day })));
        mockFocused = false;
        tree!.update(<ReadingScreen hostTab={hostTab} />);
        await flushEffects();
      });
      await act(async () => {
        mockFocused = true;
        tree!.update(<ReadingScreen hostTab={hostTab} />);
        await flushEffects();
      });
      expect(tree!.root.findAllByProps({ accessibilityLabel: 'Day 1 of 7' }).length).toBeGreaterThan(0);
      expect(mockWebViewProps.current?.day?.bodyText).toBe('Shelley fixture: canonical Day 1 content.');
      expect(useUnfoldStore.getState().currentDevotionalId).toBe(ACTIVE_DEVOTIONAL_ID);
      expect(routeParams.readOnly).toBe('1');
      act(() => tree!.unmount());
    },
  );

  it.each(['missing', 'local-only'])('offers no fallback when Day 1 is %s', async (kind) => {
    seedShelleyMissingDay();
    useUnfoldStore.setState((state) => ({
      devotionals: state.devotionals.map((series) => series.id === DEVOTIONAL_ID
        ? { ...series, days: kind === 'missing' ? [] : series.days.map((day) => ({ ...day, id: 'local-day-1' })) }
        : series),
    }));
    let tree: ReaderTree;
    await act(async () => {
      tree = renderer.create(<ReadingScreen />);
      await flushEffects();
    });
    expect(tree!.root.findAllByProps({ accessibilityLabel: 'Go back to day 1' })).toHaveLength(0);
    expect(useUnfoldStore.getState().currentDevotionalId).toBe(ACTIVE_DEVOTIONAL_ID);
    act(() => tree!.unmount());
  });

  it.each(['pull', 'job-discovery'] as const)(
    'keeps Day 1 visible when the previous Day 2 %s finishes late', async (pending) => {
      seedShelleyMissingDay();
      let resolvePull!: (value: ReturnType<typeof emptyPull>) => void;
      let resolveDiscovery!: (value: null) => void;
      if (pending === 'pull') {
        mockPullDevotionalContent.mockImplementationOnce(() => new Promise((resolve) => { resolvePull = resolve; }));
      } else {
        mockUseRealGeneratedDayWatch = true;
        mockFindDayJob.mockImplementationOnce(() => new Promise((resolve) => { resolveDiscovery = resolve; }));
      }
      let tree: ReaderTree;
      await act(async () => {
        tree = renderer.create(<ReadingScreen />);
        await flushEffects();
      });
      act(() => (tree!.root.findByProps({ accessibilityLabel: 'Go back to day 1' }).props.onPress as () => void)());
      await act(async () => {
        if (pending === 'pull') resolvePull(emptyPull());
        else resolveDiscovery(null);
        await flushEffects();
      });
      expect(tree!.root.findAllByProps({ accessibilityLabel: 'Day 1 of 7' }).length).toBeGreaterThan(0);
      expect(mockWebViewProps.current?.day?.bodyText).toBe('Shelley fixture: canonical Day 1 content.');
      expect(useUnfoldStore.getState().currentDevotionalId).toBe(ACTIVE_DEVOTIONAL_ID);
      act(() => tree!.unmount());
    },
  );

  it('keeps Open Today on the active series', async () => {
    seedShelleyMissingDay();
    let tree: ReaderTree;
    await act(async () => {
      tree = renderer.create(<ReadingScreen />);
      await flushEffects();
    });
    await act(async () => { await (tree!.root.findByProps({ accessibilityLabel: 'Open Today' }).props.onPress as () => Promise<void>)(); });
    expect(mockNavigate).toHaveBeenCalledWith('/(tabs)/(today)');
    expect(useUnfoldStore.getState().currentDevotionalId).toBe(ACTIVE_DEVOTIONAL_ID);
    act(() => tree!.unmount());
  });

  it('requires confirmation once and preserves progress when continuing the paused series', async () => {
    seedShelleyMissingDay();
    const before = useUnfoldStore.getState().devotionals;
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    let tree: ReaderTree;
    await act(async () => {
      tree = renderer.create(<ReadingScreen />);
      await flushEffects();
    });
    const continueButton = tree!.root.findByProps({ accessibilityLabel: 'Continue this series' });
    const pressContinue = continueButton.props.onPress as () => void;
    act(() => { pressContinue(); pressContinue(); });
    expect(alert).toHaveBeenCalledTimes(1);
    expect(useUnfoldStore.getState().currentDevotionalId).toBe(ACTIVE_DEVOTIONAL_ID);
    const confirm = alert.mock.calls[0][2]!.find((button) => button.text === 'Continue this series')!;
    await act(async () => { confirm.onPress!(); await flushEffects(); });
    expect(useUnfoldStore.getState().currentDevotionalId).toBe(DEVOTIONAL_ID);
    const resumed = useUnfoldStore.getState().devotionals.find((series) => series.id === DEVOTIONAL_ID)!;
    const original = before.find((series) => series.id === DEVOTIONAL_ID)!;
    expect(resumed.days).toEqual(original.days);
    expect(resumed.currentDay).toBe(original.currentDay);
    expect(resumed.seriesStartDate).toBe(original.seriesStartDate);
    expect(routeParams).toEqual({ devotionalId: DEVOTIONAL_ID, dayNumber: '2', readOnly: '' });
    act(() => tree!.unmount());
  });

  it.each([[false, '(today)'], [true, '(today)'], [true, '(study)']] as const)(
    'continues a paused series through real job submission and delivery (archived=%s, host=%s)', async (archived, hostTab) => {
    seedShelleyMissingDay();
    if (archived) useUnfoldStore.setState((state) => ({
      devotionals: state.devotionals.map((series) => series.id === DEVOTIONAL_ID
        ? { ...series, archivedAt: DAY_3_COMPLETED_AT, archivedStateAt: DAY_3_COMPLETED_AT }
        : series),
    }));
    if (!archived) useUnfoldStore.setState((state) => ({
      devotionals: state.devotionals.map((series) => series.id === ACTIVE_DEVOTIONAL_ID
        ? { ...series, createdAt: new Date(Date.now() + 30_000).toISOString() } : series),
    }));
    const before = useUnfoldStore.getState().devotionals.find((series) => series.id === DEVOTIONAL_ID)!;
    const beforeActive = useUnfoldStore.getState().devotionals.find((series) => series.id === ACTIVE_DEVOTIONAL_ID)!;
    const requestOrder: string[] = [];
    let serverArchived = archived;
    let serverActive = ACTIVE_DEVOTIONAL_ID;
    mockPullDevotionalContent.mockImplementation(async () => {
      if (mockAcceptedResume) requestOrder.push('resume lifecycle readback');
      return { ...emptyPull(), devotional: mockAcceptedResume };
    });
    globalThis.fetch = jest.fn(async (_url, init) => {
      const { changes } = JSON.parse(init!.body as string);
      requestOrder.push('unarchive push accepted');
      const resumed = changes.find((change: { table: string }) => change.table === 'devotionals');
      mockAcceptedResume = { id: resumed.id, archivedAt: resumed.data.archivedAt, archivedStateAt: resumed.data.archivedStateAt };
      serverArchived = false;
      if (Date.parse(resumed.data.archivedStateAt) > Date.parse(beforeActive.createdAt)) serverActive = DEVOTIONAL_ID;
      return { ok: true, json: async () => ({ results: changes.map((change: { table: string; id: string }) => ({
        table: change.table, id: change.id, status: 'accepted', serverUpdatedAt: new Date().toISOString(),
      })) }) } as Response;
    });
    mockSubmitGenerationJob.mockImplementation(async () => {
      requestOrder.push('generation');
      if (serverArchived || serverActive !== DEVOTIONAL_ID) throw new ApiError('Server resume required', 409, 'QA_NOT_ACTIVE');
      return { jobId: 'job-resumed-day-2', status: 'pending', devotionalId: DEVOTIONAL_ID };
    });
    mockUseRealGeneratedDayWatch = true;
    mockPollJobStatus.mockResolvedValue({
      jobId: 'job-resumed-day-2', jobType: 'day', devotionalId: DEVOTIONAL_ID, dayNumber: 2, status: 'complete',
      result: { devotionalId: DEVOTIONAL_ID, devotionalDay: makeDay(2, { isRead: false, bodyText: 'Resumed Day 2 content.' }) },
    });
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    let tree: ReaderTree;
    await act(async () => {
      tree = renderer.create(<ReadingScreen hostTab={hostTab} />);
      await flushEffects();
    });
    expect(mockSubmitGenerationJob).not.toHaveBeenCalled();
    act(() => (tree!.root.findByProps({ accessibilityLabel: 'Continue this series' }).props.onPress as () => void)());
    const confirm = alert.mock.calls[0][2]!.find((button) => button.text === 'Continue this series')!;
    await act(async () => { confirm.onPress!(); confirm.onPress!(); await flushEffects(); });
    expect(mockSubmitGenerationJob).toHaveBeenCalledTimes(1);
    expect(mockSubmitGenerationJob).toHaveBeenCalledWith(expect.objectContaining({
      devotionalId: DEVOTIONAL_ID, dayNumber: 2, jobType: 'day', session: expect.any(Number),
    }));
    expect(routeParams.readOnly).toBe('');
    await act(async () => { jest.advanceTimersByTime(15_000); await flushEffects(); });
    const after = useUnfoldStore.getState().devotionals.find((series) => series.id === DEVOTIONAL_ID)!;
    expect(after.currentDay).toBe(before.currentDay);
    expect(after.seriesStartDate).toBe(before.seriesStartDate);
    expect(after.days.find((day) => day.dayNumber === 1)).toEqual(before.days[0]);
    if (archived) expect(after.archivedAt).toBeNull();
    expect(requestOrder).toEqual(['unarchive push accepted', 'resume lifecycle readback', 'generation']);
    expect(useUnfoldStore.getState().devotionals.find((series) => series.id === ACTIVE_DEVOTIONAL_ID)).toEqual(beforeActive);
    expect(mockWebViewProps.current?.day?.bodyText).toBe('Resumed Day 2 content.');
    expect(useUnfoldStore.getState().currentDevotionalId).toBe(DEVOTIONAL_ID);
    act(() => tree!.unmount());
  }, 30_000);

  it.each(['newer-archive', 'missing-lifecycle'] as const)('continues successfully on an explicit retry after %s', async (firstFailure) => {
    seedShelleyMissingDay();
    const remoteClock = new Date(Date.now() + 60_000).toISOString();
    const before = useUnfoldStore.getState().devotionals;
    const sentClocks: string[] = [];
    globalThis.fetch = jest.fn(async (_url, init) => {
      const changes = JSON.parse(init!.body as string).changes;
      const resume = changes.find((entry: { table: string }) => entry.table === 'devotionals');
      sentClocks.push(resume.data.archivedStateAt);
      mockAcceptedResume = { id: DEVOTIONAL_ID, archivedAt: null, archivedStateAt: resume.data.archivedStateAt };
      return { ok: true, json: async () => ({ results: changes.map((entry: { table: string; id: string }) => ({
        table: entry.table, id: entry.id, status: 'accepted', serverUpdatedAt: new Date().toISOString(),
      })) }) } as Response;
    });
    mockPullDevotionalContent.mockImplementation(async () => ({ ...emptyPull(), devotional: sentClocks.length === 0 ? undefined
      : sentClocks.length === 1 ? firstFailure === 'missing-lifecycle' ? undefined
        : { id: DEVOTIONAL_ID, archivedAt: remoteClock, archivedStateAt: remoteClock }
        : mockAcceptedResume }));
    mockUseRealGeneratedDayWatch = true;
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    let tree: ReaderTree;
    await act(async () => { tree = renderer.create(<ReadingScreen />); await flushEffects(); });
    for (let attempt = 0; attempt < 2; attempt += 1) {
      act(() => (tree!.root.findByProps({ accessibilityLabel: 'Continue this series' }).props.onPress as () => void)());
      await act(async () => { alert.mock.calls[attempt][2]!.find((button) => button.text === 'Continue this series')!.onPress!(); await flushEffects(); });
      if (attempt === 0) {
        expect(useUnfoldStore.getState().devotionals).toEqual(before);
        expect(useUnfoldStore.getState().currentDevotionalId).toBe(ACTIVE_DEVOTIONAL_ID);
        expect(routeParams.readOnly).toBe('1');
        expect(mockSubmitGenerationJob).not.toHaveBeenCalled();
      }
    }
    expect(Date.parse(sentClocks[1])).toBeGreaterThan(Date.parse(firstFailure === 'newer-archive' ? remoteClock : sentClocks[0]));
    expect(useUnfoldStore.getState().currentDevotionalId).toBe(DEVOTIONAL_ID);
    expect(routeParams.readOnly).toBe('');
    expect(mockSubmitGenerationJob).toHaveBeenCalledTimes(1);
    const resumed = useUnfoldStore.getState().devotionals.find((series) => series.id === DEVOTIONAL_ID)!;
    expect(resumed.days).toEqual(before.find((series) => series.id === DEVOTIONAL_ID)!.days);
    expect(resumed.seriesStartDate).toBe(before.find((series) => series.id === DEVOTIONAL_ID)!.seriesStartDate);
    act(() => tree!.unmount());
  }, 30_000);

  it('clears Continue busy at the auth deadline and ignores credentials arriving later', async () => {
    seedShelleyMissingDay();
    const actualPull = jest.requireActual('@/lib/devotional-sync-pull').pullDevotionalContent as typeof import('@/lib/devotional-sync-pull').pullDevotionalContent;
    mockPullDevotionalContent.mockImplementation((devotionalId: string, options?: import('@/lib/devotional-sync-pull').PullDevotionalContentOptions) => (
      mockAcceptedResume ? actualPull(devotionalId, options) : Promise.resolve(emptyPull())
    ));
    const auth = jest.requireMock('../api-config').getAuthHeaders as jest.Mock;
    let releaseAuth!: (headers: Record<string, string>) => void;
    auth.mockResolvedValueOnce({ 'Content-Type': 'application/json' });
    auth.mockImplementationOnce(() => new Promise<Record<string, string>>((resolve) => { releaseAuth = resolve; }));
    mockUseRealGeneratedDayWatch = true;
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    let tree: ReaderTree;
    await act(async () => { tree = renderer.create(<ReadingScreen />); await flushEffects(); });
    act(() => (tree!.root.findByProps({ accessibilityLabel: 'Continue this series' }).props.onPress as () => void)());
    await act(async () => { alert.mock.calls[0][2]!.find((button) => button.text === 'Continue this series')!.onPress!(); await flushEffects(); });
    expect(tree!.root.findByProps({ accessibilityLabel: 'Continue this series' }).props.accessibilityState).toEqual({ disabled: true, busy: true });
    await act(async () => { jest.advanceTimersByTime(15_000); await flushEffects(); });
    expect(tree!.root.findByProps({ accessibilityLabel: 'Continue this series' }).props.accessibilityState).toEqual({ disabled: false, busy: false });
    await act(async () => { releaseAuth({ 'Content-Type': 'application/json' }); await flushEffects(); });
    expect(globalThis.fetch).toHaveBeenCalledTimes(1); // Only the accepted resume push; no late verification fetch.
    expect(mockSubmitGenerationJob).not.toHaveBeenCalled();
    expect(useUnfoldStore.getState().currentDevotionalId).toBe(ACTIVE_DEVOTIONAL_ID);
    expect(routeParams.readOnly).toBe('1');
    act(() => tree!.unmount());
  }, 30_000);

  it('critic regression: a confirmed retry supersedes the newer archive clock already observed', async () => {
    seedShelleyMissingDay();
    const baseClock = Date.now();
    const remoteArchiveClock = new Date(baseClock + 60_000).toISOString();
    useUnfoldStore.setState((state) => ({ devotionals: state.devotionals.map((series) => (
      series.id === ACTIVE_DEVOTIONAL_ID ? { ...series, createdAt: new Date(baseClock + 30_000).toISOString() }
        : series.id === DEVOTIONAL_ID ? { ...series, archivedAt: DAY_3_COMPLETED_AT, archivedStateAt: DAY_3_COMPLETED_AT }
          : series
    )) }));
    const sentClocks: string[] = [];
    globalThis.fetch = jest.fn(async (_url, init) => {
      const changes = JSON.parse(init!.body as string).changes;
      const resume = changes.find((entry: { table: string }) => entry.table === 'devotionals');
      sentClocks.push(resume.data.archivedStateAt);
      return { ok: true, json: async () => ({ results: changes.map((entry: { table: string; id: string }) => ({
        table: entry.table, id: entry.id, status: 'accepted', serverUpdatedAt: new Date().toISOString(),
      })) }) } as Response;
    });
    mockPullDevotionalContent.mockImplementation(async () => ({ ...emptyPull(), devotional: sentClocks.length === 0
      ? undefined : { id: DEVOTIONAL_ID, archivedAt: remoteArchiveClock, archivedStateAt: remoteArchiveClock } }));
    mockUseRealGeneratedDayWatch = true;
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    let tree: ReaderTree;
    await act(async () => { tree = renderer.create(<ReadingScreen />); await flushEffects(); });
    try {
      for (let attempt = 0; attempt < 2; attempt += 1) {
        act(() => (tree!.root.findByProps({ accessibilityLabel: 'Continue this series' }).props.onPress as () => void)());
        await act(async () => {
          alert.mock.calls[attempt][2]!.find((button) => button.text === 'Continue this series')!.onPress!();
          await flushEffects();
        });
        expect(useUnfoldStore.getState().currentDevotionalId).toBe(ACTIVE_DEVOTIONAL_ID);
        expect(routeParams.readOnly).toBe('1');
        expect(mockSubmitGenerationJob).not.toHaveBeenCalled();
      }
      expect(sentClocks).toHaveLength(2);
      expect(Date.parse(sentClocks[1])).toBeGreaterThan(Date.parse(remoteArchiveClock));
    } finally { act(() => tree!.unmount()); }
  }, 30_000);

  it.each(['accepted', 'accepted-newer-archive', 'accepted-wrong-clock', 'accepted-no-lifecycle', 'rejected', 'missing', 'conflict', 'service-error', 'network-error'] as const)(
    'waits for the exact archive acknowledgement before activation: %s', async (outcome) => {
      seedShelleyMissingDay();
      useUnfoldStore.setState((state) => ({ devotionals: state.devotionals.map((series) => series.id === DEVOTIONAL_ID
        ? { ...series, archivedAt: DAY_3_COMPLETED_AT, archivedStateAt: DAY_3_COMPLETED_AT } : series) }));
      const before = useUnfoldStore.getState().devotionals;
      let resolvePush!: (response: Response) => void;
      let rejectPush!: (error: Error) => void;
      let changes: { table: string; id: string; data: Record<string, unknown> }[] = [];
      globalThis.fetch = jest.fn((_url, init) => {
        changes = JSON.parse(init!.body as string).changes;
        return new Promise<Response>((resolve, reject) => { resolvePush = resolve; rejectPush = reject; });
      });
      mockUseRealGeneratedDayWatch = true;
      const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
      let tree: ReaderTree;
      await act(async () => { tree = renderer.create(<ReadingScreen />); await flushEffects(); });
      const press = () => (tree!.root.findByProps({ accessibilityLabel: 'Continue this series' }).props.onPress as () => void)();
      act(press);
      const confirm = alert.mock.calls[0][2]!.find((button) => button.text === 'Continue this series')!;
      await act(async () => { confirm.onPress!(); confirm.onPress!(); await flushEffects(); });
      expect(globalThis.fetch).toHaveBeenCalledTimes(1);
      expect(changes).toEqual([expect.objectContaining({ table: 'devotionals', id: DEVOTIONAL_ID,
        data: expect.objectContaining({ archivedAt: null, archivedStateAt: expect.any(String) }) })]);
      expect(useUnfoldStore.getState().currentDevotionalId).toBe(ACTIVE_DEVOTIONAL_ID);
      expect(useUnfoldStore.getState().devotionals).toEqual(before);
      expect(routeParams.readOnly).toBe('1');
      expect(mockSubmitGenerationJob).not.toHaveBeenCalled();
      expect(tree!.root.findByProps({ accessibilityLabel: 'Continue this series' }).props.accessibilityState)
        .toEqual({ disabled: true, busy: true });
      act(press);
      expect(alert).toHaveBeenCalledTimes(1);
      // Preserve a concurrent content update rather than replacing A with the sent snapshot.
      await act(async () => {
        useUnfoldStore.setState((state) => ({ devotionals: state.devotionals.map((series) => series.id === DEVOTIONAL_ID
          ? { ...series, title: 'Updated while waiting', updatedAt: new Date(Date.now() + 60_000).toISOString() } : series) }));
        if (outcome.startsWith('accepted') && outcome !== 'accepted-no-lifecycle') mockAcceptedResume = {
          id: DEVOTIONAL_ID,
          archivedAt: outcome === 'accepted-newer-archive' ? new Date(Date.now() + 60_000).toISOString() : null,
          archivedStateAt: outcome === 'accepted' ? changes[0].data.archivedStateAt as string : new Date(Date.now() + 60_000).toISOString(),
        };
        if (outcome === 'network-error') rejectPush(new Error('Offline'));
        else resolvePush({ ok: outcome !== 'service-error', json: async () => ({ results: outcome === 'missing' ? [] : changes.map((change) => ({
          table: change.table, id: change.id, status: outcome === 'conflict' ? 'conflict' : outcome.startsWith('accepted') ? 'accepted' : 'rejected',
          serverUpdatedAt: new Date().toISOString(), ...(outcome === 'conflict' ? { serverData: {} } : {}),
        })) }) } as Response);
        await flushEffects();
      });
      const after = useUnfoldStore.getState().devotionals.find((series) => series.id === DEVOTIONAL_ID)!;
      expect(after.title).toBe('Updated while waiting');
      expect(after.days).toEqual(before.find((series) => series.id === DEVOTIONAL_ID)!.days);
      expect(after.seriesStartDate).toBe(before.find((series) => series.id === DEVOTIONAL_ID)!.seriesStartDate);
      expect(useUnfoldStore.getState().devotionals.find((series) => series.id === ACTIVE_DEVOTIONAL_ID))
        .toEqual(before.find((series) => series.id === ACTIVE_DEVOTIONAL_ID));
      if (outcome === 'accepted') {
        expect(after.archivedStateAt).toBe(changes[0].data.archivedStateAt);
        expect(after.archivedAt).toBeNull();
        expect(routeParams.readOnly).toBe('');
        expect(mockSubmitGenerationJob).toHaveBeenCalledTimes(1);
      } else {
        expect(useUnfoldStore.getState().currentDevotionalId).toBe(ACTIVE_DEVOTIONAL_ID);
        expect(routeParams.readOnly).toBe('1');
        expect(after.archivedAt).toBe(DAY_3_COMPLETED_AT);
        expect(mockSubmitGenerationJob).not.toHaveBeenCalled();
        expect(JSON.stringify(tree!.toJSON())).toContain('This series could not be continued yet.');
      }
      act(() => tree!.unmount());
    }, 30_000,
  );

  it.each(['verified', 'back-day-1', 'rate-limit'] as const)(
    'keeps history pending until lifecycle readback completes: %s', async (outcome) => {
      seedShelleyMissingDay();
      let resolveReadback!: (value: unknown) => void;
      let rejectReadback!: (error: Error) => void;
      mockPullDevotionalContent.mockImplementation(async () => {
        if (!mockAcceptedResume) return emptyPull();
        return new Promise((resolve, reject) => { resolveReadback = resolve; rejectReadback = reject; });
      });
      mockUseRealGeneratedDayWatch = true;
      const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
      let tree: ReaderTree;
      await act(async () => { tree = renderer.create(<ReadingScreen />); await flushEffects(); });
      act(() => (tree!.root.findByProps({ accessibilityLabel: 'Continue this series' }).props.onPress as () => void)());
      await act(async () => { alert.mock.calls[0][2]!.find((button) => button.text === 'Continue this series')!.onPress!(); await flushEffects(); });
      expect(mockPullDevotionalContent).toHaveBeenLastCalledWith(DEVOTIONAL_ID, { forceFull: true, timeoutMs: 15_000 });
      expect(useUnfoldStore.getState().currentDevotionalId).toBe(ACTIVE_DEVOTIONAL_ID);
      expect(routeParams.readOnly).toBe('1');
      expect(mockSubmitGenerationJob).not.toHaveBeenCalled();
      if (outcome === 'back-day-1') act(() => (tree!.root.findByProps({ accessibilityLabel: 'Go back to day 1' }).props.onPress as () => void)());
      await act(async () => {
        if (outcome === 'rate-limit') {
          noteReadBudgetRateLimited(60);
          rejectReadback(new SyncPullRateLimitedError(60));
        } else resolveReadback({ ...emptyPull(), devotional: mockAcceptedResume,
          days: outcome === 'verified' ? [makeDay(2, { isRead: false, bodyText: 'Readback delivered Day 2.' })] : [] });
        await flushEffects();
      });
      expect(mockSubmitGenerationJob).not.toHaveBeenCalled();
      expect(useUnfoldStore.getState().currentDevotionalId).toBe(outcome === 'verified' ? DEVOTIONAL_ID : ACTIVE_DEVOTIONAL_ID);
      expect(routeParams.readOnly).toBe(outcome === 'verified' ? '' : '1');
      if (outcome === 'verified') expect(mockWebViewProps.current?.day?.bodyText).toBe('Readback delivered Day 2.');
      if (outcome === 'back-day-1') expect(mockWebViewProps.current?.day?.bodyText).toBe('Shelley fixture: canonical Day 1 content.');
      if (outcome === 'rate-limit') {
        expect(tree!.root.findAllByProps({ accessibilityLabel: 'Continue this series' })).toHaveLength(0);
        await act(async () => { jest.advanceTimersByTime(60_000); await flushEffects(); });
        expect(mockSubmitGenerationJob).not.toHaveBeenCalled();
      }
      act(() => tree!.unmount());
    }, 30_000,
  );

  it.each(['blur', 'unmount', 'change-series', 'change-day', 'day-arrives', 'reset', 'rearchive'] as const)(
    'does not activate on a late accepted archive acknowledgement after %s', async (change) => {
      seedShelleyMissingDay();
      useUnfoldStore.setState((state) => ({ devotionals: state.devotionals.map((series) => series.id === DEVOTIONAL_ID
        ? { ...series, archivedAt: DAY_3_COMPLETED_AT, archivedStateAt: DAY_3_COMPLETED_AT } : series) }));
      let resolvePush!: (response: Response) => void;
      let results: unknown[];
      let acceptedResume: typeof mockAcceptedResume;
      globalThis.fetch = jest.fn((_url, init) => {
        const changes = JSON.parse(init!.body as string).changes;
        const resume = changes.find((entry: { table: string }) => entry.table === 'devotionals');
        acceptedResume = { id: resume.id, archivedAt: null, archivedStateAt: resume.data.archivedStateAt };
        results = changes.map((entry: { table: string; id: string }) => ({
          table: entry.table, id: entry.id, status: 'accepted', serverUpdatedAt: new Date().toISOString(),
        }));
        return new Promise<Response>((resolve) => { resolvePush = resolve; });
      });
      mockUseRealGeneratedDayWatch = true;
      const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
      let tree: ReaderTree;
      await act(async () => { tree = renderer.create(<ReadingScreen />); await flushEffects(); });
      act(() => (tree!.root.findByProps({ accessibilityLabel: 'Continue this series' }).props.onPress as () => void)());
      await act(async () => { alert.mock.calls[0][2]!.find((button) => button.text === 'Continue this series')!.onPress!(); await flushEffects(); });
      await act(async () => {
        if (change === 'blur') mockFocused = false;
        if (change === 'unmount') tree!.unmount();
        if (change === 'change-series') useUnfoldStore.setState({ currentDevotionalId: 'new-active-series' });
        if (change === 'change-day') routeParams.dayNumber = '1';
        if (change === 'day-arrives') useUnfoldStore.getState().updateDevotionalDays(DEVOTIONAL_ID, [makeDay(2, { isRead: false })]);
        if (change === 'reset') { const token = beginLocalResetSession(); endLocalResetSession(token); }
        if (change === 'rearchive') useUnfoldStore.setState((state) => ({ devotionals: state.devotionals.map((series) => series.id === DEVOTIONAL_ID
          ? { ...series, archivedStateAt: new Date(Date.now() + 60_000).toISOString() } : series) }));
        if (change !== 'unmount') tree!.update(<ReadingScreen />);
        await flushEffects();
        mockAcceptedResume = acceptedResume;
        resolvePush({ ok: true, json: async () => ({ results }) } as Response);
        await flushEffects();
      });
      expect(useUnfoldStore.getState().currentDevotionalId).toBe(change === 'change-series' ? 'new-active-series' : ACTIVE_DEVOTIONAL_ID);
      expect(routeParams.readOnly).toBe('1');
      expect(mockSubmitGenerationJob).not.toHaveBeenCalled();
      if (change !== 'unmount') act(() => tree!.unmount());
    }, 30_000,
  );

  it('does not activate history when the missing day arrives while confirmation is open', async () => {
    seedShelleyMissingDay();
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    let tree: ReaderTree;
    await act(async () => { tree = renderer.create(<ReadingScreen />); await flushEffects(); });
    act(() => (tree!.root.findByProps({ accessibilityLabel: 'Continue this series' }).props.onPress as () => void)());
    const confirm = alert.mock.calls[0][2]!.find((button) => button.text === 'Continue this series')!;
    await act(async () => {
      useUnfoldStore.getState().updateDevotionalDays(DEVOTIONAL_ID, [makeDay(2, { isRead: false })]);
      await flushEffects();
      confirm.onPress!();
    });
    expect(useUnfoldStore.getState().currentDevotionalId).toBe(ACTIVE_DEVOTIONAL_ID);
    expect(routeParams.readOnly).toBe('1');
    expect(mockSubmitGenerationJob).not.toHaveBeenCalled();
    act(() => tree!.unmount());
  });

  it.each(['cancel', 'change-series', 'change-day', 'blur', 'unmount'] as const)(
    'keeps a stale or cancelled confirmation from activating history: %s', async (change) => {
      seedShelleyMissingDay();
      const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
      let tree: ReaderTree;
      await act(async () => {
        tree = renderer.create(<ReadingScreen />);
        await flushEffects();
      });
      act(() => (tree!.root.findByProps({ accessibilityLabel: 'Continue this series' }).props.onPress as () => void)());
      const buttons = alert.mock.calls[0][2]!;
      if (change === 'cancel') {
        act(() => buttons.find((button) => button.text === 'Cancel')!.onPress!());
        act(() => buttons.find((button) => button.text === 'Continue this series')!.onPress!());
      } else {
        await act(async () => {
          if (change === 'change-series') useUnfoldStore.setState({ currentDevotionalId: 'new-active-series' });
          if (change === 'change-day') routeParams.dayNumber = '1';
          if (change === 'blur') mockFocused = false;
          if (change === 'unmount') tree!.unmount();
          else tree!.update(<ReadingScreen />);
          await flushEffects();
        });
        await act(async () => {
          buttons.find((button) => button.text === 'Continue this series')!.onPress!();
          await flushEffects();
        });
      }
      expect(useUnfoldStore.getState().currentDevotionalId).toBe(change === 'change-series' ? 'new-active-series' : ACTIVE_DEVOTIONAL_ID);
      expect(routeParams.readOnly).toBe('1');
      if (change !== 'unmount') act(() => tree!.unmount());
    },
  );

  it('offers Open Today after pull and discovery confirm a paused day is absent', async () => {
    seedPausedMissingDay();
    mockDailyGenerationState = { status: 'idle', discovered: true };
    let tree: ReaderTree;

    await act(async () => {
      tree = renderer.create(<ReadingScreen />);
      await flushEffects();
    });

    expect(JSON.stringify(tree!.toJSON())).toContain("Day 4 wasn’t prepared");
    expect(tree!.root.findByProps({ accessibilityLabel: 'Open Today' }).props.accessibilityState)
      .toEqual(expect.objectContaining({ disabled: false }));
    expect(mockPullDevotionalContent).toHaveBeenCalledTimes(1);
    act(() => tree!.unmount());
  });

  it('says a read day could not be restored when the pull and discovery find no copy', async () => {
    seedPausedMissingDay();
    // Day 2 was read, but this device has only a local copy of it.
    useUnfoldStore.setState((state) => ({
      devotionals: state.devotionals.map((devotional) => devotional.id === DEVOTIONAL_ID
        ? {
          ...devotional,
          days: devotional.days.map((day) => (day.dayNumber === 2 ? { ...day, id: 'local-day-2' } : day)),
        }
        : devotional),
    }));
    routeParams.dayNumber = '2';
    mockDailyGenerationState = { status: 'idle', discovered: true };
    let tree: ReaderTree;

    await act(async () => {
      tree = renderer.create(<ReadingScreen />);
      await flushEffects();
    });

    const screenText = JSON.stringify(tree!.toJSON());
    expect(screenText).toContain('Day 2 couldn’t be restored');
    expect(screenText).toContain('We couldn’t find this reading on the server. Open Today to keep reading.');
    expect(screenText).not.toContain('wasn’t prepared');
    expect(tree!.root.findByProps({ accessibilityLabel: 'Open Today' }).props.accessibilityState)
      .toEqual(expect.objectContaining({ disabled: false }));
    act(() => tree!.unmount());
  });

  it('keeps a paused day in its preparing state when discovery finds a running job', async () => {
    seedPausedMissingDay();
    mockDailyGenerationState = { status: 'running', jobId: 'job-day-4' };
    let tree: ReaderTree;

    await act(async () => {
      tree = renderer.create(<ReadingScreen />);
      await flushEffects();
    });

    expect(JSON.stringify(tree!.toJSON())).toContain('Preparing Day 4');
    expect(tree!.root.findAllByProps({ accessibilityLabel: 'Open Today' })).toHaveLength(0);
    act(() => tree!.unmount());
  });

  it('polls a running paused-series job and delivers its day through the real watcher', async () => {
    seedPausedMissingDay();
    mockUseRealGeneratedDayWatch = true;
    const deliveredDay = makeDay(4, { isRead: false });
    let resolveFindDayJob!: (job: Record<string, unknown>) => void;
    mockFindDayJob.mockImplementation(() => new Promise((resolve) => {
      resolveFindDayJob = resolve;
    }));
    mockPollJobStatus.mockResolvedValue({
      jobId: 'job-day-4',
      jobType: 'day',
      devotionalId: DEVOTIONAL_ID,
      dayNumber: 4,
      status: 'complete',
      result: { devotionalId: DEVOTIONAL_ID, devotionalDay: deliveredDay },
    });
    let tree: ReaderTree;

    await act(async () => {
      tree = renderer.create(<ReadingScreen />);
      await flushEffects();
    });
    expect(mockFindDayJob).toHaveBeenCalledWith(DEVOTIONAL_ID, 4, expect.any(Number));

    await act(async () => {
      resolveFindDayJob({
        jobId: 'job-day-4',
        jobType: 'day',
        devotionalId: DEVOTIONAL_ID,
        dayNumber: 4,
        status: 'processing',
      });
      await flushEffects();
      jest.advanceTimersByTime(15_000);
      await flushEffects();
    });
    expect(mockPollJobStatus).toHaveBeenCalledWith('job-day-4', expect.any(Number));
    expect(useUnfoldStore.getState().devotionals.find((item) => item.id === DEVOTIONAL_ID)?.days)
      .toEqual(expect.arrayContaining([expect.objectContaining({ dayNumber: 4 })]));
    act(() => tree!.unmount());
  });

  it('records a find-day 429 and suppresses another real-watcher lookup until the window ends', async () => {
    seedPausedMissingDay();
    mockUseRealGeneratedDayWatch = true;
    let rejectFindDayJob!: (error: Error) => void;
    mockFindDayJob
      .mockImplementationOnce(() => new Promise((_, reject) => {
        rejectFindDayJob = reject;
      }))
      .mockResolvedValueOnce(null);
    let tree: ReaderTree;

    await act(async () => {
      tree = renderer.create(<ReadingScreen />);
      await flushEffects();
    });
    expect(mockFindDayJob).toHaveBeenCalledTimes(1);

    await act(async () => {
      noteReadBudgetRateLimited(60);
      rejectFindDayJob(new ApiError('Rate limited', 429, 'RATE_LIMITED'));
      await flushEffects();
    });
    expect(mockLogBugError).not.toHaveBeenCalled();

    await act(async () => {
      jest.advanceTimersByTime(59_000);
      await flushEffects();
    });
    expect(mockFindDayJob).toHaveBeenCalledTimes(1);

    await act(async () => {
      jest.advanceTimersByTime(1_000);
      await flushEffects();
    });
    expect(mockFindDayJob).toHaveBeenCalledTimes(2);
    expect(mockLogBugError).not.toHaveBeenCalled();
    act(() => tree!.unmount());
  });

  it('treats pull 429 as quiet backpressure until the shared window ends', async () => {
    seedPausedMissingDay();
    mockPullDevotionalContent
      .mockImplementationOnce(async () => {
        noteReadBudgetRateLimited(60);
        throw new SyncPullRateLimitedError(60);
      })
      .mockResolvedValueOnce(emptyPull());
    let tree: ReaderTree;

    await act(async () => {
      tree = renderer.create(<ReadingScreen />);
      await flushEffects();
    });

    const blocked = tree!.root.findByProps({ accessibilityLabel: 'Check for day 4' });
    expect(JSON.stringify(tree!.toJSON())).toContain('Try again in a minute');
    expect(blocked.props.accessibilityState).toEqual(expect.objectContaining({ disabled: true }));
    expect(mockLogBugError).not.toHaveBeenCalled();
    expect(mockCaptureAppError).not.toHaveBeenCalled();
    expect(mockPullDevotionalContent).toHaveBeenCalledTimes(1);

    await act(async () => {
      jest.advanceTimersByTime(59_000);
      await flushEffects();
    });
    expect(mockPullDevotionalContent).toHaveBeenCalledTimes(1);

    await act(async () => {
      jest.advanceTimersByTime(1_000);
      await flushEffects();
    });
    const available = tree!.root.findByProps({ accessibilityLabel: 'Check for day 4' });
    await act(async () => {
      await (available.props.onPress as () => Promise<void>)();
      await flushEffects();
    });
    expect(mockPullDevotionalContent).toHaveBeenCalledTimes(2);
    act(() => tree!.unmount());
  });

  it('keeps a new selection and the newest hydration loading state when an older pull finishes', async () => {
    const missingA = 'missing-a';
    const missingC = 'missing-c';
    let resolveA: ((value: ReturnType<typeof emptyPull>) => void) | undefined;
    let resolveC: ((value: ReturnType<typeof emptyPull>) => void) | undefined;
    seedReader();
    useUnfoldStore.setState((state) => ({ currentDevotionalId: null, devotionals: state.devotionals }));
    routeParams.devotionalId = missingA;
    routeParams.dayNumber = '1';
    mockPullDevotionalContent.mockImplementation((devotionalId: string) => new Promise((resolve) => {
      if (devotionalId === missingA) resolveA = resolve;
      if (devotionalId === missingC) resolveC = resolve;
    }));
    let tree: ReaderTree;

    await act(async () => {
      tree = renderer.create(<ReadingScreen />);
      await flushEffects();
    });
    expect(tree!.root.findAllByProps({ accessibilityLabel: 'Loading reading' }).length).toBeGreaterThan(0);

    await act(async () => {
      routeParams.devotionalId = missingC;
      tree!.update(<ReadingScreen />);
      await flushEffects();
    });
    expect(mockPullDevotionalContent).toHaveBeenCalledTimes(2);

    await act(async () => {
      resolveA?.(emptyPull());
      await flushEffects();
    });
    expect(useUnfoldStore.getState().currentDevotionalId).toBeNull();
    expect(tree!.root.findAllByProps({ accessibilityLabel: 'Loading reading' }).length).toBeGreaterThan(0);

    await act(async () => {
      resolveC?.(emptyPull());
      await flushEffects();
    });
    act(() => tree!.unmount());
  });
});
