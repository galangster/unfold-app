import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AUTO_TRIAL_INTENT_KEY } from '@/lib/auto-trial-intent';
import { STORE_KEY, saveOnboardingDraft } from '@/lib/onboarding-draft-store';
import { resetNotificationAskBaseline } from '@/lib/notification-ask';

const renderer = require('react-test-renderer');
const { act } = renderer;

const mockReplace = jest.fn();
const mockGetPermissionsAsync = jest.fn();
const mockRequestPermissionsAsync = jest.fn();
const mockRegisterPushToken = jest.fn();
const mockMmkvStore = new Map<string, string>();

let mockOnboardingSearchParams: Record<string, string> = {};

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
    FadeOut: chainable(),
    Easing: { out: () => 0, in: () => 0, inOut: () => 0, linear: 0, cubic: 0, quad: 0 },
    useReducedMotion: () => true,
    useSharedValue: (initial: unknown) => ({ value: initial }),
    useAnimatedStyle: () => ({}),
    withTiming: (v: unknown) => v,
    withRepeat: (v: unknown) => v,
    withSequence: (v: unknown) => v,
    withDelay: (_d: unknown, v: unknown) => v,
  };
});
jest.mock('react-native-gesture-handler', () => {
  const { View, TouchableOpacity } = require('react-native');
  return { Gesture: { Pan: () => ({}), Tap: () => ({}) }, GestureDetector: ({ children }: { children: unknown }) => children, TouchableOpacity, View };
});
jest.mock('react-native-safe-area-context', () => {
  const { View } = require('react-native');
  return { SafeAreaView: View, useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) };
});
jest.mock('react-native-keyboard-controller', () => {
  const { ScrollView } = require('react-native');
  return { KeyboardAwareScrollView: ScrollView };
});
jest.mock('@react-native-community/datetimepicker', () => ({ __esModule: true, default: 'DateTimePicker' }));
jest.mock('expo-router', () => ({
  useRouter: () => ({ replace: (...args: unknown[]) => mockReplace(...args), back: jest.fn(), push: jest.fn() }),
  useLocalSearchParams: () => mockOnboardingSearchParams,
}));
jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(),
  notificationAsync: jest.fn(),
  ImpactFeedbackStyle: { Light: 'light', Medium: 'medium' },
  NotificationFeedbackType: { Success: 'success', Warning: 'warning', Error: 'error' },
}));
jest.mock('expo-image', () => ({ Image: 'ExpoImage' }));
jest.mock('expo-linear-gradient', () => ({ LinearGradient: 'LinearGradient' }));
jest.mock('expo-notifications', () => ({
  getPermissionsAsync: (...args: unknown[]) => mockGetPermissionsAsync(...args),
  requestPermissionsAsync: (...args: unknown[]) => mockRequestPermissionsAsync(...args),
}));
jest.mock('@/lib/notifications', () => ({
  requestNotificationPermissions: async () => {
    const existing = await mockGetPermissionsAsync();
    if (existing.status === 'granted') return true;
    const next = await mockRequestPermissionsAsync();
    return next.status === 'granted';
  },
}));
jest.mock('@/lib/push-notifications', () => ({
  registerPushToken: (...args: unknown[]) => mockRegisterPushToken(...args),
}));
jest.mock('@/lib/trial-notification', () => ({ syncTrialEndingNotification: jest.fn() }));
jest.mock('@/lib/auto-trial-telemetry', () => ({ trackNotificationPermissionAnswered: jest.fn() }));
jest.mock('@/lib/ui-state', () => ({
  useUIState: Object.assign(
    (selector: (s: Record<string, unknown>) => unknown) => selector({}),
    {
      getState: () => ({
        bumpNotificationPermissionEpoch: jest.fn(),
        setLaterEntryNotifyAskPending: jest.fn(),
      }),
    },
  ),
}));
jest.mock('@/lib/theme', () => ({
  useTheme: () => ({ colors: { accent: '#C8A55C', text: '#F6EFE3', textMuted: '#B8AA96', background: '#111' }, isDark: true }),
}));
jest.mock('@/hooks/useOnboardingDarkColors', () => ({
  useOnboardingDarkColors: () => ({
    accent: '#C8A55C',
    background: '#111111',
    text: '#F6EFE3',
    textMuted: '#B8AA96',
    textSubtle: '#8D806D',
    textHint: '#6B5F4E',
    border: '#3A3328',
  }),
}));
const mockStoreState = {
  user: null,
  updateUser: jest.fn(),
  setUser: jest.fn(),
  setCompanionName: jest.fn(),
  addDevotional: jest.fn(),
  devotionals: [],
};
jest.mock('@/lib/store', () => ({
  useUnfoldStore: Object.assign(
    (selector: (s: typeof mockStoreState) => unknown) => selector(mockStoreState),
    { getState: () => mockStoreState },
  ),
  flushUnfoldStorePersistAsync: jest.fn(async () => undefined),
  ACCENT_THEMES: [{ id: 'gold', dark: '#C8A55C' }],
}));
jest.mock('@/lib/revenuecatClient', () => ({
  getOfferings: jest.fn(),
  purchasePackage: jest.fn(),
  isRevenueCatEnabled: () => false,
  isTrialEligibleForProduct: jest.fn(),
}));
jest.mock('@/lib/mmkv-storage', () => ({
  mmkvStorage: {
    getItem: (key: string) => mockMmkvStore.get(key) ?? null,
    setItem: (key: string, value: string) => { mockMmkvStore.set(key, value); },
    removeItem: (key: string) => { mockMmkvStore.delete(key); },
  },
  getDeviceId: () => 'device-1',
}));
jest.mock('@/lib/remote-config', () => ({
  refreshRemoteConfig: jest.fn(async () => undefined),
  awaitRemoteConfigSettled: jest.fn(async () => ({ status: 'ok' })),
  readAutoTrialSwitchSnapshot: () => ({ enabled: true, maxTrialDays: 7, fetchedAtMs: 1, reason: 'ok' }),
}));
jest.mock('@/lib/device-timezone', () => ({ getDeviceTimezone: () => 'America/Chicago' }));
jest.mock('@/lib/logger', () => ({ logger: { log: jest.fn(), warn: jest.fn(), error: jest.fn() } }));
jest.mock('@/lib/review-prompt', () => ({ requestReviewOncePerVersion: jest.fn() }));
jest.mock('@/lib/voice-feature', () => ({ isVoiceCheckInsEnabled: () => false }));
jest.mock('@/lib/sentry', () => ({ addAppBreadcrumb: jest.fn(), captureAppEvent: jest.fn() }));
jest.mock('@/lib/devotional-service', () => ({
  generateAdaptiveQuestion: jest.fn(),
  generateDiagnosticQuestions: jest.fn(),
  generateMirrorBackText: jest.fn(),
}));
jest.mock('@/lib/generation-api', () => ({ submitGenerationJob: jest.fn() }));
jest.mock('@/lib/generation-session', () => ({
  captureSyncSession: jest.fn(),
  isSyncSessionCurrent: () => true,
  SyncSessionInvalidatedError: class SyncSessionInvalidatedError extends Error {},
}));
jest.mock('@/components/TypewriterText', () => {
  const ReactActual = require('react');
  const { Text } = require('react-native');
  return {
    TypewriterText: ({ text, onComplete }: { text: string; onComplete?: () => void }) => {
      ReactActual.useEffect(() => {
        onComplete?.();
      }, [onComplete]);
      return ReactActual.createElement(Text, null, text);
    },
  };
});
jest.mock('@/components/onboarding/ThreeStepPaywall', () => ({ ThreeStepPaywall: () => null }));
jest.mock('@/components/EmberSystem', () => ({ EmberSystem: () => null }));
jest.mock('@/components/CompanionOrb', () => ({ CompanionOrb: () => null }));
jest.mock('@/components/VoiceInputBar', () => ({ VoiceInputBar: () => null }));
jest.mock('@/components/Current', () => ({ Current: () => null }));
jest.mock('@/components/ScatterTitle', () => ({ ScatterTitle: () => null }));
jest.mock('@/components/PremiumFeatureSheet', () => ({ PremiumFeatureSheet: () => null }));
jest.mock('@/components/icons', () => new Proxy({}, { get: () => () => null }));
jest.mock('@/components/ui', () => ({ alpha: (c: string) => c }));
jest.mock('@/components/onboarding/OnboardingVoiceAnswerSheet', () => ({ OnboardingVoiceAnswerSheet: () => null }));
jest.mock('@/components/onboarding/VoiceAnswerButton', () => ({ VoiceAnswerButton: () => null }));
jest.mock('@/components/onboarding/ShockStat', () => ({ ShockStat: () => null }));
jest.mock('@/components/onboarding/GrowthGraph', () => ({ GrowthGraph: () => null }));
jest.mock('@/components/onboarding/MultiSelectPills', () => ({ MultiSelectPills: () => null }));
jest.mock('@/components/onboarding/VulnerabilityValidation', () => ({ VulnerabilityValidation: () => null }));
jest.mock('@/components/onboarding/FeatureSummaryCarousel', () => ({ FeatureSummaryCarousel: () => null }));
jest.mock('@/components/onboarding/DevotionalSegue', () => ({ DevotionalSegue: () => null }));
jest.mock('@/components/onboarding/ReadDevotionalStep', () => ({ ReadDevotionalStep: () => null }));
jest.mock('@/components/onboarding/OnboardingCelebration', () => ({ OnboardingCelebration: () => null }));
jest.mock('@/components/onboarding/CommitmentStep', () => ({ CommitmentStep: () => null }));
jest.mock('@/components/onboarding/WelcomeBackStep', () => ({ WelcomeBackStep: () => null }));

