import {
  INITIAL_ARC_INVALID_RESULT_MESSAGE,
  INITIAL_ARC_JOB_NOT_FOUND_MESSAGE,
  INITIAL_ARC_UNKNOWN_STATUS_MESSAGE,
  INITIAL_ARC_UNREACHABLE_MESSAGE,
  watchInflightInitialArc,
  type InitialArcJobStatus,
} from '../inflight-initial-arc-watch';
import { MAX_CONSECUTIVE_POLL_NETWORK_ERRORS, MAX_UNKNOWN_GENERATION_STATUS } from '../generation-poll-outcome';

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

  // Jordan (item 7): a ten-minute wall clock declared a running job failed
  // without asking the server. Time is never a verdict here either.
  it('never gives up on time alone: a job long past the old ten-minute cap still lands', async () => {
    let clock = 0;
    const fetchStatus = fetchSequence([{ status: 'processing' }, { status: 'processing' }, completedStatus]);

    const outcome = await watchInflightInitialArc({
      jobId: 'job-1',
      fetchStatus,
      startedAt: 0,
      now: () => clock,
      sleep: async (ms) => { clock += ms; },
      delayFor: () => 8 * 60 * 1000,
    });

    expect(outcome.kind).toBe('complete');
    expect(fetchStatus).toHaveBeenCalledTimes(3);
    expect(clock).toBeGreaterThan(10 * 60 * 1000);
  });

  it('polls a record already far older than the old cap instead of failing it unasked', async () => {
    const fetchStatus = jest.fn(async () => completedStatus);

    const outcome = await watchInflightInitialArc({
      jobId: 'job-1',
      fetchStatus,
      startedAt: 0,
      now: () => 3 * 60 * 60 * 1000,
      sleep: immediate,
    });

    expect(outcome.kind).toBe('complete');
    expect(fetchStatus).toHaveBeenCalledTimes(1);
  });

  it('regression: Jordan item 7 — keeps polling after a processing answer past ten minutes, never failing on time alone', async () => {
    // The old /generating loop declared "Something went wrong" once the wall
    // clock passed ten minutes, without a further server poll. Here the server
    // still says "processing" at twelve minutes and completes at twenty-four:
    // the watch must ask again, on either side of the old cap, and land the job.
    let clock = 0;
    const fetchStatus = fetchSequence([{ status: 'processing' }, { status: 'processing' }, completedStatus]);

    const outcome = await watchInflightInitialArc({
      jobId: 'job-1',
      fetchStatus,
      startedAt: 0,
      now: () => clock,
      sleep: async (ms) => { clock += ms; },
      delayFor: () => 12 * 60 * 1000,
    });

    expect(outcome.kind).toBe('complete');
    expect(fetchStatus).toHaveBeenCalledTimes(3);
    // The second answer arrived past the old cap, and the loop still asked again.
    expect(clock).toBe(24 * 60 * 1000);
  });

  it('gives up as unreachable, not failed, after the consecutive network-error cap', async () => {
    const fetchStatus = fetchSequence(
      Array.from({ length: MAX_CONSECUTIVE_POLL_NETWORK_ERRORS }, () => new Error('network')),
    );
    const sleeps: number[] = [];

    const outcome = await watchInflightInitialArc({
      jobId: 'job-1',
      fetchStatus,
      sleep: async (ms) => { sleeps.push(ms); },
      delayFor: () => 3_000,
    });

    expect(outcome).toEqual({ kind: 'unreachable', message: INITIAL_ARC_UNREACHABLE_MESSAGE });
    expect(fetchStatus).toHaveBeenCalledTimes(MAX_CONSECUTIVE_POLL_NETWORK_ERRORS);
    // A doubled-cadence wait between attempts; none after the give-up.
    expect(sleeps).toEqual(Array.from({ length: MAX_CONSECUTIVE_POLL_NETWORK_ERRORS - 1 }, () => 6_000));
  });

  it('resets the network-error count on every answer, so scattered failures never add up', async () => {
    const statuses: (InitialArcJobStatus | Error)[] = [];
    for (let round = 0; round < 3; round += 1) {
      for (let n = 0; n < MAX_CONSECUTIVE_POLL_NETWORK_ERRORS - 1; n += 1) statuses.push(new Error('network'));
      statuses.push({ status: 'processing' });
    }
    statuses.push(completedStatus);
    const fetchStatus = fetchSequence(statuses);

    const outcome = await watchInflightInitialArc({ jobId: 'job-1', fetchStatus, sleep: immediate });

    expect(outcome.kind).toBe('complete');
    expect(fetchStatus).toHaveBeenCalledTimes(statuses.length);
  });
});

// A record whose job the server does not hold (a deleted row, another backend
// environment, another device id) used to read as connectivity: six polls,
// 'unreachable', record kept — and, with no age gate, kept for good. The
// server answered; that answer is a verdict, and the record is dropped.
describe('watchInflightInitialArc — a job the server does not hold', () => {
  const gone = (status: number) => Object.assign(new Error(`Poll job failed: ${status}`), { status });

  it('fails terminally on the first 404, so the record is dropped instead of kept for good', async () => {
    const fetchStatus = fetchSequence([gone(404)]);
    const sleeps: number[] = [];

    await expect(
      watchInflightInitialArc({ jobId: 'job-1', fetchStatus, sleep: async (ms) => { sleeps.push(ms); } }),
    ).resolves.toEqual({
      kind: 'failed',
      message: INITIAL_ARC_JOB_NOT_FOUND_MESSAGE,
      phase: 'server-poll-not-found',
      canRetry: true,
    });
    expect(fetchStatus).toHaveBeenCalledTimes(1);
    expect(sleeps).toEqual([]);
  });

  it('treats an id the server cannot parse (400) the same way', async () => {
    const fetchStatus = fetchSequence([gone(400)]);

    const outcome = await watchInflightInitialArc({ jobId: 'not-a-uuid', fetchStatus, sleep: immediate });

    expect(outcome).toMatchObject({ kind: 'failed', phase: 'server-poll-not-found' });
    expect(fetchStatus).toHaveBeenCalledTimes(1);
  });

  it('still counts a 5xx or a bare network error toward the unreachable give-up, never as a verdict', async () => {
    const fetchStatus = fetchSequence([gone(503), new Error('network'), completedStatus]);

    const outcome = await watchInflightInitialArc({ jobId: 'job-1', fetchStatus, sleep: immediate });

    expect(outcome.kind).toBe('complete');
    expect(fetchStatus).toHaveBeenCalledTimes(3);
  });
});
