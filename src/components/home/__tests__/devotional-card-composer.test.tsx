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

// The tomorrow-locked composer reads the completed day's journal entry from
// the store itself (the Today screen keys its reflect props on tomorrow's day).
type MockStoreState = {
  journalEntries: JournalEntry[];
  getJournalEntry: (devotionalId: string, dayNumber: number) => JournalEntry | undefined;
};
const mockStoreState: MockStoreState = {
  journalEntries: [],
  getJournalEntry: (devotionalId, dayNumber) =>
    mockStoreState.journalEntries.find((entry) => entry.devotionalId === devotionalId && entry.dayNumber === dayNumber),
};

jest.mock('@/lib/store', () => ({
  useUnfoldStore: (selector: (state: typeof mockStoreState) => unknown) => selector(mockStoreState),
}));

import { DevotionalCard } from '../DevotionalCard';
import type { DevotionalCardState } from '../compute-devotional-state';
import type { DevotionalDay, JournalEntry } from '@/lib/store';

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
    devotionalId: 'dev-1',
    dayData: makeDayData({ dayNumber: 4, isRead: false }),
    dayLabel: 'Tomorrow',
    seriesTitle: 'Faith Foundations',
    progress: 42.9,
    daysCompleted: 3,
    totalDays: 7,
    tomorrowTeaser: null,
    completedDayData: null,
    onContinue: noop,
    onReflect: noop,
    onCreateNew: noop,
    onSaveFreeWrite: noop,
    ...overrides,
  };
}

