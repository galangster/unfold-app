import React from 'react';
import { Alert } from 'react-native';
import {
  useMiddayNotificationOpen,
  type MiddayNotificationOpenInput,
} from '../useMiddayNotificationOpen';

const renderer = jest.requireActual('react-test-renderer');
const { act } = renderer;

function Harness(props: MiddayNotificationOpenInput) {
  useMiddayNotificationOpen(props);
  return null;
}

function readyInput(
  overrides: Partial<MiddayNotificationOpenInput> = {},
): MiddayNotificationOpenInput {
  return {
    focus: 'midday',
    hasHydrated: true,
    isTodayFocused: true,
    policy: 'granted',
    currentDevotionalId: 'dev-1',
    hasCompletedMiddayCheckIn: false,
    gate: () => true,
    openCheckIn: jest.fn(),
    clearFocus: jest.fn(),
    ...overrides,
  };
}

function renderOpen(input: MiddayNotificationOpenInput) {
  let tree: { update: (element: React.ReactElement) => void };
  act(() => {
    tree = renderer.create(<Harness {...input} />);
  });
  return {
    update(next: MiddayNotificationOpenInput) {
      act(() => {
        tree.update(<Harness {...next} />);
      });
    },
  };
}

describe('useMiddayNotificationOpen', () => {
  const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});

  beforeEach(() => {
    alertSpy.mockClear();
  });

  afterAll(() => {
    alertSpy.mockRestore();
  });

  it('opens the existing check-in after a late-hour midday tap once Today is ready', () => {
    const openCheckIn = jest.fn();
    const clearFocus = jest.fn();
    const gate = jest.fn(() => true);
    renderOpen(readyInput({ openCheckIn, clearFocus, gate }));

    expect(gate).toHaveBeenCalledTimes(1);
    expect(openCheckIn).toHaveBeenCalledTimes(1);
    expect(clearFocus).toHaveBeenCalledTimes(1);
    expect(alertSpy).not.toHaveBeenCalled();
  });

  it('waits for store hydration, Today focus, and a resolved premium policy before opening', () => {
    const openCheckIn = jest.fn();
    const clearFocus = jest.fn();
    const deferred = readyInput({
      hasHydrated: false,
      isTodayFocused: false,
      policy: 'unknown',
      openCheckIn,
      clearFocus,
    });
    const tree = renderOpen(deferred);

    expect(openCheckIn).not.toHaveBeenCalled();
    expect(clearFocus).not.toHaveBeenCalled();

    tree.update({ ...deferred, hasHydrated: true });
    expect(openCheckIn).not.toHaveBeenCalled();

    tree.update({ ...deferred, hasHydrated: true, isTodayFocused: true });
    expect(openCheckIn).not.toHaveBeenCalled();

    tree.update({
      ...deferred,
      hasHydrated: true,
      isTodayFocused: true,
      policy: 'granted',
    });
    expect(openCheckIn).toHaveBeenCalledTimes(1);
    expect(clearFocus).toHaveBeenCalledTimes(1);
  });

  it('consumes the intent once so a rerender or return visit cannot reopen it', () => {
    const openCheckIn = jest.fn();
    const clearFocus = jest.fn();
    const input = readyInput({ openCheckIn, clearFocus });
    const tree = renderOpen(input);

    tree.update(input);
    expect(openCheckIn).toHaveBeenCalledTimes(1);

    tree.update({ ...input, isTodayFocused: false, focus: '' });
    tree.update({ ...input, isTodayFocused: true, focus: '' });
    expect(openCheckIn).toHaveBeenCalledTimes(1);
    expect(clearFocus).toHaveBeenCalledTimes(1);
  });

  it('opens again for a later independent midday tap after the first intent was cleared', () => {
    const openCheckIn = jest.fn();
    const input = readyInput({ openCheckIn });
    const tree = renderOpen(input);

    tree.update({ ...input, focus: '' });
    tree.update({ ...input, focus: 'midday' });
    expect(openCheckIn).toHaveBeenCalledTimes(2);
  });

  it('preserves the creation gate for denied access and does not open the sheet', () => {
    const openCheckIn = jest.fn();
    const gate = jest.fn(() => false);
    const clearFocus = jest.fn();
    renderOpen(readyInput({
      policy: 'denied',
      gate,
      openCheckIn,
      clearFocus,
    }));

    expect(gate).toHaveBeenCalledTimes(1);
    expect(openCheckIn).not.toHaveBeenCalled();
    expect(clearFocus).toHaveBeenCalledTimes(1);
    expect(alertSpy).not.toHaveBeenCalled();
  });

  it('alerts when the current series is genuinely absent', () => {
    const openCheckIn = jest.fn();
    renderOpen(readyInput({
      currentDevotionalId: null,
      openCheckIn,
    }));

    expect(openCheckIn).not.toHaveBeenCalled();
    expect(alertSpy).toHaveBeenCalledWith(
      'No series found',
      'Start a series to check in.',
    );
  });

  it('confirms a saved midday reflection instead of opening a fresh draft', () => {
    const openCheckIn = jest.fn();
    renderOpen(readyInput({
      hasCompletedMiddayCheckIn: true,
      openCheckIn,
    }));

    expect(openCheckIn).not.toHaveBeenCalled();
    expect(alertSpy).toHaveBeenCalledWith(
      'Checked in',
      'Your midday reflection is already saved.',
    );
  });

  it('does not reopen a leftover midday intent after a later series switch', () => {
    const openCheckIn = jest.fn();
    const clearFocus = jest.fn();
    const input = readyInput({ openCheckIn, clearFocus });
    const tree = renderOpen(input);

    tree.update({
      ...input,
      currentDevotionalId: 'dev-2',
      focus: 'midday',
    });

    expect(openCheckIn).toHaveBeenCalledTimes(1);
    expect(clearFocus).toHaveBeenCalledTimes(1);
  });
});
