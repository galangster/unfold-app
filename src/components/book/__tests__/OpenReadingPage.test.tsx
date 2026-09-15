import React from 'react';
import { fireEvent, render, within } from '@testing-library/react-native';
import { OpenReadingPage } from '../OpenReadingPage';
import { Colors } from '@/constants/colors';
import type { BookTodayPage } from '@/lib/book-of-seasons';

jest.mock('@/hooks/useAccessibility', () => ({ useAccessibleAnimation: () => ({ reducedMotion: true }) }));
jest.mock('@shopify/react-native-skia', () => ({ makeImageFromView: jest.fn() }));
jest.mock('react-native-reanimated', () => ({ __esModule: true, default: { View: jest.requireActual('react-native').View }, useAnimatedStyle: (style: () => unknown) => style(), useSharedValue: (value: number) => ({ value }), cancelAnimation: jest.fn(), Easing: { bezier: jest.fn() } }));
jest.mock('expo-router', () => ({ useIsFocused: () => true }));
jest.mock('react-native-gesture-handler', () => {
  const gesture = new Proxy({}, { get: () => () => gesture });
  return { Gesture: { Pan: () => gesture }, GestureDetector: ({ children }: { children: React.ReactNode }) => children };
});
jest.mock('@react-native-async-storage/async-storage', () => jest.requireActual('@react-native-async-storage/async-storage/jest/async-storage-mock'));

const page: BookTodayPage = {
  dayNumber: 5, totalDays: 7, chapterName: 'Waiting', chapterDayNumber: 2, chapterDayCount: 3,
  title: 'The Middle Hour', invitation: 'Trust grows.', scriptureReference: 'Isaiah 30:15',
  contentReady: true, completedToday: false, seriesComplete: false, canOpen: true,
  action: 'continue', eyebrow: 'today',
};

it('uses the same series day scale as the reader', () => {
  const view = render(<OpenReadingPage page={page} colors={Colors} isDark onContinue={jest.fn()} />);
  expect(view.getByText('Day 5 of 7')).toBeTruthy();
});

it('opens from the folded corner without requiring a swipe', () => {
  const open = jest.fn();
  const view = render(<OpenReadingPage page={page} colors={Colors} isDark onContinue={open} />);
  fireEvent.press(view.getByTestId('book-page-corner'));
  expect(open).toHaveBeenCalledTimes(1);
});

it('does not offer the corner while no day can open', () => {
  const view = render(<OpenReadingPage page={{ ...page, canOpen: false, action: null }} colors={Colors} isDark onContinue={jest.fn()} />);
  expect(view.queryByTestId('book-page-corner')).toBeNull();
});


it('keeps the decorative corner outside the captured flat page', () => {
  const view = render(<OpenReadingPage page={page} colors={Colors} isDark onContinue={jest.fn()} />);
  const face = within(view.getByTestId('book-page-capture'));
  expect(face.getByText('The Middle Hour')).toBeTruthy();
  expect(face.queryByTestId('book-page-corner')).toBeNull();
  expect(view.getByTestId('book-page-corner')).toBeTruthy();
});
