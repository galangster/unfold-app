import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import { Colors } from '@/constants/colors';
import { BookDayList } from '@/components/book/BookDayList';
import { canonicalGeneratedDayId } from '../devotional-canonical-days';
import type { Devotional, DevotionalDay } from '../store';
import { DayMenuScreen } from '@/app/(tabs)/(today)/day-menu';

let mockDevotionals: Devotional[] = [];
let mockCurrentDevotionalId: string | null = null;
const mockDismissTo = jest.fn();
const mockNow = new Date(2026, 8, 27, 12, 0, 0);

jest.mock('expo-router', () => ({
  useRouter: () => ({ dismissTo: mockDismissTo }),
  useLocalSearchParams: () => ({ devotionalId: 'series-1', currentDay: '4' }),
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

const readIso = new Date(2026, 8, 20, 9, 0, 0).toISOString();

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

// Day 2 was read, but this device holds only a local copy of it, not the
// canonical day. Day 4 is today's reading. Nothing has prepared Day 5.
const series = {
  id: 'series-1',
  title: 'Ordinary Hours',
  totalDays: 5,
  currentDay: 4,
  createdAt: readIso,
  updatedAt: readIso,
  generationMode: 'progressive',
  seriesStartDate: readIso,
  userContext: { name: '', aboutMe: '', currentSituation: '', emotionalState: '' },
  days: [
    day(1, { isRead: true, readAt: readIso }),
    day(2, { id: 'local-day-2', isRead: true, readAt: readIso }),
    day(3, { isRead: true, readAt: readIso }),
    day(4),
  ],
} as Devotional;

function openedDays(): string[] {
  return mockDismissTo.mock.calls.map(([route]) => route.params.dayNumber);
}

// Only Day 5 of the current series keeps an unlock caption. A paused series
// will not prepare Day 5, so it promises nothing.
describe.each([
  { state: 'current', currentDevotionalId: 'series-1', seriesPaused: false, unlockCaptions: 1 },
  { state: 'paused', currentDevotionalId: 'series-2', seriesPaused: true, unlockCaptions: 0 },
])('a read day with only a local copy in a $state series', ({ currentDevotionalId, seriesPaused, unlockCaptions }) => {
  beforeEach(() => {
    jest.useFakeTimers({ now: mockNow });
    mockDevotionals = [series];
    mockCurrentDevotionalId = currentDevotionalId;
    mockDismissTo.mockClear();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('offers to restore the reading in the day picker', () => {
    const picker = render(<DayMenuScreen />);

    expect(picker.queryByText('Being prepared…')).toBeNull();
    fireEvent.press(picker.getByText('Tap to restore reading'));
    expect(openedDays()).toEqual(['2']);
  });

  it('offers the same restore in the book list', () => {
    const open = jest.fn();
    const list = render(
      <BookDayList devotional={series} seriesPaused={seriesPaused} now={mockNow} colors={Colors} onOpenDay={open} />,
    );
    fireEvent.press(list.getByRole('button', { name: 'Day 2, Day 2, Tap to restore reading' }));
    expect(open).toHaveBeenCalledWith(2);
  });

  it('keeps the days after it open in the day picker', () => {
    const picker = render(<DayMenuScreen />);

    expect(picker.queryAllByText(/^Unlocks/)).toHaveLength(unlockCaptions);
    fireEvent.press(picker.getByText('Day 3 title'));
    fireEvent.press(picker.getByText('Day 4 title'));
    expect(openedDays()).toEqual(['3', '4']);
  });
});
