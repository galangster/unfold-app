/* eslint-disable @typescript-eslint/no-require-imports, import/first */
import React from 'react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const renderer = require('react-test-renderer');
const { act } = renderer;

jest.mock('expo-router', () => ({
  useFocusEffect: () => undefined,
  useRouter: () => ({ push: jest.fn(), navigate: jest.fn() }),
}));

jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(),
  ImpactFeedbackStyle: { Medium: 'medium', Light: 'light' },
}));

jest.mock('react-native-reanimated', () => {
  const { View } = require('react-native');
  const animation: Record<string, unknown> = {};
  animation.duration = () => animation;
  animation.delay = () => animation;
  animation.easing = () => animation;
  return {
    __esModule: true,
    default: { View },
    FadeIn: animation,
    Easing: { cubic: 'cubic', out: () => 'out', in: () => 'in', inOut: () => 'inOut', bezier: () => 'bezier' },
    useSharedValue: (value: number) => ({ value }),
    useAnimatedStyle: () => ({}),
    withTiming: (value: number) => value,
    withDelay: (_ms: number, value: number) => value,
    withRepeat: (value: number) => value,
    interpolate: () => 0,
    interpolateColor: () => '#000',
    cancelAnimation: jest.fn(),
  };
});

jest.mock('expo-blur', () => ({ BlurView: require('react-native').View }));

jest.mock('@/lib/theme', () => ({
  useTheme: () => ({
    isDark: true,
    colors: {
      accent: '#c8a55c',
      backgroundElevated: '#181614',
      text: '#f5f0e8',
      textMuted: '#b9ad9e',
      textSubtle: '#8a7d70',
      border: '#2a2622',
    },
  }),
}));

jest.mock('@/hooks/useAccessibility', () => ({
  useAccessibleAnimation: () => ({
    entering: (animation: unknown) => animation,
    reducedMotion: true,
  }),
}));

jest.mock('@/components/ui', () => ({
  alpha: (color: string, opacity: number) => `${color}:${opacity}`,
}));

jest.mock('@/lib/store', () => ({
  useUnfoldStore: (selector: (state: { user: null }) => unknown) => selector({ user: null }),
}));

jest.mock('@/lib/api-config', () => ({
  PRIMARY_BACKEND_URL: 'https://example.test',
  getAuthHeaders: jest.fn(async () => ({})),
}));

jest.mock('@/lib/qa-tools', () => ({ isQaToolsEnabled: () => false }));

jest.mock('expo-router', () => ({
  useFocusEffect: () => undefined,
  useIsFocused: () => true,
  useLocalSearchParams: () => ({}),
  useRouter: () => ({ push: jest.fn(), navigate: jest.fn(), replace: jest.fn() }),
}), { virtual: false });

jest.mock('@tanstack/react-query', () => ({
  useQuery: () => ({ data: null }),
}));

jest.mock('@/hooks/useCreationGate', () => ({
  useCreationGate: () => ({
    gate: () => true,
    showExclusiveOffer: false,
    dismissOffer: jest.fn(),
    handleOfferVerifiedExit: jest.fn(),
  }),
}));

jest.mock('@/hooks/usePremiumNudge', () => ({
  usePremiumNudge: () => ({ nudge: null, onAction: jest.fn(), onDismiss: jest.fn() }),
}));

jest.mock('@/hooks/usePremiumAccessPolicy', () => ({
  usePremiumAccessPolicy: () => 'granted',
}));

