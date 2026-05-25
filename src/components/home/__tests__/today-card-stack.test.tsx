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
    interpolate: (value: number, input: number[], output: number[]) => {
      if (value <= input[0]) return output[0];
      if (value >= input[input.length - 1]) return output[output.length - 1];
      for (let index = 0; index < input.length - 1; index += 1) {
        if (value >= input[index] && value <= input[index + 1]) {
          const progress = (value - input[index]) / (input[index + 1] - input[index]);
          return output[index] + progress * (output[index + 1] - output[index]);
        }
      }
      return output[0];
    },
    runOnJS: (fn: (...args: unknown[]) => unknown) => fn,
    useAnimatedStyle: (factory: () => unknown) => factory(),
    useReducedMotion: () => false,
    useSharedValue: (value: unknown) => ({ value }),
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
  const React = require('react');
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

jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(() => Promise.resolve()),
  ImpactFeedbackStyle: { Light: 'Light' },
}));

jest.mock('expo-blur', () => ({
  BlurView: ({ children, ...props }: any) => {
    const { View } = require('react-native');
    return <View {...props}>{children}</View>;
  },
}));

jest.mock('phosphor-react-native', () => ({
  ArrowRightIcon: () => null,
  XIcon: () => null,
}));

jest.mock('@/components/ui', () => ({
  alpha: (color: string, opacity: number) => `${color}:${opacity}`,
}));

const mockTestColors = {
  background: '#0a0a0a',
  backgroundPure: '#000000',
  backgroundElevated: '#181614',
  text: '#f5f0e8',
  textMuted: '#b9ad9e',
  textSubtle: '#8c8176',
  textHint: '#746b62',
  inputBackground: '#111111',
  inputBackgroundFocused: '#171717',
  buttonBackground: '#1c1c1c',
  buttonBackgroundPressed: '#242424',
  border: '#2c2823',
  borderFocused: '#3a342e',
  borderStrong: '#4a4037',
  glassBackground: '#181614',
  glassBorder: '#302a23',
  accent: '#c8a55c',
  contrastText: '#ffffff',
  success: '#4ade80',
  error: '#f87171',
};

jest.mock('@/lib/theme', () => ({
  useTheme: () => ({
    isDark: true,
    colors: mockTestColors,
  }),
}));

import { TodayCardStack, type TodayCardStackCard } from '../TodayCardStack';
import { buildTodayCardStackModel, orderTodayStackCards } from '@/lib/today-card-stack';
import { getTodayStackSwipeDismissal, hasTodayStackHorizontalIntent } from '@/lib/today-card-stack-motion';

function fixtureCard(overrides: Partial<TodayCardStackCard> = {}): TodayCardStackCard {
  return {
    id: 'resume-card',
    kind: 'resume',
    priority: 100,
    eyebrow: 'Resume',
    title: 'Return to today’s reading',
    body: 'Your place is saved quietly for the next faithful step.',
    actionLabel: 'Continue reading',
    accessibilityLabel: 'Resume. Return to today’s reading.',
    accessibilityHint: 'Returns to the saved devotional reading',
    ...overrides,
  };
}

function renderInAct(element: React.ReactElement) {
  let tree: any;
  act(() => {
    tree = renderer.create(element);
  });
  return tree;
}

function pressByLabel(tree: any, label: string) {
  const matches = tree.root.findAll(
    (node: any) =>
      node.props.accessibilityLabel === label &&
      node.props.accessibilityRole === 'button' &&
      typeof node.props.onPress === 'function',
  );
  expect(matches.length).toBeGreaterThan(0);
  act(() => {
    matches[0].props.onPress();
  });
}

function textContent(node: any): string {
  return node.children
    .map((child: any) => (typeof child === 'string' ? child : textContent(child)))
    .join('');
}

