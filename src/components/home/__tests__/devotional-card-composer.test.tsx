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
  const { View, Text } = require('react-native');
  return {
    __esModule: true,
    default: { View, Text },
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
    interpolateColor: (_value: number, _input: number[], output: string[]) => output[output.length - 1],
    runOnJS: (fn: (...args: unknown[]) => unknown) => fn,
    useAnimatedStyle: (factory: () => unknown) => factory(),
    useReducedMotion: () => false,
    useSharedValue: (value: unknown) => ({ value }),
    withDelay: (_delay: unknown, value: unknown) => value,
    withRepeat: (value: unknown) => value,
    cancelAnimation: jest.fn(),
    withTiming: (value: unknown, _config?: unknown, callback?: (finished: boolean) => void) => {
      callback?.(true);
      return value;
    },
    Easing: {
      cubic: jest.fn(),
      bezier: jest.fn(() => 'ease-bezier'),
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

jest.mock('phosphor-react-native', () => ({
  CheckIcon: () => null,
  PlusIcon: () => null,
}));

jest.mock('expo-router', () => ({
  useFocusEffect: (callback: () => void | (() => void)) => {
    const ReactActual = require('react');
    ReactActual.useEffect(callback, []);
  },
}));

// Cuts off the whole empty/journey-complete subtree (store, api-config,
// qa-tools, expo-haptics, expo-router's useRouter) — none of that is exercised
// by the unread/complete-today/tomorrow-locked states under test here.
jest.mock('../RecommendedSeriesCard', () => ({
  RecommendedSeriesCard: () => null,
}));

jest.mock('@/components/ui', () => ({
  alpha: (color: string, opacity: number) => `${color}:${opacity}`,
}));

const mockTestColors = {
  background: '#0a0a0a',
  backgroundElevated: '#181614',
  text: '#f5f0e8',
  textMuted: '#b9ad9e',
  textSubtle: '#8c8176',
  inputBackground: '#111111',
  border: '#2c2823',
  accent: '#c8a55c',
};

jest.mock('@/lib/theme', () => ({
  useTheme: () => ({
    isDark: true,
    colors: mockTestColors,
  }),
}));

jest.mock('@/hooks/useAccessibility', () => ({
  useAccessibleAnimation: () => ({
    reducedMotion: false,
    entering: (anim: any) => anim,
    exiting: (anim: any) => anim,
  }),
}));

import { DevotionalCard } from '../DevotionalCard';
import type { DevotionalCardState } from '../compute-devotional-state';
import type { DevotionalDay } from '@/lib/store';

// ─── Fixtures ───────────────────────────────────────────────────

const noop = () => {};

function makeDayData(overrides: Partial<DevotionalDay> = {}): DevotionalDay {
  return {
    dayNumber: 3,
    title: 'Walking by Faith',
    scriptureReference: 'Hebrews 11:1',
    scriptureText: 'Now faith is the substance of things hoped for...',
    bodyText: 'Today we explore what it means to walk by faith.',
    quotableLine: 'Faith is not the absence of doubt.',
    isRead: true,
    ...overrides,
  };
}

function makeCompleteTodayState(
  overrides: Partial<Extract<DevotionalCardState, { type: 'complete-today' }>> = {},
): Extract<DevotionalCardState, { type: 'complete-today' }> {
  return {
    type: 'complete-today',
    dayData: makeDayData(),
    dayLabel: 'Today',
    seriesTitle: 'Faith Foundations',
    progress: 28.6,
    daysCompleted: 3,
    totalDays: 7,
    onContinue: noop,
    onReflect: noop,
    onCreateNew: noop,
    reflectionStatus: 'empty',
    freeWriteDraft: '',
    onSaveFreeWrite: noop,
    ...overrides,
  };
}

function makeTomorrowLockedState(
  overrides: Partial<Extract<DevotionalCardState, { type: 'tomorrow-locked' }>> = {},
): Extract<DevotionalCardState, { type: 'tomorrow-locked' }> {
  return {
    type: 'tomorrow-locked',
    dayData: makeDayData({ dayNumber: 4, isRead: false }),
    dayLabel: 'Tomorrow',
    seriesTitle: 'Faith Foundations',
    progress: 42.9,
    daysCompleted: 3,
    totalDays: 7,
    tomorrowTeaser: null,
    onContinue: noop,
    onReflect: noop,
    onCreateNew: noop,
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

function findByLabel(tree: any, label: string) {
  return tree.root.findAll(
    (node: any) => node.props.accessibilityLabel === label && typeof node.props.onPress === 'function',
  );
}

// ─── Tests ──────────────────────────────────────────────────────

describe('DevotionalCard composer integration', () => {
  it('renders the inline composer (not the CTA pill) when reflectionStatus is empty, prefilled with the draft', () => {
    const state = makeCompleteTodayState({ reflectionStatus: 'empty', freeWriteDraft: 'A quiet start.' });
    const tree = renderInAct(<DevotionalCard state={state} />);

    const composer = tree.root.findByProps({ testID: 'home-reflect-composer' });
    expect(composer).toBeTruthy();
    expect(composer.props.value).toBe('A quiet start.');
    expect(tree.root.findAll((node: any) => node.props.testID === 'home-devotional-cta')).toHaveLength(0);
  });

  it('renders the CTA pill with Read Again (not the composer) when reflectionStatus is complete', () => {
    const state = makeCompleteTodayState({ reflectionStatus: 'complete', freeWriteDraft: 'Finished thoughts.' });
    const tree = renderInAct(<DevotionalCard state={state} />);

    const cta = tree.root.findByProps({ testID: 'home-devotional-cta' });
    expect(cta).toBeTruthy();
    expect(
      tree.root.findAll(
        (node: any) => node.type === 'Text' && node.children?.includes('Read Again'),
      ).length,
    ).toBeGreaterThan(0);
    expect(tree.root.findAll((node: any) => node.props.testID === 'home-reflect-composer')).toHaveLength(0);
  });

  it('shows "Finish your reflection" link text when reflectionStatus is started', () => {
    const state = makeCompleteTodayState({ reflectionStatus: 'started', freeWriteDraft: 'Halfway there.' });
    const tree = renderInAct(<DevotionalCard state={state} />);

    expect(tree.root.findByProps({ testID: 'home-reflect-composer' })).toBeTruthy();
    expect(
      tree.root.findAll(
        (node: any) => node.type === 'Text' && textContent(node).includes('Finish your reflection'),
      ).length,
    ).toBeGreaterThan(0);
  });

  it('renders the "Reflect on today\'s reading" link for tomorrow-locked and calls onReflect with Math.max(1, daysCompleted)', () => {
    const onReflect = jest.fn();
    const state = makeTomorrowLockedState({ daysCompleted: 5, onReflect });
    const tree = renderInAct(<DevotionalCard state={state} />);

    const matches = findByLabel(tree, "Reflect on today's reading");
    expect(matches.length).toBeGreaterThan(0);

    act(() => {
      matches[0].props.onPress();
    });

    expect(onReflect).toHaveBeenCalledWith(5);
  });

  it('renders the reflect link with daysCompleted=0 clamped to 1 via Math.max(1, daysCompleted)', () => {
    const onReflect = jest.fn();
    const state = makeTomorrowLockedState({ daysCompleted: 0, onReflect });
    const tree = renderInAct(<DevotionalCard state={state} />);

    const matches = findByLabel(tree, "Reflect on today's reading");
    act(() => {
      matches[0].props.onPress();
    });

    expect(onReflect).toHaveBeenCalledWith(1);
  });

  it('autosaves the typed draft after the debounce/maxWait window elapses', () => {
    jest.useFakeTimers();
    const onSaveFreeWrite = jest.fn();
    const state = makeCompleteTodayState({
      reflectionStatus: 'empty',
      freeWriteDraft: '',
      onSaveFreeWrite,
      dayData: makeDayData({ dayNumber: 3 }),
    });
    const tree = renderInAct(<DevotionalCard state={state} />);

    const composer = tree.root.findByProps({ testID: 'home-reflect-composer' });
    act(() => {
      composer.props.onChangeText('What stayed with me today.');
    });

    act(() => {
      jest.advanceTimersByTime(2100);
    });

    expect(onSaveFreeWrite).toHaveBeenCalledWith(3, 'What stayed with me today.');

    jest.useRealTimers();
  });
});

function textContent(node: any): string {
  return node.children
    .map((child: any) => (typeof child === 'string' ? child : textContent(child)))
    .join('');
}