import OnboardingScreen from '@/app/onboarding';
import { readAutoTrialIntent } from '@/lib/auto-trial-intent';

const INTENT_ID = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';

function purchasedIntent(overrides: Record<string, unknown> = {}) {
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
    expiresAt: '2026-12-01T17:00:00.000Z',
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

function seedDraft() {
  saveOnboardingDraft({
    deviceId: 'device-1',
    stepId: 'purchaseConfirmation',
    purchasedDuringOnboarding: true,
    data: {
      name: 'Ada',
      reminderTime: '8:00 AM',
    } as never,
  });
}

function findByLabel(tree: { root: { findAll: Function } }, label: string) {
  return tree.root.findAll(
    (node: { props?: { accessibilityLabel?: string; onPress?: unknown } }) =>
      node.props?.accessibilityLabel === label && typeof node.props?.onPress === 'function',
  );
}

function findText(tree: { root: { findAll: Function } }, text: string) {
  return tree.root.findAll((node: { props?: { children?: unknown } }) => node.props?.children === text);
}

async function renderOnboarding() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  let tree: { root: { findAll: Function }; unmount: () => void };
  await act(async () => {
    tree = renderer.create(
      <QueryClientProvider client={client}>
        <OnboardingScreen />
      </QueryClientProvider>,
    );
    await Promise.resolve();
  });
  return {
    tree: tree!,
    unmount: async () => {
      await act(async () => {
        tree.unmount();
        client.clear();
      });
    },
  };
}

