/* eslint-disable @typescript-eslint/no-require-imports, import/first */
import React from 'react';

const renderer = require('react-test-renderer');
const { act } = renderer;

type AnimationChain = {
  duration: jest.Mock<AnimationChain, unknown[]>;
  delay: jest.Mock<AnimationChain, unknown[]>;
  easing: jest.Mock<AnimationChain, unknown[]>;
};

const animationChain = {} as AnimationChain;
animationChain.duration = jest.fn(() => animationChain);
animationChain.delay = jest.fn(() => animationChain);
animationChain.easing = jest.fn(() => animationChain);

jest.mock('react-native-reanimated', () => {
  const { View } = require('react-native');
  return {
    __esModule: true,
    default: { View },
    FadeIn: animationChain,
    FadeOut: animationChain,
    FadeInDown: animationChain,
    useReducedMotion: () => false,
    useSharedValue: (value: unknown) => ({ value }),
    useAnimatedStyle: () => ({}),
    withTiming: (value: unknown) => value,
    Easing: {
      cubic: jest.fn(),
      out: jest.fn(() => 'ease-out'),
      in: jest.fn(() => 'ease-in'),
      inOut: jest.fn(() => 'ease-in-out'),
    },
  };
});

jest.mock('expo-blur', () => ({
  BlurView: ({ children, ...props }: any) => {
    const { View } = require('react-native');
    return <View {...props}>{children}</View>;
  },
}));

jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(),
  ImpactFeedbackStyle: { Light: 'light' },
}));

jest.mock('phosphor-react-native', () => ({
  ArrowRightIcon: () => null,
  BookOpenTextIcon: () => null,
  FeatherIcon: () => null,
  FireIcon: () => null,
  SpeakerHighIcon: () => null,
  SparkleIcon: () => null,
  XIcon: () => null,
}));

jest.mock('@/components/CompanionOrb', () => ({
  CompanionOrb: () => {
    const { View } = require('react-native');
    return <View accessibilityLabel="Companion orb" />;
  },
}));

jest.mock('@/components/ui', () => ({
  alpha: (color: string, opacity: number) => `${color}:${opacity}`,
}));

jest.mock('@/components/ui/utils/alpha', () => ({
  alpha: (color: string, opacity: number) => `${color}:${opacity}`,
}));

jest.mock('@/components/PremiumFeatureSheet', () => ({
  PremiumFeatureSheet: () => null,
}));

jest.mock('@/lib/theme', () => ({
  useTheme: () => ({
    isDark: true,
    colors: {
      text: '#f5f0e8',
      textMuted: '#b9ad9e',
      textSubtle: '#8c8176',
      background: '#0a0a0a',
      backgroundElevated: '#181614',
      accent: '#c8a55c',
    },
  }),
}));

const mockRouterPush = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockRouterPush }),
}));

const mockSetDismissedRememberThisCardDate = jest.fn();
const mockStoreState = {
  getRandomHighlight: jest.fn(() => ({
    id: 'highlight-1',
    devotionalId: 'devotional-1',
    devotionalTitle: 'Quiet Path Series',
    dayNumber: 1,
    highlightedText: 'The next faithful step is enough for today.',
    color: 'yellow',
  })),
  setCurrentDevotional: jest.fn(),
  devotionals: [{ id: 'devotional-1', title: 'Quiet Path Series' }],
  dismissedRememberThisCardDate: null as string | null,
  setDismissedRememberThisCardDate: mockSetDismissedRememberThisCardDate,
};

jest.mock('@/lib/store', () => ({
  useUnfoldStore: (selector: (state: typeof mockStoreState) => unknown) => selector(mockStoreState),
}));

import { ContextSlot } from '../ContextSlot';
import { RememberThisCard } from '../RememberThisCard';
import { PremiumNudgeCard } from '../../PremiumNudgeCard';
import type { ColorTheme } from '@/constants/colors';

const testColors = {
  text: '#f5f0e8',
  textMuted: '#b9ad9e',
  textSubtle: '#8c8176',
  background: '#0a0a0a',
  backgroundElevated: '#181614',
  accent: '#c8a55c',
} as ColorTheme;

