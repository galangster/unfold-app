/* eslint-disable import/first */
import React from 'react';
import { Alert } from 'react-native';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const renderer = require('react-test-renderer');
const { act } = renderer;
let mockReadBudgetBlocked = false;
const mockGeneratedDayWatch = jest.fn((_options: unknown) => ({
  state: { status: 'idle' },
  checkAgain: jest.fn(),
  retry: jest.fn(),
}));
const mockPullDevotionalContent = jest.fn(async (..._args: unknown[]) => ({ days: [], timestamp: 't' }));
const mockLogBugEvent = jest.fn();
const mockTodayStoreState: Record<string, unknown> = {
  user: { name: 'Reader', hasCompletedOnboarding: true },
  devotionals: [{
    id: 'today-series',
    title: 'Today Series',
    totalDays: 3,
    currentDay: 2,
    generationMode: 'progressive',
    createdAt: '2026-09-01T00:00:00.000Z',
    seriesStartDate: '2026-09-01T00:00:00.000Z',
    days: [{ id: 'today-series-day-1', devotionalId: 'today-series', dayNumber: 1, title: 'Day 1', isRead: true }],
  }],
  currentDevotionalId: 'today-series',
  setCurrentDevotional: jest.fn(),
  resumeContext: null,
  clearResumeContext: jest.fn(),
  updateUser: jest.fn(),
  updateDevotionalDays: jest.fn(),
  streakCurrent: 0,
  streakLastReadDate: null,
  addCheckIn: jest.fn(),
  markMiddayCheckInCompleted: jest.fn(),
  beginRitualSession: jest.fn(),
  getCheckIn: jest.fn(),
  hasSeenDay1Review: false,
  appFeedbackPromptLastDate: null,
  appFeedbackReadingsAtLast: 0,
  appFeedbackSeriesAtLast: 0,
  reviewPromptLastDate: null,
  recordAppFeedbackPrompt: jest.fn(),
  setHasSeenDay1Review: jest.fn(),
  hasSeenHomeTooltips: true,
  addGeneratedDay: jest.fn(),
  archiveCurrentDevotional: jest.fn(),
  markDayAsRevealed: jest.fn(),
  isReturningUser: () => false,
  dismissedMiddayCardDate: null,
  dismissedEveningCardDate: null,
  dismissedBridgeCardDate: null,
  dismissedRememberThisCardDate: null,
  highlights: [],
  bibleHighlights: [],
  setDismissedMiddayCardDate: jest.fn(),
  setDismissedEveningCardDate: jest.fn(),
  setDismissedBridgeCardDate: jest.fn(),
  setDismissedRememberThisCardDate: jest.fn(),
  checkIns: [],
  generationSession: { status: 'idle', devotionalId: null, title: null, error: null },
  clearGenerationSession: jest.fn(),
  resetNudgeSession: jest.fn(),
};

let mockSearchParams: Record<string, string> = {};
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), navigate: jest.fn(), setParams: jest.fn() }),
  useSegments: () => [],
  useNavigation: () => ({ getState: () => ({ index: 1, routes: [] }) }),
  useFocusEffect: (callback: () => void | (() => void)) => require('react').useEffect(callback, [callback]),
  useIsFocused: () => true,
  useLocalSearchParams: () => mockSearchParams,
}));

jest.mock('@tanstack/react-query', () => ({
  useQuery: () => ({ data: null }),
}));

jest.mock('@/lib/theme', () => ({
  useTheme: () => ({ colors: { background: '#000', accent: '#c8a55c', text: '#fff' } }),
}));

jest.mock('@/hooks/useAccessibility', () => ({
  useAccessibleAnimation: () => ({ entering: (value: unknown) => value }),
}));

jest.mock('@/hooks/useCreationGate', () => ({
  useCreationGate: () => ({
    gate: () => true,
    showExclusiveOffer: false,
    dismissOffer: jest.fn(),
    handleOfferVerifiedExit: jest.fn(),
    policy: 'granted',
  }),
}));

jest.mock('@/hooks/usePremiumNudge', () => ({
  usePremiumNudge: () => ({ nudge: null, onAction: jest.fn(), onDismiss: jest.fn() }),
}));

jest.mock('@/hooks/usePremiumAccessPolicy', () => ({
  usePremiumAccessPolicy: () => 'granted',
}));
jest.mock('@/hooks/useReadBudgetBlocked', () => ({
  useReadBudgetBlocked: () => mockReadBudgetBlocked,
}));
jest.mock('@/hooks/useGeneratedDayWatch', () => ({
  useGeneratedDayWatch: (options: unknown) => mockGeneratedDayWatch(options),
}));
jest.mock('@/hooks/useInflightInitialArcWatch', () => ({
  useInflightInitialArcWatch: () => undefined,
}));
jest.mock('@/hooks/useAdaptiveLayout', () => ({
  useAdaptiveLayout: () => ({
    usesSplit: false,
    splitMaxWidth: 800,
    clusterMaxWidth: 600,
    columnGap: 16,
    availableHeight: 800,
  }),
}));

