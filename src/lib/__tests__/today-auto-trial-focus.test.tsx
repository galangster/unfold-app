/* eslint-disable import/first */
import React from 'react';
import { Alert, AppState, type AppStateStatus, type NativeEventSubscription } from 'react-native';
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
const mockPullDevotionalContent = jest.fn(async (..._args: unknown[]): Promise<{ days: unknown[]; timestamp: string }> => ({ days: [], timestamp: 't' }));
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
let mockIsTodayFocused = true;
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), navigate: jest.fn(), setParams: jest.fn() }),
  useSegments: () => [],
  useNavigation: () => ({ getState: () => ({ index: 1, routes: [] }) }),
  useFocusEffect: (callback: () => void | (() => void)) => require('react').useEffect(callback, [callback]),
  useIsFocused: () => mockIsTodayFocused,
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
let mockAdaptiveLayout: object | null = null;
jest.mock('@/hooks/useAdaptiveLayout', () => ({
  useAdaptiveLayout: () => mockAdaptiveLayout ?? {
    usesSplit: false,
    splitMaxWidth: 800,
    clusterMaxWidth: 600,
    columnGap: 16,
    availableHeight: 800,
  },
}));

jest.mock('@/components/home/AmbientArtCanvas', () => ({ AmbientArtCanvas: () => null }));
let mockDevotionalCardProps: Record<string, unknown> | null = null;
jest.mock('@/components/home/DevotionalCard', () => ({
  DevotionalCard: (props: Record<string, unknown>) => {
    mockDevotionalCardProps = props;
    return null;
  },
}));
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

