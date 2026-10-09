/**
 * Step-level render checks for findings from the 1.1.18 release smoke. The
 * harness mirrors src/lib/__tests__/onboarding-completion-render.test.tsx and
 * opens the screen at one step through ?startAt=.
 */
import React from 'react';
import { ScrollView, TextInput } from 'react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { pressableAncestor } from '@/lib/__tests__/fixtures/pressable-ancestor';

const renderer = jest.requireActual('react-test-renderer');
const { act } = renderer;

const mockReplace = jest.fn();
const mockFeatureSummaryCarousel = jest.fn((_props: unknown) => null);
const mockMmkvStore = new Map<string, string>();
let mockOnboardingSearchParams: Record<string, string> = { startAt: 'hook' };

jest.mock('react-native-reanimated', () => {
  const { View, Text: RNText } = jest.requireActual('react-native');
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
  const { View, TouchableOpacity } = jest.requireActual('react-native');
  return { Gesture: { Pan: () => ({}), Tap: () => ({}) }, GestureDetector: ({ children }: { children: unknown }) => children, TouchableOpacity, View };
});
jest.mock('react-native-safe-area-context', () => {
  const { View } = jest.requireActual('react-native');
  return { SafeAreaView: View, useSafeAreaInsets: () => ({ top: 0, bottom: 34, left: 0, right: 0 }) };
});
jest.mock('react-native-keyboard-controller', () => {
  const { ScrollView } = jest.requireActual('react-native');
  return { KeyboardAwareScrollView: ScrollView };
});
jest.mock('@react-native-community/datetimepicker', () => ({ __esModule: true, default: 'DateTimePicker' }));
jest.mock('expo-router', () => ({
  useIsFocused: () => true,
  useRouter: () => ({
    canGoBack: () => true,
    replace: (...args: unknown[]) => mockReplace(...args),
    dismissTo: jest.fn(),
    back: jest.fn(),
    push: jest.fn(),
  }),
  useSegments: () => [],
  useNavigation: () => ({ getState: () => ({ index: 1, routes: [] }) }),
  useLocalSearchParams: () => mockOnboardingSearchParams,
}));
jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(),
  notificationAsync: jest.fn(),
  ImpactFeedbackStyle: { Light: 'light', Medium: 'medium', Heavy: 'heavy' },
  NotificationFeedbackType: { Success: 'success', Warning: 'warning', Error: 'error' },
}));
jest.mock('expo-image', () => ({ Image: 'ExpoImage' }));
jest.mock('expo-linear-gradient', () => ({ LinearGradient: 'LinearGradient' }));
jest.mock('expo-notifications', () => ({
  getPermissionsAsync: jest.fn(async () => ({ status: 'granted' })),
  requestPermissionsAsync: jest.fn(async () => ({ status: 'granted' })),
}));
jest.mock('@/lib/notifications', () => ({ requestNotificationPermissions: jest.fn(async () => true) }));
jest.mock('@/lib/push-notifications', () => ({ registerPushToken: jest.fn(async () => 'registered') }));
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
  newSeriesLifeDraft: null as string | null,
  setNewSeriesLifeDraft: jest.fn(),
  setUser: jest.fn(),
  companionName: null as string | null,
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
  const ReactActual = jest.requireActual('react');
  const { Text } = jest.requireActual('react-native');
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
jest.mock('@/components/onboarding/FeatureSummaryCarousel', () => ({
  FeatureSummaryCarousel: (props: unknown) => mockFeatureSummaryCarousel(props),
}));
jest.mock('@/components/onboarding/DevotionalSegue', () => ({ DevotionalSegue: () => null }));
jest.mock('@/components/onboarding/ReadDevotionalStep', () => ({ ReadDevotionalStep: () => null }));
jest.mock('@/components/onboarding/OnboardingCelebration', () => ({ OnboardingCelebration: () => null }));
jest.mock('@/components/onboarding/CommitmentStep', () => ({ CommitmentStep: () => null }));
jest.mock('@/components/onboarding/WelcomeBackStep', () => ({ WelcomeBackStep: () => null }));

