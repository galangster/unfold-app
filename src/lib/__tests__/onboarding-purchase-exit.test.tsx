jest.mock('react-native-reanimated', () => {
  const { View } = require('react-native');
  const chainable = () => {
    const anim: Record<string, unknown> = {};
    for (const method of ['duration', 'delay', 'easing', 'springify', 'build', 'withInitialValues']) {
      anim[method] = () => anim;
    }
    return anim;
  };
  return {
    __esModule: true,
    default: { View, createAnimatedComponent: (c: unknown) => c },
    FadeIn: chainable(),
    FadeOut: chainable(),
    Easing: { out: () => 0, in: () => 0, inOut: () => 0, cubic: 0, quad: 0 },
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
jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children }: { children: unknown }) => children,
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('react-native-keyboard-controller', () => ({ KeyboardAwareScrollView: 'KeyboardAwareScrollView' }));
jest.mock('@react-native-community/datetimepicker', () => ({ __esModule: true, default: 'DateTimePicker' }));
jest.mock('expo-router', () => ({ useRouter: () => ({ replace: jest.fn() }), useLocalSearchParams: () => ({}) }));
jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(),
  notificationAsync: jest.fn(),
  ImpactFeedbackStyle: { Light: 'light', Medium: 'medium' },
  NotificationFeedbackType: { Success: 'success', Warning: 'warning', Error: 'error' },
}));
jest.mock('expo-notifications', () => ({
  getPermissionsAsync: jest.fn(async () => ({ status: 'granted' })),
  requestPermissionsAsync: jest.fn(async () => ({ status: 'granted' })),
  scheduleNotificationAsync: jest.fn(async () => 'id'),
  cancelScheduledNotificationAsync: jest.fn(async () => undefined),
  getAllScheduledNotificationsAsync: jest.fn(async () => []),
  setNotificationHandler: jest.fn(),
}));
jest.mock('expo-image', () => ({ Image: 'ExpoImage' }));
jest.mock('expo-linear-gradient', () => ({ LinearGradient: 'LinearGradient' }));
jest.mock('@tanstack/react-query', () => ({
  useQuery: () => ({ data: null, isLoading: false }),
  useMutation: () => ({ mutate: jest.fn() }),
  useQueryClient: () => ({ invalidateQueries: jest.fn() }),
}));
jest.mock('@/lib/theme', () => ({ useTheme: () => ({ colors: {}, isDark: true }) }));
jest.mock('@/lib/store', () => ({
  useUnfoldStore: (selector: (s: Record<string, unknown>) => unknown) =>
    selector({
      user: null,
      updateUser: jest.fn(),
      setUser: jest.fn(),
      setCompanionName: jest.fn(),
      addDevotional: jest.fn(),
      devotionals: [],
    }),
  flushUnfoldStorePersistAsync: jest.fn(async () => undefined),
  ACCENT_THEMES: [{ id: 'gold', dark: '#C8A55C' }],
}));
jest.mock('@/hooks/useOnboardingDarkColors', () => ({
  useOnboardingDarkColors: () => ({ accent: '#C8A55C', background: '#111', text: '#fff' }),
}));
jest.mock('@/lib/logger', () => ({ logger: { log: jest.fn(), warn: jest.fn(), error: jest.fn() } }));
jest.mock('@/lib/push-notifications', () => ({ registerPushToken: jest.fn(async () => undefined) }));
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
jest.mock('@/lib/remote-config', () => ({
  refreshRemoteConfig: jest.fn(),
  readAutoTrialSwitchSnapshot: () => ({ enabled: true, maxTrialDays: 7, fetchedAtMs: 1, reason: 'ok' }),
}));
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
jest.mock('@/lib/revenuecatClient', () => ({
  getOfferings: jest.fn(),
  purchasePackage: jest.fn(),
  isRevenueCatEnabled: () => false,
  isTrialEligibleForProduct: jest.fn(),
}));
jest.mock('@/components/onboarding/ThreeStepPaywall', () => ({ ThreeStepPaywall: () => null }));
jest.mock('@/components/EmberSystem', () => ({ EmberSystem: () => null }));
jest.mock('@/components/TypewriterText', () => ({ TypewriterText: () => null }));
jest.mock('@/components/CompanionOrb', () => ({ CompanionOrb: () => null }));
jest.mock('@/components/VoiceInputBar', () => ({ VoiceInputBar: () => null }));
jest.mock('@/components/Current', () => ({ Current: () => null }));
jest.mock('@/components/ScatterTitle', () => ({ ScatterTitle: () => null }));
jest.mock('@/components/PremiumFeatureSheet', () => ({ PremiumFeatureSheet: () => null }));
jest.mock('@/components/icons', () => new Proxy({}, { get: () => () => null }));
jest.mock('@/components/ui', () => ({ alpha: (c: string) => c }));

