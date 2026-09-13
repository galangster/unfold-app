import React from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import { useCalendarNow } from '../useCalendarNow';

const renderer = require('react-test-renderer');
const { act } = renderer;
let tree: ReturnType<typeof renderer.create> | undefined;

let emitAppState: ((next: AppStateStatus) => void) | null = null;

function Probe({ onNow }: { onNow: (value: Date) => void }) {
  const now = useCalendarNow();
  onNow(now);
  return null;
}

describe('useCalendarNow', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    emitAppState = null;
    jest.spyOn(AppState, 'addEventListener').mockImplementation((_event, listener) => {
      emitAppState = listener as (next: AppStateStatus) => void;
      return { remove: jest.fn() };
    });
  });

  afterEach(() => {
    act(() => tree?.unmount());
    tree = undefined;
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('refreshes when the app returns to the foreground', () => {
    const seen: Date[] = [];
    act(() => {
      tree = renderer.create(<Probe onNow={(value) => seen.push(value)} />);
    });
    const first = seen[seen.length - 1];

    act(() => {
      emitAppState?.('background');
    });
    expect(seen[seen.length - 1]).toBe(first);

    act(() => {
      emitAppState?.('active');
    });
    expect(seen[seen.length - 1]).not.toBe(first);
    expect(seen[seen.length - 1].getTime()).toBeGreaterThanOrEqual(first.getTime());
  });

  it('refreshes at the next local midnight', () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date(2026, 4, 10, 23, 59, 50));

    const seen: Date[] = [];
    act(() => {
      tree = renderer.create(<Probe onNow={(value) => seen.push(value)} />);
    });
    const beforeMidnight = seen[seen.length - 1];
    expect(beforeMidnight.getDate()).toBe(10);

    act(() => {
      jest.advanceTimersByTime(20_000);
    });
    expect(seen[seen.length - 1].getDate()).toBe(11);
  });
});
