import type { AutoTrialIntentV1 } from '../auto-trial-intent';
import { MAX_CONSECUTIVE_POLL_NETWORK_ERRORS } from '../generation-poll-outcome';
import {
  canRetrySeriesReveal,
  reduceSeriesReveal,
  type SeriesRevealEvent,
  type SeriesRevealState,
} from '../series-reveal-machine';

const INTENT_ID = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const OTHER_ID = 'bbbbbbbb-cccc-4ddd-8eee-ffffffffffff';
const REQUEST_ID = '11111111-2222-4333-8444-555555555555';
const JOB_ID = 'job-1';
const DEVO_ID = 'devo-1';

function validIntent(overrides: Partial<AutoTrialIntentV1> = {}): AutoTrialIntentV1 {
  return {
    version: 1,
    intentId: INTENT_ID,
    deviceId: 'device-1',
    entry: 'onboarding',
    surface: 'onboarding_paywall',
    source: 'purchase',
    simulated: false,
    trialDays: 3,
    purchasedAt: '2026-09-08T17:00:00.000Z',
    expiresAt: '2026-09-11T17:00:00.000Z',
    purchaseLocalDate: '2026-09-08',
    timeZone: 'America/Chicago',
    platform: 'ios',
    isSandbox: false,
    productIdentifier: 'unfold_premium_yearly',
    switchEnabledAtPurchase: true,
    switchFetchedAt: '2026-09-08T17:00:00.000Z',
    requestId: REQUEST_ID,
    status: 'purchased',
    jobId: null,
    devotionalId: null,
    createdAt: '2026-09-08T17:00:00.000Z',
    updatedAt: '2026-09-08T17:00:00.000Z',
    submittedAt: null,
    landedAt: null,
    revealedAt: null,
    completedAt: null,
    dismissedAt: null,
    failedAt: null,
    failureCode: null,
    abandonedAt: null,
    abandonReason: null,
    ...overrides,
  };
}

const resolving: SeriesRevealState = { kind: 'resolving' };

function mounted(
  overrides: Partial<Extract<SeriesRevealEvent, { type: 'mounted' }>> = {},
): Extract<SeriesRevealEvent, { type: 'mounted' }> {
  return {
    type: 'mounted',
    intent: validIntent(),
    paramIntentId: INTENT_ID,
    hasCompletedOnboarding: true,
    day1Landed: false,
    expired: false,
    supersededByUserSeries: false,
    ...overrides,
  };
}

function reduce(state: SeriesRevealState, event: SeriesRevealEvent) {
  return reduceSeriesReveal(state, event);
}