jest.mock('@/components/home/AmbientArtCanvas', () => ({ AmbientArtCanvas: () => null }));
jest.mock('@/components/home/DevotionalCard', () => ({ DevotionalCard: () => null }));
jest.mock('@/components/home/TodayCardStack', () => ({ TodayCardStack: () => null }));
jest.mock('@/components/home/GreetingRow', () => ({ GreetingRow: () => null }));
jest.mock('@/components/home/BentoGrid', () => ({ BentoGrid: () => null }));
jest.mock('@/components/home/SeriesCarousel', () => ({ SeriesCarousel: () => null }));
jest.mock('@/components/home/CompactStreakRow', () => ({ CompactStreakRow: () => null }));
jest.mock('@/components/StreakBox', () => ({ StreakBox: () => null }));
jest.mock('@/components/HomeOnboardingTooltips', () => ({ HomeOnboardingTooltips: () => null }));
jest.mock('@/components/RippleLoader', () => ({ RippleLoader: () => null }));
jest.mock('@/components/StreakCelebration', () => ({ StreakCelebration: () => null }));
let mockCheckInSheetProps: Record<string, unknown> | null = null;
let mockCheckInSheetMounts = 0;
jest.mock('@/components/CheckInSheet', () => ({
  CheckInSheet: (props: Record<string, unknown>) => {
    mockCheckInSheetProps = props;
    // A sheet that Today takes off the screen has no props left. One that
    // Today mounts again has lost what the reader typed in it.
    require('react').useEffect(() => {
      mockCheckInSheetMounts += 1;
      return () => {
        mockCheckInSheetProps = null;
      };
    }, []);
    return null;
  },
}));
jest.mock('@/components/AppFeedbackSheet', () => ({ AppFeedbackSheet: () => null }));
jest.mock('@/components/voice-check-in/VoiceCheckInSheet', () => ({ VoiceCheckInSheet: () => null }));
jest.mock('@/components/PremiumFeatureSheet', () => ({ PremiumFeatureSheet: () => null }));
jest.mock('@/components/ExclusiveOfferSheet', () => ({ ExclusiveOfferSheet: () => null }));
jest.mock('@/components/PremiumNudgeCard', () => ({ getPremiumNudgeCardTone: () => 'calm' }));

jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(),
  ImpactFeedbackStyle: { Light: 'light', Medium: 'medium' },
}));

jest.mock('react-native-reanimated', () => {
  const { View } = require('react-native');
  const animation: Record<string, unknown> = {};
  animation.duration = () => animation;
  animation.delay = () => animation;
  animation.easing = () => animation;
  return {
    __esModule: true,
    default: { View, ScrollView: View },
    FadeIn: animation,
    useSharedValue: (value: number) => ({ value }),
    useAnimatedScrollHandler: () => ({}),
    useAnimatedStyle: () => ({}),
    Easing: {
      cubic: 'cubic',
      out: () => 'out',
      in: () => 'in',
      inOut: () => 'inOut',
      bezier: () => 'bezier',
    },
  };
});

jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: require('react-native').View,
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

jest.mock('@/lib/mmkv-storage', () => ({
  getDeviceId: () => 'device-1',
  getSharedEncryptionKey: () => undefined,
  mmkvStorage: {
    getItem: () => null,
    setItem: () => undefined,
    removeItem: () => undefined,
  },
}));

jest.mock('@/lib/store', () => {
  const useUnfoldStore = (selector: (state: Record<string, unknown>) => unknown) => selector(mockTodayStoreState);
  useUnfoldStore.getState = () => mockTodayStoreState;
  return {
    useUnfoldStore,
    useHasHydrated: () => true,
    updateSyncedDevotionals: jest.fn(),
  };
});

jest.mock('@/lib/devotional-sync-pull', () => ({
  pullDevotionalContent: (...args: unknown[]) => mockPullDevotionalContent(...args),
  commitDevotionalPullCursor: jest.fn(),
}));
jest.mock('@/lib/devotional-pulled-content', () => ({ applyPulledDevotionalContent: jest.fn() }));
jest.mock('@/lib/sync-outbox', () => ({ drainSyncOutbox: jest.fn() }));
jest.mock('@/lib/bug-logger', () => ({
  logBugEvent: (...args: unknown[]) => mockLogBugEvent(...args),
}));
jest.mock('@/lib/bible-db', () => ({
  getBibleDbStatus: jest.fn(() => 'ready'),
  downloadBibleDb: jest.fn(async () => undefined),
}));

import HomeScreen, {
  applyTodayAutoTrialFocus,
  abandonPurchasedIntentBeforeNewSeries,
} from '@/app/(tabs)/(today)/index';
import { SyncPullRateLimitedError } from '@/lib/sync-pull-backoff';
import { beginRitualSessionRecord, type RitualSessionIdentity } from '@/lib/ritual-session';
import { beginLocalResetSession, endLocalResetSession, resetSyncSessionFenceForTesting } from '@/lib/sync-session-fence';
import {
  buildRevealGuardKey,
  reconcileAutoTrialIntentOnLaunch,
  transitionAutoTrialIntent,
  type AutoTrialIntentV1,
} from '@/lib/auto-trial-intent';
import { resolveGeneratingEntry } from '@/lib/generating-entry';
import {

  resolveTodayInflightAction,
  type InflightGenerationJob,
} from '@/lib/inflight-generation-job';

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

