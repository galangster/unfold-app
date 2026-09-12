jest.mock('@/components/ProfileEntryButton', () => ({ ProfileEntryButton: () => null }));

import React from 'react';
import { canonicalGeneratedDayId } from '../devotional-canonical-days';
import type { Devotional, DevotionalDay } from '../store';

const renderer = require('react-test-renderer');
const { act } = renderer;

const mockPush = jest.fn();
let mockParams = { id: 'past-series' };
let mockDevotionals: Devotional[] = [];
let mockCurrentDevotionalId: string | null = 'other-series';

function day(id: string, n: number, over: Partial<DevotionalDay> = {}): DevotionalDay {
  return {
    id: canonicalGeneratedDayId(id, n),
    devotionalId: id,
    dayNumber: n,
    title: `Day ${n} title`,
    scriptureReference: 'John 1:1',
    scriptureText: 'Scripture',
    bodyText: 'Body',
    quotableLine: 'Quote',
    isRead: false,
    ...over,
  };
}

function nonAuto(over: Partial<Devotional> = {}): Devotional {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 7, 12).toISOString();
  return {
    id: 'past-series',
    title: 'Past Series',
    totalDays: 2,
    currentDay: 3,
    createdAt: start,
    updatedAt: start,
    generationMode: 'progressive',
    seriesStartDate: start,
    days: [
      day('past-series', 1, { isRead: true, readAt: start }),
      day('past-series', 2, { isRead: true, readAt: start }),
    ],
    userContext: { name: '', aboutMe: '', currentSituation: '', emotionalState: '' },
    ...over,
  } as Devotional;
}

function autoCurrentDay2(): Devotional {
  const now = new Date();
  const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 12);
  return {
    id: 'auto-1',
    title: 'Auto Series',
    totalDays: 3,
    currentDay: 2,
    createdAt: yesterday.toISOString(),
    updatedAt: yesterday.toISOString(),
    generationMode: 'progressive',
    seriesStartDate: yesterday.toISOString(),
    days: [day('auto-1', 1, { isRead: true, readAt: yesterday.toISOString() })],
    userContext: { name: '', aboutMe: '', currentSituation: '', emotionalState: '' },
    seriesArc: {
      totalDaysPlanned: 3,
      overarchingTheme: 'theme',
      narrativeShape: 'shape',
      dayHints: [],
      isOpenEnded: false,
      createdAt: yesterday.toISOString(),
      seriesKind: 'auto_trial',
    },
  } as Devotional;
}

jest.mock('expo-router', () => ({
  useRouter: () => ({ canGoBack: () => true, push: mockPush, back: jest.fn() }),
  useSegments: () => [],
  useNavigation: () => ({ getState: () => ({ index: 1, routes: [] }) }),
  useLocalSearchParams: () => mockParams,
}));

jest.mock('@/lib/store', () => ({
  useUnfoldStore: (selector: (state: unknown) => unknown) =>
    selector({
      devotionals: mockDevotionals,
      currentDevotionalId: mockCurrentDevotionalId,
      setCurrentDevotional: jest.fn(),
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
  let tree: { root: { findAll: (p: (n: unknown) => boolean) => unknown[]; findAllByProps: (p: object) => unknown[] } };
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
  mockParams = { id: 'past-series' };
  mockDevotionals = [nonAuto()];
  mockCurrentDevotionalId = 'other-series';
});

describe('J16 series-detail auto trial', () => {
  it('renders only existing rows and no preparing node for a non-auto, non-current series', () => {
    const tree = renderScreen();
    const text = allRenderedText(tree);
    expect(text).toContain('Day 1 title');
    expect(text).toContain('Day 2 title');
    expect(tree.root.findAllByProps({ testID: 'series-path' })).toHaveLength(0);
    expect(text).not.toContain('Day 3 preparing');
  });

  it('renders a non-auto complete series the same way as today', () => {
    mockDevotionals = [nonAuto({ currentDay: 3 })];
    const text = allRenderedText(renderScreen());
    expect(text).toContain('2 days completed');
    expect(text).not.toContain('Day 3 preparing');
  });

  it('renders an auto series current on calendar Day 2 with no row as read, preparing, locked', () => {
    mockParams = { id: 'auto-1' };
    mockCurrentDevotionalId = 'auto-1';
    mockDevotionals = [autoCurrentDay2()];
    const tree = renderScreen();
    // Nick's 2026-09-11 ruling: an auto series renders like a normal series.
    // No drawn path; the existing progress row carries the read count.
    expect(tree.root.findAllByProps({ testID: 'series-path' })).toHaveLength(0);
    expect(allRenderedText(tree)).toMatch(/completed/);
  });
});
