// mmkv-storage is mocked so we can import the real ApiError from generation-api
// (its module graph reaches native MMKV) to build a faithful submit-failure.
jest.mock('../mmkv-storage', () => ({
  mmkvStorage: {
    getItem: jest.fn(() => null),
    setItem: jest.fn(),
    removeItem: jest.fn(),
  },
  getDeviceId: jest.fn(() => 'test-device-id'),
  getSharedEncryptionKey: jest.fn(() => 'test-key'),
}));

import {
  countConsecutiveNetworkErrors,
  evaluateGenerationDeadline,
  evaluateGenerationPoll,
  getNextPollDelayMs,
  isInflightRecordExpired,
  resolveGenerationRetryAction,
  resolveGenerationSubmitFailure,
  resolveGoHomeCleanup,
  resolveInflightResume,
  shiftPollStart,
  INFLIGHT_MAX_AGE_MS,
  LONG_RUNNING_AFTER_MS,
  MAX_CONSECUTIVE_POLL_NETWORK_ERRORS,
  MAX_UNKNOWN_GENERATION_STATUS,
  POLL_DELAY_AFTER_1_MIN_MS,
  POLL_DELAY_AFTER_3_MIN_MS,
  POLL_DELAY_INITIAL_MS,
} from '../generation-poll-outcome';
import { ApiError } from '../generation-api';

// Minimal devotional day — reconciliation only needs enough to derive identity.
const day = { title: 'Day 1' } as never;

describe('evaluateGenerationPoll', () => {
  it('returns complete with a reconciled result when the job is done', () => {
    const { outcome } = evaluateGenerationPoll({
      status: 'complete',
      result: { devotionalDay: day, devotionalId: 'dev-1' },
      priorConsecutiveUnknown: 0,
    });
    expect(outcome.kind).toBe('complete');
    if (outcome.kind === 'complete') {
      expect(outcome.result.devotionalId).toBe('dev-1');
      expect(outcome.result.devotionalDay.dayNumber).toBe(1);
    }
  });

  it('FIX 3a: complete WITHOUT a result is terminal (invalid-result)', () => {
    const { outcome } = evaluateGenerationPoll({
      status: 'complete',
      result: undefined,
      priorConsecutiveUnknown: 0,
    });
    expect(outcome).toEqual({ kind: 'invalid-result' });
  });

  it('FIX 3b: a result that cannot be reconciled is terminal, not a retry', () => {
    // devotionalDay present but no devotionalId anywhere -> reconcile throws.
    const { outcome } = evaluateGenerationPoll({
      status: 'complete',
      result: { devotionalDay: day },
      fallbackDevotionalId: null,
      priorConsecutiveUnknown: 0,
    });
    expect(outcome).toEqual({ kind: 'invalid-result' });
  });

  it('classifies a failed job and honors server retryability', () => {
    expect(
      evaluateGenerationPoll({ status: 'failed', canRetry: false, error: 'boom', priorConsecutiveUnknown: 0 })
        .outcome,
    ).toEqual({ kind: 'failed', canRetry: false, error: 'boom' });

    expect(
      evaluateGenerationPoll({ status: 'failed', priorConsecutiveUnknown: 0 }).outcome,
    ).toEqual({ kind: 'failed', canRetry: true, error: 'Generation failed on server' });
  });

  it('keeps waiting on pending / processing and resets the unknown counter', () => {
    expect(evaluateGenerationPoll({ status: 'pending', priorConsecutiveUnknown: 2 })).toEqual({
      outcome: { kind: 'waiting' },
      consecutiveUnknown: 0,
    });
    expect(evaluateGenerationPoll({ status: 'processing', priorConsecutiveUnknown: 2 })).toEqual({
      outcome: { kind: 'waiting' },
      consecutiveUnknown: 0,
    });
  });

  it('FIX 3c: three consecutive unknown statuses become terminal', () => {
    let consecutiveUnknown = 0;
    const results: string[] = [];
    for (let i = 0; i < MAX_UNKNOWN_GENERATION_STATUS; i += 1) {
      const step = evaluateGenerationPoll({ status: 'garbage', priorConsecutiveUnknown: consecutiveUnknown });
      consecutiveUnknown = step.consecutiveUnknown;
      results.push(step.outcome.kind);
    }
    expect(results).toEqual(['unknown-retry', 'unknown-retry', 'unknown-terminal']);
    expect(consecutiveUnknown).toBe(3);
  });
});

