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
  evaluateGenerationPoll,
  resolveGenerationSubmitFailure,
  MAX_UNKNOWN_GENERATION_STATUS,
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