// eslint-disable-next-line import/first -- the screen import must run after Jest module mocks are registered.
import OnboardingScreen from '@/app/onboarding';

type Tree = { root: { findAll: Function }; unmount: () => void };

let client: QueryClient;
let tree: Tree | null = null;

async function openAt(startAt: string): Promise<Tree> {
  mockOnboardingSearchParams = { startAt };
  client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  await act(async () => {
    tree = renderer.create(
      <QueryClientProvider client={client}>
        <OnboardingScreen />
      </QueryClientProvider>,
    );
    await Promise.resolve();
  });
  return tree!;
}

function textNodes(root: Tree, text: string) {
  return root.root.findAll((n: { props?: { children?: unknown } }) => n.props?.children === text);
}

beforeEach(() => {
  jest.clearAllMocks();
  mockMmkvStore.clear();
  mockStoreState.user = null;
  mockStoreState.companionName = null;
});

afterEach(async () => {
  if (tree) {
    const mounted = tree;
    tree = null;
    await act(async () => {
      mounted.unmount();
      client.clear();
    });
  }
});

// 1.1.18 release smoke (F04): VoiceOver spelled the hook out letter by letter
// and found no button on the founder note.
describe('onboarding headline and button semantics', () => {
  it('reads the hook heading as one sentence', async () => {
    const screen = await openAt('hook');

    const labelled = screen.root.findAll(
      (n: { props?: { accessible?: boolean; accessibilityLabel?: string } }) =>
        n.props?.accessible === true
        && n.props?.accessibilityLabel === 'Ever open your Bible and not know where to start?',
      { deep: false },
    );
    expect(labelled).toHaveLength(1);
  });

  it('marks the founder note Continue as a button', async () => {
    const screen = await openAt('founderNote');

    const control = pressableAncestor(textNodes(screen, 'Continue')[0]) as { props: { accessibilityRole?: string } };
    expect(control.props.accessibilityRole).toBe('button');
  });
});

// 1.1.18 release smoke (F06): the confirm buttons started at y=876 on an
// 874-point screen, under generated text of varying length.
describe('mirror-back actions', () => {
  const reflection = 'You keep coming back to the quiet, and it keeps meeting you. '.repeat(12);
  const mockGenerateMirrorBackText = jest.requireMock('@/lib/devotional-service').generateMirrorBackText as jest.Mock;

  async function openMirrorBack(): Promise<Tree> {
    mockGenerateMirrorBackText.mockResolvedValue({
      content: {
        reflection,
        verse: 'Be still, and know that I am God.',
        verseRef: 'Psalm 46:10',
        anticipation: 'Something is being written for you right now.',
      },
    });
    const screen = await openAt('mirrorBack');
    await act(async () => {
      await Promise.resolve();
    });
    return screen;
  }

  function insideScroll(screen: Tree, text: string): boolean {
    return screen.root
      .findAll((n: { type?: unknown }) => n.type === ScrollView)
      .some((scroll: Tree['root']) => scroll.findAll((n: { props?: { children?: unknown } }) => n.props?.children === text).length > 0);
  }

  it('keeps the confirm actions on screen while the reflection scrolls', async () => {
    const screen = await openMirrorBack();

    expect(insideScroll(screen, reflection)).toBe(true);
    expect(textNodes(screen, 'Yes, this feels right').length).toBeGreaterThan(0);
    expect(insideScroll(screen, 'Yes, this feels right')).toBe(false);
    expect(insideScroll(screen, 'Let me adjust something')).toBe(false);
  });

  it('pins the actions to the bottom and pads the scroll by their measured height', async () => {
    const screen = await openMirrorBack();
    const footer = screen.root.findAll(
      (n: { props?: { testID?: string; onLayout?: unknown } }) =>
        n.props?.testID === 'mirror-back-actions' && typeof n.props?.onLayout === 'function',
    )[0];
    expect(footer.props.style).toMatchObject({ position: 'absolute', left: 0, right: 0, bottom: 0 });

    await act(async () => {
      footer.props.onLayout({ nativeEvent: { layout: { height: 180.4 } } });
    });

    // The scroll already ends with 120 pt of padding, so the spacer adds the
    // rest of the measured 181 pt footer.
    const spacers = screen.root
      .findAll((n: { type?: unknown }) => n.type === ScrollView)
      .flatMap((scroll: Tree['root']) => scroll.findAll((n: { props?: { testID?: string } }) => n.props?.testID === 'mirror-back-scroll-spacer'));
    expect(spacers.length).toBeGreaterThan(0);
    expect(spacers[0].props.style).toMatchObject({ height: 61 });
  });

  it('confirms the reflection and moves on to the feature summary', async () => {
    const screen = await openMirrorBack();

    await act(async () => {
      await pressableAncestor(textNodes(screen, 'Yes, this feels right')[0]).props.onPress();
    });

    expect(mockFeatureSummaryCarousel).toHaveBeenCalled();
  });

  it('opens the correction field in the scroll and drops the pinned actions', async () => {
    const screen = await openMirrorBack();

    await act(async () => {
      await pressableAncestor(textNodes(screen, 'Let me adjust something')[0]).props.onPress();
    });

    expect(textNodes(screen, 'Yes, this feels right')).toHaveLength(0);
    const field = screen.root.findAll((n: { type?: unknown }) => n.type === TextInput);
    expect(field).toHaveLength(1);
    expect(field[0].props.placeholder).toBe('What did we get wrong?');
  });
});