describe('resolveGenerationSubmitFailure', () => {
  it('FIX 3d: adopts the existing job when the ApiError carries existingJobId', () => {
    const err = new ApiError('Already generated today', 409, 'ALREADY_GENERATED_TODAY', 'existing-job-1');
    expect(resolveGenerationSubmitFailure(err)).toEqual({
      kind: 'adopt-existing',
      jobId: 'existing-job-1',
    });
  });

  it('falls back to a plain failure when there is no existing job id', () => {
    expect(resolveGenerationSubmitFailure(new Error('network down'))).toEqual({
      kind: 'fail',
      message: 'network down',
    });
    const apiErr = new ApiError('bad', 500, 'SERVER_ERROR');
    expect(resolveGenerationSubmitFailure(apiErr)).toEqual({ kind: 'fail', message: 'bad' });
  });
});

describe('getNextPollDelayMs', () => {
  const rngValues = [0, 0.25, 0.5, 0.999, 1];

  it('holds a fixed 3s cadence for the whole first minute, whatever the rng says', () => {
    for (const elapsed of [0, 1, 2_999, 30_000, 59_000, 59_999]) {
      for (const r of rngValues) {
        expect(getNextPollDelayMs(elapsed, () => r)).toBe(3_000);
      }
    }
    expect(POLL_DELAY_INITIAL_MS).toBe(3_000);
  });

  it('steps to the 5s tier at exactly 60s with ±20% jitter', () => {
    expect(POLL_DELAY_AFTER_1_MIN_MS).toBe(5_000);
    expect(getNextPollDelayMs(60_000, () => 0.5)).toBe(5_000);
    expect(getNextPollDelayMs(60_000, () => 0)).toBe(4_000);
    expect(getNextPollDelayMs(60_000, () => 1)).toBe(6_000);
    // Still the middle tier just before three minutes.
    expect(getNextPollDelayMs(179_999, () => 0.5)).toBe(5_000);
  });

  it('caps at the 8s tier from exactly 3 minutes onward', () => {
    expect(POLL_DELAY_AFTER_3_MIN_MS).toBe(8_000);
    for (const elapsed of [180_000, 240_000, 9 * 60_000, 10 * 60_000, 60 * 60_000]) {
      expect(getNextPollDelayMs(elapsed, () => 0.5)).toBe(8_000);
      expect(getNextPollDelayMs(elapsed, () => 0)).toBe(6_400);
      expect(getNextPollDelayMs(elapsed, () => 1)).toBe(9_600);
    }
  });

  it('never leaves the jitter band of the active tier', () => {
    for (let i = 0; i < 500; i++) {
      const r = Math.random();
      const mid = getNextPollDelayMs(60_000 + i * 100, () => r);
      expect(mid).toBeGreaterThanOrEqual(4_000);
      expect(mid).toBeLessThanOrEqual(6_000);
      const top = getNextPollDelayMs(180_000 + i * 1_000, () => r);
      expect(top).toBeGreaterThanOrEqual(6_400);
      expect(top).toBeLessThanOrEqual(9_600);
    }
    // An out-of-range rng is clamped rather than trusted.
    expect(getNextPollDelayMs(180_000, () => -3)).toBe(6_400);
    expect(getNextPollDelayMs(180_000, () => 7)).toBe(9_600);
  });

  it('uses Math.random by default and returns whole milliseconds', () => {
    const delay = getNextPollDelayMs(200_000);
    expect(Number.isInteger(delay)).toBe(true);
    expect(delay).toBeGreaterThanOrEqual(6_400);
    expect(delay).toBeLessThanOrEqual(9_600);
  });

  it('treats a non-finite or negative elapsed time as the start of the job', () => {
    expect(getNextPollDelayMs(Number.NaN, () => 1)).toBe(3_000);
    expect(getNextPollDelayMs(-5_000, () => 1)).toBe(3_000);
  });
});