jest.mock('@/components/home/AmbientArtCanvas', () => ({ AmbientArtCanvas: () => null }));
jest.mock('@/components/home/TodayCardStack', () => ({ TodayCardStack: () => null }));
jest.mock('@/components/home/GreetingRow', () => ({ GreetingRow: () => null }));
jest.mock('@/components/home/BentoGrid', () => ({ BentoGrid: () => null }));
jest.mock('@/components/home/SeriesCarousel', () => ({ SeriesCarousel: () => null }));
jest.mock('@/components/home/CompactStreakRow', () => ({ CompactStreakRow: () => null }));
jest.mock('@/components/StreakBox', () => ({ StreakBox: () => null }));
jest.mock('@/components/HomeOnboardingTooltips', () => ({ HomeOnboardingTooltips: () => null }));
jest.mock('@/components/RippleLoader', () => ({ RippleLoader: () => null }));
jest.mock('@/components/StreakCelebration', () => ({ StreakCelebration: () => null }));
jest.mock('@/components/CheckInSheet', () => ({ CheckInSheet: () => null }));
jest.mock('@/components/voice-check-in/VoiceCheckInSheet', () => ({ VoiceCheckInSheet: () => null }));
jest.mock('@/components/PremiumFeatureSheet', () => ({ PremiumFeatureSheet: () => null }));
jest.mock('@/components/ExclusiveOfferSheet', () => ({ ExclusiveOfferSheet: () => null }));
jest.mock('@/components/PremiumNudgeCard', () => ({ getPremiumNudgeCardTone: () => 'calm' }));

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

import { computeDevotionalState, type ComputeInput } from '@/components/home/compute-devotional-state';
import { DevotionalCard } from '@/components/home/DevotionalCard';
import { AutoTrialNotifyCard } from '@/components/onboarding/AutoTrialNotifyCard';
import { canonicalGeneratedDayId } from '@/lib/devotional-canonical-days';
import { shouldShowTodayAutoTrialNotify } from '@/app/(tabs)/(today)/index';
import {
  buildPlannedSeriesPath,
  buildSeriesPath,
} from '@/lib/series-path';
import type { AutoTrialIntentV1 } from '@/lib/auto-trial-intent';
import type { Devotional, DevotionalDay, NextPick } from '@/lib/store';

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

const ID = 'auto-1';
const monday = new Date(2026, 5, 8, 18, 0, 0);
const tuesday = new Date(2026, 5, 9, 10, 0, 0);

function day(n: number, over: Partial<DevotionalDay> = {}): DevotionalDay {
  return {
    id: canonicalGeneratedDayId(ID, n),
    devotionalId: ID,
    dayNumber: n,
    title: `Day ${n} title`,
    scriptureReference: 'John 1:1',
    scriptureText: 'In the beginning',
    bodyText: 'Body',
    quotableLine: 'Quote',
    isRead: false,
    ...over,
  };
}

function autoSeries(over: Partial<Devotional> = {}): Devotional {
  const createdAt = new Date(2026, 5, 8, 12, 0, 0).toISOString();
  return {
    id: ID,
    title: 'Trial Series',
    totalDays: 3,
    currentDay: 1,
    days: [],
    createdAt,
    userContext: { name: '', aboutMe: '', currentSituation: '', emotionalState: '' },
    generationMode: 'progressive',
    seriesStartDate: createdAt,
    seriesArc: {
      totalDaysPlanned: 3,
      overarchingTheme: 'theme',
      narrativeShape: 'shape',
      dayHints: [
        { dayNumber: 1, themeHint: 'a', scriptureRegion: 'gospels', narrativeRole: 'foundation', dayTitle: 'Begin' },
        { dayNumber: 2, themeHint: 'b', scriptureRegion: 'gospels', narrativeRole: 'deepening', dayTitle: 'Continue' },
        { dayNumber: 3, themeHint: 'c', scriptureRegion: 'gospels', narrativeRole: 'resolution', dayTitle: 'Close' },
      ],
      isOpenEnded: false,
      createdAt,
      seriesKind: 'auto_trial',
    },
    ...over,
  };
}

const nextPick: NextPick = {
  theme: 'trust',
  themeName: 'Learning to Trust',
  type: 'theme',
  suggestedLength: 7,
  line: 'A quieter study on trust.',
};

const noop = () => {};

