/* eslint-disable import/first */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn() }),
  useLocalSearchParams: () => ({}),
  useFocusEffect: () => undefined,
  useIsFocused: () => true,
}));

jest.mock('react-native-gesture-handler', () => {
  const { View } = require('react-native');
  return {
    Gesture: { Pan: () => ({ onUpdate: () => ({ onEnd: () => ({}) }) }) },
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
  ImpactFeedbackStyle: { Light: 'light', Medium: 'medium' },
  NotificationFeedbackType: { Success: 'success' },
}));

jest.mock('expo-linear-gradient', () => ({ LinearGradient: require('react-native').View }));
jest.mock('expo-blur', () => ({ BlurView: require('react-native').View }));
jest.mock('@react-native-community/netinfo', () => ({
  addEventListener: jest.fn(() => jest.fn()),
  fetch: jest.fn(async () => ({ isConnected: true })),
}));

jest.mock('@/components/icons', () => new Proxy({}, { get: () => () => null }));
jest.mock('@/components/UndoToast', () => ({ UndoToast: () => null }));
jest.mock('@/components/CompletionCelebration', () => ({ CompletionCelebration: () => null }));
jest.mock('@/components/reading/DevotionalContent', () => ({ DevotionalContent: () => null }));
jest.mock('@/components/reading/StudyMethodSheet', () => ({ StudyMethodSheet: () => null }));
jest.mock('@/components/reading/ReaderOutlineSheet', () => ({ ReaderOutlineSheet: () => null }));
jest.mock('@/components/ScriptureTapSheet', () => ({ ScriptureTapSheet: () => null }));
jest.mock('@/components/reading/DevotionalReaderPreferencesSheet', () => ({
  DevotionalReaderPreferencesSheet: () => null,
}));
jest.mock('@/components/PremiumFeatureSheet', () => ({ PremiumFeatureSheet: () => null }));
jest.mock('@/components/PremiumNudgeCard', () => ({ PremiumNudgeCard: () => null }));
jest.mock('@/hooks/useGlobalAudioPlayer', () => ({ useGlobalAudioPlayer: () => ({}) }));
jest.mock('@/hooks/useGeneratedDayWatch', () => ({ useGeneratedDayWatch: () => undefined }));
jest.mock('@/hooks/useAutoHide', () => ({ useAutoHide: () => undefined }));
jest.mock('@/lib/store', () => ({
  FONT_SIZE_VALUES: { small: 16, medium: 18, large: 20 },
  useUnfoldStore: (selector: (state: Record<string, unknown>) => unknown) => selector({
    user: { fontSize: 'medium' },
    currentDevotionalId: null,
    setCurrentDevotional: jest.fn(),
    markDayAsRead: jest.fn(),
    setActOutcome: jest.fn(),
    advanceDay: jest.fn(),
    updateDevotionalDays: jest.fn(),
    setResumeContext: jest.fn(),
    clearResumeContext: jest.fn(),
    addBookmark: jest.fn(),
    removeBookmark: jest.fn(),
    reconcileDayHighlights: jest.fn(),
    devotionals: [],
    getState: () => ({}),
  }),
}));

jest.mock('react-native-reanimated', () => {
  const { View } = require('react-native');
  const chain: Record<string, unknown> = {};
  chain.duration = () => chain;
  chain.delay = () => chain;
  chain.easing = () => chain;
  return {
    __esModule: true,
    default: { View, ScrollView: View },
    FadeIn: chain,
    FadeOut: chain,
    SlideInDown: chain,
    SlideOutDown: chain,
    Easing: { cubic: 'cubic', out: () => 'out', in: () => 'in', inOut: () => 'inOut', bezier: () => 'bezier' },
    useSharedValue: (value: number) => ({ value }),
    useAnimatedStyle: () => ({}),
    useAnimatedScrollHandler: () => ({}),
    withTiming: (value: number) => value,
    withRepeat: (value: number) => value,
    withSequence: (...values: number[]) => values[0],
    withSpring: (value: number) => value,
    runOnJS: (fn: (...args: unknown[]) => void) => fn,
    useReducedMotion: () => true,
  };
});

jest.mock('@/lib/theme', () => ({
  useTheme: () => ({ colors: { text: '#fff', accent: '#c8a55c', textMuted: '#aaa', background: '#000' } }),
}));

jest.mock('@/hooks/usePremiumNudge', () => ({
  usePremiumNudge: () => ({ nudge: null, onAction: jest.fn(), onDismiss: jest.fn() }),
}));

jest.mock('@/hooks/usePremiumAccessPolicy', () => ({
  usePremiumAccessPolicy: () => 'granted',
}));

import { maybeCompleteAutoTrialOnLastDay } from '@/app/(tabs)/(today)/reading';
import {
  readAutoTrialIntent,
  transitionAutoTrialIntent,
  type AutoTrialIntentV1,
} from '@/lib/auto-trial-intent';
import { trackAutoTrialCompleted } from '@/lib/auto-trial-telemetry';
import { evaluateNudges, NUDGE_INITIAL_STATE } from '@/lib/nudges';

