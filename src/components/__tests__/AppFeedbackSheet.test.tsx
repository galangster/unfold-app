import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { AppFeedbackSheet } from '../AppFeedbackSheet';
import { sendAppFeedback } from '@/lib/app-feedback';
import { useUnfoldStore } from '@/lib/store';

jest.mock('@/lib/app-feedback', () => ({ sendAppFeedback: jest.fn() }));
jest.mock('@/lib/theme', () => ({ useTheme: () => ({ colors: { text: '#111', textMuted: '#666', inputBackground: '#eee' } }) }));
jest.mock('@/components/ui', () => {
  const { View, Text, TouchableOpacity } = require('react-native');
  return {
    Sheet: ({ visible, children }: any) => visible ? <View>{children}</View> : null,
    Button: ({ label, onPress, disabled, loading }: any) => <TouchableOpacity accessibilityRole="button" accessibilityLabel={label} onPress={onPress} disabled={disabled || loading}><Text>{label}</Text></TouchableOpacity>,
  };
});
jest.mock('@/lib/store', () => {
  const { create } = jest.requireActual('zustand');
  return { useUnfoldStore: create((set: any) => ({
    appFeedbackDraft: '', devotionals: [],
    setAppFeedbackDraft: (draft: string) => set({ appFeedbackDraft: draft }),
    recordAppFeedbackPrompt: jest.fn(),
  })) };
});
beforeEach(() => {
  jest.clearAllMocks();
  useUnfoldStore.setState({ appFeedbackDraft: '', devotionals: [] });
});
it('preserves the draft across dismissal and reopening without sending', () => {
  const close = jest.fn();
  const screen = render(<AppFeedbackSheet visible onClose={close} source="profile" />);
  fireEvent.changeText(screen.getByLabelText('Your feedback'), 'Please make sharing easier.');
  fireEvent.press(screen.getByRole('button', { name: 'Not now' }));
  screen.rerender(<AppFeedbackSheet visible={false} onClose={close} source="profile" />);
  screen.rerender(<AppFeedbackSheet visible onClose={close} source="profile" />);
  expect(screen.getByLabelText('Your feedback').props.value).toBe('Please make sharing easier.');
  expect(close).toHaveBeenCalledTimes(1);
  expect(sendAppFeedback).not.toHaveBeenCalled();
});
it('retains a failed note, then clears it only after a successful retry', async () => {
  (sendAppFeedback as jest.Mock).mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(undefined);
  const screen = render(<AppFeedbackSheet visible onClose={jest.fn()} source="reading-milestone" />);
  fireEvent.changeText(screen.getByLabelText('Your feedback'), 'The completion choices help.');
  fireEvent.press(screen.getByRole('button', { name: 'Send feedback' }));
  await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy());
  expect(useUnfoldStore.getState().appFeedbackDraft).toBe('The completion choices help.');
  fireEvent.press(screen.getByRole('button', { name: 'Send feedback' }));
  await waitFor(() => expect(screen.getByText('Your feedback has been sent to the Unfold team.')).toBeTruthy());
  expect(useUnfoldStore.getState().appFeedbackDraft).toBe('');
  expect(sendAppFeedback).toHaveBeenLastCalledWith('The completion choices help.', 'reading-milestone');
});
it('prevents duplicate submissions while a request is pending', async () => {
  let finish!: () => void;
  (sendAppFeedback as jest.Mock).mockImplementation(() => new Promise<void>((resolve) => { finish = resolve; }));
  const screen = render(<AppFeedbackSheet visible onClose={jest.fn()} source="profile" />);
  fireEvent.changeText(screen.getByLabelText('Your feedback'), 'A note.');
  fireEvent.press(screen.getByRole('button', { name: 'Send feedback' }));
  fireEvent.press(screen.getByRole('button', { name: 'Sending…' }));
  expect(sendAppFeedback).toHaveBeenCalledTimes(1);
  finish();
  await waitFor(() => expect(screen.getByRole('button', { name: 'Done' })).toBeTruthy());
});

