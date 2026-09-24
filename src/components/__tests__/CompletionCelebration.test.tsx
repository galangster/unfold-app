import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import { CompletionCelebration } from '../CompletionCelebration';
import { AppState } from 'react-native';
import * as Haptics from 'expo-haptics';

jest.mock('@/lib/theme', () => ({ useTheme: () => ({ colors: { background: '#fff', text: '#111', textMuted: '#666' } }) }));
jest.mock('@/hooks/useAccessibility', () => ({ useAccessibleAnimation: () => ({ reducedMotion: true }) }));
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
  withTiming: (value: number) => value,
  withDelay: (_delay: number, value: number) => value,
  withSpring: (value: number) => value,
  Easing: { out: (value: unknown) => value, in: (value: unknown) => value, inOut: (value: unknown) => value, cubic: 'cubic' },
}));

it('presents explicit next steps and accepts only one navigation per celebration', () => {
  const primary = jest.fn();
  const secondary = jest.fn();
  const dismiss = jest.fn();
  const screen = render(<CompletionCelebration visible type="series" onDismiss={dismiss} nextStep={{
    title: 'Where next?', detail: 'Choose a study on Today.',
    primaryLabel: 'Choose next study', onPrimary: primary,
    secondaryLabel: 'Review this study', onSecondary: secondary,
  }} />);
  expect(screen.getByText('Where next?')).toBeTruthy();
  expect(screen.queryByText('Tap anywhere to continue')).toBeNull();
  fireEvent.press(screen.getByRole('button', { name: 'Choose next study' }));
  fireEvent.press(screen.getByRole('button', { name: 'Review this study' }));
  expect(primary).toHaveBeenCalledTimes(1);
  expect(secondary).not.toHaveBeenCalled();
  expect(dismiss).not.toHaveBeenCalled();
});

it('keeps onboarding continuation available without reader next steps', () => {
  const dismiss = jest.fn();
  const screen = render(<CompletionCelebration visible type="day" message="A beginning" onDismiss={dismiss} />);
  fireEvent.press(screen.getByRole('button', { name: 'Day Complete. A beginning. Continue' }));
  expect(dismiss).toHaveBeenCalledTimes(1);
});

describe('gentle completion feedback', () => {
  const previousState = AppState.currentState;

  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
    AppState.currentState = 'active';
  });

  afterEach(() => {
    jest.useRealTimers();
    AppState.currentState = previousState;
  });

  it('plays the gentle pattern by default', () => {
    render(<CompletionCelebration visible type="day" onDismiss={jest.fn()} />);
    expect(Haptics.impactAsync).toHaveBeenCalledTimes(1);
    jest.advanceTimersByTime(99);
    expect(Haptics.impactAsync).toHaveBeenCalledTimes(1);
    jest.advanceTimersByTime(1);
    expect(Haptics.impactAsync).toHaveBeenCalledTimes(2);
    expect(Haptics.notificationAsync).not.toHaveBeenCalled();
  });

  it('plays the short ordered pattern once while completion remains visible', () => {
    const props = { visible: true, type: 'day' as const, onDismiss: jest.fn() };
    const screen = render(<CompletionCelebration {...props} />);
    screen.rerender(<CompletionCelebration {...props} message="Still complete" />);
    jest.runOnlyPendingTimers();
    expect((Haptics.impactAsync as jest.Mock).mock.calls.map((call) => call[0])).toEqual([
      Haptics.ImpactFeedbackStyle.Soft,
      Haptics.ImpactFeedbackStyle.Light,
    ]);
    expect(Haptics.notificationAsync).not.toHaveBeenCalled();
  });

  it('cancels remaining feedback when the celebration closes', () => {
    const props = { type: 'day' as const, onDismiss: jest.fn() };
    const screen = render(<CompletionCelebration {...props} visible />);
    screen.rerender(<CompletionCelebration {...props} visible={false} />);
    jest.runOnlyPendingTimers();
    expect(Haptics.impactAsync).toHaveBeenCalledTimes(1);
  });

  it('does not continue feedback after the app becomes inactive', () => {
    render(<CompletionCelebration visible type="day" onDismiss={jest.fn()} />);
    AppState.currentState = 'background';
    jest.runOnlyPendingTimers();
    expect(Haptics.impactAsync).toHaveBeenCalledTimes(1);
  });

  it('cancels remaining feedback when the celebration unmounts', () => {
    const screen = render(<CompletionCelebration visible type="day" onDismiss={jest.fn()} />);
    screen.unmount();
    jest.runOnlyPendingTimers();
    expect(Haptics.impactAsync).toHaveBeenCalledTimes(1);
  });

  it('does not begin feedback while the app is inactive', () => {
    AppState.currentState = 'inactive';
    render(<CompletionCelebration visible type="day" onDismiss={jest.fn()} />);
    jest.runOnlyPendingTimers();
    expect(Haptics.impactAsync).not.toHaveBeenCalled();
  });

  it('cancels the pending tap when AppState reports inactivity', () => {
    render(<CompletionCelebration visible type="day" onDismiss={jest.fn()} />);
    const listeners = (AppState.addEventListener as unknown as jest.Mock).mock.calls
      .filter((call: unknown[]) => call[0] === 'change')
      .map((call: unknown[]) => call[1] as (status: string) => void);
    expect(listeners.length).toBeGreaterThan(0);
    for (const listener of listeners) {
      listener('inactive');
    }
    jest.runOnlyPendingTimers();
    expect(Haptics.impactAsync).toHaveBeenCalledTimes(1);
  });
});
