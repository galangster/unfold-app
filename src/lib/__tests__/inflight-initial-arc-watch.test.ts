import {
  INITIAL_ARC_INVALID_RESULT_MESSAGE,
  INITIAL_ARC_TIMEOUT_MESSAGE,
  INITIAL_ARC_UNKNOWN_STATUS_MESSAGE,
  watchInflightInitialArc,
  type InitialArcJobStatus,
} from '../inflight-initial-arc-watch';
import { MAX_UNKNOWN_GENERATION_STATUS } from '../generation-poll-outcome';

const immediate = async () => {};

const completedStatus: InitialArcJobStatus = {
  status: 'complete',
  result: {
    devotionalId: 'devo-1',
    seriesTitle: 'Rooted',
    totalDays: 7,
    devotionalDay: {
      dayNumber: 1,
      title: 'Day 1',
      scriptureReference: 'John 1:1',
      scriptureText: 'In the beginning was the Word.',
      bodyText: 'Body',
      quotableLine: 'Line',
      isRead: false,
    },
  },
};

function fetchSequence(statuses: (InitialArcJobStatus | Error)[]) {
  const fetchStatus = jest.fn<Promise<InitialArcJobStatus>, [string]>();
  for (const s of statuses) {
    if (s instanceof Error) fetchStatus.mockRejectedValueOnce(s);
    else fetchStatus.mockResolvedValueOnce(s);
  }
  return fetchStatus;
}

describe('watchInflightInitialArc', () => {
  it('resolves with the reconciled result when the job completes', async () => {
    const fetchStatus = fetchSequence([{ status: 'pending' }, { status: 'processing' }, completedStatus]);

    const outcome = await watchInflightInitialArc({ jobId: 'job-1', fetchStatus, sleep: immediate });

    expect(outcome.kind).toBe('complete');
    if (outcome.kind !== 'complete') throw new Error('unreachable');
    expect(outcome.result.devotionalId).toBe('devo-1');
    expect(outcome.result.devotionalDay.dayNumber).toBe(1);
    expect(fetchStatus).toHaveBeenCalledTimes(3);
    expect(fetchStatus).toHaveBeenCalledWith('job-1');
  });

  it('polls immediately, then waits between polls at the shared cadence', async () => {
    const order: string[] = [];
    const sleep = async (ms: number) => { order.push(`sleep:${ms}`); };
    const fetchStatus = async () => {
      order.push('fetch');
      return order.filter((o) => o === 'fetch').length < 3 ? { status: 'pending' } : completedStatus;
    };

    await watchInflightInitialArc({ jobId: 'job-1', fetchStatus, sleep, delayFor: () => 3_000 });

    expect(order).toEqual(['fetch', 'sleep:3000', 'fetch', 'sleep:3000', 'fetch']);
  });

  it('keeps polling through a throwing fetch at double cadence', async () => {
    const sleeps: number[] = [];
    const fetchStatus = fetchSequence([new Error('network'), completedStatus]);

    const outcome = await watchInflightInitialArc({
      jobId: 'job-1',
      fetchStatus,
      sleep: async (ms) => { sleeps.push(ms); },
      delayFor: () => 3_000,
    });

    expect(outcome.kind).toBe('complete');
    expect(sleeps).toEqual([6_000]);
  });

  it('fails with the server error when the job fails', async () => {
    const fetchStatus = fetchSequence([{ status: 'failed', error: 'Model overloaded', canRetry: false }]);

    await expect(watchInflightInitialArc({ jobId: 'job-1', fetchStatus, sleep: immediate })).resolves.toEqual({
      kind: 'failed',
      message: 'Model overloaded',
      phase: 'server-poll',
      canRetry: false,
    });
  });

  it('fails terminally on a complete response without an openable result', async () => {
    const fetchStatus = fetchSequence([{ status: 'complete', result: null }]);

    await expect(watchInflightInitialArc({ jobId: 'job-1', fetchStatus, sleep: immediate })).resolves.toEqual({
      kind: 'failed',
      message: INITIAL_ARC_INVALID_RESULT_MESSAGE,
      phase: 'server-poll-invalid-result',
      canRetry: true,
    });
  });

  it('tolerates a few unknown statuses, then fails', async () => {
    const fetchStatus = fetchSequence(
      Array.from({ length: MAX_UNKNOWN_GENERATION_STATUS + 1 }, () => ({ status: 'mystery' })),
    );

    const outcome = await watchInflightInitialArc({ jobId: 'job-1', fetchStatus, sleep: immediate });

    expect(outcome).toEqual({
      kind: 'failed',
      message: INITIAL_ARC_UNKNOWN_STATUS_MESSAGE,
      phase: 'server-poll-unknown-status',
      canRetry: true,
    });
    expect(fetchStatus).toHaveBeenCalledTimes(MAX_UNKNOWN_GENERATION_STATUS);
  });

  it('stops without a further fetch once cancelled', async () => {
    let cancelled = false;
    const fetchStatus = jest.fn(async () => ({ status: 'pending' }));

    const outcome = await watchInflightInitialArc({
      jobId: 'job-1',
      fetchStatus,
      isCancelled: () => cancelled,
      sleep: async () => { cancelled = true; },
    });

    expect(outcome).toEqual({ kind: 'cancelled' });
    expect(fetchStatus).toHaveBeenCalledTimes(1);
  });

  it('does not fetch at all when cancelled before it starts', async () => {
    const fetchStatus = jest.fn(async () => completedStatus);

    await expect(
      watchInflightInitialArc({ jobId: 'job-1', fetchStatus, isCancelled: () => true, sleep: immediate }),
    ).resolves.toEqual({ kind: 'cancelled' });
    expect(fetchStatus).not.toHaveBeenCalled();
  });

  it('gives up with the timeout copy once the job is past its budget, counted from submission', async () => {
    let clock = 1_000_000;
    const fetchStatus = jest.fn(async () => ({ status: 'pending' }));

    const outcome = await watchInflightInitialArc({
      jobId: 'job-1',
      fetchStatus,
      startedAt: clock,
      now: () => clock,
      maxDurationMs: 10_000,
      sleep: async (ms) => { clock += ms; },
      delayFor: () => 4_000,
    });

    expect(outcome).toEqual({
      kind: 'failed',
      message: INITIAL_ARC_TIMEOUT_MESSAGE,
      phase: 'server-poll-timeout',
      canRetry: true,
    });
    // Polled at t=0s, 4s, 8s; 12s is past the 10s budget.
    expect(fetchStatus).toHaveBeenCalledTimes(3);
  });

  it('times out immediately for a record already older than the budget', async () => {
    const fetchStatus = jest.fn(async () => completedStatus);

    const outcome = await watchInflightInitialArc({
      jobId: 'job-1',
      fetchStatus,
      startedAt: 0,
      now: () => 11 * 60 * 1000,
      sleep: immediate,
    });

    expect(outcome.kind).toBe('failed');
    expect(fetchStatus).not.toHaveBeenCalled();
  });
});
