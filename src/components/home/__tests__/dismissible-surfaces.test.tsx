/* eslint-disable @typescript-eslint/no-require-imports, import/first */
import React from 'react';
import * as fs from 'fs';
import * as path from 'path';

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
    Extrapolation: { CLAMP: 'clamp' },
    FadeIn: animationChain,
    FadeOut: animationChain,
    FadeInDown: animationChain,
    interpolate: (value: number) => value,
    runOnJS: (fn: (...args: unknown[]) => unknown) => fn,
    useReducedMotion: () => false,
    useSharedValue: (value: unknown) => ({ value }),
    useAnimatedStyle: () => ({}),
    withTiming: (value: unknown, _config?: unknown, callback?: (finished: boolean) => void) => {
      callback?.(true);
      return value;
    },
    Easing: {
      cubic: jest.fn(),
      out: jest.fn(() => 'ease-out'),
      in: jest.fn(() => 'ease-in'),
      inOut: jest.fn(() => 'ease-in-out'),
    },
  };
});

jest.mock('react-native-gesture-handler', () => {
  const { View } = require('react-native');
  const makePan = () => {
    const gesture: Record<string, jest.Mock> = {};
    ['enabled', 'activeOffsetX', 'failOffsetY', 'onBegin', 'onUpdate', 'onEnd', 'onFinalize'].forEach((method) => {
      gesture[method] = jest.fn(() => gesture);
    });
    return gesture;
  };

  return {
    Gesture: { Pan: jest.fn(makePan) },
    GestureDetector: ({ children }: any) => <View testID="today-card-stack-gesture-detector">{children}</View>,
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
const { StyleSheet: RNStyleSheet } = require('react-native');

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
import { TodayCardStack, type TodayCardStackCard } from '../TodayCardStack';
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

function flattenStyle(style: unknown) {
  return RNStyleSheet.flatten(style) ?? {};
}

function stackCardFixture(overrides: Partial<TodayCardStackCard> = {}): TodayCardStackCard {
  return {
    id: 'today-stack-resume',
    kind: 'resume',
    priority: 500,
    eyebrow: 'Resume where you left off',
    title: 'Quiet Path Series · Day 2: Strength for the Middle',
    body: 'Saved 1h ago. Your place is saved quietly.',
    actionLabel: 'Continue reading',
    accessibilityLabel: 'Resume where you left off. Quiet Path Series · Day 2: Strength for the Middle. Saved 1h ago.',
    accessibilityHint: 'Returns to the saved devotional reading',
    dismissAccessibilityLabel: 'Dismiss resume stack card',
    dismissAccessibilityHint: 'Clears this saved resume prompt without deleting your reading',
    ...overrides,
  };
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

  it('renders the Today premium nudge card with shared frosted glass on iOS', () => {
    const { Platform } = require('react-native');
    const tree = renderInAct(
      <PremiumNudgeCard
        type="audio_teaser"
        message="Let today be read aloud."
        cta="Try audio"
        premiumFeature="audio"
        onAction={jest.fn()}
        onDismiss={jest.fn()}
      />,
    );

    const blurLayers = tree.root.findAll((node: any) => node.props.testID === 'premium-nudge-glass-blur');
    if (Platform.OS === 'ios') {
      expect(blurLayers.length).toBeGreaterThan(0);
    } else {
      expect(blurLayers).toHaveLength(0);
    }
  });

  it('keeps the premium nudge banner variant out of the floating Today glass treatment', () => {
    const tree = renderInAct(
      <PremiumNudgeCard
        type="audio_teaser"
        message="Let today be read aloud."
        cta="Try audio"
        premiumFeature="audio"
        onAction={jest.fn()}
        onDismiss={jest.fn()}
        variant="banner"
      />,
    );

    const blurLayers = tree.root.findAll((node: any) => node.props.testID === 'premium-nudge-glass-blur');
    expect(blurLayers).toHaveLength(0);
  });

  it.each([
    {
      name: 'resume',
      label: 'Dismiss resume stack card',
      card: stackCardFixture({ kind: 'resume', priority: 500, dismissAccessibilityLabel: 'Dismiss resume stack card' }),
    },
    {
      name: 'evening',
      label: 'Dismiss evening stack card',
      card: stackCardFixture({ id: 'today-stack-evening', kind: 'evening', priority: 400, title: 'Wind down with today’s reading', dismissAccessibilityLabel: 'Dismiss evening stack card' }),
    },
    {
      name: 'midday',
      label: 'Dismiss midday stack card',
      card: stackCardFixture({ id: 'today-stack-midday', kind: 'midday', priority: 300, title: 'Check in with today’s reading', dismissAccessibilityLabel: 'Dismiss midday stack card' }),
    },
    {
      name: 'bridge',
      label: 'Dismiss bridge stack card',
      card: stackCardFixture({ id: 'today-stack-bridge', kind: 'bridge', priority: 200, title: 'A thread from yesterday to today', dismissAccessibilityLabel: 'Dismiss bridge stack card' }),
    },
    {
      name: 'bridge-loading',
      label: 'Dismiss bridge loading stack card',
      card: stackCardFixture({ id: 'today-stack-bridge-loading', kind: 'bridge-loading', priority: 100, title: 'Preparing today’s thread…', dismissAccessibilityLabel: 'Dismiss bridge loading stack card' }),
    },
    {
      name: 'saved echo',
      label: 'Dismiss saved echo stack card',
      card: stackCardFixture({ id: 'today-stack-remember-this-highlight-1', kind: 'remember-this', priority: 80, title: 'A line worth carrying', dismissAccessibilityLabel: 'Dismiss saved echo stack card' }),
    },
    {
      name: 'Day 1 review',
      label: 'Dismiss Day 1 review stack card',
      card: stackCardFixture({ id: 'today-stack-day1-review', kind: 'day1-review', priority: 70, title: 'Did today’s reading feel personal?', dismissAccessibilityLabel: 'Dismiss Day 1 review stack card' }),
    },
    {
      name: 'premium nudge',
      label: 'Dismiss premium invitation stack card',
      card: stackCardFixture({ id: 'today-stack-premium-streak-freeze', kind: 'premium-nudge', priority: 50, title: 'Grace for missed days', dismissAccessibilityLabel: 'Dismiss premium invitation stack card' }),
    },
  ])('calls the TodayCardStack inline X callback for migrated $name cards', ({ label, card }) => {
    const onDismiss = jest.fn();
    const onPress = jest.fn();
    const tree = renderInAct(
      <TodayCardStack
        colors={testColors}
        cards={[{ ...card, onDismiss, onPress }]}
      />,
    );

    pressByLabel(tree, label);

    expect(onDismiss).toHaveBeenCalledTimes(1);
    expect(onPress).not.toHaveBeenCalled();
  });

  it('renders Today stack dismiss X as icon-only without circular chrome', () => {
    const tree = renderInAct(
      <TodayCardStack
        colors={testColors}
        cards={[
          stackCardFixture({
            id: 'today-stack-evening',
            kind: 'evening',
            title: 'Wind down with today’s reading',
            dismissAccessibilityLabel: 'Dismiss evening stack card',
            onDismiss: jest.fn(),
          }),
        ]}
      />,
    );

    const dismissButton = tree.root.find(
      (node: any) => node.props.accessibilityLabel === 'Dismiss evening stack card' && typeof node.props.onPress === 'function',
    );
    const style = flattenStyle(dismissButton.props.style);

    expect(style.backgroundColor).toBeUndefined();
    expect(style.borderColor).toBeUndefined();
    expect(style.borderWidth).toBeUndefined();
    expect(style.borderRadius).toBeUndefined();
    expect(style.shadowOpacity).toBeUndefined();
    expect(style.elevation).toBeUndefined();
  });

  it('wires the production Today stack under the hero and above Daily Rhythm only', () => {
    const sourcePath = path.join(__dirname, '..', '..', '..', 'app', '(tabs)', '(today)', 'index.tsx');
    const source = fs.readFileSync(sourcePath, 'utf8');
    const renderStart = source.indexOf('<GreetingRow');
    const renderSource = source.slice(renderStart);
    const heroIndex = renderSource.indexOf('<DevotionalCard');
    const stackIndex = renderSource.indexOf('<TodayCardStack');
    const streakIndex = renderSource.indexOf('<StreakBox');

    expect(heroIndex).toBeGreaterThan(-1);
    expect(stackIndex).toBeGreaterThan(heroIndex);
    expect(streakIndex).toBeGreaterThan(stackIndex);
    expect(renderSource).not.toContain('<ContextSlot');
    expect(renderSource).not.toContain('slotType={');
    expect(renderSource).not.toContain('<RememberThisCard');
    expect(renderSource).not.toContain('<PremiumNudgeCard');
    expect(renderSource).not.toContain('day1ReviewWrapper');
  });

  it('keeps migrated production stack priority and dismiss semantics explicit', () => {
    const sourcePath = path.join(__dirname, '..', '..', '..', 'app', '(tabs)', '(today)', 'index.tsx');
    const source = fs.readFileSync(sourcePath, 'utf8');

    expect(source).toContain("kind: 'resume',\n        priority: 500");
    expect(source).toContain("kind: 'evening',\n        priority: 400");
    expect(source).toContain("kind: 'midday',\n        priority: 300");
    expect(source).toContain("kind: 'bridge',\n        priority: 200");
    expect(source).toContain("kind: 'bridge-loading',\n        priority: 100");
    expect(source).toContain("kind: 'remember-this',\n        priority: 80");
    expect(source).toContain("kind: 'day1-review',\n        priority: 70");
    expect(source).toContain("kind: 'premium-nudge',\n        priority: 50");
    expect(source).toContain('clearResumeContext();');
    expect(source).toContain('setDismissedMiddayCardDate(todayDate);');
    expect(source).toContain('setDismissedEveningCardDate(todayDate);');
    expect(source).toContain('setDismissedBridgeCardDate(todayDate);');
    expect(source).toContain('setDismissedRememberThisCardDate(todayDate);');
    expect(source).toContain('setHasSeenDay1Review();');
    expect(source).toContain('nudgeDismiss();');
    expect(source).toContain('nudgeAction();');
    expect(source).toContain("title: 'Preparing today’s thread…'");
    expect(source).not.toContain('Companion is gathering');
  });

  it('documents Phase 6 relationship-based Today spacing in named tokens', () => {
    const homePath = path.join(__dirname, '..', '..', '..', 'app', '(tabs)', '(today)', 'index.tsx');
    const bentoPath = path.join(__dirname, '..', 'BentoGrid.tsx');
    const homeSource = fs.readFileSync(homePath, 'utf8');
    const bentoSource = fs.readFileSync(bentoPath, 'utf8');

    expect(homeSource).toContain('const TODAY_RELATIONSHIP_SPACING = {');
    expect(homeSource).toContain("heroToOptionalStack: Spacing['5']");
    expect(homeSource).toContain("heroToRhythm: Spacing['5']");
    expect(homeSource).toContain("optionalStackToRhythm: Spacing['4']");
    expect(homeSource).toContain("rhythmToBento: Spacing['3']");
    expect(homeSource).toContain("bentoToNewThought: Spacing['6']");
    expect(homeSource).toContain('hasOptionalTodayStack ? styles.rhythmAfterOptionalStack : styles.rhythmAfterHero');
    expect(homeSource).toContain('style={styles.bentoWrapper}');
    expect(homeSource).toContain('const activeCurrentDayData = currentDevotional?.days.find');
    expect(homeSource).toContain('hasReadToday && activeCurrentDayData && !activeCurrentDayData.isRead');
    expect(bentoSource).not.toContain('marginTop: Spacing');
  });
});