describe('H1 reduceSeriesReveal mount table', () => {
  it('redirects Today when the intent is missing', () => {
    const result = reduce(resolving, mounted({ intent: null }));
    expect(result.state).toEqual({ kind: 'resolving' });
    expect(result.effects).toEqual([{ type: 'redirect', to: '/(tabs)/(today)' }]);
    expect(result.effects).not.toContainEqual({ type: 'submit' });
  });

  it('redirects Today when the param intentId does not match', () => {
    const result = reduce(resolving, mounted({ paramIntentId: OTHER_ID }));
    expect(result.state).toEqual({ kind: 'resolving' });
    expect(result.effects).toEqual([{ type: 'redirect', to: '/(tabs)/(today)' }]);
    expect(result.effects).not.toContainEqual({ type: 'submit' });
  });

  it('declines an expired purchased intent and does not submit', () => {
    const result = reduce(resolving, mounted({
      intent: validIntent({ status: 'purchased' }),
      expired: true,
    }));
    expect(result.state).toEqual({ kind: 'declined', reason: 'trial_expired' });
    expect(result.effects).toEqual([
      { type: 'transition', to: 'abandoned', reason: 'trial_expired_before_submit' },
    ]);
    expect(result.effects).not.toContainEqual({ type: 'submit' });
  });

  it('abandons a superseded purchased intent, redirects Today, and does not submit', () => {
    const result = reduce(resolving, mounted({
      intent: validIntent({ status: 'purchased' }),
      supersededByUserSeries: true,
    }));
    expect(result.state).toEqual({ kind: 'resolving' });
    expect(result.effects).toEqual([
      { type: 'transition', to: 'abandoned', reason: 'superseded_by_user_series' },
      { type: 'redirect', to: '/(tabs)/(today)' },
    ]);
    expect(result.effects).not.toContainEqual({ type: 'submit' });
  });

  it('sends an incomplete onboarding purchased intent back to onboarding', () => {
    const result = reduce(resolving, mounted({
      intent: validIntent({ status: 'purchased' }),
      hasCompletedOnboarding: false,
    }));
    expect(result.state).toEqual({ kind: 'resolving' });
    expect(result.effects).toEqual([{ type: 'redirect', to: '/onboarding' }]);
    expect(result.effects).not.toContainEqual({ type: 'submit' });
  });

  it('submits a purchased intent after onboarding with a null jobId', () => {
    const result = reduce(resolving, mounted({
      intent: validIntent({ status: 'purchased' }),
    }));
    expect(result.state).toEqual({
      kind: 'generating',
      jobId: null,
      devotionalId: null,
      consecutiveNetworkErrors: 0,
    });
    expect(result.effects).toEqual([{ type: 'submit' }]);
  });

  it('lands a submitted intent when Day 1 is already in the store', () => {
    const result = reduce(resolving, mounted({
      intent: validIntent({ status: 'submitted', jobId: JOB_ID, devotionalId: DEVO_ID }),
      day1Landed: true,
    }));
    expect(result.state).toEqual({ kind: 'revealed', devotionalId: DEVO_ID });
    expect(result.effects).toEqual([{ type: 'land' }]);
  });

  it('polls a submitted intent when Day 1 is not in the store', () => {
    const result = reduce(resolving, mounted({
      intent: validIntent({ status: 'submitted', jobId: JOB_ID, devotionalId: DEVO_ID }),
      day1Landed: false,
    }));
    expect(result.state).toEqual({
      kind: 'generating',
      jobId: JOB_ID,
      devotionalId: DEVO_ID,
      consecutiveNetworkErrors: 0,
    });
    expect(result.effects).toEqual([{ type: 'poll', jobId: JOB_ID }]);
  });

  it.each(['landed', 'revealed', 'completed'] as const)(
    'lands a %s intent when the devotional is in the store',
    (status) => {
      const result = reduce(resolving, mounted({
        intent: validIntent({ status, jobId: JOB_ID, devotionalId: DEVO_ID }),
        day1Landed: true,
      }));
      expect(result.state).toEqual({ kind: 'revealed', devotionalId: DEVO_ID });
      expect(result.effects).toEqual([{ type: 'land' }]);
    },
  );

  it.each(['landed', 'revealed'] as const)(
    'redirects Today when a %s intent is missing its devotional',
    (status) => {
      const result = reduce(resolving, mounted({
        intent: validIntent({ status, jobId: JOB_ID, devotionalId: DEVO_ID }),
        day1Landed: false,
      }));
      expect(result.state).toEqual({ kind: 'resolving' });
      expect(result.effects).toEqual([{ type: 'redirect', to: '/(tabs)/(today)' }]);
    },
  );

  it('opens retry_exhausted for a failed intent', () => {
    const result = reduce(resolving, mounted({
      intent: validIntent({ status: 'failed', jobId: JOB_ID, failureCode: 'MAX_RETRIES_EXCEEDED' }),
    }));
    expect(result.state).toEqual({
      kind: 'retry_exhausted',
      jobId: JOB_ID,
      reason: 'max_retries',
    });
    expect(result.effects).toEqual([]);
  });

  it('redirects Today for an abandoned intent', () => {
    const result = reduce(resolving, mounted({
      intent: validIntent({ status: 'abandoned', abandonReason: 'user_setup_fallback' }),
    }));
    expect(result.state).toEqual({ kind: 'resolving' });
    expect(result.effects).toEqual([{ type: 'redirect', to: '/(tabs)/(today)' }]);
  });
});

