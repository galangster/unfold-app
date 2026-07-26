import {
  decideOnboardingSeguePoll,
  runOnboardingSampleFallback,
} from '../onboarding-segue-poll';

const TIMEOUT_MS = 240_000;

describe('decideOnboardingSeguePoll (FIX 1: deadline never beats a completed job)', () => {
  it('is ready when the job completes exactly at the deadline', () => {
    expect(
      decideOnboardingSeguePoll({
        status: 'complete',
        hasNormalizedResult: true,
        elapsedMs: TIMEOUT_MS,
        timeoutMs: TIMEOUT_MS,
        hasFallback: true,
      }),
    ).toEqual({ kind: 'ready' });
  });

  it('is ready when the job completes well after the deadline', () => {
    expect(
      decideOnboardingSeguePoll({
        status: 'complete',
        hasNormalizedResult: true,
        elapsedMs: TIMEOUT_MS + 90_000,
        timeoutMs: TIMEOUT_MS,
        hasFallback: true,
      }),
    ).toEqual({ kind: 'ready' });
  });

  it('reports invalid when complete but the result cannot be normalized', () => {
    expect(
      decideOnboardingSeguePoll({
        status: 'complete',
        hasNormalizedResult: false,
        elapsedMs: 1000,
        timeoutMs: TIMEOUT_MS,
        hasFallback: true,
      }),
    ).toEqual({ kind: 'invalid' });
  });

  it('only times out when the job is still non-terminal past the deadline', () => {
    expect(
      decideOnboardingSeguePoll({
        status: 'processing',
        hasNormalizedResult: false,
        elapsedMs: TIMEOUT_MS + 1,
        timeoutMs: TIMEOUT_MS,
        hasFallback: true,
      }),
    ).toEqual({ kind: 'timeout' });
  });

  it('keeps waiting when non-terminal and inside the deadline', () => {
    expect(
      decideOnboardingSeguePoll({
        status: 'pending',
        hasNormalizedResult: false,
        elapsedMs: TIMEOUT_MS - 1,
        timeoutMs: TIMEOUT_MS,
        hasFallback: true,
      }),
    ).toEqual({ kind: 'waiting' });
  });

  it('marks a failed job retryable when a fallback submit is available', () => {
    expect(
      decideOnboardingSeguePoll({
        status: 'failed',
        hasNormalizedResult: false,
        elapsedMs: 1000,
        timeoutMs: TIMEOUT_MS,
        canRetry: false,
        hasFallback: true,
      }),
    ).toEqual({ kind: 'failed', canRetry: true });
  });

  it('respects a non-retryable failed job when there is no fallback', () => {
    expect(
      decideOnboardingSeguePoll({
        status: 'failed',
        hasNormalizedResult: false,
        elapsedMs: 1000,
        timeoutMs: TIMEOUT_MS,
        canRetry: false,
        hasFallback: false,
      }),
    ).toEqual({ kind: 'failed', canRetry: false });
  });
});

describe('runOnboardingSampleFallback (FIX 2: no duplicate job)', () => {
  it('polls a persisted job and never submits a new one', async () => {
    const usePersistedJob = jest.fn();
    const recoverCompleted = jest.fn(async () => false);
    const submitFallback = jest.fn(async () => {});

    const branch = await runOnboardingSampleFallback({
      persistedJobId: 'persisted-job-1',
      usePersistedJob,
      recoverCompleted,
      submitFallback,
    });

    expect(branch).toBe('persisted');
    expect(usePersistedJob).toHaveBeenCalledWith('persisted-job-1');
    expect(recoverCompleted).not.toHaveBeenCalled();
    expect(submitFallback).not.toHaveBeenCalled();
  });

  it('recovers a completed backend job and never submits a new one', async () => {
    const usePersistedJob = jest.fn();
    const recoverCompleted = jest.fn(async () => true);
    const submitFallback = jest.fn(async () => {});

    const branch = await runOnboardingSampleFallback({
      persistedJobId: null,
      usePersistedJob,
      recoverCompleted,
      submitFallback,
    });

    expect(branch).toBe('recovered');
    expect(recoverCompleted).toHaveBeenCalledTimes(1);
    expect(submitFallback).not.toHaveBeenCalled();
    expect(usePersistedJob).not.toHaveBeenCalled();
  });

  it('submits only when there is no persisted job and nothing to recover', async () => {
    const usePersistedJob = jest.fn();
    const recoverCompleted = jest.fn(async () => false);
    const submitFallback = jest.fn(async () => {});

    const branch = await runOnboardingSampleFallback({
      persistedJobId: null,
      usePersistedJob,
      recoverCompleted,
      submitFallback,
    });

    expect(branch).toBe('submitted');
    expect(recoverCompleted).toHaveBeenCalledTimes(1);
    expect(submitFallback).toHaveBeenCalledTimes(1);
    expect(usePersistedJob).not.toHaveBeenCalled();
  });
});