describe('today-card-stack helper', () => {
  it('orders cards by priority while keeping ties stable', () => {
    const ordered = orderTodayStackCards([
      fixtureCard({ id: 'low', kind: 'bridge', priority: 1 }),
      fixtureCard({ id: 'high-a', kind: 'resume', priority: 10 }),
      fixtureCard({ id: 'high-b', kind: 'midday', priority: 10 }),
      fixtureCard({ id: '', kind: 'evening', priority: 999 }),
    ]);

    expect(ordered.map((card) => card.id)).toEqual(['high-a', 'high-b', 'low']);
  });

  it('models top card, total count, and visible back card count', () => {
    const model = buildTodayCardStackModel([
      fixtureCard({ id: 'resume', kind: 'resume', priority: 90 }),
      fixtureCard({ id: 'midday', kind: 'midday', priority: 70 }),
      fixtureCard({ id: 'bridge', kind: 'bridge', priority: 40 }),
      fixtureCard({ id: 'premium', kind: 'premium-nudge', priority: 5 }),
    ]);

    expect(model.topCard?.id).toBe('resume');
    expect(model.totalCount).toBe(4);
    expect(model.backCards.map((card) => card.id)).toEqual(['midday', 'bridge']);
    expect(model.visibleBackCount).toBe(2);
  });
});

describe('today-card-stack motion helper', () => {
  it('requires clear horizontal intent before treating a drag as a stack swipe', () => {
    expect(hasTodayStackHorizontalIntent(18, 6)).toBe(true);
    expect(hasTodayStackHorizontalIntent(10, 0)).toBe(false);
    expect(hasTodayStackHorizontalIntent(24, 28)).toBe(false);
  });

  it('dismisses by distance or velocity only when reduced motion is off', () => {
    expect(getTodayStackSwipeDismissal(91, 8, 120, 320)).toEqual({ shouldDismiss: true, direction: 1 });
    expect(getTodayStackSwipeDismissal(-40, 4, -700, 320)).toEqual({ shouldDismiss: true, direction: -1 });
    expect(getTodayStackSwipeDismissal(50, 4, 120, 320)).toEqual({ shouldDismiss: false, direction: 1 });
    expect(getTodayStackSwipeDismissal(120, 4, 900, 320, true)).toEqual({ shouldDismiss: false, direction: 0 });
  });

  it('rejects vertical-scroll-looking gestures even when horizontal velocity is high', () => {
    expect(getTodayStackSwipeDismissal(22, 44, 900, 320)).toEqual({ shouldDismiss: false, direction: 0 });
  });
});

