import React, { useEffect } from 'react';
import { AppState, type AppStateStatus } from 'react-native';

const renderer = require('react-test-renderer');
const { act } = renderer;

const mockFindDayJob = jest.fn();
const mockSubmitGenerationJob = jest.fn();
const mockPollJobStatus = jest.fn();
const mockRetryJob = jest.fn();
const mockOnNetwork = jest.fn();
let mockOnAppState: ((state: AppStateStatus) => void) | null = null;

jest.mock('@react-native-community/netinfo', () => ({
  __esModule: true,
  default: {
    fetch: jest.fn(async () => ({ isConnected: true, isInternetReachable: true })),
    addEventListener: jest.fn((listener: unknown) => {
      mockOnNetwork.mockImplementation(listener as (...args: unknown[]) => unknown);
      return jest.fn();
    }),
  },
}));

jest.mock('@/lib/generation-api', () => ({
  ApiError: class ApiError extends Error {},
  findDayJob: (...args: unknown[]) => mockFindDayJob(...args),
  submitGenerationJob: (...args: unknown[]) => mockSubmitGenerationJob(...args),
  pollJobStatus: (...args: unknown[]) => mockPollJobStatus(...args),
  retryJob: (...args: unknown[]) => mockRetryJob(...args),
  recoverCompletedGenerationResult: jest.fn(async () => null),
  normalizeGenerationResult: (result: { devotionalDay: unknown; devotionalId: string }) => result,
}));

jest.mock('@/lib/generation-session', () => ({
  captureSyncSession: () => 1,
  isSyncSessionCurrent: () => true,
  SyncSessionInvalidatedError: class SyncSessionInvalidatedError extends Error {},
}));

import { useGeneratedDayWatch, type GeneratedDayWatchResult } from '../useGeneratedDayWatch';
import { resetDailyGenerationRecoveryForTesting } from '@/lib/daily-generation-recovery';

function Probe({
  onDay,
  onValue,
  canMutate = true,
}: {
  onDay: jest.Mock;
  onValue: (value: GeneratedDayWatchResult) => void;
  canMutate?: boolean;
}) {
  const value = useGeneratedDayWatch({
    devotionalId: 'devo-1',
    dayNumber: 2,
    enabled: true,
    canMutate,
    onDay,
  });
  useEffect(() => onValue(value), [onValue, value]);
  return null;
}

describe('useGeneratedDayWatch', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockOnAppState = null;
    jest.spyOn(AppState, 'addEventListener').mockImplementation((_event, listener) => {
      mockOnAppState = listener as (state: AppStateStatus) => void;
      return { remove: jest.fn() };
    });
    resetDailyGenerationRecoveryForTesting();
    mockSubmitGenerationJob.mockResolvedValue({ jobId: 'job-new', status: 'pending', devotionalId: 'devo-1' });
    mockPollJobStatus.mockResolvedValue({
      jobId: 'job-1',
      jobType: 'day',
      devotionalId: 'devo-1',
      dayNumber: 2,
      status: 'processing',
    });
    mockRetryJob.mockResolvedValue({ jobId: 'job-1', status: 'pending' });
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('discovers and applies an existing day on the initial online mount', async () => {
    const day = {
      id: 'day-devo-1-2',
      devotionalId: 'devo-1',
      dayNumber: 2,
      title: 'Day 2',
      scriptureReference: 'John 1:1',
      scriptureText: 'In the beginning was the Word.',
      bodyText: 'Body',
      quotableLine: 'Line',
      isRead: false,
    };
    mockFindDayJob.mockResolvedValue({
      jobId: 'job-1',
      jobType: 'day',
      devotionalId: 'devo-1',
      dayNumber: 2,
      status: 'complete',
      result: { devotionalId: 'devo-1', devotionalDay: day },
    });
    const onDay = jest.fn();
    let tree: { unmount: () => void } | null = null;

    await act(async () => {
      tree = renderer.create(<Probe onDay={onDay} onValue={() => undefined} />);
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mockFindDayJob).toHaveBeenCalledWith('devo-1', 2, 1);
    expect(onDay).toHaveBeenCalledWith('devo-1', day);
    expect(mockSubmitGenerationJob).not.toHaveBeenCalled();
    act(() => tree?.unmount());
  });

  it('throttles foreground discovery per recovery key without throttling initial start', async () => {
    jest.useFakeTimers({ now: 1_000 });
    mockFindDayJob.mockResolvedValue(null);
    const onDay = jest.fn();
    let tree: { unmount: () => void } | null = null;

    await act(async () => {
      tree = renderer.create(<Probe onDay={onDay} onValue={() => undefined} canMutate={false} />);
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(mockFindDayJob).toHaveBeenCalledTimes(1);

    await act(async () => {
      mockOnAppState?.('active');
      await Promise.resolve();
      await Promise.resolve();
      mockOnAppState?.('active');
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(mockFindDayJob).toHaveBeenCalledTimes(2);

    await act(async () => {
      jest.advanceTimersByTime(10_000);
      mockOnAppState?.('active');
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(mockFindDayJob).toHaveBeenCalledTimes(3);
    act(() => tree?.unmount());
  });
});