function makeJournalEntry(overrides: Partial<JournalEntry> = {}): JournalEntry {
  return {
    id: 'dev-1:1',
    devotionalId: 'dev-1',
    dayNumber: 1,
    content: '',
    createdAt: '2026-09-04T09:00:00Z',
    updatedAt: '2026-09-04T09:00:00Z',
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
  beforeEach(() => {
    mockStoreState.journalEntries = [];
  });

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

  // ─── Day 1 of a multi-day series, finished today (Jordan, item 10) ────

  it('renders the composer for tomorrow-locked when a day was completed today, and saves to that day', () => {
    jest.useFakeTimers();
    const onSaveFreeWrite = jest.fn();
    const onReflect = jest.fn();
    const onContinue = jest.fn();
    const state = makeTomorrowLockedState({
      dayData: makeDayData({ dayNumber: 2, isRead: false }),
      daysCompleted: 1,
      totalDays: 7,
      completedDayData: makeDayData({ dayNumber: 1, isRead: true, readAt: '2026-09-04T08:00:00Z' }),
      onSaveFreeWrite,
      onReflect,
      onContinue,
    });
    const tree = renderInAct(<DevotionalCard state={state} />);

    const composer = tree.root.findByProps({ testID: 'home-reflect-composer' });
    expect(composer.props.value).toBe('');
    expect(tree.root.findAll((node: any) => node.props.testID === 'home-devotional-cta')).toHaveLength(0);
    expect(findByLabel(tree, "Reflect on today's reading")).toHaveLength(0);

    act(() => {
      composer.props.onChangeText('Day one stayed with me.');
    });
    act(() => {
      jest.advanceTimersByTime(2100);
    });
    expect(onSaveFreeWrite).toHaveBeenCalledWith(1, 'Day one stayed with me.');

    act(() => {
      findByLabel(tree, 'Open full reflection')[0].props.onPress();
    });
    expect(onReflect).toHaveBeenCalledWith(1);

    act(() => {
      findByLabel(tree, "Read today's devotional again")[0].props.onPress();
    });
    expect(onContinue).toHaveBeenCalledWith(1);

    jest.useRealTimers();
  });

  it("prefills the tomorrow-locked composer from the completed day's journal entry, not tomorrow's", () => {
    mockStoreState.journalEntries = [
      makeJournalEntry({ dayNumber: 1, content: 'Written after day one.' }),
      makeJournalEntry({ id: 'dev-1:2', dayNumber: 2, content: 'Stray entry on tomorrow.' }),
    ];
    const state = makeTomorrowLockedState({
      dayData: makeDayData({ dayNumber: 2, isRead: false }),
      daysCompleted: 1,
      completedDayData: makeDayData({ dayNumber: 1, isRead: true, readAt: '2026-09-04T08:00:00Z' }),
    });
    const tree = renderInAct(<DevotionalCard state={state} />);

    const composer = tree.root.findByProps({ testID: 'home-reflect-composer' });
    expect(composer.props.value).toBe('Written after day one.');
    expect(findByLabel(tree, 'Finish your reflection').length).toBeGreaterThan(0);
  });

  it("hides the tomorrow-locked composer once the completed day's reflection is complete", () => {
    mockStoreState.journalEntries = [
      makeJournalEntry({
        dayNumber: 1,
        content: 'Done.',
        questionResponses: [
          { question: 'Q1', response: 'A1' },
          { question: 'Q2', response: 'A2' },
        ],
      }),
    ];
    const onReflect = jest.fn();
    const state = makeTomorrowLockedState({
      dayData: makeDayData({ dayNumber: 2, isRead: false }),
      daysCompleted: 1,
      completedDayData: makeDayData({
        dayNumber: 1,
        isRead: true,
        readAt: '2026-09-04T08:00:00Z',
        reflectionQuestions: ['Q1', 'Q2'],
      }),
      onReflect,
    });
    const tree = renderInAct(<DevotionalCard state={state} />);

    expect(tree.root.findAll((node: any) => node.props.testID === 'home-reflect-composer')).toHaveLength(0);
    expect(tree.root.findByProps({ testID: 'home-devotional-cta' })).toBeTruthy();
    const reflectLinks = findByLabel(tree, "Reflect on today's reading");
    expect(reflectLinks.length).toBeGreaterThan(0);
    act(() => {
      reflectLinks[0].props.onPress();
    });
    expect(onReflect).toHaveBeenCalledWith(1);
  });

  it('keeps the CTA pill and reflect link when tomorrow-locked carries no completed day', () => {
    const state = makeTomorrowLockedState({ completedDayData: null, daysCompleted: 3 });
    const tree = renderInAct(<DevotionalCard state={state} />);

    expect(tree.root.findAll((node: any) => node.props.testID === 'home-reflect-composer')).toHaveLength(0);
    expect(tree.root.findByProps({ testID: 'home-devotional-cta' })).toBeTruthy();
    expect(findByLabel(tree, "Reflect on today's reading").length).toBeGreaterThan(0);
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

describe('DevotionalCard pending-initial-resume', () => {
  it('offers Continue without forcing another navigation', () => {
    const onResume = jest.fn();
    const tree = renderInAct(
      <DevotionalCard
        state={{ type: 'pending-initial-resume', onResume }}
      />,
    );

    expect(tree.root.findByProps({ testID: 'home-pending-initial-resume' })).toBeTruthy();
    act(() => {
      findByLabel(tree, 'Continue')[0].props.onPress();
    });
    expect(onResume).toHaveBeenCalledTimes(1);
  });

  it('keeps a readable series visible and offers a nonblocking resume', () => {
    const onResume = jest.fn();
    const tree = renderInAct(
      <DevotionalCard
        state={{
          type: 'unread',
          dayData: makeDayData(),
          dayLabel: 'Today',
          seriesTitle: 'Faith Foundations',
          progress: 0,
          daysCompleted: 0,
          totalDays: 7,
          onContinue: noop,
          onCreateNew: noop,
          ctaText: 'Begin Your Journey',
        }}
        nonblockingResume={{ onResume }}
      />,
    );

    expect(tree.root.findByProps({ testID: 'home-pending-initial-resume-inline' })).toBeTruthy();
    expect(tree.root.findAll((node: { props?: { testID?: string } }) => (
      node.props?.testID === 'home-pending-initial-resume'
    ))).toHaveLength(0);
    act(() => {
      tree.root.findByProps({ testID: 'home-pending-initial-resume-inline' }).props.onPress();
    });
    expect(onResume).toHaveBeenCalledTimes(1);
  });
});

describe('DevotionalCard first-series-failed', () => {
  it('shows the failure copy and routes Try again / Not now to the state callbacks', () => {
    const onTryAgain = jest.fn();
    const onDismiss = jest.fn();
    const tree = renderInAct(
      <DevotionalCard
        state={{ type: 'first-series-failed', message: 'We couldn’t reach the writing service.', onTryAgain, onDismiss }}
      />,
    );

    expect(tree.root.findByProps({ testID: 'home-first-series-failed' })).toBeTruthy();
    expect(
      tree.root.findAll(
        (node: any) => node.type === 'Text' && textContent(node).includes('We couldn’t reach the writing service.'),
      ).length,
    ).toBeGreaterThan(0);

    act(() => {
      findByLabel(tree, 'Try again')[0].props.onPress();
    });
    expect(onTryAgain).toHaveBeenCalledTimes(1);

    act(() => {
      findByLabel(tree, 'Not now')[0].props.onPress();
    });
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });
});

describe('DevotionalCard daily recovery', () => {
  const baseState: Extract<DevotionalCardState, { type: 'preparing' }> = {
    type: 'preparing',
    progress: 0,
    seriesTitle: 'Faith Foundations',
    dayNumber: 2,
    onCreateNew: noop,
  };

  it('shows a safe failed-job message and routes Try Again to the job retry', () => {
    const onRetry = jest.fn(async () => undefined);
    const tree = renderInAct(
      <DevotionalCard
        state={{
          ...baseState,
          recovery: {
            status: 'failed',
            jobId: 'job-1',
            canRetry: true,
            failureKind: 'job',
            onCheckAgain: jest.fn(async () => undefined),
            onRetry,
          },
        }}
      />,
    );

    expect(tree.root.findAll((node: any) => textContent(node).includes('Your series is safe.')).length).toBeGreaterThan(0);
    act(() => findByLabel(tree, 'Try Again')[0].props.onPress());
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('offers Check Again without retry copy when the server exhausted retries', () => {
    const tree = renderInAct(
      <DevotionalCard
        state={{
          ...baseState,
          recovery: {
            status: 'failed',
            jobId: 'job-1',
            canRetry: false,
            failureKind: 'job',
            onCheckAgain: jest.fn(async () => undefined),
            onRetry: jest.fn(async () => undefined),
          },
        }}
      />,
    );

    expect(findByLabel(tree, 'Check Again').length).toBeGreaterThan(0);
    expect(tree.root.findAll((node: any) => textContent(node).includes('Try this reading again'))).toHaveLength(0);
  });

  it('keeps Check Again visible with disabled and busy feedback while checking', () => {
    const tree = renderInAct(
      <DevotionalCard
        state={{
          ...baseState,
          recovery: {
            status: 'checking',
            operation: 'discover',
            onCheckAgain: jest.fn(async () => undefined),
            onRetry: jest.fn(async () => undefined),
          },
        }}
      />,
    );

    const button = findByLabel(tree, 'Checking...')[0];
    expect(button.props.disabled).toBe(true);
    expect(button.props.accessibilityState).toEqual({ disabled: true, busy: true });
    expect(tree.root.findAllByType(require('react-native').ActivityIndicator)).toHaveLength(1);
    expect(tree.root.findAll((node: any) => textContent(node).includes('Looking for Day 2.')).length).toBeGreaterThan(0);
  });

  it('labels an active job as preparing without claiming it is almost ready', () => {
    const tree = renderInAct(
      <DevotionalCard
        state={{
          ...baseState,
          recovery: {
            status: 'running',
            jobId: 'job-1',
            onCheckAgain: jest.fn(async () => undefined),
            onRetry: jest.fn(async () => undefined),
          },
        }}
      />,
    );

    expect(tree.root.findAll((node: any) => textContent(node).includes('Preparing Day 2.')).length).toBeGreaterThan(0);
    expect(tree.root.findAll((node: any) => textContent(node).includes('almost ready')).length).toBe(0);
  });

  it.each([
    {
      recovery: { status: 'blocked' as const, reason: 'day-not-ready' as const },
      title: 'Day 2 isn’t available yet.',
    },
    {
      recovery: { status: 'service-error' as const },
      title: 'We couldn’t check Day 2.',
    },
  ])('shows $title as a server response with a check-again action', ({ recovery, title }) => {
    const tree = renderInAct(
      <DevotionalCard
        state={{
          ...baseState,
          recovery: {
            ...recovery,
            onCheckAgain: jest.fn(async () => undefined),
            onRetry: jest.fn(async () => undefined),
          },
        }}
      />,
    );

    expect(tree.root.findAll((node: any) => textContent(node).includes(title)).length).toBeGreaterThan(0);
    expect(tree.root.findAll((node: any) => textContent(node).includes('lost connection'))).toHaveLength(0);
    expect(findByLabel(tree, 'Check Again').length).toBeGreaterThan(0);
  });
});

function textContent(node: any): string {
  return node.children
    .map((child: any) => (typeof child === 'string' ? child : textContent(child)))
    .join('');
}