// 1.1.18 release smoke (F10): onboarding stopped asking for the companion
// name on 2026-09-13 and saved the default 'Grace' for every reader. Nick:
// "the companion should be named what the user named it in the beginning".
describe('companion name', () => {
  type CarouselProps = {
    onCompanionNameChange: (name: string) => void;
    onComplete: () => void;
  };
  const carouselProps = () => mockFeatureSummaryCarousel.mock.calls.at(-1)?.[0] as unknown as CarouselProps;

  function findByLabel(root: Tree, label: string) {
    return root.root.findAll(
      (n: { props?: { accessibilityLabel?: string; onPress?: unknown } }) =>
        n.props?.accessibilityLabel === label && typeof n.props?.onPress === 'function',
    );
  }

  async function completeFromReminderTime() {
    const screen = await openAt('reminderTime');
    await act(async () => {
      findByLabel(screen, 'Morning')[0].props.onPress();
    });
    await act(async () => {
      await new Promise<void>((resolve) => {
        setTimeout(resolve, 400);
      });
    });
    expect(mockStoreState.setUser).toHaveBeenCalledTimes(1);
    return mockStoreState.setUser.mock.calls[0][0] as { companionName?: string };
  }

  it('keeps the name the reader types on the feature summary', async () => {
    await openAt('featureSummary');

    await act(async () => {
      carouselProps().onCompanionNameChange('  Selah ');
    });
    await act(async () => {
      carouselProps().onComplete();
    });

    expect(mockStoreState.setCompanionName).toHaveBeenLastCalledWith('Selah');
  });

  it('keeps no name, not the default, when the reader leaves the field empty', async () => {
    await openAt('featureSummary');

    await act(async () => {
      carouselProps().onComplete();
    });

    expect(mockStoreState.setCompanionName).toHaveBeenLastCalledWith(null);
    expect(mockStoreState.setCompanionName).not.toHaveBeenCalledWith('Grace');
  });

  it('saves the typed name with the profile when onboarding completes', async () => {
    mockStoreState.companionName = 'Selah';

    const profile = await completeFromReminderTime();

    expect(profile.companionName).toBe('Selah');
    expect(mockStoreState.setCompanionName).toHaveBeenLastCalledWith('Selah');
  });

  it('saves no name with the profile when the reader gave none', async () => {
    const profile = await completeFromReminderTime();

    expect(profile.companionName).toBeUndefined();
    expect(mockStoreState.setCompanionName).toHaveBeenLastCalledWith(null);
  });
});