import type { CustomerInfo } from 'react-native-purchases';
import type { VerifiedEntitlementExit, VerifiedExitDecision } from '@/lib/auto-trial-exit';
import { runOnboardingPurchaseSuccess } from '@/app/onboarding';

const EXIT: VerifiedEntitlementExit = {
  source: 'purchase',
  customerInfo: {
    entitlements: { active: { 'Unfold Premium': { identifier: 'Unfold Premium' } } },
  } as unknown as CustomerInfo,
};

const AUTO = {
  kind: 'auto',
  created: true,
  intent: { intentId: 'intent-1', status: 'purchased' },
} as VerifiedExitDecision;

describe('F10 onboarding purchase exit', () => {
  it('runs createAutoTrialIntent, then saveOnboardingDraft(purchaseConfirmation), then advanceToNextStep, and awaits nothing', () => {
    const order: string[] = [];
    const createAutoTrialIntent = jest.fn(() => {
      order.push('createAutoTrialIntent');
    });
    const saveOnboardingDraft = jest.fn(() => {
      order.push('saveOnboardingDraft');
    });
    const advanceToNextStep = jest.fn(() => {
      order.push('advanceToNextStep');
    });

    const result = runOnboardingPurchaseSuccess({
      exit: EXIT,
      ensureDeviceId: () => undefined,
      decide: () => {
        createAutoTrialIntent();
        return AUTO;
      },
      saveDraft: () => {
        saveOnboardingDraft();
      },
      setPurchased: () => undefined,
      setAutoTrialMode: () => undefined,
      markPremium: () => undefined,
      advance: () => {
        advanceToNextStep();
      },
    });

    expect(result).toBeUndefined();
    expect(order).toEqual([
      'createAutoTrialIntent',
      'saveOnboardingDraft',
      'advanceToNextStep',
    ]);
    expect(saveOnboardingDraft).toHaveBeenCalledTimes(1);
    expect(advanceToNextStep).toHaveBeenCalledTimes(1);
  });

  it('still writes the confirmation draft, marks premium, and advances once when the decision dependency throws', () => {
    const saveOnboardingDraft = jest.fn();
    const updateUser = jest.fn();
    const advanceToNextStep = jest.fn();

    runOnboardingPurchaseSuccess({
      exit: EXIT,
      ensureDeviceId: () => undefined,
      decide: () => {
        throw new Error('decision dependency failed');
      },
      saveDraft: () => {
        saveOnboardingDraft();
      },
      setPurchased: () => undefined,
      setAutoTrialMode: () => undefined,
      markPremium: () => {
        updateUser({ isPremium: true });
      },
      advance: () => {
        advanceToNextStep();
      },
    });

    expect(saveOnboardingDraft).toHaveBeenCalledTimes(1);
    expect(updateUser).toHaveBeenCalledTimes(1);
    expect(updateUser).toHaveBeenCalledWith({ isPremium: true });
    expect(advanceToNextStep).toHaveBeenCalledTimes(1);
  });
});