describe('evaluateGenerationDeadline — the wall clock is never a verdict', () => {
  it('keeps polling before the long-running threshold', () => {
    expect(LONG_RUNNING_AFTER_MS).toBe(10 * 60 * 1000);
    for (const elapsed of [0, 1, 60_000, LONG_RUNNING_AFTER_MS - 1]) {
      expect(evaluateGenerationDeadline({ elapsedMs: elapsed, consecutiveNetworkErrors: 0 })).toBe('poll');
    }
  });

  it('softens to long-running past the threshold and never errors on time alone', () => {
    for (const elapsed of [LONG_RUNNING_AFTER_MS, 11 * 60_000, 25 * 60_000, 3 * 60 * 60_000]) {
      expect(evaluateGenerationDeadline({ elapsedMs: elapsed, consecutiveNetworkErrors: 0 })).toBe('long-running');
    }
    expect(evaluateGenerationDeadline({ elapsedMs: 5_000, maxDurationMs: 4_000, consecutiveNetworkErrors: 0 })).toBe(
      'long-running',
    );
  });

  it('stays long-running, not failed, while the server keeps reporting the job alive', () => {
    let consecutive = 0;
    for (let i = 0; i < 20; i += 1) {
      const { outcome } = evaluateGenerationPoll({ status: i % 2 ? 'processing' : 'pending', priorConsecutiveUnknown: 0 });
      expect(outcome.kind).toBe('waiting');
      consecutive = countConsecutiveNetworkErrors(consecutive, true);
      expect(
        evaluateGenerationDeadline({ elapsedMs: LONG_RUNNING_AFTER_MS + i * 8_000, consecutiveNetworkErrors: consecutive }),
      ).toBe('long-running');
    }
  });

  it('gives up only after the consecutive network-error cap', () => {
    expect(MAX_CONSECUTIVE_POLL_NETWORK_ERRORS).toBe(6);
    let consecutive = 0;
    for (let n = 1; n < MAX_CONSECUTIVE_POLL_NETWORK_ERRORS; n += 1) {
      consecutive = countConsecutiveNetworkErrors(consecutive, false);
      expect(consecutive).toBe(n);
      expect(evaluateGenerationDeadline({ elapsedMs: 30_000, consecutiveNetworkErrors: consecutive })).toBe('poll');
    }
    consecutive = countConsecutiveNetworkErrors(consecutive, false);
    expect(evaluateGenerationDeadline({ elapsedMs: 30_000, consecutiveNetworkErrors: consecutive })).toBe('network-error');
    // The network cap wins over the long-running state.
    expect(evaluateGenerationDeadline({ elapsedMs: 20 * 60_000, consecutiveNetworkErrors: 7 })).toBe('network-error');
    // Custom cap.
    expect(evaluateGenerationDeadline({ elapsedMs: 0, consecutiveNetworkErrors: 2, maxNetworkErrors: 2 })).toBe(
      'network-error',
    );
  });

  it('a successful poll resets the counter so scattered failures never accumulate', () => {
    let consecutive = 0;
    for (let round = 0; round < 5; round += 1) {
      for (let n = 0; n < MAX_CONSECUTIVE_POLL_NETWORK_ERRORS - 1; n += 1) {
        consecutive = countConsecutiveNetworkErrors(consecutive, false);
      }
      expect(evaluateGenerationDeadline({ elapsedMs: 0, consecutiveNetworkErrors: consecutive })).toBe('poll');
      consecutive = countConsecutiveNetworkErrors(consecutive, true);
      expect(consecutive).toBe(0);
    }
  });

  it('treats NaN or negative elapsed time as the start of the job', () => {
    expect(evaluateGenerationDeadline({ elapsedMs: Number.NaN, consecutiveNetworkErrors: 0 })).toBe('poll');
    expect(evaluateGenerationDeadline({ elapsedMs: -5_000, consecutiveNetworkErrors: 0 })).toBe('poll');
  });
});

describe('shiftPollStart — background time does not count toward the threshold', () => {
  it('moves the start forward by the backgrounded duration', () => {
    const start = 1_000;
    const backgroundedAt = start + 2 * 60_000; // polled for 2 min
    const now = backgroundedAt + 12 * 60_000; // away for 12 min
    const shifted = shiftPollStart(start, backgroundedAt, now);
    expect(shifted).toBe(start + 12 * 60_000);
    // On foreground the job reads as 2 minutes old, not 14.
    expect(now - shifted).toBe(2 * 60_000);
    expect(evaluateGenerationDeadline({ elapsedMs: now - shifted, consecutiveNetworkErrors: 0 })).toBe('poll');
  });

  it('is a no-op for a zero, negative, or NaN pause', () => {
    expect(shiftPollStart(1_000, 5_000, 5_000)).toBe(1_000);
    expect(shiftPollStart(1_000, 5_000, 4_000)).toBe(1_000);
    expect(shiftPollStart(1_000, Number.NaN, 5_000)).toBe(1_000);
  });

  it('never moves the start past now', () => {
    // Start recorded after the app went inactive (submission finished while inactive).
    expect(shiftPollStart(9_000, 5_000, 10_000)).toBe(10_000);
  });
});

