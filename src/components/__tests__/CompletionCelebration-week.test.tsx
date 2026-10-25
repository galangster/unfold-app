/**
 * The restrained week-complete moment (spec r2 section 7, row 43). It reuses
 * the Day Complete overlay and its Reduce Motion path.
 */
import React from 'react';
import { AccessibilityInfo } from 'react-native';
import { act, render } from '@testing-library/react-native';
import { CompletionCelebration } from '../CompletionCelebration';
import { completionCopy, completionVariation } from '@/constants/daily-copy';
import { copySeed } from '@/lib/copy-variation';

let mockReducedMotion = true;
const mockWithTiming = jest.fn((value: number) => value);
jest.mock('@/lib/theme', () => ({ useTheme: () => ({ colors: { background: '#fff', text: '#111', textMuted: '#666' } }) }));
jest.mock('@/hooks/useAccessibility', () => ({ useAccessibleAnimation: () => ({ reducedMotion: mockReducedMotion }) }));
jest.mock('@/components/EmberSystem', () => ({ EmberSystem: () => null }));
jest.mock('@/components/ui/Button', () => ({
  Button: ({ label, onPress }: { label: string; onPress: () => void }) => {
    const { TouchableOpacity, Text } = require('react-native');
    return <TouchableOpacity accessibilityRole="button" accessibilityLabel={label} onPress={onPress}><Text>{label}</Text></TouchableOpacity>;
  },
}));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('expo-haptics', () => ({
  notificationAsync: jest.fn(),
  impactAsync: jest.fn(),
  NotificationFeedbackType: { Success: 'success' },
  ImpactFeedbackStyle: { Soft: 'soft', Light: 'light' },
}));
jest.mock('react-native-reanimated', () => ({
  __esModule: true,
  default: { View: require('react-native').View },
  useSharedValue: (value: number) => ({ value }),
  useAnimatedStyle: (fn: () => unknown) => fn(),
  withTiming: (value: number) => mockWithTiming(value),
  withDelay: (_delay: number, value: number) => value,
  withSpring: (value: number) => value,
  Easing: { out: (value: unknown) => value, in: (value: unknown) => value, inOut: (value: unknown) => value, cubic: 'cubic' },
}));

const WEEK = {
  title: 'Week 1 complete',
  line: '1 of 4 weeks · 7 of 28 days',
  spokenLine: '1 of 4 weeks, 7 of 28 days',
};
const nextStep = {
  title: 'Week 2 · Synthetic Week Two begins tomorrow',
  detail: 'Synthetic detail.',
  primaryLabel: 'Return to Today', onPrimary: jest.fn(),
  secondaryLabel: 'Keep reflecting', onSecondary: jest.fn(),
};

beforeEach(() => {
  mockReducedMotion = true;
  mockWithTiming.mockClear();
});

it('names the finished week, its place, and the next week', () => {
  const screen = render(<CompletionCelebration visible type="day" week={WEEK} nextStep={nextStep} onDismiss={jest.fn()} />);
  expect(screen.getByText('Week 1 complete')).toBeTruthy();
  expect(screen.getByText('1 of 4 weeks · 7 of 28 days')).toBeTruthy();
  expect(screen.getByText('Week 2 · Synthetic Week Two begins tomorrow')).toBeTruthy();
  const dayCopy = completionCopy('day', completionVariation(copySeed(), 0));
  expect(screen.queryByText(dayCopy.title)).toBeNull();
});

it('is modal, makes the title a header, speaks the line without the separator, and focuses the title', () => {
  jest.useFakeTimers();
  const focus = jest.spyOn(AccessibilityInfo, 'sendAccessibilityEvent').mockImplementation(() => {});
  const screen = render(<CompletionCelebration visible type="day" week={WEEK} nextStep={nextStep} onDismiss={jest.fn()} />);
  const title = screen.getByText('Week 1 complete');
  expect(title.props.accessibilityRole).toBe('header');
  expect(title.props.numberOfLines).toBeUndefined();
  expect(screen.getByLabelText('1 of 4 weeks, 7 of 28 days')).toBeTruthy();
  expect(screen.UNSAFE_root.findAll((node) => node.props.accessibilityViewIsModal === true).length).toBeGreaterThan(0);
  act(() => { jest.runAllTimers(); });
  expect(focus).toHaveBeenCalledWith(expect.anything(), 'focus');
  focus.mockRestore();
  jest.useRealTimers();
});

it('shows without a fade when Reduce Motion is on', () => {
  render(<CompletionCelebration visible type="day" week={WEEK} nextStep={nextStep} onDismiss={jest.fn()} />);
  expect(mockWithTiming).not.toHaveBeenCalled();
});

it('plays the same entrance as Day Complete when Reduce Motion is off', () => {
  mockReducedMotion = false;
  render(<CompletionCelebration visible type="day" nextStep={nextStep} onDismiss={jest.fn()} />);
  const dayCalls = mockWithTiming.mock.calls.length;
  mockWithTiming.mockClear();
  render(<CompletionCelebration visible type="day" week={WEEK} nextStep={nextStep} onDismiss={jest.fn()} />);
  expect(mockWithTiming.mock.calls.length).toBe(dayCalls);
});

it('leaves the Day Complete overlay unchanged without a week', () => {
  const screen = render(<CompletionCelebration visible type="day" nextStep={nextStep} onDismiss={jest.fn()} />);
  const dayCopy = completionCopy('day', completionVariation(copySeed(), 0));
  expect(screen.getByText(dayCopy.title).props.accessibilityRole).toBeUndefined();
  expect(screen.queryByText('Week 1 complete')).toBeNull();
});