function pressByLabel(tree: any, label: string) {
  const matches = tree.root.findAll(
    (node: any) => node.props.accessibilityLabel === label && typeof node.props.onPress === 'function',
  );
  expect(matches.length).toBeGreaterThan(0);
  act(() => {
    matches[0].props.onPress();
  });
}

function renderInAct(element: React.ReactElement) {
  let tree: any;
  act(() => {
    tree = renderer.create(element);
  });
  return tree;
}

describe('dismissible Today/Home surfaces', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockStoreState.dismissedRememberThisCardDate = null;
  });

  it.each([
    {
      name: 'resume prompt',
      label: 'Dismiss resume card',
      props: {
        slotType: 'resume' as const,
        resumeProps: {
          onPress: jest.fn(),
          label: 'Resume where you left off',
          title: 'Quiet Path Series · Day 2: Strength for the Middle',
          timeAgo: 'Saved 1h ago',
        },
      },
    },
    {
      name: 'companion check-in',
      label: 'Dismiss companion check-in card',
      props: {
        slotType: 'midday' as const,
        onMiddayPress: jest.fn(),
        middayMessage: 'How is today landing for you?',
      },
    },
    {
      name: 'evening wind-down',
      label: 'Dismiss evening check-in card',
      props: {
        slotType: 'evening' as const,
        onEveningPress: jest.fn(),
        eveningMessage: 'Before rest — one thought from today.',
      },
    },
    {
      name: 'bridge text',
      label: 'Dismiss bridge card',
      props: {
        slotType: 'bridge' as const,
        bridgeText: 'Nick, today’s reading picks up the thread of waiting with God.',
      },
    },
  ])('calls the dismiss callback for $name when its circled X is tapped', ({ label, props }) => {
    const onDismissResume = jest.fn();
    const onDismissMidday = jest.fn();
    const onDismissEvening = jest.fn();
    const onDismissBridge = jest.fn();

    const tree = renderInAct(
      <ContextSlot
        colors={testColors}
        onDismissResume={onDismissResume}
        onDismissMidday={onDismissMidday}
        onDismissEvening={onDismissEvening}
        onDismissBridge={onDismissBridge}
        {...props}
      />,
    );

    pressByLabel(tree, label);

    const expected = {
      'Dismiss resume card': onDismissResume,
      'Dismiss companion check-in card': onDismissMidday,
      'Dismiss evening check-in card': onDismissEvening,
      'Dismiss bridge card': onDismissBridge,
    }[label];
    expect(expected).toHaveBeenCalledTimes(1);
  });

  it('renders the companion check-in with the shared frosted glass blur layer on iOS', () => {
    const { Platform } = require('react-native');
    const tree = renderInAct(
      <ContextSlot
        colors={testColors}
        slotType="midday"
        onMiddayPress={jest.fn()}
        middayMessage="Where are you being called to remain faithful today?"
      />,
    );

    const blurLayers = tree.root.findAll((node: any) => node.props.testID === 'today-companion-glass-blur');
    if (Platform.OS === 'ios') {
      expect(blurLayers.length).toBeGreaterThan(0);
    } else {
      expect(blurLayers).toHaveLength(0);
    }
  });

  it('hides the saved echo for today when its circled X is tapped', () => {
    const tree = renderInAct(<RememberThisCard />);

    pressByLabel(tree, 'Dismiss saved echo');

    expect(mockSetDismissedRememberThisCardDate).toHaveBeenCalledTimes(1);
    expect(mockSetDismissedRememberThisCardDate).toHaveBeenCalledWith(new Date().toLocaleDateString('en-CA'));
  });

  it('runs the premium nudge dismiss flow when its circled X is tapped', () => {
    const onDismiss = jest.fn();
    const tree = renderInAct(
      <PremiumNudgeCard
        type="audio_teaser"
        message="Let today be read aloud."
        cta="Try audio"
        premiumFeature="audio"
        onAction={jest.fn()}
        onDismiss={onDismiss}
      />,
    );

    pressByLabel(tree, 'Dismiss premium invitation');

    expect(onDismiss).toHaveBeenCalledTimes(1);
  });
});
