import React from 'react';
import { Text } from 'react-native';
import { act, render, screen } from '@testing-library/react-native';
import { useRerenderAt } from '../useRerenderAt';
import {
  canRetrySeriesReveal,
  seriesRevealRetryOpensAtMs,
  type SeriesRevealState,
} from '@/lib/series-reveal-machine';

const NOW = 1_760_000_000_000;

// The error screen's retry button, reduced to its gate.
function RetryGate({ state }: { state: SeriesRevealState }) {
  useRerenderAt(seriesRevealRetryOpensAtMs(state));
  return <Text>{canRetrySeriesReveal(state, Date.now()) ? 'Try again' : 'Waiting'}</Text>;
}

describe('useRerenderAt', () => {
  beforeEach(() => {
    jest.useFakeTimers({ now: NOW });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('shows Try again once a rate limit\'s retry time passes, with nothing else rendering', () => {
    const state: SeriesRevealState = { kind: 'failed', jobId: null, reason: 'rate_limited', retryAtMs: NOW + 60_000 };
    render(<RetryGate state={state} />);
    expect(screen.getByText('Waiting')).toBeTruthy();

    act(() => {
      jest.advanceTimersByTime(59_999);
    });
    expect(screen.getByText('Waiting')).toBeTruthy();

    act(() => {
      jest.advanceTimersByTime(2);
    });
    expect(screen.getByText('Try again')).toBeTruthy();
  });

  it('waits again when a second rate limit follows the first retry', () => {
    const first: SeriesRevealState = { kind: 'failed', jobId: null, reason: 'rate_limited', retryAtMs: NOW + 60_000 };
    const { rerender } = render(<RetryGate state={first} />);
    act(() => {
      jest.advanceTimersByTime(60_001);
    });
    expect(screen.getByText('Try again')).toBeTruthy();
    expect(jest.getTimerCount()).toBe(0);

    // The reader tried again, and the next submit hit the limit too.
    const second: SeriesRevealState = { kind: 'failed', jobId: null, reason: 'rate_limited', retryAtMs: Date.now() + 60_000 };
    rerender(<RetryGate state={second} />);
    expect(screen.getByText('Waiting')).toBeTruthy();
    expect(jest.getTimerCount()).toBe(1);

    act(() => {
      jest.advanceTimersByTime(60_001);
    });
    expect(screen.getByText('Try again')).toBeTruthy();
  });

  it('replaces its timer when the retry time moves', () => {
    const first: SeriesRevealState = { kind: 'failed', jobId: null, reason: 'rate_limited', retryAtMs: NOW + 60_000 };
    const { rerender } = render(<RetryGate state={first} />);
    rerender(<RetryGate state={{ ...first, retryAtMs: NOW + 120_000 }} />);
    expect(jest.getTimerCount()).toBe(1);

    act(() => {
      jest.advanceTimersByTime(60_001);
    });
    expect(screen.getByText('Waiting')).toBeTruthy();
    act(() => {
      jest.advanceTimersByTime(60_000);
    });
    expect(screen.getByText('Try again')).toBeTruthy();
  });

  it('sets no timer for a failure that can be retried now', () => {
    const state: SeriesRevealState = { kind: 'failed', jobId: null, reason: 'unreachable', retryAtMs: null };
    render(<RetryGate state={state} />);

    expect(screen.getByText('Try again')).toBeTruthy();
    expect(jest.getTimerCount()).toBe(0);
  });

  it('clears its timer when the screen leaves before the retry time', () => {
    const state: SeriesRevealState = { kind: 'failed', jobId: null, reason: 'rate_limited', retryAtMs: NOW + 60_000 };
    const { unmount } = render(<RetryGate state={state} />);
    expect(jest.getTimerCount()).toBe(1);

    unmount();
    expect(jest.getTimerCount()).toBe(0);
  });
});

describe('seriesRevealRetryOpensAtMs', () => {
  it('names the retry time of a rate-limited failure only', () => {
    expect(seriesRevealRetryOpensAtMs({ kind: 'failed', jobId: null, reason: 'rate_limited', retryAtMs: NOW })).toBe(NOW);
    expect(seriesRevealRetryOpensAtMs({ kind: 'failed', jobId: null, reason: 'unreachable', retryAtMs: NOW })).toBeNull();
  });
});
