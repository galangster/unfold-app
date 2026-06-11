/**
 * RV-UI-1: /generating is the universal AI-consent collection point.
 *
 * Consent-false users can reach /generating from OUTSIDE the onboarding funnel
 * (returning-user new series enters onboarding past the aiConsent step and
 * RecommendedSeriesCard pushes /generating directly; 218-upgraders' migrated
 * stores default hasConsentedToAI=false). Before the fix the screen dead-ended
 * them: isGenerating inits true, beforeRemove blocked all navigation, and the
 * submission effect silently aborted — a spinner that can never complete.
 *
 * Contract:
 *  1. consent-false → the consent notice renders (not the spinner), no job is
 *     submitted, and back-navigation is NOT blocked.
 *  2. accepting consent sets the flag and the submission effect fires.
 *  3. consent-true → unchanged behavior (submit on mount, nav blocked).
 */
import React from 'react';
import { TouchableOpacity } from 'react-native';

// react-test-renderer types are not installed in this app; keep this aligned
// with the existing component-test pattern.
const renderer = require('react-test-renderer');
const { act } = renderer;

const mockNavigation = {
  setOptions: jest.fn(),
  addListener: jest.fn(() => jest.fn()),
};

jest.mock('expo-router', () => ({
  useRouter: () => ({ replace: jest.fn(), push: jest.fn(), back: jest.fn() }),
  useNavigation: () => mockNavigation,
}));

jest.mock('react-native-safe-area-context', () => {
  const { View } = require('react-native');
  return { SafeAreaView: View };
});

jest.mock('react-native-reanimated', () => {
  const { View, Text } = require('react-native');
  const chainable = () => {
    const anim: Record<string, unknown> = {};
    for (const method of ['duration', 'delay', 'easing', 'springify', 'damping', 'build']) {
      anim[method] = () => anim;
    }
    return anim;
  };
  return {
    __esModule: true,
    default: { View, Text, createAnimatedComponent: (c: unknown) => c },
    FadeIn: chainable(),
    FadeInUp: chainable(),
    FadeOut: chainable(),
    Easing: {
      out: () => 'out',
      in: () => 'in',
      inOut: () => 'inOut',
      cubic: 'cubic',
      linear: 'linear',
    },
    useSharedValue: (value: unknown) => ({ value }),
    useAnimatedStyle: () => ({}),
    withRepeat: (value: unknown) => value,
    withDelay: (_delay: number, value: unknown) => value,
    withTiming: (value: unknown) => value,
    interpolate: () => 0,
    cancelAnimation: () => {},
    useReducedMotion: () => true,
  };
});

jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(),
  notificationAsync: jest.fn(),
  ImpactFeedbackStyle: { Light: 'light', Medium: 'medium' },
  NotificationFeedbackType: { Success: 'success', Error: 'error' },
}));

jest.mock('phosphor-react-native', () => ({
  BellIcon: 'BellIcon',
  BookOpenTextIcon: 'BookOpenTextIcon',
}));

jest.mock('@/hooks/useAccessibility', () => ({
  useAccessibleAnimation: () => ({
    reducedMotion: true,
    entering: () => undefined,
    exiting: () => undefined,
  }),
}));

jest.mock('@/lib/theme', () => ({
  useTheme: () => ({
    colors: {
      accent: '#C8A55C',
      background: '#0A0A0A',
      text: '#F5F5F7',
      textMuted: '#A0A6B1',
      textSubtle: '#7D8592',
      error: '#E5484D',
      cardBackground: '#111214',
      inputBackground: '#111214',
      border: '#24262B',
      textHint: '#5C6370',
    },
    isDark: true,
  }),
}));

jest.mock('@/lib/store', () => {
  const { create } = require('zustand');
  const useUnfoldStore = create((set: (partial: object) => void) => ({
    user: {
      name: 'Nick',
      aboutMe: 'Builder',
      currentSituation: 'busy season',
      emotionalState: 'hopeful',
      spiritualSeeking: 'peace',
      faithImpact: '',
      selectedTheme: 'trust',
      selectedType: 'personal',
      selectedStudySubject: undefined,
      readingDuration: 15,
      devotionalLength: 7,
      bibleTranslation: 'BSB',
      writingStyle: undefined,
      relationshipWithGod: 'ups-and-downs',
      growthGoals: [],
      obstacles: [],
    },
    hasConsentedToAI: false,
    devotionals: [],
    generationSession: { devotionalId: null },
    setHasConsentedToAI: (consented: boolean) => set({ hasConsentedToAI: consented }),
    addDevotional: jest.fn(),
    addUsedScriptures: jest.fn(),
    addGeneratedDay: jest.fn(),
    startGenerationSession: jest.fn(),
    updateGenerationSessionProgress: jest.fn(),
    completeGenerationSession: jest.fn(),
    failGenerationSession: jest.fn(),
    clearGenerationSession: jest.fn(),
  }));
  return { useUnfoldStore };
});

