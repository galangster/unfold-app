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
import { canonicalGeneratedDayId } from '@/lib/devotional-canonical-days';
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

describe('J14 Today auto-trial card', () => {
  it('renders the S4 3-day fixture rows with the expected type', () => {
    expect(computeDevotionalState(input({
      currentDevotional: null,
      currentDayData: null,
      preparingInflightSeries: { seriesTitle: 'Trial Series' },
      autoTrialActive: true,
    })).type).toBe('preparing');

    expect(computeDevotionalState(input({
      currentDevotional: null,
      currentDayData: null,
      inflightSeriesFailed: { message: 'failed', onTryAgain: noop, onDismiss: noop },
    })).type).toBe('first-series-failed');

    const day1 = autoSeries({ days: [day(1)], currentDay: 1 });
    expect(computeDevotionalState(input({
      currentDevotional: day1,
      currentDayData: day1.days[0],
      autoTrialActive: true,
    })).type).toBe('unread');

    const day1Read = autoSeries({
      currentDay: 2,
      days: [day(1, { isRead: true, readAt: monday.toISOString() })],
    });
    expect(computeDevotionalState(input({
      currentDevotional: day1Read,
      currentDayData: day1Read.days[0],
      hasReadToday: true,
      dayLabel: 'Today',
      daysCompleted: 1,
      autoTrialActive: true,
    })).type).toBe('complete-today');

    const day2Locked = autoSeries({
      currentDay: 2,
      days: [
        day(1, { isRead: true, readAt: monday.toISOString() }),
        day(2, { isRevealed: true }),
      ],
    });
    expect(computeDevotionalState(input({
      currentDevotional: day2Locked,
      currentDayData: day2Locked.days[1],
      hasReadToday: true,
      dayLabel: 'Tomorrow',
      daysCompleted: 1,
      autoTrialActive: true,
    })).type).toBe('tomorrow-locked');

    const day2Missing = autoSeries({
      currentDay: 2,
      days: [day(1, { isRead: true, readAt: monday.toISOString() })],
    });
    expect(computeDevotionalState(input({
      currentDevotional: day2Missing,
      currentDayData: null,
      isPreparing: true,
      daysCompleted: 1,
      autoTrialActive: true,
    })).type).toBe('preparing');

    const day2Sealed = autoSeries({
      currentDay: 2,
      days: [
        day(1, { isRead: true, readAt: monday.toISOString() }),
        day(2, { isRevealed: false }),
      ],
    });
    expect(computeDevotionalState(input({
      currentDevotional: day2Sealed,
      currentDayData: day2Sealed.days[1],
      daysCompleted: 1,
      autoTrialActive: true,
    })).type).toBe('reveal-ready');

    const day2Open = autoSeries({
      currentDay: 2,
      days: [
        day(1, { isRead: true, readAt: monday.toISOString() }),
        day(2, { isRevealed: true }),
      ],
    });
    expect(computeDevotionalState(input({
      currentDevotional: day2Open,
      currentDayData: day2Open.days[1],
      daysCompleted: 1,
      autoTrialActive: true,
    })).type).toBe('unread');

    const complete = autoSeries({
      currentDay: 3,
      days: [
        day(1, { isRead: true }),
        day(2, { isRead: true }),
        day(3, { isRead: true, nextPick }),
      ],
    });
    expect(computeDevotionalState(input({
      currentDevotional: complete,
      currentDayData: null,
      isJourneyComplete: true,
      premiumPolicy: 'denied',
      daysCompleted: 3,
      autoTrialActive: true,
    })).type).toBe('journey-complete');

    const lapsed = autoSeries({
      currentDay: 3,
      days: [day(1, { isRead: true }), day(2, { isRead: true })],
    });
    expect(computeDevotionalState(input({
      currentDevotional: lapsed,
      currentDayData: null,
      premiumPolicy: 'denied',
      daysCompleted: 2,
      autoTrialActive: true,
    })).type).toBe('premium-paused');

    const lapsedUnread = autoSeries({
      currentDay: 3,
      days: [
        day(1, { isRead: true }),
        day(2, { isRead: true }),
        day(3, { isRevealed: true }),
      ],
    });
    expect(computeDevotionalState(input({
      currentDevotional: lapsedUnread,
      currentDayData: lapsedUnread.days[2],
      premiumPolicy: 'denied',
      daysCompleted: 2,
      autoTrialActive: true,
    })).type).toBe('unread');
  });

  it('uses journey-complete and premium-paused without keepsake chrome', async () => {
    const completeState = computeDevotionalState(input({
      currentDayData: null,
      isJourneyComplete: true,
      premiumPolicy: 'denied',
      daysCompleted: 3,
      autoTrialActive: true,
    }));
    const pausedState = computeDevotionalState(input({
      currentDayData: null,
      premiumPolicy: 'denied',
      daysCompleted: 2,
      autoTrialActive: true,
    }));
    expect(completeState.type).toBe('journey-complete');
    expect(pausedState.type).toBe('premium-paused');

    let completeTree!: ReturnType<typeof renderer.create>;
    let pausedTree!: ReturnType<typeof renderer.create>;
    await act(async () => {
      completeTree = renderer.create(<DevotionalCard state={completeState} />);
      pausedTree = renderer.create(<DevotionalCard state={pausedState} />);
    });

    expect(completeTree.root.findAllByProps({ accessibilityLabel: 'Open keepsake' })).toHaveLength(0);
    expect(pausedTree.root.findAllByProps({ accessibilityLabel: 'Open keepsake' })).toHaveLength(0);
  });

  it('does not mount a Today notify card', () => {
    expect(todaySource).not.toContain('AutoTrialNotifyCard');
    expect(todaySource).not.toContain('notify={showAutoTrialNotify');
  });

  it('leaves the Today demoMode QA prop unchanged', () => {
    expect(todaySource).toContain("demoMode={isQaToolsEnabled() && routeParams.voiceCheckInDemo === '1'}");
  });
});
