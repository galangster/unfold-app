/**
 * Weekly chapters on Today (spec r2 rows 8-16, APP-1). A chaptered series
 * frames the day by its week; a legacy series renders exactly as before (R6).
 */
/* eslint-disable @typescript-eslint/no-require-imports, import/first */
import React from 'react';
import { render, type RenderResult } from '@testing-library/react-native';

jest.mock('react-native-reanimated', () => {
  const { View, Text } = require('react-native');
  const chain: Record<string, unknown> = {};
  chain.duration = () => chain;
  chain.delay = () => chain;
  chain.easing = () => chain;
  return {
    __esModule: true,
    default: { View, Text, createAnimatedComponent: (component: unknown) => component },
    Extrapolation: { CLAMP: 'clamp' },
    FadeIn: chain,
    FadeOut: chain,
    interpolate: (_value: number, _input: number[], output: number[]) => output[output.length - 1],
    interpolateColor: (_value: number, _input: number[], output: string[]) => output[output.length - 1],
    runOnJS: (fn: (...args: unknown[]) => unknown) => fn,
    useAnimatedProps: (factory: () => unknown) => factory(),
    useAnimatedStyle: (factory: () => unknown) => factory(),
    useReducedMotion: () => true,
    useSharedValue: (value: unknown) => require('react').useRef({ value }).current,
    withDelay: (_delay: unknown, value: unknown) => value,
    withRepeat: (value: unknown) => value,
    cancelAnimation: jest.fn(),
    withTiming: (value: unknown) => value,
    Easing: { cubic: jest.fn(), bezier: jest.fn(), out: jest.fn(), in: jest.fn(), inOut: jest.fn() },
  };
});
jest.mock('react-native-svg', () => {
  const ReactLib = require('react');
  const { View } = require('react-native');
  const Stub = (props: { children?: React.ReactNode }) => ReactLib.createElement(View, null, props.children);
  return { __esModule: true, default: Stub, Path: Stub };
});
jest.mock('expo-blur', () => ({ BlurView: () => null }));
jest.mock('phosphor-react-native', () => ({ CheckIcon: () => null, PlusIcon: () => null }));
jest.mock('expo-router', () => ({
  useFocusEffect: (callback: () => void | (() => void)) => {
    require('react').useEffect(callback, []);
  },
}));
jest.mock('../RecommendedSeriesCard', () => ({ RecommendedSeriesCard: () => null }));
jest.mock('@/components/ui', () => ({ alpha: (color: string, opacity: number) => `${color}:${opacity}` }));
jest.mock('@/lib/theme', () => ({
  useTheme: () => ({
    isDark: true,
    colors: {
      background: '#0a0a0a', backgroundElevated: '#181614', text: '#f5f0e8', textMuted: '#b9ad9e',
      textSubtle: '#8c8176', inputBackground: '#111111', border: '#2c2823', accent: '#c8a55c',
    },
  }),
}));
jest.mock('@/hooks/useAppForegrounded', () => ({ useAppForegrounded: () => true }));
jest.mock('@/hooks/useAccessibility', () => ({
  useAccessibleAnimation: () => ({ reducedMotion: true, entering: (a: unknown) => a, exiting: (a: unknown) => a }),
}));
jest.mock('@/lib/store', () => ({
  useUnfoldStore: (selector: (state: { journalEntries: never[]; getJournalEntry: () => undefined }) => unknown) =>
    selector({ journalEntries: [], getJournalEntry: () => undefined }),
}));

import { DevotionalCard } from '../DevotionalCard';
import { computeDevotionalState, type ComputeInput, type DevotionalCardState } from '../compute-devotional-state';
import type { Devotional, DevotionalDay } from '@/lib/store';
import { readSeriesWeeks } from '@/lib/series-weeks';
import { makeChapteredArc } from '@/lib/__tests__/fixtures/chaptered-arc';

const noop = () => {};
const SERIES = 'Synthetic Series';
const WEEKS = readSeriesWeeks(makeChapteredArc(['planned', 'planned', 'outline', 'outline']))!;
const UNPLANNED_WEEKS = readSeriesWeeks(makeChapteredArc(['planned', 'outline', 'outline', 'outline']))!;

