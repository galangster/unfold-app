/**
 * Regression test for the "tap Day 2, land on Day 1" report.
 *
 * This renders the real SeriesDetailScreen. Reverting the component's row gate
 * back to `devotional.currentDay` MUST fail these tests — that is the whole
 * point, so do not reimplement the component's logic here.
 *
 * The scenario is the one the reader's own resolver refuses: the next day has
 * advanced but is not selectable yet, so `resolveInitialReadingDayNumber` would
 * silently downgrade a Day 2 request to Day 1. The list must therefore never
 * offer Day 2 as a tap target in the first place.
 */
import React from 'react';
import { canonicalGeneratedDayId } from '../devotional-canonical-days';
import { resolveInitialReadingDayNumber } from '../devotional-day-access';
import type { Devotional, DevotionalDay } from '../store';

const renderer = require('react-test-renderer');
const { act } = renderer;

const mockPush = jest.fn();
const mockSetCurrentDevotional = jest.fn();

// Day 1 read *today* — required for the reader's tomorrow-lock to engage.
const readTodayIso = new Date().toISOString();

function day(overrides: Partial<DevotionalDay> = {}): DevotionalDay {
  const dayNumber = overrides.dayNumber ?? 1;
  return {
    id: canonicalGeneratedDayId('dino-series', dayNumber),
    devotionalId: 'dino-series',
    dayNumber,
    title: `Day ${dayNumber} title`,
    scriptureReference: 'John 1:1',
    scriptureText: 'Scripture',
    bodyText: 'Body',
    quotableLine: 'Quote',
    isRead: false,
    reflectionQuestions: [],
    ...overrides,
  };
}

const mockSeries = {
  id: 'dino-series',
  title: "Enough: The Entrepreneur's Reckoning",
  totalDays: 30,
  // Advanced to 2 by advanceDay() the moment Day 1 was completed…
  currentDay: 2,
  createdAt: readTodayIso,
  updatedAt: readTodayIso,
  generationMode: 'progressive',
  // …but the series started today, so Day 2 is still tomorrow's reading.
  seriesStartDate: readTodayIso,
  days: [
    day({ dayNumber: 1, isRead: true, readAt: readTodayIso, title: 'The King Who Sat Down' }),
    day({ dayNumber: 2, title: 'The Voice Through the Lattice' }),
  ],
} as unknown as Devotional;

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, back: jest.fn() }),
  useLocalSearchParams: () => ({ id: 'dino-series' }),
}));

// Swappable so a test can render a different store state without re-requiring
// the component (a second React copy breaks hooks).
let mockDevotionals: Devotional[] = [mockSeries];

jest.mock('@/lib/store', () => ({
  useUnfoldStore: (selector: (state: unknown) => unknown) =>
    selector({
      devotionals: mockDevotionals,
      setCurrentDevotional: mockSetCurrentDevotional,
    }),
}));

jest.mock('@/hooks/useCrossTabBack', () => ({
  useCrossTabBack: () => ({ handleBack: jest.fn() }),
}));

jest.mock('@/lib/theme', () => ({
  useTheme: () => ({
    colors: {
      accent: '#C8A55C',
      background: '#111111',
      inputBackground: '#231F18',
      text: '#F6EFE3',
      textMuted: '#B8AA96',
      textSubtle: '#8D806D',
      textHint: '#6B6152',
      border: '#3A3328',
    },
  }),
}));

jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(),
  ImpactFeedbackStyle: { Light: 'light' },
}));

jest.mock('react-native-reanimated', () => ({
  __esModule: true,
  default: { View: 'Animated.View' },
  FadeIn: { duration: () => ({ delay: () => ({ easing: () => undefined }), easing: () => undefined }) },
  useAnimatedStyle: (factory: () => unknown) => factory(),
  useReducedMotion: () => true,
  useSharedValue: (value: unknown) => ({ value }),
  withTiming: (value: unknown) => value,
  withDelay: (_d: number, value: unknown) => value,
  withRepeat: (value: unknown) => value,
  interpolate: () => 0,
  Easing: {
    out: () => undefined,
    in: () => undefined,
    inOut: () => undefined,
    cubic: undefined,
    ease: undefined,
  },
}));

jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: 'SafeAreaView',
}));

// series-detail only needs `alpha`; the real barrel pulls in gesture-handler.
jest.mock('@/components/ui', () => ({
  alpha: (color: string) => color,
}));