jest.mock('expo-notifications', () => ({
  getPermissionsAsync: jest.fn(async () => ({ status: 'granted' })),
  requestPermissionsAsync: jest.fn(async () => ({ status: 'granted' })),
  scheduleNotificationAsync: jest.fn(async () => 'id'),
  cancelScheduledNotificationAsync: jest.fn(async () => undefined),
  getAllScheduledNotificationsAsync: jest.fn(async () => []),
  setNotificationHandler: jest.fn(),
  AndroidImportance: { DEFAULT: 3 },
  SchedulableTriggerInputTypes: { DATE: 'date', DAILY: 'daily' },
}));

jest.mock('@react-native-community/netinfo', () => ({
  addEventListener: jest.fn(() => jest.fn()),
  fetch: jest.fn(async () => ({ isConnected: true })),
}));

jest.mock('expo-constants', () => ({
  __esModule: true,
  default: { expoConfig: { extra: { buildProfile: 'production' } } },
}));

jest.mock('expo-file-system/legacy', () => ({
  documentDirectory: '',
  cacheDirectory: '',
  getInfoAsync: jest.fn(async () => ({ exists: false })),
  makeDirectoryAsync: jest.fn(async () => undefined),
  deleteAsync: jest.fn(async () => undefined),
  downloadAsync: jest.fn(async () => ({ status: 200 })),
  createDownloadResumable: jest.fn(() => ({ downloadAsync: jest.fn(async () => ({ status: 200 })) })),
}));

jest.mock('expo-asset', () => ({ Asset: { fromModule: jest.fn(() => ({ downloadAsync: jest.fn() })) } }));

jest.mock('@expo/ui/swift-ui', () => new Proxy({}, { get: () => () => null }));

jest.mock('@/lib/widget-bridge', () => ({ syncWidgets: jest.fn() }));

jest.mock('expo-device', () => ({ isDevice: true }));

jest.mock('react-native-purchases', () => ({
  __esModule: true,
  default: {
    getCustomerInfo: jest.fn(async () => ({ entitlements: { active: {} } })),
    addCustomerInfoUpdateListener: jest.fn(),
  },
}));


const todaySource = readFileSync(
  join(__dirname, '../../app/(tabs)/(today)/index.tsx'),
  'utf8',
);

const INTENT_ID = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';

