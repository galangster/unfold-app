import React from 'react';
import { render } from '@testing-library/react-native';
import { canonicalGeneratedDayId } from '../devotional-canonical-days';
import type { Devotional, DevotionalDay } from '../store';
import { DayMenuScreen } from '@/app/(tabs)/(today)/day-menu';

let mockDevotionals: Devotional[] = [];
let mockCurrentDevotionalId: string | null = null;
const mockNow = new Date(2026, 8, 27, 12, 0, 0);

jest.mock('expo-router', () => ({
  useRouter: () => ({ dismissTo: jest.fn() }),
  useLocalSearchParams: () => ({ devotionalId: 'series-1', currentDay: '1' }),
}));
jest.mock('@/lib/store', () => ({
  useUnfoldStore: (selector: (state: unknown) => unknown) =>
    selector({ devotionals: mockDevotionals, currentDevotionalId: mockCurrentDevotionalId }),
}));
jest.mock('@/lib/theme', () => ({
  useTheme: () => ({ colors: jest.requireActual('@/constants/colors').Colors, isDark: false }),
}));
jest.mock('@/hooks/useCalendarNow', () => ({ useCalendarNow: () => mockNow }));
jest.mock('@/hooks/useAdaptiveLayout', () => ({ useAdaptiveLayout: () => ({ sheetMaxWidth: 560 }) }));
jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children }: { children: React.ReactNode }) => children,
}));
jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(),
  notificationAsync: jest.fn(),
  ImpactFeedbackStyle: { Light: 'light' },
  NotificationFeedbackType: { Warning: 'warning' },
}));
jest.mock('react-native-reanimated', () => {
  const { Text, View } = jest.requireActual('react-native');
  return {
    __esModule: true,
    default: { Text, View },
    Easing: { out: jest.fn(), in: jest.fn(), inOut: jest.fn(), cubic: jest.fn() },
    useReducedMotion: () => true,
    useSharedValue: (value: number) => ({ value }),
    useAnimatedStyle: (style: () => unknown) => style(),
    withTiming: (value: number) => value,
    withSequence: (...values: number[]) => values[values.length - 1],
  };
});

const pausedIso = new Date(2026, 8, 12, 9, 0, 0).toISOString();

function day(dayNumber: number, overrides: Partial<DevotionalDay> = {}): DevotionalDay {
  return {
    id: canonicalGeneratedDayId('series-1', dayNumber),
    devotionalId: 'series-1',
    dayNumber,
    title: `Day ${dayNumber} title`,
    scriptureReference: 'Psalm 46:10',
    scriptureText: 'Scripture',
    bodyText: 'Body',
    quotableLine: 'Be still.',
    isRead: false,
    reflectionQuestions: [],
    ...overrides,
  };
}

// Day 1 was read before the series stopped. Days 2 to 4 have no content.
const series = {
  id: 'series-1',
  title: 'Ordinary Hours',
  totalDays: 4,
  currentDay: 2,
  createdAt: pausedIso,
  updatedAt: pausedIso,
  generationMode: 'progressive',
  seriesStartDate: pausedIso,
  userContext: { name: '', aboutMe: '', currentSituation: '', emotionalState: '' },
  days: [day(1, { isRead: true, readAt: pausedIso })],
} as Devotional;

beforeEach(() => {
  jest.useFakeTimers({ now: mockNow });
  mockDevotionals = [series];
});

afterEach(() => {
  jest.useRealTimers();
});

it('keeps the next day of the current series in preparation', () => {
  mockCurrentDevotionalId = 'series-1';
  const view = render(<DayMenuScreen />);

  expect(view.getByText('Being prepared…')).toBeTruthy();
  expect(view.getAllByText('Unlocks as you continue your reading')).toHaveLength(3);
});

it('marks the missing days of a paused series not prepared, with no unlock promise', () => {
  mockCurrentDevotionalId = 'series-2';
  const view = render(<DayMenuScreen />);

  expect(view.queryByText('Being prepared…')).toBeNull();
  expect(view.queryByText('Coming soon')).toBeNull();
  expect(view.getAllByText('Not prepared')).toHaveLength(3);
  expect(view.queryByText('Unlocks as you continue your reading')).toBeNull();
  expect(view.getByText('Day 1 title')).toBeTruthy();
});
