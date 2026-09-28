import React from 'react';
import { AppState, TextInput } from 'react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { STORE_KEY } from '@/lib/onboarding-draft-store';
import { resetNotificationAskBaseline } from '@/lib/notification-ask';
import { pressableAncestor } from './fixtures/pressable-ancestor';

const renderer = require('react-test-renderer');
const { act } = renderer;

const mockReplace = jest.fn();
const mockGetPermissionsAsync = jest.fn();
const mockRequestPermissionsAsync = jest.fn();
const mockRegisterPushToken = jest.fn();
const mockSetItem = jest.fn((key: string, value: string) => {
  mockMmkvStore.set(key, value);
});
const mockMmkvStore = new Map<string, string>();

let mockOnboardingSearchParams: Record<string, string> = { startAt: 'reminderTime' };

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
  useIsFocused: () => true,
  useRouter: () => ({ canGoBack: () => true, replace: (...args: unknown[]) => mockReplace(...args), back: jest.fn(), push: jest.fn() }),
  useSegments: () => [],
  useNavigation: () => ({ getState: () => ({ index: 1, routes: [] }) }),
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
  user: null as Record<string, unknown> | null,
  updateUser: jest.fn(),
  lifeContextDraft: null as string | null,
  setLifeContextDraft: jest.fn(),
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
    setItem: (key: string, value: string) => mockSetItem(key, value),
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
// Headlines finish typing at once unless a test holds one mid-reveal.
let mockTypewriterFinishes = true;
jest.mock('@/components/TypewriterText', () => {
  const ReactActual = require('react');
  const { Text } = require('react-native');
  return {
    TypewriterText: ({ text, onComplete }: { text: string; onComplete?: () => void }) => {
      ReactActual.useEffect(() => {
        if (mockTypewriterFinishes) onComplete?.();
      }, [onComplete]);
      return ReactActual.createElement(Text, null, text);
    },
  };
});
jest.mock('@/components/onboarding/ThreeStepPaywall', () => ({ ThreeStepPaywall: () => null }));
jest.mock('@/components/EmberSystem', () => ({ EmberSystem: () => null }));
jest.mock('@/components/companion/CompanionAvatar', () => ({ CompanionAvatar: () => null }));
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

function findByLabel(tree: { root: { findAll: Function } }, label: string) {
  return tree.root.findAll(
    (node: { props?: { accessibilityLabel?: string; onPress?: unknown } }) =>
      node.props?.accessibilityLabel === label && typeof node.props?.onPress === 'function',
  );
}

function emitAppState(next: string) {
  const listeners = (AppState.addEventListener as unknown as jest.Mock).mock.calls
    .filter((call: unknown[]) => call[0] === 'change')
    .map((call: unknown[]) => call[1] as (status: string) => void);
  for (const listener of listeners) {
    listener(next);
  }
}