function input(over: Partial<ComputeInput> = {}): ComputeInput {
  const currentDevotional = over.currentDevotional ?? autoSeries({ days: [day(1)] });
  return {
    currentDevotional,
    currentDayData: currentDevotional.days[0] ?? null,
    hasReadToday: false,
    dayLabel: 'Today',
    isJourneyComplete: false,
    isPreparing: false,
    premiumPolicy: 'granted',
    daysCompleted: 0,
    totalDays: 3,
    progress: 0,
    tomorrowTeaser: null,
    onContinue: noop,
    onReflect: noop,
    onCreateNew: noop,
    onOpenBible: noop,
    onRenewPremium: noop,
    onReveal: noop,
    ctaText: 'Begin Your Journey',
    reflectionStatus: 'empty',
    ...over,
  };
}

function states(nodes: { state: string }[]) {
  return nodes.map((node) => node.state);
}

describe('J14 Today auto-trial card', () => {
  it('renders the S4 3-day fixture rows with the expected type and nodes', () => {
    const planned = buildPlannedSeriesPath(3);
    expect(states(planned)).toEqual(['preparing', 'locked', 'locked']);
    expect(computeDevotionalState(input({
      currentDevotional: null,
      currentDayData: null,
      preparingInflightSeries: { seriesTitle: 'Trial Series' },
      autoTrial: {
        path: planned,
        daysRead: 0,
        keepsakeAvailable: false,
        onOpenKeepsake: noop,
        nextPick: null,
      },
    })).type).toBe('preparing');

    expect(computeDevotionalState(input({
      currentDevotional: null,
      currentDayData: null,
      inflightSeriesFailed: { message: 'failed', onTryAgain: noop, onDismiss: noop },
    })).type).toBe('first-series-failed');

    const day1 = autoSeries({ days: [day(1)], currentDay: 1 });
    const day1Path = buildSeriesPath(day1, monday, { isCurrentSeries: true });
    expect(states(day1Path)).toEqual(['today', 'locked', 'locked']);
    expect(computeDevotionalState(input({
      currentDevotional: day1,
      currentDayData: day1.days[0],
      autoTrial: {
        path: day1Path,
        daysRead: 0,
        keepsakeAvailable: false,
        onOpenKeepsake: noop,
        nextPick: null,
      },
    })).type).toBe('unread');

    const day1Read = autoSeries({
      currentDay: 2,
      days: [day(1, { isRead: true, readAt: monday.toISOString() })],
    });
    const eveningPath = buildSeriesPath(day1Read, monday, { isCurrentSeries: true });
    expect(states(eveningPath)).toEqual(['read', 'tomorrow', 'locked']);
    expect(eveningPath[1]?.contentReady).toBe(false);
    const eveningState = computeDevotionalState(input({
      currentDevotional: day1Read,
      currentDayData: day1Read.days[0],
      hasReadToday: true,
      dayLabel: 'Today',
      daysCompleted: 1,
      autoTrial: {
        path: eveningPath,
        daysRead: 1,
        keepsakeAvailable: true,
        onOpenKeepsake: noop,
        nextPick: null,
      },
    }));
    expect(eveningState.type).toBe('complete-today');

    const day2Locked = autoSeries({
      currentDay: 2,
      days: [
        day(1, { isRead: true, readAt: monday.toISOString() }),
        day(2, { isRevealed: true }),
      ],
    });
    const lockedPath = buildSeriesPath(day2Locked, monday, { isCurrentSeries: true });
    expect(states(lockedPath)).toEqual(['read', 'tomorrow', 'locked']);
    expect(lockedPath[1]?.contentReady).toBe(true);
    expect(computeDevotionalState(input({
      currentDevotional: day2Locked,
      currentDayData: day2Locked.days[1],
      hasReadToday: true,
      dayLabel: 'Tomorrow',
      daysCompleted: 1,
      autoTrial: {
        path: lockedPath,
        daysRead: 1,
        keepsakeAvailable: true,
        onOpenKeepsake: noop,
        nextPick: null,
      },
    })).type).toBe('tomorrow-locked');

    const day2Missing = autoSeries({
      currentDay: 2,
      days: [day(1, { isRead: true, readAt: monday.toISOString() })],
    });
    const recoveryPath = buildSeriesPath(day2Missing, tuesday, { isCurrentSeries: true });
    expect(states(recoveryPath)).toEqual(['read', 'preparing', 'locked']);
    expect(computeDevotionalState(input({
      currentDevotional: day2Missing,
      currentDayData: null,
      isPreparing: true,
      daysCompleted: 1,
      autoTrial: {
        path: recoveryPath,
        daysRead: 1,
        keepsakeAvailable: true,
        onOpenKeepsake: noop,
        nextPick: null,
      },
    })).type).toBe('preparing');

    const day2Sealed = autoSeries({
      currentDay: 2,
      days: [
        day(1, { isRead: true, readAt: monday.toISOString() }),
        day(2, { isRevealed: false }),
      ],
    });
    const revealPath = buildSeriesPath(day2Sealed, tuesday, { isCurrentSeries: true });
    expect(states(revealPath)).toEqual(['read', 'today', 'locked']);
    expect(computeDevotionalState(input({
      currentDevotional: day2Sealed,
      currentDayData: day2Sealed.days[1],
      daysCompleted: 1,
      autoTrial: {
        path: revealPath,
        daysRead: 1,
        keepsakeAvailable: true,
        onOpenKeepsake: noop,
        nextPick: null,
      },
    })).type).toBe('reveal-ready');

    const day2Open = autoSeries({
      currentDay: 2,
      days: [
        day(1, { isRead: true, readAt: monday.toISOString() }),
        day(2, { isRevealed: true }),
      ],
    });
    const openPath = buildSeriesPath(day2Open, tuesday, { isCurrentSeries: true });
    expect(states(openPath)).toEqual(['read', 'today', 'locked']);
    expect(computeDevotionalState(input({
      currentDevotional: day2Open,
      currentDayData: day2Open.days[1],
      daysCompleted: 1,
      autoTrial: {
        path: openPath,
        daysRead: 1,
        keepsakeAvailable: true,
        onOpenKeepsake: noop,
        nextPick: null,
      },
    })).type).toBe('unread');

    const complete = autoSeries({
      currentDay: 3,
      days: [
        day(1, { isRead: true }),
        day(2, { isRead: true }),
        day(3, { isRead: true, nextPick }),
      ],
    });
    const completePath = buildSeriesPath(complete, tuesday, { isCurrentSeries: true });
    expect(states(completePath)).toEqual(['read', 'read', 'read']);
    expect(computeDevotionalState(input({
      currentDevotional: complete,
      currentDayData: null,
      isJourneyComplete: true,
      premiumPolicy: 'denied',
      daysCompleted: 3,
      autoTrial: {
        path: completePath,
        daysRead: 3,
        keepsakeAvailable: true,
        onOpenKeepsake: noop,
        nextPick,
      },
    })).type).toBe('trial-journey-complete');

    const lapsed = autoSeries({
      currentDay: 3,
      days: [day(1, { isRead: true }), day(2, { isRead: true })],
    });
    const lapsedPath = buildSeriesPath(lapsed, tuesday, { isCurrentSeries: true });
    expect(computeDevotionalState(input({
      currentDevotional: lapsed,
      currentDayData: null,
      premiumPolicy: 'denied',
      daysCompleted: 2,
      autoTrial: {
        path: lapsedPath,
        daysRead: 2,
        keepsakeAvailable: true,
        onOpenKeepsake: noop,
        nextPick: null,
      },
    })).type).toBe('trial-paused');

    // OI-36: reading access after a lapse is UNVERIFIED. Card type only.
    const wednesday = new Date(2026, 5, 10, 10, 0, 0);
    const lapsedUnread = autoSeries({
      currentDay: 3,
      days: [
        day(1, { isRead: true }),
        day(2, { isRead: true }),
        day(3, { isRevealed: true }),
      ],
    });
    const lapsedUnreadPath = buildSeriesPath(lapsedUnread, wednesday, { isCurrentSeries: true });
    expect(states(lapsedUnreadPath)).toEqual(['read', 'read', 'today']);
    expect(computeDevotionalState(input({
      currentDevotional: lapsedUnread,
      currentDayData: lapsedUnread.days[2],
      premiumPolicy: 'denied',
      daysCompleted: 2,
      autoTrial: {
        path: lapsedUnreadPath,
        daysRead: 2,
        keepsakeAvailable: true,
        onOpenKeepsake: noop,
        nextPick: null,
      },
    })).type).toBe('unread');
  });

  it('shows the keepsake entry on both trial states', async () => {
    const onOpenKeepsake = jest.fn();
    const completeState = computeDevotionalState(input({
      currentDayData: null,
      isJourneyComplete: true,
      premiumPolicy: 'denied',
      daysCompleted: 3,
      autoTrial: {
        path: buildPlannedSeriesPath(3),
        daysRead: 3,
        keepsakeAvailable: true,
        onOpenKeepsake,
        nextPick,
      },
    }));
    const pausedState = computeDevotionalState(input({
      currentDayData: null,
      premiumPolicy: 'denied',
      daysCompleted: 2,
      autoTrial: {
        path: buildPlannedSeriesPath(3),
        daysRead: 2,
        keepsakeAvailable: true,
        onOpenKeepsake,
        nextPick: null,
      },
    }));

    let completeTree!: ReturnType<typeof renderer.create>;
    let pausedTree!: ReturnType<typeof renderer.create>;
    await act(async () => {
      completeTree = renderer.create(<DevotionalCard state={completeState} />);
      pausedTree = renderer.create(<DevotionalCard state={pausedState} />);
    });

    const completeKeep = completeTree.root.findByProps({ accessibilityLabel: 'Open keepsake' });
    const pausedKeep = pausedTree.root.findByProps({ accessibilityLabel: 'Open keepsake' });
    act(() => completeKeep.props.onPress());
    act(() => pausedKeep.props.onPress());
    expect(onOpenKeepsake).toHaveBeenCalledTimes(2);
  });

  it('renders the S4 notify card for an undetermined auto intent and hides it when granted', async () => {
    const liveIntent = { status: 'revealed' } as AutoTrialIntentV1;
    expect(shouldShowTodayAutoTrialNotify({
      autoTrialActive: true,
      intent: liveIntent,
      permission: 'undetermined',
    })).toBe(true);
    expect(shouldShowTodayAutoTrialNotify({
      autoTrialActive: true,
      intent: liveIntent,
      permission: 'granted',
    })).toBe(false);
    expect(shouldShowTodayAutoTrialNotify({
      autoTrialActive: true,
      intent: { status: 'completed' } as AutoTrialIntentV1,
      permission: 'undetermined',
    })).toBe(false);

    let shown!: ReturnType<typeof renderer.create>;
    let hidden!: ReturnType<typeof renderer.create>;
    await act(async () => {
      shown = renderer.create(
        <AutoTrialNotifyCard
          permission="undetermined"
          phase="idle"
          onAsk={jest.fn()}
          onOpenSettings={jest.fn()}
        />,
      );
      hidden = renderer.create(
        <AutoTrialNotifyCard
          permission="granted"
          phase="idle"
          onAsk={jest.fn()}
          onOpenSettings={jest.fn()}
        />,
      );
    });
    const notifyHosts = shown.root
      .findAllByProps({ accessibilityLabel: 'Notify me' })
      .filter((node: { type: unknown }) => typeof node.type === 'string');
    expect(notifyHosts).toHaveLength(1);
    expect(hidden.toJSON()).toBeNull();
  });

  it('leaves the Today demoMode QA prop unchanged', () => {
    expect(todaySource).toContain("demoMode={isQaToolsEnabled() && routeParams.voiceCheckInDemo === '1'}");
  });
});