import HomeScreen, { applyTodayAutoTrialFocus } from '@/app/(tabs)/(today)/index';
import { SyncPullRateLimitedError } from '@/lib/sync-pull-backoff';
import { drainSyncOutbox } from '@/lib/sync-outbox';
import { commitDevotionalPullCursor } from '@/lib/devotional-sync-pull';
import { applyPulledDevotionalContent } from '@/lib/devotional-pulled-content';
import { beginRitualSessionRecord, type RitualSessionIdentity } from '@/lib/ritual-session';
import { beginLocalResetSession, endLocalResetSession, resetSyncSessionFenceForTesting } from '@/lib/sync-session-fence';
import {
  abandonPurchasedIntentBeforeNewSeries,
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

describe('Today pages', () => {
  const { resolveAdaptiveLayout, resolveAdaptivePanes } = jest.requireActual('@/lib/adaptive-layout');

  afterEach(() => {
    mockAdaptiveLayout = null;
    mockDevotionalCardProps = null;
  });

  async function renderToday() {
    let tree: { unmount: () => void } | undefined;
    await act(async () => {
      tree = renderer.create(<HomeScreen />);
      await Promise.resolve();
    });
    tree?.unmount();
  }

  it('sizes the hero from its page on an open folding display', async () => {
    // Reported iPhone Duo inner display, open and wider than tall.
    mockAdaptiveLayout = resolveAdaptiveLayout({ width: 951, height: 669, insetTop: 24, insetBottom: 20 });
    const panes = resolveAdaptivePanes(mockAdaptiveLayout);
    await renderToday();

    expect(panes.first).toBe(panes.second);
    expect(mockDevotionalCardProps?.availableWidth).toBe(panes.first);
    expect(mockDevotionalCardProps?.relaxHeroMinHeight).toBe(true);
  });

  it('sizes the hero from the safe column, not the window, beside a side rail', async () => {
    // Reported iPhone Duo outer display with a side rail on one edge.
    mockAdaptiveLayout = resolveAdaptiveLayout({ width: 466, height: 678, insetLeft: 80 });
    await renderToday();

    expect(mockDevotionalCardProps?.availableWidth).toBe(386);
    expect(mockDevotionalCardProps?.relaxHeroMinHeight).toBe(false);
  });
});

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

describe('Today across local midnight', () => {
  // An on-schedule reader: the series started Oct 1 and Day 3 was read on the
  // evening of Oct 3, so currentDay already points at Day 4. The server only
  // writes Day 4 after local midnight, so it is not on the device yet.
  const onScheduleSeries = {
    id: 'today-series',
    title: 'Today Series',
    totalDays: 7,
    currentDay: 4,
    generationMode: 'progressive',
    createdAt: new Date(2026, 9, 1, 8, 0).toISOString(),
    seriesStartDate: new Date(2026, 9, 1, 8, 0).toISOString(),
    days: [
      new Date(2026, 9, 1, 8, 30),
      new Date(2026, 9, 2, 8, 30),
      new Date(2026, 9, 3, 20, 30),
    ].map((readAt, index) => ({
      id: `today-series-day-${index + 1}`,
      devotionalId: 'today-series',
      dayNumber: index + 1,
      title: `Day ${index + 1}`,
      isRead: true,
      readAt: readAt.toISOString(),
    })),
  };
  let saved: Record<string, unknown>;
  let tree: { update: (element: React.ReactElement) => void; unmount: () => void } | null = null;
  let appStateListeners: Set<(state: AppStateStatus) => void>;
  // The preset's AppState.addEventListener is already a jest.fn. Put its
  // default back afterwards; mockRestore() would wipe it, and every later
  // subscription in this file would come back undefined.
  const appStateListen = jest.mocked(AppState.addEventListener);
  const defaultAppStateListen = appStateListen.getMockImplementation();

  async function renderTodayAt(now: Date) {
    jest.useFakeTimers({ now });
    await act(async () => {
      tree = renderer.create(<HomeScreen />);
      await Promise.resolve();
    });
  }

  // iOS resumes a suspended app without a navigation focus event: only
  // AppState listeners hear it.
  function emitAppState(state: AppStateStatus) {
    act(() => {
      [...appStateListeners].forEach((listener) => listener(state));
    });
  }

  function lastWatchOptions() {
    return mockGeneratedDayWatch.mock.calls[mockGeneratedDayWatch.mock.calls.length - 1]?.[0];
  }

  // The pull is async: let its result reach the store before asserting on it.
  async function settlePull() {
    await act(async () => {
      for (let i = 0; i < 5; i++) await Promise.resolve();
    });
  }

  // What the server wrote overnight: Day 4 of the open series.
  const overnightPull = {
    days: [{ id: 'today-series-day-4', devotionalId: 'today-series', dayNumber: 4, title: 'Day 4' }],
    timestamp: 'overnight',
  };

  beforeEach(() => {
    jest.clearAllMocks();
    saved = { ...mockTodayStoreState };
    mockReadBudgetBlocked = false;
    mockIsTodayFocused = true;
    mockTodayStoreState.devotionals = [onScheduleSeries];
    mockTodayStoreState.currentDevotionalId = 'today-series';
    mockTodayStoreState.getJournalEntry = () => undefined;
    appStateListeners = new Set();
    appStateListen.mockImplementation((_type, listener) => {
      const handler = listener as (state: AppStateStatus) => void;
      appStateListeners.add(handler);
      return { remove: () => appStateListeners.delete(handler) } as unknown as NativeEventSubscription;
    });
  });

  afterEach(() => {
    if (tree) act(() => tree!.unmount());
    tree = null;
    Object.keys(mockTodayStoreState).forEach((key) => delete mockTodayStoreState[key]);
    Object.assign(mockTodayStoreState, saved);
    mockReadBudgetBlocked = false;
    mockIsTodayFocused = true;
    appStateListen.mockImplementation(defaultAppStateListen);
    jest.useRealTimers();
  });

  it('asks for the new day when local midnight passes with Today open', async () => {
    await renderTodayAt(new Date(2026, 9, 3, 23, 59, 30));
    // Day 4 is tomorrow's reading until midnight, so nothing asks for it yet.
    expect(lastWatchOptions()).toEqual(expect.objectContaining({ dayNumber: 4, enabled: false, canMutate: false }));

    act(() => {
      jest.advanceTimersByTime(60_000);
    });

    // The same series object, untouched by any store write, is due on Oct 4.
    expect((mockTodayStoreState.devotionals as unknown[])[0]).toBe(onScheduleSeries);
    expect(lastWatchOptions()).toEqual(expect.objectContaining({
      devotionalId: 'today-series',
      dayNumber: 4,
      enabled: true,
      canMutate: true,
    }));
  });

  it('asks for and pulls the new day on a warm resume the next morning, with no focus change', async () => {
    await renderTodayAt(new Date(2026, 9, 3, 21, 0));
    expect(lastWatchOptions()).toEqual(expect.objectContaining({ dayNumber: 4, enabled: false }));
    expect(mockPullDevotionalContent).toHaveBeenCalledTimes(1);
    expect(drainSyncOutbox).toHaveBeenCalledTimes(1);

    emitAppState('background');
    act(() => {
      jest.setSystemTime(new Date(2026, 9, 4, 7, 30));
    });
    mockPullDevotionalContent.mockResolvedValueOnce(overnightPull);
    emitAppState('active');
    await settlePull();
    // The minute tick that was due while the app slept.
    act(() => {
      jest.advanceTimersByTime(60_000);
    });

    expect(lastWatchOptions()).toEqual(expect.objectContaining({
      devotionalId: 'today-series',
      dayNumber: 4,
      enabled: true,
      canMutate: true,
    }));
    // A day the server wrote overnight lands without the reader leaving Today.
    expect(drainSyncOutbox).toHaveBeenCalledTimes(2);
    expect(mockPullDevotionalContent).toHaveBeenCalledTimes(2);
    expect(mockPullDevotionalContent).toHaveBeenLastCalledWith('today-series');
    // The pulled day reaches the store, and only then does the cursor move.
    expect(applyPulledDevotionalContent).toHaveBeenCalledWith(expect.objectContaining({
      devotionalId: 'today-series',
      pulled: overnightPull,
    }));
    expect(commitDevotionalPullCursor).toHaveBeenCalledWith(overnightPull);
    const applyOrder = jest.mocked(applyPulledDevotionalContent).mock.invocationCallOrder;
    const commitOrder = jest.mocked(commitDevotionalPullCursor).mock.invocationCallOrder;
    expect(applyOrder[applyOrder.length - 1]).toBeLessThan(commitOrder[commitOrder.length - 1]);
    // The card follows the watch again, so its Checking / Check Again action
    // tracks the job, instead of a recovery-less "Check back in a moment".
    expect(mockDevotionalCardProps?.state).toEqual(expect.objectContaining({
      type: 'preparing',
      dayNumber: 4,
      recovery: expect.objectContaining({ onCheckAgain: expect.any(Function) }),
    }));
  });

  it('keeps the cursor when the pulled day fails to reach the store', async () => {
    await renderTodayAt(new Date(2026, 9, 3, 21, 0));
    await settlePull();
    jest.mocked(applyPulledDevotionalContent).mockClear();
    jest.mocked(commitDevotionalPullCursor).mockClear();
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined);

    emitAppState('background');
    act(() => {
      jest.setSystemTime(new Date(2026, 9, 4, 7, 30));
    });
    mockPullDevotionalContent.mockResolvedValueOnce(overnightPull);
    jest.mocked(applyPulledDevotionalContent).mockImplementationOnce(() => {
      throw new Error('apply failed');
    });
    emitAppState('active');
    await settlePull();
    warnSpy.mockRestore();

    // Day 4 never reached the store. The cursor stays put, so the next
    // incremental pull asks for Day 4 again instead of skipping it.
    expect(applyPulledDevotionalContent).toHaveBeenCalledWith(expect.objectContaining({ pulled: overnightPull }));
    expect(commitDevotionalPullCursor).not.toHaveBeenCalled();
  });

  it('shows the new day on resume without waiting for the minute tick', async () => {
    await renderTodayAt(new Date(2026, 9, 3, 21, 0));

    emitAppState('background');
    act(() => {
      jest.setSystemTime(new Date(2026, 9, 4, 7, 30));
    });
    emitAppState('active');
    await settlePull();

    // No 60s tick has run yet. The card already treats Oct 4 as today: Day 3
    // was read yesterday, so Day 4 is being prepared, not locked until tomorrow.
    expect(mockDevotionalCardProps?.state).toEqual(expect.objectContaining({
      type: 'preparing',
      dayNumber: 4,
    }));
  });

  it('refreshes on foreground only while Today is focused, at most once per cooldown', async () => {
    await renderTodayAt(new Date(2026, 9, 4, 7, 30));
    expect(mockPullDevotionalContent).toHaveBeenCalledTimes(1);

    emitAppState('active');
    expect(mockPullDevotionalContent).toHaveBeenCalledTimes(2);

    act(() => {
      jest.advanceTimersByTime(5_000);
    });
    emitAppState('active');
    expect(mockPullDevotionalContent).toHaveBeenCalledTimes(2);

    act(() => {
      jest.advanceTimersByTime(6_000);
    });
    emitAppState('active');
    expect(mockPullDevotionalContent).toHaveBeenCalledTimes(3);

    // Another screen covers Today: its own focus pull covers the return.
    mockIsTodayFocused = false;
    await act(async () => {
      tree!.update(<HomeScreen />);
      await Promise.resolve();
    });
    act(() => {
      jest.advanceTimersByTime(60_000);
    });
    emitAppState('active');
    expect(mockPullDevotionalContent).toHaveBeenCalledTimes(3);
  });

  it('drops a foreground pull that resolves after Today lost focus', async () => {
    await renderTodayAt(new Date(2026, 9, 4, 7, 30));
    await settlePull();
    jest.mocked(applyPulledDevotionalContent).mockClear();
    jest.mocked(commitDevotionalPullCursor).mockClear();

    let resolvePull: (value: { days: unknown[]; timestamp: string }) => void = () => {};
    mockPullDevotionalContent.mockImplementationOnce(() => new Promise((resolve) => { resolvePull = resolve; }));
    emitAppState('active');
    expect(mockPullDevotionalContent).toHaveBeenCalledTimes(2);

    // Another screen covers Today before the pull comes back.
    mockIsTodayFocused = false;
    await act(async () => {
      tree!.update(<HomeScreen />);
      await Promise.resolve();
    });
    resolvePull(overnightPull);
    await settlePull();

    expect(applyPulledDevotionalContent).not.toHaveBeenCalled();
    expect(commitDevotionalPullCursor).not.toHaveBeenCalled();
  });

  it('drains the outbox on foreground but does not pull while the read budget is spent', async () => {
    mockReadBudgetBlocked = true;
    await renderTodayAt(new Date(2026, 9, 4, 7, 30));
    expect(drainSyncOutbox).toHaveBeenCalledTimes(1);

    emitAppState('active');

    expect(drainSyncOutbox).toHaveBeenCalledTimes(2);
    expect(mockPullDevotionalContent).not.toHaveBeenCalled();
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
