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
    Extrapolation: { CLAMP: 'clamp' },
    FadeIn: animationChain,
    FadeOut: animationChain,
    interpolate: (value: number, input: number[], output: number[]) => {
      if (value <= input[0]) return output[0];
      if (value >= input[input.length - 1]) return output[output.length - 1];
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
  const ReactLib = require('react');
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

jest.mock('expo-linear-gradient', () => ({
  LinearGradient: ({ children, ...props }: any) => {
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
import { highlightInk, highlighterFlatBand } from '@/constants/bible-highlight-colors';

function rememberThisCard(overrides: Partial<TodayCardStackCard> = {}): TodayCardStackCard {
  return {
    id: 'today-stack-remember-this-1',
    kind: 'remember-this',
    priority: 80,
    eyebrow: 'Saved echo',
    title: 'A line worth carrying',
    bodyQuote: { text: 'Be still and know', color: 'yellow' },
    body: 'Psalm 46:10 · Day 4',
    bodyNumberOfLines: 3,
    accessibilityLabel: 'Saved highlight from Psalm 46:10: Be still and know',
    ...overrides,
  };
}

function flattenStyles(style: unknown): Record<string, unknown>[] {
  if (!style) return [];
  if (Array.isArray(style)) return style.flatMap(flattenStyles);
  if (typeof style === 'object') return [style as Record<string, unknown>];
  return [];
}

function renderInAct(element: React.ReactElement) {
  let tree: any;
  act(() => {
    tree = renderer.create(element);
  });
  return tree;
}

describe('TodayCardStack quote stroke', () => {
  it('paints one felt-tip stroke per laid-out quote line instead of a flat band', () => {
    const tree = renderInAct(
      <TodayCardStack colors={mockTestColors} cards={[rememberThisCard()]} />,
    );

    const quoteText = tree.root.find((node: any) => typeof node.props.onTextLayout === 'function');
    act(() => {
      quoteText.props.onTextLayout({
        nativeEvent: {
          lines: [
            { x: 0, y: 0, width: 200, height: 24 },
            { x: 0, y: 24, width: 120, height: 24 },
          ],
        },
      });
    });

    expect(tree.root.findAll((node: any) => typeof node.type === 'string' && node.props.testID === 'today-quote-stroke-line')).toHaveLength(2);

    const oldBand = highlighterFlatBand(highlightInk('yellow', true));
    const banded = tree.root.findAll((node: any) =>
      flattenStyles(node.props.style).some((entry) => entry.backgroundColor === oldBand),
    );
    expect(banded).toHaveLength(0);
  });
});