describe('Today read-budget gate', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockReadBudgetBlocked = true;
  });

  it('pauses the watcher and focus pull, then reruns both when the window ends', async () => {
    mockPullDevotionalContent.mockRejectedValueOnce(new SyncPullRateLimitedError(30));
    let tree: { update: (element: React.ReactElement) => void; unmount: () => void };

    await act(async () => {
      tree = renderer.create(<HomeScreen />);
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(mockGeneratedDayWatch).toHaveBeenLastCalledWith(expect.objectContaining({ enabled: false }));
    expect(mockPullDevotionalContent).not.toHaveBeenCalled();

    mockReadBudgetBlocked = false;
    await act(async () => {
      tree!.update(<HomeScreen />);
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(mockGeneratedDayWatch).toHaveBeenLastCalledWith(expect.objectContaining({ enabled: true }));
    expect(mockPullDevotionalContent).toHaveBeenCalledTimes(1);
    expect(mockLogBugEvent).toHaveBeenCalledWith(
      'today-sync-refresh',
      'sync-pull-rate-limited',
      { retryAfterSeconds: 30 },
      'warn',
    );
    act(() => tree!.unmount());
  });
});

describe('Today midday check-in', () => {
  const TODAY_QUESTION = 'Where did trust meet you today?';
  const TODAY_CHIPS = ['In a hard talk'];
  let saved: Record<string, unknown>;
  let tree: { update: (element: React.ReactElement) => void; unmount: () => void } | null = null;

  // Day 3 was read at readAt, so currentDay already points at a prepared Day 4.
  function seriesReadAt(readAt: Date) {
    return {
      id: 'today-series',
      title: 'Today Series',
      totalDays: 7,
      currentDay: 4,
      generationMode: 'progressive',
      createdAt: '2026-09-01T00:00:00.000Z',
      seriesStartDate: '2026-09-01T00:00:00.000Z',
      days: [
        { id: 'today-series-day-3', devotionalId: 'today-series', dayNumber: 3, title: 'Day 3', isRead: true, readAt: readAt.toISOString(), checkInQuestion: TODAY_QUESTION, checkInChips: TODAY_CHIPS },
        { id: 'today-series-day-4', devotionalId: 'today-series', dayNumber: 4, title: 'Day 4', isRead: false, checkInQuestion: 'A question about tomorrow', checkInChips: ['Tomorrow'] },
      ],
    };
  }

  // Opens Today from a midday notification, which opens the check-in sheet.
  async function openFromMiddayNotification(now: Date, readAt: Date) {
    jest.useFakeTimers({ now });
    mockTodayStoreState.devotionals = [seriesReadAt(readAt)];
    await act(async () => {
      tree = renderer.create(<HomeScreen />);
      await Promise.resolve();
    });
    expect(mockCheckInSheetProps).toEqual(expect.objectContaining({ visible: true, question: TODAY_QUESTION, chips: TODAY_CHIPS }));
  }

  // Moves the clock and lets Today's minute tick re-render.
  function moveClockTo(date: Date) {
    act(() => {
      jest.setSystemTime(date);
      jest.advanceTimersByTime(60_000);
    });
  }

  const WRITTEN_ANSWER = 'The talk with my brother';
  const WRITTEN_NOTE = 'Lord, help me listen first.';

  function submitCheckIn() {
    let result: boolean | undefined;
    act(() => {
      result = (mockCheckInSheetProps!.onComplete as (data: { mood: number; moodLabel: string; chipAnswer: string; freeText: string }) => boolean)(
        { mood: 5, moodLabel: 'Steady', chipAnswer: WRITTEN_ANSWER, freeText: WRITTEN_NOTE },
      );
    });
    return result;
  }

  // A refused answer stays in the open sheet: nothing saved, no alert, and the
  // reader's words in no log event.
  function expectRefusedInTheOpenSheet() {
    expect(mockTodayStoreState.addCheckIn).not.toHaveBeenCalled();
    expect(mockTodayStoreState.markMiddayCheckInCompleted).not.toHaveBeenCalled();
    expect(mockCheckInSheetProps).toEqual(expect.objectContaining({ visible: true, question: TODAY_QUESTION, chips: TODAY_CHIPS }));
    // The same sheet all along, so the text typed in it is still there.
    expect(mockCheckInSheetMounts).toBe(1);
    expect(alertSpy).not.toHaveBeenCalled();
    const logged = JSON.stringify([mockLogBugEvent.mock.calls, consoleSpies.map((spy) => spy.mock.calls)]);
    expect(logged).not.toContain(WRITTEN_ANSWER);
    expect(logged).not.toContain(WRITTEN_NOTE);
  }

  async function syncDevotionals(devotionals: unknown[], currentDevotionalId?: string) {
    mockTodayStoreState.devotionals = devotionals;
    if (currentDevotionalId) mockTodayStoreState.currentDevotionalId = currentDevotionalId;
    await act(async () => {
      tree!.update(<HomeScreen />);
      await Promise.resolve();
    });
  }

  let alertSpy: jest.SpyInstance;
  let consoleSpies: jest.SpyInstance[];

  beforeEach(() => {
    consoleSpies = (['log', 'info', 'warn', 'error', 'debug'] as const).map((method) => jest.spyOn(console, method).mockImplementation(() => undefined));
    saved = { ...mockTodayStoreState };
    mockCheckInSheetProps = null;
    mockCheckInSheetMounts = 0;
    mockSearchParams = { focus: 'midday' };
    // A day read today reaches the completed-day reflection, which reads journal entries.
    mockTodayStoreState.getJournalEntry = () => undefined;
    mockTodayStoreState.addCheckIn = jest.fn();
    mockTodayStoreState.markMiddayCheckInCompleted = jest.fn();
    // The store keeps the session the way the real one does.
    mockTodayStoreState.ritualSessions = {};
    mockTodayStoreState.beginRitualSession = (identity: RitualSessionIdentity) => {
      mockTodayStoreState.ritualSessions = { midday: beginRitualSessionRecord(undefined, { ...identity, timeZone: null }) };
    };
    mockTodayStoreState.clearRitualSession = jest.fn();
    alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
  });

  afterEach(() => {
    if (tree) act(() => tree!.unmount());
    tree = null;
    Object.keys(mockTodayStoreState).forEach((key) => delete mockTodayStoreState[key]);
    Object.assign(mockTodayStoreState, saved);
    mockSearchParams = {};
    resetSyncSessionFenceForTesting();
    alertSpy.mockRestore();
    consoleSpies.forEach((spy) => spy.mockRestore());
    jest.useRealTimers();
  });

  it('asks the question of the day it saves to, not the prepared tomorrow', async () => {
    await openFromMiddayNotification(new Date(2026, 8, 28, 12, 30), new Date(2026, 8, 28, 8, 0));

    expect(submitCheckIn()).toBe(true);
    expect(mockTodayStoreState.addCheckIn).toHaveBeenCalledWith(expect.objectContaining({ devotionalId: 'today-series', dayNumber: 3, timeOfDay: 'midday' }));
    expect(alertSpy).not.toHaveBeenCalled();
  });

  it('saves the answer for a day still in preparation', async () => {
    jest.useFakeTimers({ now: new Date(2026, 8, 28, 12, 30) });
    // Day 3 was read yesterday. Today's Day 4 is still being prepared, so it is not in the store.
    const series = seriesReadAt(new Date(2026, 8, 27, 8, 0));
    mockTodayStoreState.devotionals = [{ ...series, days: series.days.filter((day) => day.dayNumber === 3) }];
    await act(async () => {
      tree = renderer.create(<HomeScreen />);
      await Promise.resolve();
    });
    expect(mockCheckInSheetProps).toEqual(expect.objectContaining({ visible: true, question: undefined }));

    expect(submitCheckIn()).toBe(true);
    expect(mockTodayStoreState.addCheckIn).toHaveBeenCalledWith(expect.objectContaining({ devotionalId: 'today-series', dayNumber: 4, timeOfDay: 'midday' }));
  });

  it('keeps the day it opened on when midnight passes with the sheet open', async () => {
    await openFromMiddayNotification(new Date(2026, 8, 28, 23, 59), new Date(2026, 8, 28, 23, 30));

    moveClockTo(new Date(2026, 8, 29, 0, 1));
    expect(mockCheckInSheetProps).toEqual(expect.objectContaining({ question: TODAY_QUESTION, chips: TODAY_CHIPS }));
    submitCheckIn();
    expect(mockTodayStoreState.addCheckIn).toHaveBeenCalledWith(expect.objectContaining({ dayNumber: 3 }));
  });

  it('saves to the opened day after the ritual carry-over window runs out', async () => {
    await openFromMiddayNotification(new Date(2026, 8, 28, 23, 59), new Date(2026, 8, 28, 23, 30));

    // More than four hours past midnight, the ritual session no longer carries the day.
    moveClockTo(new Date(2026, 8, 29, 4, 5));
    expect(mockCheckInSheetProps).toEqual(expect.objectContaining({ question: TODAY_QUESTION }));
    submitCheckIn();
    expect(mockTodayStoreState.addCheckIn).toHaveBeenCalledWith(expect.objectContaining({ devotionalId: 'today-series', dayNumber: 3 }));
  });

  it('saves to the opened series when a sync switches series with the sheet open', async () => {
    await openFromMiddayNotification(new Date(2026, 8, 28, 12, 30), new Date(2026, 8, 28, 8, 0));

    mockTodayStoreState.devotionals = [
      { ...seriesReadAt(new Date(2026, 8, 28, 8, 0)), archivedAt: '2026-09-28T19:00:00.000Z' },
      { id: 'series-b', title: 'Series B', totalDays: 7, currentDay: 2, generationMode: 'progressive', createdAt: '2026-09-20T00:00:00.000Z', seriesStartDate: '2026-09-20T00:00:00.000Z', days: [{ id: 'series-b-day-2', devotionalId: 'series-b', dayNumber: 2, title: 'B Day 2', isRead: false, checkInQuestion: 'A question from series B' }] },
    ];
    mockTodayStoreState.currentDevotionalId = 'series-b';
    await act(async () => {
      tree!.update(<HomeScreen />);
      await Promise.resolve();
    });

    submitCheckIn();
    expect(mockTodayStoreState.addCheckIn).toHaveBeenCalledWith(expect.objectContaining({ devotionalId: 'today-series', dayNumber: 3 }));
  });

  it('saves nothing and keeps the sheet open when a sync deletes the opened series', async () => {
    await openFromMiddayNotification(new Date(2026, 8, 28, 12, 30), new Date(2026, 8, 28, 8, 0));

    await syncDevotionals([
      { id: 'series-b', title: 'Series B', totalDays: 7, currentDay: 2, generationMode: 'progressive', createdAt: '2026-09-20T00:00:00.000Z', seriesStartDate: '2026-09-20T00:00:00.000Z', days: [{ id: 'series-b-day-2', devotionalId: 'series-b', dayNumber: 2, title: 'B Day 2', isRead: false, checkInQuestion: 'A question from series B' }] },
    ], 'series-b');

    expect(submitCheckIn()).toBe(false);
    expectRefusedInTheOpenSheet();
  });

  it('saves nothing and keeps the sheet open when a sync deletes the opened day', async () => {
    await openFromMiddayNotification(new Date(2026, 8, 28, 12, 30), new Date(2026, 8, 28, 8, 0));

    const series = seriesReadAt(new Date(2026, 8, 28, 8, 0));
    await syncDevotionals([{ ...series, days: series.days.filter((day) => day.dayNumber !== 3) }]);

    expect(submitCheckIn()).toBe(false);
    expectRefusedInTheOpenSheet();
  });

  it('keeps the open sheet on screen when a sync deletes the only series', async () => {
    await openFromMiddayNotification(new Date(2026, 8, 28, 12, 30), new Date(2026, 8, 28, 8, 0));

    // No series is left, so Today has no current series to show.
    mockTodayStoreState.currentDevotionalId = null;
    await syncDevotionals([]);

    expect(mockCheckInSheetProps).toEqual(expect.objectContaining({ visible: true, question: TODAY_QUESTION, chips: TODAY_CHIPS }));
    expect(submitCheckIn()).toBe(false);
    expectRefusedInTheOpenSheet();
  });

  it('closes the refused sheet when the reader closes it', async () => {
    await openFromMiddayNotification(new Date(2026, 8, 28, 12, 30), new Date(2026, 8, 28, 8, 0));
    mockTodayStoreState.currentDevotionalId = null;
    await syncDevotionals([]);
    expect(submitCheckIn()).toBe(false);

    act(() => (mockCheckInSheetProps!.onClose as () => void)());

    expect(mockCheckInSheetProps).toEqual(expect.objectContaining({ visible: false }));
  });

  it('closes the check-in with the alert when an account reset is in progress at the submit', async () => {
    await openFromMiddayNotification(new Date(2026, 8, 28, 12, 30), new Date(2026, 8, 28, 8, 0));

    let resetToken = 0;
    act(() => {
      resetToken = beginLocalResetSession();
    });
    expect(submitCheckIn()).toBe(false);

    expect(mockTodayStoreState.addCheckIn).not.toHaveBeenCalled();
    expect(mockCheckInSheetProps).toEqual(expect.objectContaining({ visible: false }));
    expect(alertSpy).toHaveBeenCalledWith('Check-in not saved', 'The reading it belongs to was removed from this device while you were answering.');
    act(() => endLocalResetSession(resetToken));
  });

  it('closes the check-in and saves nothing after an account reset', async () => {
    await openFromMiddayNotification(new Date(2026, 8, 28, 12, 30), new Date(2026, 8, 28, 8, 0));
    const submitAfterReset = mockCheckInSheetProps!.onComplete as (data: { mood: number; moodLabel: string }) => void;

    act(() => {
      endLocalResetSession(beginLocalResetSession());
    });
    expect(mockCheckInSheetProps).toEqual(expect.objectContaining({ visible: false }));
    act(() => submitAfterReset({ mood: 5, moodLabel: 'Steady' }));
    expect(mockTodayStoreState.addCheckIn).not.toHaveBeenCalled();
    expect(alertSpy).toHaveBeenCalledWith('Check-in not saved', expect.any(String));
  });
});

function intent(overrides: Partial<AutoTrialIntentV1> = {}): AutoTrialIntentV1 {
  return {
    version: 1,
    intentId: INTENT_ID,
    deviceId: 'device-1',
    entry: 'onboarding',
    surface: 'onboarding_paywall',
    source: 'purchase',
    simulated: false,
    trialDays: 3,
    purchasedAt: '2026-09-08T17:00:00.000Z',
    expiresAt: '2026-09-11T17:00:00.000Z',
    purchaseLocalDate: '2026-09-08',
    timeZone: 'America/Chicago',
    platform: 'ios',
    isSandbox: false,
    productIdentifier: 'unfold_premium_yearly',
    switchEnabledAtPurchase: true,
    switchFetchedAt: '2026-09-08T17:00:00.000Z',
    requestId: '11111111-2222-4333-8444-555555555555',
    status: 'purchased',
    jobId: null,
    devotionalId: null,
    createdAt: '2026-09-08T17:00:00.000Z',
    updatedAt: '2026-09-08T17:00:00.000Z',
    submittedAt: null,
    landedAt: null,
    revealedAt: null,
    completedAt: null,
    dismissedAt: null,
    failedAt: null,
    failureCode: null,
    abandonedAt: null,
    abandonReason: null,
    ...overrides,
  };
}

describe('H7 Today auto-trial focus', () => {
  it('wires reconcile before the inflight resolver and skips the resolver on open_reveal', () => {
    const focusEffect = todaySource.slice(
      todaySource.indexOf('export function applyTodayAutoTrialFocus'),
      todaySource.indexOf('const onInflightSeriesSettled'),
    );
    expect(focusEffect.indexOf('reconcileAutoTrialIntentOnLaunch')).toBeLessThan(
      focusEffect.indexOf('resolveTodayInflightAction'),
    );
    expect(focusEffect).toContain("action === 'open_reveal'");
    expect(focusEffect).toContain('settleLandedAutoTrialSeries');
    expect(focusEffect).toContain('applyTodayAutoTrialFocus');
  });

  it('open_reveal skips the resolver and names the reveal route', () => {
    const resolveInflight = jest.fn(resolveTodayInflightAction);
    const result = applyTodayAutoTrialFocus({
      intent: intent({ status: 'purchased' }),
      deviceId: 'device-1',
      nowMs: Date.parse('2026-09-10T17:00:00.000Z'),
      hasCompletedOnboarding: true,
      landedDevotionalIds: [],
      inflightJob: null,
      revealGuardKey: null,
      generationSessionStatus: 'idle',
      resolveInflight,
    });

    expect(result.launchAction).toEqual({ action: 'open_reveal', intentId: INTENT_ID });
    expect(result.skipResolver).toBe(true);
    expect(result.navigation).toEqual({
      pathname: '/generating',
      params: { autoTrialIntentId: INTENT_ID },
    });
    expect(resolveInflight).not.toHaveBeenCalled();
  });

  it('none runs the resolver as today', () => {
    const resolveInflight = jest.fn(resolveTodayInflightAction);
    const result = applyTodayAutoTrialFocus({
      intent: null,
      deviceId: 'device-1',
      nowMs: Date.parse('2026-09-10T17:00:00.000Z'),
      hasCompletedOnboarding: true,
      landedDevotionalIds: [],
      inflightJob: null,
      revealGuardKey: null,
      generationSessionStatus: 'running',
      resolveInflight,
    });

    expect(result.launchAction).toEqual({ action: 'none' });
    expect(result.skipResolver).toBe(false);
    expect(resolveInflight).toHaveBeenCalledTimes(1);
  });

  it('does not reopen reveal when the session guard key still matches', () => {
    const purchased = intent({ status: 'purchased' });
    const guarded = applyTodayAutoTrialFocus({
      intent: purchased,
      deviceId: 'device-1',
      nowMs: Date.parse('2026-09-10T17:00:00.000Z'),
      hasCompletedOnboarding: true,
      landedDevotionalIds: [],
      inflightJob: null,
      revealGuardKey: buildRevealGuardKey(purchased, null),
      generationSessionStatus: 'idle',
    });
    expect(guarded.navigation).toBeNull();
    expect(guarded.launchAction.action).toBe('none');

    const fresh = applyTodayAutoTrialFocus({
      intent: purchased,
      deviceId: 'device-1',
      nowMs: Date.parse('2026-09-10T17:00:00.000Z'),
      hasCompletedOnboarding: true,
      landedDevotionalIds: [],
      inflightJob: null,
      revealGuardKey: null,
      generationSessionStatus: 'idle',
    });
    expect(fresh.navigation).toEqual({
      pathname: '/generating',
      params: { autoTrialIntentId: INTENT_ID },
    });
  });

  it('reopens reveal once after a dismissed auto-job record is gone', () => {
    const submitted = intent({
      status: 'submitted',
      jobId: 'job-1',
      devotionalId: 'auto-1',
      dismissedAt: '2026-09-10T16:00:00.000Z',
    });
    const result = applyTodayAutoTrialFocus({
      intent: submitted,
      deviceId: 'device-1',
      nowMs: Date.parse('2026-09-10T17:00:00.000Z'),
      hasCompletedOnboarding: true,
      landedDevotionalIds: [],
      inflightJob: null,
      revealGuardKey: null,
      generationSessionStatus: 'error',
    });

    expect(reconcileAutoTrialIntentOnLaunch({
      intent: submitted,
      deviceId: 'device-1',
      nowMs: Date.parse('2026-09-10T17:00:00.000Z'),
      hasCompletedOnboarding: true,
      landedDevotionalIds: [],
      inflightJob: null,
      revealGuardKey: null,
    }).action).toBe('open_reveal');
    expect(result.navigation).toEqual({
      pathname: '/generating',
      params: { autoTrialIntentId: INTENT_ID },
    });
  });

  it('keeps auto-trial-handoff after mark_landed settle clears the inflight record', () => {
    const inflight: InflightGenerationJob = {
      jobId: 'job-1',
      devotionalId: 'auto-1',
      submittedAt: Date.parse('2026-09-10T16:00:00.000Z'),
    };
    const submitted = intent({
      status: 'submitted',
      jobId: 'job-1',
      devotionalId: 'auto-1',
    });
    const focus = applyTodayAutoTrialFocus({
      intent: submitted,
      deviceId: 'device-1',
      nowMs: Date.parse('2026-09-10T17:00:00.000Z'),
      hasCompletedOnboarding: true,
      landedDevotionalIds: ['auto-1'],
      inflightJob: inflight,
      revealGuardKey: null,
      generationSessionStatus: 'running',
    });

    expect(focus.launchAction).toEqual({ action: 'mark_landed', then: 'open_reveal' });
    expect(focus.settleIntent).toEqual(submitted);
    expect(focus.navigation).toEqual({
      pathname: '/generating',
      params: { autoTrialIntentId: INTENT_ID },
    });

    const landed = { ...submitted, status: 'landed' as const };
    const entry = resolveGeneratingEntry({
      inflight: null,
      params: focus.navigation?.params ?? {},
      sessionDevotionalId: null,
      autoTrialIntent: landed,
    });
    expect(entry).toEqual({ kind: 'auto-trial-handoff', intentId: INTENT_ID });
    expect(entry).not.toEqual({ kind: 'submit' });
  });

  it('never resumes an unmarked auto record on /generating', () => {
    const autoJob: InflightGenerationJob = {
      jobId: 'job-1',
      devotionalId: 'auto-1',
      submittedAt: Date.parse('2026-09-10T16:00:00.000Z'),
    };
    const autoIntent = intent({
      status: 'submitted',
      jobId: 'job-1',
      devotionalId: 'auto-1',
      dismissedAt: '2026-09-10T16:00:00.000Z',
    });
    const result = applyTodayAutoTrialFocus({
      intent: autoIntent,
      deviceId: 'device-1',
      nowMs: Date.parse('2026-09-10T17:00:00.000Z'),
      hasCompletedOnboarding: true,
      landedDevotionalIds: [],
      inflightJob: autoJob,
      revealGuardKey: buildRevealGuardKey(autoIntent, autoJob),
      generationSessionStatus: 'running',
    });

    expect(result.inflightDecision?.action).toBe('watch-on-today');
    expect(result.navigation).toBeNull();
    expect(result.resumeGenerating).toBe(false);
  });

  it('routes auto today-failed retry to generating for submitted and failed', () => {
    const retry = todaySource.slice(
      todaySource.indexOf('const handleRetryInflightSeries'),
      todaySource.indexOf('const handleDismissInflightSeriesFailure'),
    );
    expect(retry).toContain('generatingRoute(readAutoTrialIntent()?.intentId)');
    expect(retry).not.toContain("pathname: '/series-reveal'");
    expect(retry).not.toContain('submitGenerationJob');
  });

  it('openNewSeriesDiscovery with a landed intent does not hand off', () => {
    const landed = intent({ status: 'landed', jobId: 'job-1', devotionalId: 'auto-1' });
    expect(resolveGeneratingEntry({
      inflight: null,
      params: {},
      sessionDevotionalId: null,
      autoTrialIntent: landed,
    }).kind).not.toBe('auto-trial-handoff');

    const discovery = todaySource.slice(
      todaySource.indexOf('const openNewSeriesDiscovery'),
      todaySource.indexOf('const handleCreateNew'),
    );
    expect(discovery).not.toContain('/generating');
    expect(discovery).toContain("pathname: '/onboarding'");
  });

  it('the reconcile push carries autoTrialIntentId', () => {
    const openReveal = applyTodayAutoTrialFocus({
      intent: intent({ status: 'purchased' }),
      deviceId: 'device-1',
      nowMs: Date.parse('2026-09-10T17:00:00.000Z'),
      hasCompletedOnboarding: true,
      landedDevotionalIds: [],
      inflightJob: null,
      revealGuardKey: null,
      generationSessionStatus: 'idle',
    });
    expect(openReveal.navigation).toEqual({
      pathname: '/generating',
      params: { autoTrialIntentId: INTENT_ID },
    });

    const markLanded = applyTodayAutoTrialFocus({
      intent: intent({ status: 'submitted', jobId: 'job-1', devotionalId: 'auto-1' }),
      deviceId: 'device-1',
      nowMs: Date.parse('2026-09-10T17:00:00.000Z'),
      hasCompletedOnboarding: true,
      landedDevotionalIds: ['auto-1'],
      inflightJob: {
        jobId: 'job-1',
        devotionalId: 'auto-1',
        submittedAt: Date.parse('2026-09-10T16:00:00.000Z'),
      },
      revealGuardKey: null,
      generationSessionStatus: 'running',
    });
    expect(markLanded.navigation).toEqual({
      pathname: '/generating',
      params: { autoTrialIntentId: INTENT_ID },
    });
  });

  it('abandons a purchased intent before opening new-series onboarding', () => {
    const storage = new Map<string, string>();
    const purchased = intent({ status: 'purchased' });
    storage.set('auto-trial-series-intent-v1', JSON.stringify(purchased));
    const fakeStorage = {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => {
        storage.set(key, value);
      },
      removeItem: (key: string) => {
        storage.delete(key);
      },
    };

    abandonPurchasedIntentBeforeNewSeries({
      nowMs: Date.parse('2026-09-10T17:00:00.000Z'),
      storage: fakeStorage,
    });
    const next = JSON.parse(storage.get('auto-trial-series-intent-v1') ?? '{}') as AutoTrialIntentV1;
    expect(next.status).toBe('abandoned');
    expect(next.abandonReason).toBe('superseded_by_user_series');

    const discovery = todaySource.slice(
      todaySource.indexOf('const openNewSeriesDiscovery'),
      todaySource.indexOf('const handleCreateNew'),
    );
    expect(discovery.indexOf('abandonPurchasedIntentBeforeNewSeries')).toBeLessThan(
      discovery.indexOf('router.push'),
    );
    expect(discovery).toContain("pathname: '/onboarding'");
    expect(transitionAutoTrialIntent).toEqual(expect.any(Function));
  });

  it('abandons a failed intent before opening new-series onboarding', () => {
    const storage = new Map<string, string>();
    const failed = intent({ status: 'failed', jobId: 'job-1', failedAt: '2026-09-10T16:00:00.000Z' });
    storage.set('auto-trial-series-intent-v1', JSON.stringify(failed));
    const fakeStorage = {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => {
        storage.set(key, value);
      },
      removeItem: (key: string) => {
        storage.delete(key);
      },
    };

    abandonPurchasedIntentBeforeNewSeries({
      nowMs: Date.parse('2026-09-10T17:00:00.000Z'),
      storage: fakeStorage,
    });
    const next = JSON.parse(storage.get('auto-trial-series-intent-v1') ?? '{}') as AutoTrialIntentV1;
    expect(next.status).toBe('abandoned');
    expect(next.abandonReason).toBe('user_setup_fallback');
  });
});
