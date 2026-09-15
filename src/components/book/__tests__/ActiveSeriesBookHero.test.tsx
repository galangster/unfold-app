import React from 'react';
import { act, fireEvent, render, within } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useBookOpening } from '@/lib/book-opening';
import { ActiveSeriesBookHero } from '../ActiveSeriesBookHero';
import { Colors } from '@/constants/colors';
import type { BookTodayPage } from '@/lib/book-of-seasons';

jest.mock('@/hooks/useAccessibility', () => ({ useAccessibleAnimation: () => ({ reducedMotion: true }) }));
jest.mock('@shopify/react-native-skia', () => ({ makeImageFromView: jest.fn() }));
jest.mock('react-native-reanimated', () => ({
  __esModule: true,
  default: { View: jest.requireActual('react-native').View },
  useAnimatedStyle: (style: () => unknown) => style(),
  useSharedValue: (value: number) => ({ value }),
  cancelAnimation: jest.fn(),
  Easing: { bezier: jest.fn() },
}));
jest.mock('expo-router', () => ({ useIsFocused: () => true }));
jest.mock('react-native-gesture-handler', () => {
  const gesture = new Proxy({}, { get: () => () => gesture });
  return { Gesture: { Pan: () => gesture }, GestureDetector: ({ children }: { children: React.ReactNode }) => children };
});
jest.mock('@react-native-async-storage/async-storage', () =>
  jest.requireActual('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
jest.mock('@/components/bookshelf/SeriesBookCover', () => ({
  SeriesBookCover: ({ devotional }: { devotional: { title: string } }) => {
    const { Text } = require('react-native');
    return jest.requireActual('react').createElement(Text, { testID: 'series-book-cover' }, devotional.title);
  },
}));

const page: BookTodayPage = {
  dayNumber: 5,
  totalDays: 7,
  chapterName: 'Waiting',
  chapterDayNumber: 2,
  chapterDayCount: 3,
  title: 'The Middle Hour',
  invitation: 'Trust grows.',
  scriptureReference: 'Isaiah 30:15',
  contentReady: true,
  completedToday: false,
  seriesComplete: false,
  canOpen: true,
  action: 'continue',
  eyebrow: 'today',
};

const book = {
  id: 'devo-1',
  title: 'Ordinary Hours',
  createdAt: '2026-05-01T00:00:00.000Z',
  seriesStartDate: '2026-05-07T12:00:00.000Z',
};

beforeEach(async () => {
  await AsyncStorage.clear();
  useBookOpening.setState({ session: null });
});

it('keeps today title, progress, and continue beneath the hardcover', async () => {
  const view = render(
    <ActiveSeriesBookHero page={page} book={book} colors={Colors} isDark onContinue={jest.fn()} />,
  );
  expect(view.getByTestId('series-book-cover')).toHaveTextContent('Ordinary Hours');
  expect(view.getByText('Day 5 of 7')).toBeTruthy();
  expect(view.getByText('The Middle Hour')).toBeTruthy();
  expect(view.getByTestId('book-continue-reading')).toBeTruthy();
  const capture = within(view.getByTestId('book-cover-capture'));
  expect(capture.getByTestId('series-book-cover')).toBeTruthy();
  expect(capture.queryByText('The Middle Hour')).toBeNull();
  expect(capture.queryByTestId('book-continue-reading')).toBeNull();
  await act(async () => {});
});

it.each(['book-continue-reading', 'active-series-cover'])('opens from %s without another tap', async (target) => {
  const open = jest.fn();
  const view = render(
    <ActiveSeriesBookHero page={page} book={book} colors={Colors} isDark onContinue={open} />,
  );
  await act(async () => fireEvent.press(view.getByTestId(target)));
  expect(open).toHaveBeenCalledTimes(1);
});

it('offers a subtle first-use hint', async () => {
  const view = render(
    <ActiveSeriesBookHero page={page} book={book} colors={Colors} isDark onContinue={jest.fn()} />,
  );
  expect(await view.findByText('Swipe left to open')).toBeTruthy();
});

it('does not offer cover or continue while no day can open', async () => {
  const open = jest.fn();
  const view = render(
    <ActiveSeriesBookHero
      page={{ ...page, canOpen: false, action: null }}
      book={book}
      colors={Colors}
      isDark
      onContinue={open}
    />,
  );
  expect(view.queryByTestId('book-continue-reading')).toBeNull();
  await act(async () => fireEvent.press(view.getByTestId('active-series-cover')));
  expect(open).not.toHaveBeenCalled();
});