// Submission promise intentionally never resolves — keeps the screen in the
// generating state without exercising the polling/completion paths.
const mockSubmitGenerationJob = jest.fn((..._args: unknown[]) => new Promise(() => {}));

jest.mock('@/lib/generation-api', () => ({
  submitGenerationJob: (...args: unknown[]) => mockSubmitGenerationJob(...args),
  pollJobStatus: jest.fn(async () => ({ status: 'processing' })),
  retryJob: jest.fn(),
  recoverCompletedGenerationResult: jest.fn(),
  normalizeGenerationResult: jest.fn((result: unknown) => result),
  ApiError: class ApiError extends Error {},
}));

jest.mock('@/lib/generation-errors', () => ({
  toFriendlyOnboardingGenerationError: (error: string) => error,
}));

jest.mock('@/lib/notifications', () => ({
  requestNotificationPermissions: jest.fn(async () => false),
  areNotificationsEnabled: jest.fn(async () => true),
}));

jest.mock('@/lib/push-notifications', () => ({
  registerPushToken: jest.fn(async () => undefined),
}));

jest.mock('@/lib/bug-logger', () => ({
  logBugEvent: jest.fn(async () => undefined),
  logBugError: jest.fn(async () => undefined),
}));

jest.mock('@/lib/logger', () => ({
  logger: { log: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

jest.mock('@/lib/mmkv-storage', () => {
  const store = new Map<string, string>();
  return {
    mmkvStorage: {
      getItem: jest.fn((key: string) => store.get(key) ?? null),
      setItem: jest.fn((key: string, value: string) => {
        store.set(key, value);
      }),
      removeItem: jest.fn((key: string) => {
        store.delete(key);
      }),
    },
  };
});

import GeneratingScreen from '../../app/generating';
import { useUnfoldStore } from '@/lib/store';

const CONSENT_TITLE = 'A note on privacy';
const CONSENT_CTA_LABEL = 'I understand — continue';

function renderedText(tree: { toJSON: () => unknown }): string {
  return JSON.stringify(tree.toJSON());
}

function findConsentCta(tree: { root: { findAll: (predicate: (node: { type: unknown; props: { accessibilityLabel?: string } }) => boolean) => Array<{ props: { onPress: () => void } }> } }) {
  return tree.root.findAll(
    (node) => node.type === TouchableOpacity && node.props.accessibilityLabel === CONSENT_CTA_LABEL,
  )[0];
}

describe('generating consent gate (RV-UI-1)', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });

  it('consent-false: renders the consent notice, never submits, and does not block leaving', async () => {
    act(() => {
      useUnfoldStore.setState({ hasConsentedToAI: false });
    });

    let tree: any;
    await act(async () => {
      tree = renderer.create(<GeneratingScreen />);
    });

    expect(renderedText(tree)).toContain(CONSENT_TITLE);
    expect(mockSubmitGenerationJob).not.toHaveBeenCalled();
    // beforeRemove must NOT be registered while unconsented — back-nav stays free
    expect(mockNavigation.addListener).not.toHaveBeenCalled();
    // swipe-back gesture must stay enabled while the consent gate is showing
    expect(mockNavigation.setOptions).toHaveBeenLastCalledWith({ gestureEnabled: true });

    act(() => tree.unmount());
  });

  it('accepting consent sets the flag and arms the submission effect', async () => {
    act(() => {
      useUnfoldStore.setState({ hasConsentedToAI: false });
    });

    let tree: any;
    await act(async () => {
      tree = renderer.create(<GeneratingScreen />);
    });

    const cta = findConsentCta(tree);
    expect(cta).toBeTruthy();

    await act(async () => {
      cta.props.onPress();
    });

    expect(useUnfoldStore.getState().hasConsentedToAI).toBe(true);
    expect(mockSubmitGenerationJob).toHaveBeenCalledTimes(1);
    // generation is now genuinely in flight — external navigation is blocked again
    expect(mockNavigation.addListener).toHaveBeenCalledWith('beforeRemove', expect.any(Function));

    act(() => tree.unmount());
  });

  it('consent-true: unchanged behavior — submits on mount, no consent UI, nav blocked', async () => {
    act(() => {
      useUnfoldStore.setState({ hasConsentedToAI: true });
    });

    let tree: any;
    await act(async () => {
      tree = renderer.create(<GeneratingScreen />);
    });

    expect(renderedText(tree)).not.toContain(CONSENT_TITLE);
    expect(mockSubmitGenerationJob).toHaveBeenCalledTimes(1);
    expect(mockNavigation.addListener).toHaveBeenCalledWith('beforeRemove', expect.any(Function));

    act(() => tree.unmount());
  });
});