const mockGetPermissionsAsync = jest.fn(async (..._args: unknown[]) => ({ status: 'granted' }));
jest.mock('expo-notifications', () => ({
  getPermissionsAsync: (...args: unknown[]) => mockGetPermissionsAsync(...args),
  requestPermissionsAsync: jest.fn(async () => ({ status: 'granted' })),
  scheduleNotificationAsync: jest.fn(async () => 'id'),
  cancelScheduledNotificationAsync: jest.fn(async () => undefined),
  getAllScheduledNotificationsAsync: jest.fn(async () => []),
  setNotificationHandler: jest.fn(),
}));


jest.mock('@/lib/auto-trial-intent', () => {
  const actual = jest.requireActual('@/lib/auto-trial-intent') as typeof import('@/lib/auto-trial-intent');
  return {
    ...actual,
    readAutoTrialIntent: jest.fn(),
    transitionAutoTrialIntent: jest.fn(),
  };
});

jest.mock('@/lib/auto-trial-telemetry', () => ({
  trackAutoTrialCompleted: jest.fn(),
}));


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

jest.mock('expo-file-system', () => ({ File: jest.fn(), Paths: { cache: '' }, Directory: jest.fn() }));

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



const readingSource = readFileSync(
  join(__dirname, '../../app/(tabs)/(today)/reading.tsx'),
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
    status: 'revealed',
    jobId: 'job-1',
    devotionalId: 'auto-1',
    createdAt: '2026-09-08T17:00:00.000Z',
    updatedAt: '2026-09-08T17:00:00.000Z',
    submittedAt: '2026-09-08T17:01:00.000Z',
    landedAt: '2026-09-08T17:02:00.000Z',
    revealedAt: '2026-09-08T17:03:00.000Z',
    completedAt: null,
    dismissedAt: null,
    failedAt: null,
    failureCode: null,
    abandonedAt: null,
    abandonReason: null,
    ...overrides,
  };
}

describe('SG-10 reading auto trial', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('transitions the matching intent to completed on the last day', () => {
    (readAutoTrialIntent as jest.Mock).mockReturnValue(intent({ status: 'revealed' }));
    (transitionAutoTrialIntent as jest.Mock).mockReturnValue(intent({ status: 'completed' }));
    maybeCompleteAutoTrialOnLastDay({
      completingLastDay: true,
      devotionalId: 'auto-1',
      nowMs: Date.parse('2026-09-10T17:00:00.000Z'),
    });
    expect(transitionAutoTrialIntent).toHaveBeenCalledWith(
      'completed',
      {},
      { nowMs: Date.parse('2026-09-10T17:00:00.000Z') },
    );
    expect(trackAutoTrialCompleted).toHaveBeenCalledWith({
      entry: 'onboarding',
      trial_days: 3,
    });
  });

  it('does not complete when the day is not last or the id does not match', () => {
    (readAutoTrialIntent as jest.Mock).mockReturnValue(intent({ status: 'revealed' }));
    maybeCompleteAutoTrialOnLastDay({
      completingLastDay: false,
      devotionalId: 'auto-1',
      nowMs: 1,
    });
    (readAutoTrialIntent as jest.Mock).mockReturnValue(intent({
      status: 'revealed',
      devotionalId: 'other',
    }));
    maybeCompleteAutoTrialOnLastDay({
      completingLastDay: true,
      devotionalId: 'auto-1',
      nowMs: 1,
    });
    expect(transitionAutoTrialIntent).not.toHaveBeenCalled();
  });

  it('uses the boundary header total and no Day 2 chip', () => {
    expect(readingSource).toContain('const totalDays = currentDevotional ? getServerOwnedSeriesTotalDays(currentDevotional) || 1 : 1;');
    expect(readingSource).toContain('Day {viewingDay} of {totalDays}');
    expect(readingSource).not.toContain('Day {viewingDay} of {currentDevotional.totalDays}');
    expect(readingSource).toContain('accessibilityLabel={`Day ${viewingDay} of ${totalDays}`}');
    expect(readingSource).not.toContain('<ShapedByCheckInChip');
    expect(readingSource).toContain('maybeCompleteAutoTrialOnLastDay');
  });

  it('dismisses a completed auto series through the series-complete route', () => {
    expect(readingSource).toContain('getCompletionDismissRoute(celebrationType, { autoTrialDevotionalId })');
  });

  it('keeps the premium nudge free of price on the keepsake path (OI-37)', () => {
    const nudge = evaluateNudges({
      screen: 'home',
      isPremium: false,
      streakCurrent: 3,
      streakJustReset: false,
      totalReadingsCompleted: 12,
      hasUsedAudio: true,
      seriesJustCompleted: 'Trial Series',
    }, NUDGE_INITIAL_STATE);
    expect(nudge?.type).toBe('journey_completion');
    expect(nudge?.message).not.toMatch(/\$|price|charge/i);
    expect(readingSource).toContain("usePremiumNudge({ screen: 'reading' })");
  });
});
