/* eslint-disable import/first */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), navigate: jest.fn() }),
  useFocusEffect: () => undefined,
  useIsFocused: () => true,
  useLocalSearchParams: () => ({}),
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
jest.mock('@/components/CheckInSheet', () => ({ CheckInSheet: () => null }));
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

jest.mock('@/lib/store', () => ({
  useUnfoldStore: (selector: (state: Record<string, unknown>) => unknown) => selector({
    user: { hasCompletedOnboarding: true },
    devotionals: [],
    currentDevotionalId: null,
    setCurrentDevotional: jest.fn(),
    resumeContext: null,
    clearResumeContext: jest.fn(),
    updateUser: jest.fn(),
    updateDevotionalDays: jest.fn(),
    streakCurrent: 0,
    streakLastReadDate: null,
    addCheckIn: jest.fn(),
    markMiddayCheckInCompleted: jest.fn(),
    getCheckIn: jest.fn(),
    hasSeenDay1Review: false,
    setHasSeenDay1Review: jest.fn(),
    hasSeenHomeTooltips: true,
    addGeneratedDay: jest.fn(),
    archiveCurrentDevotional: jest.fn(),
    markDayAsRevealed: jest.fn(),
    isReturningUser: () => false,
    dismissedMiddayCardDate: null,
    dismissedEveningCardDate: null,
    dismissedBridgeCardDate: null,
    generationSession: { status: 'idle', devotionalId: null, title: null, error: null },
    clearGenerationSession: jest.fn(),
  }),
}));

import {
  applyTodayAutoTrialFocus,
  abandonPurchasedIntentBeforeNewSeries,
} from '@/app/(tabs)/(today)/index';
import {
  buildRevealGuardKey,
  reconcileAutoTrialIntentOnLaunch,
  transitionAutoTrialIntent,
  type AutoTrialIntentV1,
} from '@/lib/auto-trial-intent';
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
    });
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
    expect(retry).toContain("router.replace('/generating')");
    expect(retry).not.toContain("pathname: '/series-reveal'");
    expect(retry).not.toContain('submitGenerationJob');
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
});