describe('G5 onboarding completion draft retirement', () => {
  beforeEach(() => {
    mockMmkvStore.clear();
    mockSetItem.mockClear();
    mockReplace.mockClear();
    mockGetPermissionsAsync.mockResolvedValue({ status: 'undetermined' });
    mockRequestPermissionsAsync.mockResolvedValue({ status: 'granted' });
    mockRegisterPushToken.mockResolvedValue('registered');
    mockOnboardingSearchParams = { startAt: 'reminderTime' };
    mockStoreState.user = null;
    resetNotificationAskBaseline();
  });

  it('does not recreate onboarding-draft-v1 after completion starts and the app backgrounds', async () => {
    const client = new QueryClient({
      defaultOptions: {
        queries: { retry: false, gcTime: Infinity },
        mutations: { retry: false, gcTime: Infinity },
      },
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

    await act(async () => {
      findByLabel(tree!, 'Morning')[0].props.onPress();
    });
    await act(async () => {
      await new Promise<void>((resolve) => {
        setTimeout(resolve, 400);
      });
    });

    expect(mockReplace).toHaveBeenCalledTimes(1);
    expect(mockMmkvStore.get(STORE_KEY)).toBeUndefined();

    mockSetItem.mockClear();
    await act(async () => {
      emitAppState('background');
    });

    expect(mockSetItem).not.toHaveBeenCalledWith(STORE_KEY, expect.anything());
    expect(mockMmkvStore.get(STORE_KEY)).toBeUndefined();

    await act(async () => {
      tree.unmount();
      client.clear();
    });
  });
});

describe('new series from Today', () => {
  // A reader who finished onboarding and one earlier series, a book study.
  const PREVIOUS_SITUATION = 'Walking a short series through an ordinary week.';
  const SHARE_AN_UPDATE_DRAFT = 'An unsaved edit from Share an update.';
  const mockGenerateDiagnosticQuestions = jest.requireMock('@/lib/devotional-service').generateDiagnosticQuestions as jest.Mock;
  let client: QueryClient;
  let tree: { root: { findAll: Function }; unmount: () => void };

  beforeEach(() => {
    jest.useFakeTimers();
    mockReplace.mockClear();
    mockTypewriterFinishes = true;
    mockGenerateDiagnosticQuestions.mockReset().mockResolvedValue(null);
    mockStoreState.lifeContextDraft = SHARE_AN_UPDATE_DRAFT;
    mockStoreState.user = {
      name: 'Ben',
      aboutMe: 'A father of two.',
      hasCompletedOnboarding: true,
      currentSituation: PREVIOUS_SITUATION,
      reminderTime: '9:00 PM',
      relationshipWithGod: 'ups-and-downs',
      bibleFrequency: 'weekly',
      growthGoals: ['Prayer life'],
      obstacles: ['Busy schedule'],
      selectedTheme: 'trust',
      selectedType: 'book_study',
      selectedStudySubject: 'Ruth',
    };
    // The store merges each update over the saved profile.
    mockStoreState.updateUser.mockImplementation((patch: Record<string, unknown>) => {
      mockStoreState.user = { ...mockStoreState.user, ...patch };
    });
    mockStoreState.setLifeContextDraft.mockImplementation((text: string | null) => {
      mockStoreState.lifeContextDraft = text;
    });
    client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  });

  afterEach(async () => {
    await act(async () => {
      tree?.unmount();
      client.clear();
    });
    mockStoreState.updateUser.mockReset();
    mockStoreState.setLifeContextDraft.mockReset();
    mockStoreState.user = null;
    mockStoreState.lifeContextDraft = null;
    jest.useRealTimers();
  });

  async function openAt(startAt: string) {
    mockOnboardingSearchParams = { startAt, flow: 'newSeries' };
    await act(async () => {
      tree = renderer.create(
        <QueryClientProvider client={client}>
          <OnboardingScreen />
        </QueryClientProvider>,
      );
    });
  }

  // Presses, then lets step transitions (up to 350 ms) and completion settle.
  async function tap(target: { label?: string; text?: string }) {
    const node = target.label
      ? findByLabel(tree, target.label)[0]
      : pressableAncestor(tree.root.findAll((n: { props?: { children?: unknown } }) => n.props?.children === target.text)[0]);
    await act(async () => {
      node.props.onPress();
      await jest.advanceTimersByTimeAsync(400);
    });
  }

  function lifeQuestionField() {
    return tree.root.findAll(
      (n: { type?: unknown; props?: { accessibilityLabel?: string } }) =>
        n.type === TextInput && n.props?.accessibilityLabel === 'Your life update',
    )[0];
  }

  async function type(field: { props: { onChangeText: (text: string) => void } }, text: string) {
    await act(async () => field.props.onChangeText(text));
  }

  it('opens the life question blank instead of showing the previous series answer', async () => {
    await openAt('themeType');
    await tap({ text: 'Just guide me' });

    expect(lifeQuestionField().props.defaultValue).toBe('');
  });

  it('types the life question in before its answer controls appear', async () => {
    await openAt('themeType');
    mockTypewriterFinishes = false;
    await tap({ text: 'Just guide me' });

    // The answer controls wait for the question, as on every other step.
    expect(lifeQuestionField()).toBeUndefined();
  });

  it('skipping the life question keeps the saved context without asking about the old answer', async () => {
    await openAt('themeType');
    await tap({ text: 'Just guide me' });
    await tap({ label: 'Skip life update' });

    // The diagnostic round would otherwise build follow-ups from the old answer.
    expect(mockGenerateDiagnosticQuestions).not.toHaveBeenCalled();
    expect(tree.root.findAll(
      (n: { props?: { children?: unknown } }) => typeof n.props?.children === 'string' && n.props.children.startsWith('When you imagine your faith'),
    ).length).toBeGreaterThan(0);
  });

  it('saves a new answer as the life context and leaves unsaved Share an update writing alone', async () => {
    await openAt('themeType');
    await tap({ text: 'Just guide me' });
    await type(lifeQuestionField(), 'Starting a new job next month.');
    // Typing in a new series does not write the Share an update draft.
    expect(mockStoreState.setLifeContextDraft).not.toHaveBeenCalled();

    await tap({ label: 'Continue' });
    // No diagnostic questions come back, so the next step is spiritualSeeking.
    await type(tree.root.findAll((n: { type?: unknown }) => n.type === TextInput)[0], 'More patience.');
    await tap({ label: 'Continue' });
    await tap({ label: 'Continue' }); // upcomingEvent is optional
    await tap({ label: '15 minutes' });
    await tap({ label: '7 days' });

    expect(mockReplace).toHaveBeenCalledWith('/generating');
    expect(mockStoreState.user?.currentSituation).toBe('Starting a new job next month.');
    expect(mockStoreState.lifeContextDraft).toBe(SHARE_AN_UPDATE_DRAFT);
  });

  it('keeps the profile answers a new series does not ask again', async () => {
    await openAt('devotionalLength');
    await tap({ label: '7 days' });

    expect(mockReplace).toHaveBeenCalledWith('/generating');
    expect(mockStoreState.user).toEqual(expect.objectContaining({
      reminderTime: '9:00 PM',
      relationshipWithGod: 'ups-and-downs',
      bibleFrequency: 'weekly',
      growthGoals: ['Prayer life'],
      obstacles: ['Busy schedule'],
      // Nothing new was written, so the saved life context and its unsaved edit stay.
      currentSituation: PREVIOUS_SITUATION,
    }));
    expect(mockStoreState.lifeContextDraft).toBe(SHARE_AN_UPDATE_DRAFT);
  });

  it('does not inherit the previous series direction', async () => {
    await openAt('devotionalLength');
    await tap({ label: '7 days' });

    expect(mockStoreState.user?.selectedTheme).toBeUndefined();
    expect(mockStoreState.user?.selectedType).toBeUndefined();
    expect(mockStoreState.user?.selectedStudySubject).toBeUndefined();
  });
});