describe('resolveGenerationRetryAction — Try again never duplicates a series', () => {
  it('resubmits only when no job is known (the server dedups active and completed work)', () => {
    expect(resolveGenerationRetryAction({ pendingJobId: null, observedState: 'unobserved' })).toEqual({ kind: 'resubmit' });
    expect(resolveGenerationRetryAction({ pendingJobId: '', observedState: 'failed' })).toEqual({ kind: 'resubmit' });
  });

  it('retries the SAME job after a server failure verdict', () => {
    expect(resolveGenerationRetryAction({ pendingJobId: 'job-1', observedState: 'failed' })).toEqual({
      kind: 'retry-existing',
      jobId: 'job-1',
    });
    for (const observedState of ['invalid-result', 'unknown-terminal', 'complete'] as const) {
      expect(resolveGenerationRetryAction({ pendingJobId: 'job-1', observedState })).toEqual({
        kind: 'retry-existing',
        jobId: 'job-1',
      });
    }
  });

  it('re-polls the same job when the client gave up on network errors (job may be alive or done)', () => {
    for (const observedState of ['unobserved', 'alive'] as const) {
      expect(resolveGenerationRetryAction({ pendingJobId: 'job-1', observedState })).toEqual({
        kind: 'resume-poll',
        jobId: 'job-1',
      });
    }
  });

  it('a from-scratch resubmit that hits the completed-day 409 adopts the existing job', () => {
    const err = new ApiError('Already generated today', 409, 'ALREADY_GENERATED_TODAY', 'job-existing');
    expect(resolveGenerationSubmitFailure(err)).toEqual({ kind: 'adopt-existing', jobId: 'job-existing' });
  });
});

describe('resolveGoHomeCleanup — leaving must not orphan a live job', () => {
  it('clears the inflight record after a terminal server verdict or with no job', () => {
    expect(resolveGoHomeCleanup({ pendingJobId: null, observedState: 'unobserved' })).toBe('clear');
    for (const observedState of ['failed', 'invalid-result', 'unknown-terminal', 'complete'] as const) {
      expect(resolveGoHomeCleanup({ pendingJobId: 'job-1', observedState })).toBe('clear');
    }
  });

  it('keeps the inflight record while the job may still be alive', () => {
    for (const observedState of ['unobserved', 'alive'] as const) {
      expect(resolveGoHomeCleanup({ pendingJobId: 'job-1', observedState })).toBe('keep-inflight');
    }
  });
});

describe('resolveInflightResume — Today asks the server before routing back', () => {
  const now = 1_700_000_000_000;

  it('expires a record at 25 minutes (formerly 15) and treats a corrupt timestamp as expired', () => {
    expect(INFLIGHT_MAX_AGE_MS).toBe(25 * 60 * 1000);
    expect(isInflightRecordExpired(now - INFLIGHT_MAX_AGE_MS + 1, now)).toBe(false);
    expect(isInflightRecordExpired(now - INFLIGHT_MAX_AGE_MS, now)).toBe(true);
    expect(isInflightRecordExpired(Number.NaN, now)).toBe(true);
    expect(resolveInflightResume({ submittedAt: now - 30 * 60_000, now, serverStatus: 'processing' })).toBe('discard');
  });

  it('resumes only when the server reports the job alive or complete', () => {
    for (const serverStatus of ['pending', 'processing', 'complete']) {
      expect(resolveInflightResume({ submittedAt: now - 20 * 60_000, now, serverStatus })).toBe('resume');
    }
  });

  it('discards a failed job and keeps the record when the status could not be fetched', () => {
    expect(resolveInflightResume({ submittedAt: now - 60_000, now, serverStatus: 'failed' })).toBe('discard');
    expect(resolveInflightResume({ submittedAt: now - 60_000, now, serverStatus: undefined })).toBe('keep');
    expect(resolveInflightResume({ submittedAt: now - 60_000, now, serverStatus: null })).toBe('keep');
    expect(resolveInflightResume({ submittedAt: now - 60_000, now, serverStatus: 'garbage' })).toBe('keep');
  });
});