describe('TodayCardStack fixture shell', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders no surface for zero fixture cards', () => {
    const tree = renderInAct(<TodayCardStack cards={[]} colors={mockTestColors} />);

    expect(tree.toJSON()).toBeNull();
  });

  it('renders one top card without stack count or back silhouettes', () => {
    const tree = renderInAct(<TodayCardStack cards={[fixtureCard()]} colors={mockTestColors} />);

    expect(tree.root.findByProps({ testID: 'today-card-stack-top-card' })).toBeTruthy();
    expect(tree.root.findAll((node: any) => node.children?.includes('Return to today’s reading'))).toHaveLength(1);
    expect(tree.root.findAll((node: any) => node.props.testID === 'today-card-stack-count')).toHaveLength(0);
    expect(tree.root.findAll((node: any) => /^today-card-stack-back-card-/.test(node.props.testID))).toHaveLength(0);
  });

  it('renders the highest-priority fixture as top card with count and subdued back-card silhouettes', () => {
    const tree = renderInAct(
      <TodayCardStack
        colors={mockTestColors}
        cards={[
          fixtureCard({ id: 'bridge', kind: 'bridge', priority: 40, title: 'Bridge note' }),
          fixtureCard({ id: 'resume', kind: 'resume', priority: 100, title: 'Resume reading' }),
          fixtureCard({ id: 'premium', kind: 'premium-nudge', priority: 5, title: 'Premium path' }),
        ]}
      />,
    );

    expect(tree.root.findAll((node: any) => node.children?.includes('Resume reading'))).toHaveLength(1);
    expect(tree.root.findAll((node: any) => node.children?.includes('Bridge note'))).toHaveLength(0);
    expect(tree.root.findAll((node: any) => node.props.testID === 'today-card-stack-count')).toHaveLength(0);
    expect(tree.root.findByProps({ testID: 'today-card-stack' }).props.accessibilityLabel).toBe('Today card stack');
    const backCardIds = new Set(
      tree.root
        .findAll((node: any) => /^today-card-stack-back-card-/.test(node.props.testID))
        .map((node: any) => node.props.testID),
    );
    expect([...backCardIds]).toEqual(['today-card-stack-back-card-1', 'today-card-stack-back-card-2']);
  });

  it('calls the top card inline X dismissal callback without invoking the primary action', () => {
    const onPress = jest.fn();
    const onDismiss = jest.fn();
    const tree = renderInAct(
      <TodayCardStack
        colors={mockTestColors}
        cards={[
          fixtureCard({
            onPress,
            onDismiss,
            dismissAccessibilityLabel: 'Dismiss resume stack card',
          }),
        ]}
      />,
    );

    pressByLabel(tree, 'Dismiss resume stack card');

    expect(onDismiss).toHaveBeenCalledTimes(1);
    expect(onPress).not.toHaveBeenCalled();
  });

  it('wraps only dismissible, motion-enabled top cards in the swipe gesture detector', () => {
    const tree = renderInAct(
      <TodayCardStack
        colors={mockTestColors}
        cards={[fixtureCard({ onDismiss: jest.fn(), dismissAccessibilityLabel: 'Dismiss resume stack card' })]}
      />,
    );

    expect(tree.root.findAllByProps({ testID: 'today-card-stack-gesture-detector' }).length).toBeGreaterThan(0);
  });

  it('keeps reduced-motion previews free of enter/exit animation props, swipe wrapper, and offset transforms', () => {
    const tree = renderInAct(
      <TodayCardStack
        colors={mockTestColors}
        reducedMotionOverride
        cards={[
          fixtureCard({ id: 'resume', kind: 'resume', priority: 100 }),
          fixtureCard({ id: 'midday', kind: 'midday', priority: 80 }),
        ]}
      />,
    );

    const stack = tree.root.findByProps({ testID: 'today-card-stack' });
    expect(stack.props.entering).toBeUndefined();
    expect(stack.props.exiting).toBeUndefined();
    expect(tree.root.findAllByProps({ testID: 'today-card-stack-gesture-detector' })).toHaveLength(0);

    const backCard = tree.root.findByProps({ testID: 'today-card-stack-back-card-1' });
    expect(backCard.props.style).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          transform: [{ translateY: 0 }, { scale: 1 }],
        }),
      ]),
    );
  });

  it('renders card-local action buttons without requiring a parent card press', () => {
    const primary = jest.fn();
    const secondary = jest.fn();
    const tree = renderInAct(
      <TodayCardStack
        colors={mockTestColors}
        cards={[
          fixtureCard({
            id: 'day1-review',
            kind: 'day1-review',
            priority: 70,
            title: 'Did today’s reading feel personal?',
            actionLabel: undefined,
            onPress: undefined,
            actions: [
              {
                label: 'This helped me',
                onPress: primary,
                accessibilityLabel: 'This reading helped me',
                tone: 'primary',
              },
              {
                label: 'Still settling',
                onPress: secondary,
                accessibilityLabel: 'This reading was still settling',
                tone: 'secondary',
              },
            ],
          }),
        ]}
      />,
    );

    pressByLabel(tree, 'This reading helped me');
    pressByLabel(tree, 'This reading was still settling');

    expect(primary).toHaveBeenCalledTimes(1);
    expect(secondary).toHaveBeenCalledTimes(1);
  });

  it('does not place the inline X inside the card body pressable', () => {
    const sourcePath = path.join(__dirname, '..', 'TodayCardStack.tsx');
    const source = fs.readFileSync(sourcePath, 'utf8');
    const bodyStart = source.indexOf('function TopCardBody');
    const bodyEnd = source.indexOf('function commitSwipeDismiss');
    const bodySource = source.slice(bodyStart, bodyEnd);

    expect(bodySource).toContain('<TouchableOpacity');
    expect(bodySource).not.toContain('StackDismissButton');
    expect(source).toMatch(/<TopCardBody\s+card=\{topCard\}\s+colors=\{colors\}\s*\/>\s*<StackDismissButton\s+card=\{topCard\}\s+colors=\{colors\}\s*\/>/);
  });

  it('keeps the stack generic while owning only the shared swipe gesture shell', () => {
    const sourcePath = path.join(__dirname, '..', 'TodayCardStack.tsx');
    const source = fs.readFileSync(sourcePath, 'utf8');

    expect(source).not.toMatch(/ContextSlot|NotificationCard|DailyBridgeCard|RememberThisCard|PremiumNudgeCard|useUnfoldStore/);
    expect(source).toMatch(/GestureDetector|Gesture\.Pan/);
    expect(source).not.toMatch(/PanGestureHandler|Swipeable/);
  });
});