describe('H2 reduceSeriesReveal events', () => {
  const generating: SeriesRevealState = {
    kind: 'generating',
    jobId: JOB_ID,
    devotionalId: DEVO_ID,
    consecutiveNetworkErrors: 0,
  };

  it('maps submit_blocked expired to declined and never submits', () => {
    const result = reduce(generating, { type: 'submit_blocked', reason: 'expired' });
    expect(result.state).toEqual({ kind: 'declined', reason: 'trial_expired' });
    expect(result.effects).toEqual([
      { type: 'transition', to: 'abandoned', reason: 'trial_expired_before_submit' },
    ]);
    expect(result.effects).not.toContainEqual({ type: 'submit' });
  });

  it('maps submit_blocked superseded to Today and never submits', () => {
    const result = reduce(generating, { type: 'submit_blocked', reason: 'superseded' });
    expect(result.state).toEqual({ kind: 'resolving' });
    expect(result.effects).toEqual([
      { type: 'transition', to: 'abandoned', reason: 'superseded_by_user_series' },
      { type: 'redirect', to: '/(tabs)/(today)' },
    ]);
    expect(result.effects).not.toContainEqual({ type: 'submit' });
  });

  it('adopts submit_ok into generating and polls', () => {
    const from: SeriesRevealState = {
      kind: 'generating',
      jobId: null,
      devotionalId: null,
      consecutiveNetworkErrors: 0,
    };
    const result = reduce(from, {
      type: 'submit_ok',
      jobId: JOB_ID,
      devotionalId: DEVO_ID,
      claim: 'created',
    });
    expect(result.state).toEqual({
      kind: 'generating',
      jobId: JOB_ID,
      devotionalId: DEVO_ID,
      consecutiveNetworkErrors: 0,
    });
    expect(result.effects).toEqual([
      { type: 'transition', to: 'submitted' },
      { type: 'poll', jobId: JOB_ID },
    ]);
  });

  it('adopts submit_error existingJobId as submitted and polls', () => {
    const from: SeriesRevealState = {
      kind: 'generating',
      jobId: null,
      devotionalId: null,
      consecutiveNetworkErrors: 0,
    };
    const result = reduce(from, {
      type: 'submit_error',
      status: 409,
      code: 'ALREADY_GENERATED_TODAY',
      existingJobId: JOB_ID,
      nowMs: 1,
    });
    expect(result.state).toMatchObject({ kind: 'generating', jobId: JOB_ID });
    expect(result.effects).toEqual([
      { type: 'transition', to: 'submitted' },
      { type: 'poll', jobId: JOB_ID },
    ]);
  });

  it('declines 409 AUTO_TRIAL_UNAVAILABLE and abandons with trial_expired_before_submit', () => {
    const from: SeriesRevealState = {
      kind: 'generating',
      jobId: null,
      devotionalId: null,
      consecutiveNetworkErrors: 0,
    };
    const result = reduce(from, {
      type: 'submit_error',
      status: 409,
      code: 'trial_expired',
      existingJobId: null,
      nowMs: 1,
    });
    expect(result.state).toEqual({ kind: 'declined', reason: 'trial_expired' });
    expect(result.effects).toEqual([
      { type: 'transition', to: 'abandoned', reason: 'trial_expired_before_submit' },
    ]);
  });

  it('treats a 409 ALREADY_GENERATED_TODAY without a decline code as submit_failed', () => {
    const from: SeriesRevealState = {
      kind: 'generating',
      jobId: null,
      devotionalId: null,
      consecutiveNetworkErrors: 0,
    };
    const result = reduce(from, {
      type: 'submit_error',
      status: 409,
      code: 'ALREADY_GENERATED_TODAY',
      existingJobId: null,
      nowMs: 1,
    });
    expect(result.state).toEqual({
      kind: 'failed',
      jobId: null,
      reason: 'submit_failed',
      retryAtMs: null,
    });
    expect(result.effects).toEqual([]);
    expect(result.effects).not.toContainEqual(expect.objectContaining({
      type: 'transition',
      to: 'abandoned',
    }));
  });

  it('declines 409 switch_off as server_unavailable', () => {
    const from: SeriesRevealState = {
      kind: 'generating',
      jobId: null,
      devotionalId: null,
      consecutiveNetworkErrors: 0,
    };
    const result = reduce(from, {
      type: 'submit_error',
      status: 409,
      code: 'switch_off',
      existingJobId: null,
      nowMs: 1,
    });
    expect(result.state).toEqual({ kind: 'declined', reason: 'switch_off' });
    expect(result.effects).toEqual([
      { type: 'transition', to: 'abandoned', reason: 'server_unavailable' },
    ]);
  });

  it('rate-limits 429 for 60 seconds', () => {
    const now = 1_800_000_000_000;
    const from: SeriesRevealState = {
      kind: 'generating',
      jobId: null,
      devotionalId: null,
      consecutiveNetworkErrors: 0,
    };
    const result = reduce(from, {
      type: 'submit_error',
      status: 429,
      code: null,
      existingJobId: null,
      nowMs: now,
    });
    expect(result.state).toEqual({
      kind: 'failed',
      jobId: null,
      reason: 'rate_limited',
      retryAtMs: now + 60_000,
    });
  });

  it('exhausts 400 with transition failed and both clears', () => {
    const from: SeriesRevealState = {
      kind: 'generating',
      jobId: null,
      devotionalId: null,
      consecutiveNetworkErrors: 0,
    };
    const result = reduce(from, {
      type: 'submit_error',
      status: 400,
      code: 'BAD_REQUEST',
      existingJobId: null,
      nowMs: 1,
    });
    expect(result.state).toEqual({
      kind: 'retry_exhausted',
      jobId: null,
      reason: 'bad_request',
    });
    expect(result.effects).toEqual([
      { type: 'transition', to: 'failed' },
      { type: 'clear_inflight' },
      { type: 'clear_session' },
    ]);
  });

  it('keeps purchased on network or 5xx submit_error', () => {
    const from: SeriesRevealState = {
      kind: 'generating',
      jobId: null,
      devotionalId: null,
      consecutiveNetworkErrors: 0,
    };
    const result = reduce(from, {
      type: 'submit_error',
      status: 503,
      code: null,
      existingJobId: null,
      nowMs: 1,
    });
    expect(result.state).toEqual({
      kind: 'failed',
      jobId: null,
      reason: 'submit_failed',
      retryAtMs: null,
    });
    expect(result.effects).toEqual([]);
  });

  it('resets consecutive network errors on poll waiting or unknown-retry', () => {
    const from: SeriesRevealState = {
      ...generating,
      consecutiveNetworkErrors: 4,
    };
    const waiting = reduce(from, { type: 'poll', outcome: { kind: 'waiting' } });
    expect(waiting.state).toEqual({
      kind: 'generating',
      jobId: JOB_ID,
      devotionalId: DEVO_ID,
      consecutiveNetworkErrors: 0,
    });
    expect(waiting.effects).toEqual([{ type: 'poll', jobId: JOB_ID }]);

    const retry = reduce(from, { type: 'poll', outcome: { kind: 'unknown-retry' } });
    expect(retry.state).toMatchObject({ kind: 'generating', consecutiveNetworkErrors: 0 });
    expect(retry.effects).toEqual([{ type: 'poll', jobId: JOB_ID }]);
  });

  it('lands a complete poll', () => {
    const result = reduce(generating, {
      type: 'poll',
      outcome: {
        kind: 'complete',
        result: { devotionalId: DEVO_ID, devotionalDay: { dayNumber: 1 } } as never,
      },
    });
    expect(result.state).toEqual(generating);
    expect(result.effects).toEqual([{ type: 'land' }]);
  });

  it('moves a landed event to revealed', () => {
    const result = reduce(generating, { type: 'landed', devotionalId: DEVO_ID });
    expect(result.state).toEqual({ kind: 'revealed', devotionalId: DEVO_ID });
  });

  it('fails a retryable poll as job_failed', () => {
    const result = reduce(generating, {
      type: 'poll',
      outcome: { kind: 'failed', canRetry: true, error: 'model' },
    });
    expect(result.state).toEqual({
      kind: 'failed',
      jobId: JOB_ID,
      reason: 'job_failed',
      retryAtMs: null,
    });
  });

  it('exhausts a non-retryable poll with transition failed and both clears', () => {
    const result = reduce(generating, {
      type: 'poll',
      outcome: { kind: 'failed', canRetry: false, error: 'done' },
    });
    expect(result.state).toEqual({
      kind: 'retry_exhausted',
      jobId: JOB_ID,
      reason: 'max_retries',
    });
    expect(result.effects).toEqual([
      { type: 'transition', to: 'failed' },
      { type: 'clear_inflight' },
      { type: 'clear_session' },
    ]);
  });

  it('never yields retry_job on invalid-result and clears inflight and session', () => {
    const result = reduce(generating, { type: 'poll', outcome: { kind: 'invalid-result' } });
    expect(result.state).toEqual({
      kind: 'retry_exhausted',
      jobId: JOB_ID,
      reason: 'invalid_result',
    });
    expect(result.effects).toEqual([
      { type: 'transition', to: 'failed' },
      { type: 'clear_inflight' },
      { type: 'clear_session' },
    ]);
    expect(result.effects).not.toContainEqual({ type: 'retry_job', jobId: JOB_ID });
  });

  it('fails unknown-terminal as unknown_status', () => {
    const result = reduce(generating, { type: 'poll', outcome: { kind: 'unknown-terminal' } });
    expect(result.state).toEqual({
      kind: 'failed',
      jobId: JOB_ID,
      reason: 'unknown_status',
      retryAtMs: null,
    });
  });

  it('resubmits on the first job_gone and fails the second as submit_failed', () => {
    const first = reduce(generating, { type: 'job_gone' });
    expect(first.state).toEqual({
      kind: 'generating',
      jobId: null,
      devotionalId: DEVO_ID,
      consecutiveNetworkErrors: 0,
    });
    expect(first.effects).toEqual([{ type: 'submit' }]);

    const second = reduce(first.state, { type: 'job_gone' });
    expect(second.state).toEqual({
      kind: 'failed',
      jobId: null,
      reason: 'submit_failed',
      retryAtMs: null,
    });
  });

  it(`keeps generating through ${MAX_CONSECUTIVE_POLL_NETWORK_ERRORS - 1} unreachable events and fails on the cap`, () => {
    let state: SeriesRevealState = generating;
    for (let count = 1; count < MAX_CONSECUTIVE_POLL_NETWORK_ERRORS; count += 1) {
      const result = reduce(state, { type: 'unreachable' });
      expect(result.state).toEqual({
        kind: 'generating',
        jobId: JOB_ID,
        devotionalId: DEVO_ID,
        consecutiveNetworkErrors: count,
      });
      expect(result.effects).toEqual([{ type: 'poll', jobId: JOB_ID }]);
      state = result.state;
    }
    const capped = reduce(state, { type: 'unreachable' });
    expect(capped.state).toEqual({
      kind: 'failed',
      jobId: JOB_ID,
      reason: 'unreachable',
      retryAtMs: null,
    });
  });

  it('resets the unreachable count when a waiting poll lands between them', () => {
    const five = reduce(
      { ...generating, consecutiveNetworkErrors: 4 },
      { type: 'unreachable' },
    );
    expect(five.state).toMatchObject({ consecutiveNetworkErrors: 5 });
    const reset = reduce(five.state, { type: 'poll', outcome: { kind: 'waiting' } });
    expect(reset.state).toMatchObject({ consecutiveNetworkErrors: 0 });
  });

  it('exhausts MAX_RETRIES_EXCEEDED with transition failed and both clears', () => {
    const result = reduce(generating, { type: 'retry_error', code: 'MAX_RETRIES_EXCEEDED' });
    expect(result.state).toEqual({
      kind: 'retry_exhausted',
      jobId: JOB_ID,
      reason: 'max_retries',
    });
    expect(result.effects).toEqual([
      { type: 'transition', to: 'failed' },
      { type: 'clear_inflight' },
      { type: 'clear_session' },
    ]);
  });

  it('retries job_failed with retry_job and never submit', () => {
    const failed: SeriesRevealState = {
      kind: 'failed',
      jobId: JOB_ID,
      reason: 'job_failed',
      retryAtMs: null,
    };
    const result = reduce(failed, { type: 'try_again', nowMs: 1 });
    expect(result.state).toMatchObject({ kind: 'generating', jobId: JOB_ID });
    expect(result.effects).toEqual([{ type: 'retry_job', jobId: JOB_ID }]);
    expect(result.effects).not.toContainEqual({ type: 'submit' });
  });

  it('polls again on unreachable try_again', () => {
    const failed: SeriesRevealState = {
      kind: 'failed',
      jobId: JOB_ID,
      reason: 'unreachable',
      retryAtMs: null,
    };
    const result = reduce(failed, { type: 'try_again', nowMs: 1 });
    expect(result.effects).toEqual([{ type: 'poll', jobId: JOB_ID }]);
  });

  it('hides Try again while the rate-limit window is open', () => {
    const limited: SeriesRevealState = {
      kind: 'failed',
      jobId: null,
      reason: 'rate_limited',
      retryAtMs: 60_000,
    };
    expect(canRetrySeriesReveal(limited, 1)).toBe(false);
    expect(canRetrySeriesReveal(limited, 60_000)).toBe(true);
    expect(reduce(limited, { type: 'try_again', nowMs: 1 })).toEqual({ state: limited, effects: [] });
  });

  it('resubmits submit_failed on try_again', () => {
    const failed: SeriesRevealState = {
      kind: 'failed',
      jobId: null,
      reason: 'submit_failed',
      retryAtMs: null,
    };
    const result = reduce(failed, { type: 'try_again', nowMs: 1 });
    expect(result.effects).toEqual([{ type: 'submit' }]);
  });

  it('OI-24: a landed event from generating reveals instead of treating the job as gone', () => {
    const result = reduce(generating, { type: 'landed', devotionalId: DEVO_ID });
    expect(result.state).toEqual({ kind: 'revealed', devotionalId: DEVO_ID });
    expect(result.effects).not.toContainEqual({ type: 'submit' });
    expect(result.effects).not.toContainEqual({ type: 'retry_job', jobId: JOB_ID });
  });

  it('includes inflight and session clears on every transition failed', () => {
    const cases: SeriesRevealEvent[] = [
      { type: 'submit_error', status: 400, code: null, existingJobId: null, nowMs: 1 },
      { type: 'poll', outcome: { kind: 'failed', canRetry: false, error: 'x' } },
      { type: 'poll', outcome: { kind: 'invalid-result' } },
      { type: 'retry_error', code: 'MAX_RETRIES_EXCEEDED' },
    ];
    for (const event of cases) {
      const result = reduce(generating, event);
      expect(result.effects).toEqual(expect.arrayContaining([
        { type: 'transition', to: 'failed' },
        { type: 'clear_inflight' },
        { type: 'clear_session' },
      ]));
    }
  });
});
