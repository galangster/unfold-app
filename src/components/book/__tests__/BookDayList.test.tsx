import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import { BookDayList } from '../BookDayList';
import { Colors } from '@/constants/colors';
import { canonicalGeneratedDayId } from '@/lib/devotional-canonical-days';
import type { Devotional, DevotionalDay } from '@/lib/store';

const now = new Date(2026, 8, 27, 12, 0, 0);
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

// Day 1 was read before the series stopped. Day 2 is only a local placeholder,
// so the series has no reading ready for its next day.
const series = {
  id: 'series-1',
  title: 'Ordinary Hours',
  totalDays: 7,
  currentDay: 2,
  createdAt: pausedIso,
  updatedAt: pausedIso,
  generationMode: 'progressive',
  seriesStartDate: pausedIso,
  userContext: { name: '', aboutMe: '', currentSituation: '', emotionalState: '' },
  days: [day(1, { isRead: true, readAt: pausedIso }), day(2, { id: 'local-day-2' })],
} as Devotional;

beforeEach(() => {
  jest.useFakeTimers({ now });
});

afterEach(() => {
  jest.useRealTimers();
});

function renderList(seriesPaused: boolean, onOpenDay: (dayNumber: number) => void) {
  return render(
    <BookDayList devotional={series} seriesPaused={seriesPaused} now={now} colors={Colors} onOpenDay={onOpenDay} />,
  );
}

it('shows the next day of the current series as being prepared and opens it', () => {
  const open = jest.fn();
  const view = renderList(false, open);

  const nextDay = view.getByRole('button', { name: 'Day 2, Day 2, Being prepared' });
  expect(nextDay).toBeEnabled();
  fireEvent.press(nextDay);
  expect(open).toHaveBeenCalledWith(2);
});

it('shows the next day of a paused series as not prepared and lets the reader check it', () => {
  const open = jest.fn();
  const view = renderList(true, open);

  expect(view.queryByText('Being prepared')).toBeNull();
  const nextDay = view.getByRole('button', { name: 'Day 2, Day 2, Not prepared' });
  expect(nextDay).toBeEnabled();
  fireEvent.press(nextDay);
  expect(open).toHaveBeenCalledWith(2);
});