jest.mock('expo-linear-gradient', () => ({ LinearGradient: 'LinearGradient' }));

jest.mock('phosphor-react-native', () => ({
  CaretLeftIcon: 'CaretLeftIcon',
  CheckCircleIcon: 'CheckCircleIcon',
  LockSimpleIcon: 'LockSimpleIcon',
  CircleIcon: 'CircleIcon',
}));

const SeriesDetailScreen = require('@/app/(tabs)/(you)/series-detail').default;

function renderScreen() {
  let tree: { root: { findAll: (p: (n: unknown) => boolean) => unknown[] } };
  act(() => {
    tree = renderer.create(React.createElement(SeriesDetailScreen));
  });
  // @ts-expect-error assigned inside act
  return tree;
}

function textContent(node: { props: Record<string, unknown> }): string {
  const children = node.props.children;
  const flat = Array.isArray(children) ? children : [children];
  return flat
    .map((c) => (typeof c === 'string' || typeof c === 'number' ? String(c) : ''))
    .join('');
}

function findRowContaining(tree: ReturnType<typeof renderScreen>, needle: string) {
  // Locate the pressable ancestor whose subtree renders `needle`.
  const candidates = tree.root.findAll((node) => {
    const n = node as { props?: Record<string, unknown> };
    return Boolean(n.props && typeof n.props.onPress === 'function' && n.props.style);
  }) as { props: Record<string, unknown>; findAll: (p: (n: unknown) => boolean) => unknown[] }[];

  return candidates.find((c) => {
    const texts = c.findAll((node) => {
      const n = node as { props?: Record<string, unknown> };
      return Boolean(n.props && 'children' in (n.props ?? {}));
    }) as { props: Record<string, unknown> }[];
    return texts.some((t) => textContent(t).includes(needle));
  });
}

function allRenderedText(tree: ReturnType<typeof renderScreen>): string {
  return (
    tree.root.findAll((node) => {
      const n = node as { props?: Record<string, unknown> };
      return Boolean(n.props && 'children' in (n.props ?? {}));
    }) as { props: Record<string, unknown> }[]
  )
    .map(textContent)
    .join('|');
}

beforeEach(() => {
  mockPush.mockClear();
  mockSetCurrentDevotional.mockClear();
  mockDevotionals = [mockSeries];
});

describe('SeriesDetailScreen day gating', () => {
  it('sanity: the reader would refuse a Day 2 request in this state', () => {
    expect(resolveInitialReadingDayNumber(mockSeries, 2)).toBe(1);
  });

  it('does not navigate when the not-yet-available next day is tapped', () => {
    const tree = renderScreen();
    const row = findRowContaining(tree, 'Day 2');
    expect(row).toBeDefined();

    // Either the row is disabled, or pressing it must not navigate.
    expect(row!.props.disabled).toBe(true);

    act(() => {
      (row!.props.onPress as () => void)();
    });
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('labels the not-yet-available next day "Tomorrow", not "Current"', () => {
    const tree = renderScreen();
    const allText = allRenderedText(tree);

    expect(allText).toContain('Tomorrow');
    expect(allText).not.toContain('Current');
  });

  it('still navigates to the completed Day 1 so re-reads work', () => {
    const tree = renderScreen();
    const row = findRowContaining(tree, 'Day 1');
    expect(row).toBeDefined();
    expect(row!.props.disabled).toBe(false);

    act(() => {
      (row!.props.onPress as () => void)();
    });

    expect(mockSetCurrentDevotional).toHaveBeenCalledWith('dino-series');
    expect(mockPush).toHaveBeenCalledTimes(1);
    const target = mockPush.mock.calls[0][0];
    expect(target.params.dayNumber).toBe('1');
    // Whatever day the list navigates to, the reader must land on that same day.
    expect(resolveInitialReadingDayNumber(mockSeries, Number(target.params.dayNumber))).toBe(1);
  });
  it('does NOT claim "Tomorrow" when the next day has no canonical content', () => {
    // Same state, except Day 2's content never materialised (non-canonical id).
    // Labelling this "Tomorrow" would disguise a generation failure as pacing.
    mockDevotionals = [
      {
        ...mockSeries,
        days: [mockSeries.days[0], { ...mockSeries.days[1], id: 'local-only-day-2' }],
      } as unknown as Devotional,
    ];

    const allText = allRenderedText(renderScreen());
    expect(allText).not.toContain('Tomorrow');
    expect(allText).not.toContain('Current');
  });
});