function day(dayNumber: number, overrides: Partial<DevotionalDay> = {}): DevotionalDay {
  return {
    dayNumber,
    title: `Synthetic Day ${dayNumber}`,
    scriptureReference: 'Psalm 1:1',
    scriptureText: 'Synthetic scripture.',
    bodyText: 'Synthetic body.',
    quotableLine: 'A synthetic line.',
    isRead: false,
    isRevealed: true,
    ...overrides,
  };
}

const common = { seriesTitle: SERIES, progress: 32, daysCompleted: 9, totalDays: 28, onContinue: noop, onCreateNew: noop };

function unread(weeks: typeof WEEKS | null = WEEKS): DevotionalCardState {
  return { type: 'unread', dayData: day(10), dayLabel: 'Today', ctaText: 'Continue Reading', ...common, ...(weeks ? { weeks } : {}) };
}

function completeToday(weeks: typeof WEEKS | null = WEEKS): DevotionalCardState {
  return {
    type: 'complete-today', dayData: day(10, { isRead: true }), dayLabel: 'Today', ...common,
    onReflect: noop, reflectionStatus: 'complete', freeWriteDraft: '', onSaveFreeWrite: noop,
    ...(weeks ? { weeks } : {}),
  };
}

function tomorrowLocked(weeks: typeof WEEKS | null = WEEKS): DevotionalCardState {
  return {
    type: 'tomorrow-locked', devotionalId: 'dev-synthetic', dayData: day(8), dayLabel: 'Tomorrow', ...common,
    daysCompleted: 7, tomorrowTeaser: null, completedDayData: day(7, { isRead: true }),
    onReflect: noop, onSaveFreeWrite: noop, ...(weeks ? { weeks } : {}),
  };
}

function revealReady(weeks: typeof WEEKS | null = WEEKS): DevotionalCardState {
  return {
    type: 'reveal-ready', dayData: day(10, { isRevealed: false }), dayLabel: 'Today', seriesTitle: SERIES,
    dayNumber: 10, totalDays: 28, onReveal: noop, ...(weeks ? { weeks } : {}),
  };
}

/** Every rendered string and prop, labels included. */
function allText(screen: RenderResult): string {
  return JSON.stringify(screen.toJSON());
}

describe('Today meta line (rows 8-12)', () => {
  it('frames an unread day by its week', () => {
    const screen = render(<DevotionalCard state={unread()} />);
    expect(screen.getByText('Today · Week 2 · Day 3 of 7')).toBeTruthy();
    expect(screen.queryByText(/Day 10 of 28/)).toBeNull();
  });

  it('frames a reveal-ready day by its week', () => {
    const screen = render(<DevotionalCard state={revealReady()} />);
    expect(screen.getByText('Ready to reveal · Week 2 · Day 3 of 7')).toBeTruthy();
    expect(screen.getByLabelText(`Reveal ${SERIES}, Week 2, day 3 of 7`)).toBeTruthy();
  });

  it('frames a completed day by its week, spoken without the separator', () => {
    const screen = render(<DevotionalCard state={completeToday()} />);
    expect(screen.getByText('Completed')).toBeTruthy();
    expect(screen.getByText('Week 2 · Day 3 of 7')).toBeTruthy();
    expect(screen.getByLabelText('Completed. Week 2, day 3 of 7')).toBeTruthy();
  });

  it('frames tomorrow by tomorrow\'s week', () => {
    const screen = render(<DevotionalCard state={tomorrowLocked()} />);
    expect(screen.getByText('Tomorrow · Week 2 · Day 1 of 7')).toBeTruthy();
  });

  it('never caps the week line with a line limit (row 16)', () => {
    const screen = render(<DevotionalCard state={revealReady()} />);
    expect(screen.getByText('Ready to reveal · Week 2 · Day 3 of 7').props.numberOfLines).toBeUndefined();
  });
});

describe('Today caption (row 13, Ruled 2 and 6)', () => {
  it('shows the week name once the week is planned', () => {
    const screen = render(<DevotionalCard state={unread()} />);
    expect(screen.getByText('Synthetic Week Two')).toBeTruthy();
    expect(screen.queryByText(SERIES)).toBeNull();
  });

  it('shows the series title while the week is not planned', () => {
    const screen = render(<DevotionalCard state={unread(UNPLANNED_WEEKS)} />);
    expect(screen.getByText(SERIES)).toBeTruthy();
    expect(screen.queryByText('Synthetic Week Two')).toBeNull();
  });
});