async function settleReminderCommit() {
  await act(async () => {
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 400);
    });
  });
}

describe('G2 onboarding mount abandon', () => {
  beforeEach(() => {
    mockMmkvStore.clear();
    mockReplace.mockClear();
    mockOnboardingSearchParams = {};
    mockStoreState.user = null;
    resetNotificationAskBaseline();
  });

  it('abandons an expired purchased intent at mount and resumes at themeType', async () => {
    seedDraft();
    mockMmkvStore.set(AUTO_TRIAL_INTENT_KEY, JSON.stringify(purchasedIntent({
      expiresAt: '2026-01-01T00:00:00.000Z',
    })));

    const { tree, unmount } = await renderOnboarding();

    expect(readAutoTrialIntent()?.status).toBe('abandoned');
    expect(readAutoTrialIntent()?.abandonReason).toBe('trial_expired_before_submit');
    expect(findText(tree, 'Is there something specific you want\u00A0to\u00A0explore?').length).toBeGreaterThan(0);
    expect(mockMmkvStore.get(STORE_KEY)).toBeTruthy();
    await unmount();
  });
});

describe('G7 onboarding reminderTime render', () => {
  beforeEach(() => {
    mockMmkvStore.clear();
    mockReplace.mockClear();
    mockGetPermissionsAsync.mockReset();
    mockRequestPermissionsAsync.mockReset();
    mockRegisterPushToken.mockReset();
    mockGetPermissionsAsync.mockResolvedValue({ status: 'undetermined' });
    mockRequestPermissionsAsync.mockResolvedValue({ status: 'granted' });
    mockRegisterPushToken.mockResolvedValue('registered');
    mockOnboardingSearchParams = { startAt: 'reminderTime' };
    mockStoreState.user = null;
    resetNotificationAskBaseline();
  });

  it('asks once then replaces /generating when there is no intent', async () => {
    const { tree, unmount } = await renderOnboarding();
    const morning = findByLabel(tree, 'Morning')[0];
    await act(async () => {
      morning.props.onPress();
    });
    await settleReminderCommit();

    expect(mockRequestPermissionsAsync).toHaveBeenCalledTimes(1);
    expect(mockReplace).toHaveBeenCalledTimes(1);
    expect(mockReplace).toHaveBeenCalledWith('/generating');
    await unmount();
  });

  it('replaces /generating after a purchased auto-trial intent', async () => {
    seedDraft();
    mockMmkvStore.set(AUTO_TRIAL_INTENT_KEY, JSON.stringify(purchasedIntent()));
    const { tree, unmount } = await renderOnboarding();
    await act(async () => {
      findByLabel(tree, 'Morning')[0].props.onPress();
    });
    await settleReminderCommit();

    expect(mockRequestPermissionsAsync).toHaveBeenCalledTimes(1);
    expect(mockReplace).toHaveBeenCalledTimes(1);
    expect(mockReplace).toHaveBeenCalledWith('/generating');
    await unmount();
  });

  it('navigates once when the reminder option is tapped twice', async () => {
    const { tree, unmount } = await renderOnboarding();
    const morning = findByLabel(tree, 'Morning')[0];
    await act(async () => {
      morning.props.onPress();
      morning.props.onPress();
    });
    await settleReminderCommit();

    expect(mockRequestPermissionsAsync).toHaveBeenCalledTimes(1);
    expect(mockReplace).toHaveBeenCalledTimes(1);
    await unmount();
  });
});
