import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import { CompletionCelebration } from '../CompletionCelebration';

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
jest.mock('expo-haptics', () => ({ notificationAsync: jest.fn(), NotificationFeedbackType: { Success: 'success' } }));
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