describe('Today progress and VoiceOver (rows 14 and 15)', () => {
  it('keeps series progress text and adds the week to the bar label', () => {
    const screen = render(<DevotionalCard state={unread()} />);
    expect(screen.getByText('9 of 28 completed')).toBeTruthy();
    expect(screen.getByTestId('devotional-progress-bar').props.accessibilityLabel).toBe('9 of 28 days complete. Week 2 of 4.');
  });

  it('reads the card as "Week 2, day 3 of 7"', () => {
    const screen = render(<DevotionalCard state={unread()} />);
    expect(screen.getByLabelText(`Continue Reading. ${SERIES}, Week 2, day 3 of 7.`)).toBeTruthy();
  });

  it('never shows reader-facing "chapter" (R3)', () => {
    for (const state of [unread(), completeToday(), tomorrowLocked(), revealReady()]) {
      expect(allText(render(<DevotionalCard state={state} />))).not.toMatch(/chapter/i);
    }
  });
});

describe('legacy series (R6)', () => {
  it('keeps "Day N of 28" and no bar label when the arc has no weeks', () => {
    const screen = render(<DevotionalCard state={unread(null)} />);
    expect(screen.getByText('Today · Day 10 of 28')).toBeTruthy();
    expect(screen.getByText(SERIES)).toBeTruthy();
    expect(screen.getByTestId('devotional-progress-bar').props.accessibilityLabel).toBeUndefined();
    expect(screen.getByLabelText(`Continue Reading. ${SERIES}, day 10 of 28.`)).toBeTruthy();
    expect(render(<DevotionalCard state={revealReady(null)} />).getByText('Ready to reveal · Day 10 of 28')).toBeTruthy();
    expect(render(<DevotionalCard state={completeToday(null)} />).getByLabelText('Completed. Day 10 of 28')).toBeTruthy();
    expect(render(<DevotionalCard state={tomorrowLocked(null)} />).getByText('Tomorrow · Day 8 of 28')).toBeTruthy();
  });
});

describe('paused series (row 12)', () => {
  it('keeps the paused line and its day count unchanged', () => {
    const screen = render(<DevotionalCard state={{
      type: 'premium-paused', seriesTitle: SERIES, daysCompleted: 9, totalDays: 28, onOpenBible: noop, onRenewPremium: noop,
    }} />);
    expect(screen.getByText(`${SERIES} · Paused`)).toBeTruthy();
    expect(screen.getByText('9 of 28 days complete')).toBeTruthy();
  });
});

describe('computeDevotionalState carries the weeks', () => {
  function devotional(arc: Devotional['seriesArc']): Devotional {
    return {
      id: 'dev-synthetic', title: SERIES, totalDays: 28, currentDay: 10, days: [day(10)],
      createdAt: '2026-10-20T00:00:00Z', generationMode: 'progressive', seriesArc: arc,
      userContext: { name: 'Synthetic', aboutMe: '', currentSituation: '', emotionalState: '' },
    };
  }
  const input = (arc: Devotional['seriesArc']): ComputeInput => ({
    currentDevotional: devotional(arc), currentDayData: day(10), hasReadToday: false, dayLabel: 'Today',
    isJourneyComplete: false, isPreparing: false, premiumPolicy: 'granted', daysCompleted: 9, totalDays: 28,
    progress: 32, tomorrowTeaser: null, onContinue: noop, onCreateNew: noop, onOpenBible: noop,
    onRenewPremium: noop, onReveal: noop, ctaText: 'Continue Reading',
  });

  it('attaches the weeks for a chaptered arc and leaves a legacy state as it was', () => {
    const chaptered = computeDevotionalState(input(makeChapteredArc()));
    expect(chaptered.type).toBe('unread');
    expect(chaptered.type === 'unread' && chaptered.weeks?.weeks).toHaveLength(4);
    const { planning: _planning, ...legacyArc } = makeChapteredArc();
    void _planning;
    const legacy = computeDevotionalState(input(legacyArc));
    expect('weeks' in legacy).toBe(false);
  });
});
