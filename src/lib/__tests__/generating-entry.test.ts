import { resolveGeneratingEntry } from '../generating-entry';
import type { InflightGenerationJob } from '../inflight-generation-job';

const NOW = 1_700_000_000_000;
const liveRecord: InflightGenerationJob = { jobId: 'job-live', devotionalId: 'dev-live', submittedAt: NOW - 60_000 };
const pushParams = { jobId: 'job-failed', devotionalId: 'dev-failed' };

describe('resolveGeneratingEntry', () => {
  it('resumes the in-flight record when nothing named a job', () => {
    expect(resolveGeneratingEntry({ inflight: liveRecord, params: {}, sessionDevotionalId: null })).toEqual({
      kind: 'resume',
      inflight: liveRecord,
    });
    // A record the reader left for Today resumes here just the same.
    const left = { ...liveRecord, leftForHome: true as const };
    expect(resolveGeneratingEntry({ inflight: left, params: undefined, sessionDevotionalId: 'dev-old' })).toEqual({
      kind: 'resume',
      inflight: left,
    });
  });

  it('resumes the record for the very job the push named, whatever the session says', () => {
    // App killed mid-generation, the job failed, the push arrived: polling
    // the record reaches the same failed status with the server's own text.
    const record = { ...liveRecord, jobId: 'job-failed', devotionalId: 'dev-failed' };
    expect(resolveGeneratingEntry({ inflight: record, params: pushParams, sessionDevotionalId: 'dev-old' })).toEqual({
      kind: 'resume',
      inflight: record,
    });
  });

  it('polls the job the push named when the inflight record is gone', () => {
    expect(resolveGeneratingEntry({ inflight: null, params: pushParams, sessionDevotionalId: null })).toEqual({
      kind: 'poll-from-push',
      jobId: 'job-failed',
      devotionalId: 'dev-failed',
    });
    // The session still names the pushed series: still that job's own failure.
    expect(resolveGeneratingEntry({ inflight: null, params: pushParams, sessionDevotionalId: 'dev-failed' })).toMatchObject({
      kind: 'poll-from-push',
      jobId: 'job-failed',
    });
  });

  it('carries a null devotionalId when the push had none, and unwraps array params', () => {
    expect(resolveGeneratingEntry({ inflight: null, params: { jobId: 'job-failed' }, sessionDevotionalId: null })).toEqual({
      kind: 'poll-from-push',
      jobId: 'job-failed',
      devotionalId: null,
    });
    expect(
      resolveGeneratingEntry({
        inflight: null,
        params: { jobId: ['job-a', 'job-b'], devotionalId: ['dev-a'] },
        sessionDevotionalId: null,
      }),
    ).toEqual({ kind: 'poll-from-push', jobId: 'job-a', devotionalId: 'dev-a' });
  });

  // Jordan (item 8): the store's current devotional is not "the series the
  // reader moved on to". Onboarding's "I'll decide later" makes the sample
  // current, and "Start study" on a finished journey keeps that journey
  // current — so judging the push against it made every first-series failure
  // push a dead tap: Today, no failed card, no Try again.
  describe('the store\'s current devotional is never the staleness signal', () => {
    it('polls the pushed job while the onboarding sample is the only series the reader has', () => {
      // The first real series failed; Go home (or Dismiss on Today) cleared
      // the session, and the sample is still what the store calls current.
      expect(
        resolveGeneratingEntry({
          inflight: null,
          params: pushParams,
          sessionDevotionalId: null,
          landedDevotionalIds: ['onboarding-sample'],
        }),
      ).toEqual({ kind: 'poll-from-push', jobId: 'job-failed', devotionalId: 'dev-failed' });
    });

    it('polls the pushed job when a finished journey is current and the session was cleared', () => {
      expect(
        resolveGeneratingEntry({
          inflight: null,
          params: pushParams,
          sessionDevotionalId: null,
          landedDevotionalIds: ['dev-done', 'onboarding-sample'],
        }),
      ).toMatchObject({ kind: 'poll-from-push', jobId: 'job-failed' });
    });
  });

  // A "We hit a snag" push outlives the job it names: iOS keeps it in
  // Notification Center after the reader recovered. Landing on the old job's
  // failed state let Try again resurrect a superseded series.
  describe('a stale push goes to Today instead of the failed state', () => {
    it('when the reader started over and the session names the new series', () => {
      expect(resolveGeneratingEntry({ inflight: null, params: pushParams, sessionDevotionalId: 'dev-new' })).toEqual({
        kind: 'stale-push',
        jobId: 'job-failed',
      });
    });

    it('when a different job is in flight, marked for Today or not', () => {
      expect(resolveGeneratingEntry({ inflight: liveRecord, params: pushParams, sessionDevotionalId: null })).toEqual({
        kind: 'stale-push',
        jobId: 'job-failed',
      });
      const left = { ...liveRecord, leftForHome: true as const };
      expect(resolveGeneratingEntry({ inflight: left, params: pushParams, sessionDevotionalId: 'dev-old' })).toEqual({
        kind: 'stale-push',
        jobId: 'job-failed',
      });
    });

    it('when the push lost its devotionalId but the session names a series', () => {
      expect(
        resolveGeneratingEntry({ inflight: null, params: { jobId: 'job-failed' }, sessionDevotionalId: 'dev-new' }),
      ).toEqual({ kind: 'stale-push', jobId: 'job-failed' });
    });

    it('when the pushed series already landed in the store (a retry finished it after all)', () => {
      expect(
        resolveGeneratingEntry({
          inflight: null,
          params: pushParams,
          sessionDevotionalId: 'dev-failed',
          landedDevotionalIds: ['dev-failed'],
        }),
      ).toEqual({ kind: 'stale-push', jobId: 'job-failed' });
    });
  });

  // "Start over with new answers" used to delete the record; with no record
  // and no session the push for the abandoned job polled it back to life and
  // Try again re-ran the old answers. The record now stays, marked superseded.
  describe('a record superseded by Start over', () => {
    const superseded: InflightGenerationJob = { jobId: 'job-failed', submittedAt: NOW - 120_000, superseded: true };

    it('sends the push for that job to Today even with no session and no series', () => {
      expect(resolveGeneratingEntry({ inflight: superseded, params: pushParams, sessionDevotionalId: null })).toEqual({
        kind: 'stale-push',
        jobId: 'job-failed',
      });
    });

    it('sends a push for any other job to Today too: nothing newer was recorded here', () => {
      expect(
        resolveGeneratingEntry({ inflight: superseded, params: { jobId: 'job-older' }, sessionDevotionalId: null }),
      ).toEqual({ kind: 'stale-push', jobId: 'job-older' });
    });

    it('is nothing to resume: without a push the screen submits fresh over it', () => {
      expect(resolveGeneratingEntry({ inflight: superseded, params: {}, sessionDevotionalId: null })).toEqual({ kind: 'submit' });
      expect(resolveGeneratingEntry({ inflight: superseded, params: undefined, sessionDevotionalId: 'dev-old' })).toEqual({ kind: 'submit' });
    });
  });

  it('never asserts a failure itself: the named job is polled, whatever the push claimed', () => {
    const entry = resolveGeneratingEntry({ inflight: null, params: pushParams, sessionDevotionalId: null });
    expect(entry.kind).toBe('poll-from-push');
    expect(entry).not.toHaveProperty('error');
    expect(entry).not.toHaveProperty('canRetry');
  });

  it('submits fresh with neither a record nor a job in the params', () => {
    expect(resolveGeneratingEntry({ inflight: null, params: {}, sessionDevotionalId: null })).toEqual({ kind: 'submit' });
    expect(resolveGeneratingEntry({ inflight: null, params: undefined, sessionDevotionalId: null })).toEqual({ kind: 'submit' });
    expect(resolveGeneratingEntry({ inflight: null, params: { jobId: '' }, sessionDevotionalId: null })).toEqual({ kind: 'submit' });
    // "Start study" on a finished journey enters with no params and a
    // series in the store: that is a new submission, not a stale push.
    expect(
      resolveGeneratingEntry({ inflight: null, params: {}, sessionDevotionalId: null, landedDevotionalIds: ['dev-done'] }),
    ).toEqual({ kind: 'submit' });
  });
});

describe('H10 auto-trial-handoff', () => {
  const autoJob = { jobId: 'job-auto', devotionalId: 'dev-auto', submittedAt: NOW - 60_000 };
  const submitted = {
    intentId: 'intent-1',
    status: 'submitted' as const,
    jobId: 'job-auto',
    devotionalId: 'dev-auto',
  };

  it('hands off a matching jobId on inflight or push, and resumes a bare matching record', () => {
    expect(resolveGeneratingEntry({
      inflight: autoJob,
      params: { jobId: 'job-auto', devotionalId: 'dev-auto' },
      sessionDevotionalId: null,
      autoTrialIntent: submitted,
    })).toEqual({ kind: 'auto-trial-handoff', intentId: 'intent-1' });

    expect(resolveGeneratingEntry({
      inflight: null,
      params: { jobId: 'job-auto', devotionalId: 'dev-auto' },
      sessionDevotionalId: null,
      autoTrialIntent: submitted,
    })).toEqual({ kind: 'auto-trial-handoff', intentId: 'intent-1' });

    expect(resolveGeneratingEntry({
      inflight: autoJob,
      params: {},
      sessionDevotionalId: null,
      autoTrialIntent: submitted,
    })).toEqual({ kind: 'resume', inflight: autoJob });
  });

  it('a bare landed or submitted intent stays on the legacy path', () => {
    const landed = { ...submitted, status: 'landed' as const };
    expect(resolveGeneratingEntry({
      inflight: null,
      params: {},
      sessionDevotionalId: null,
      autoTrialIntent: landed,
    })).toEqual({ kind: 'submit' });
    expect(resolveGeneratingEntry({
      inflight: autoJob,
      params: {},
      sessionDevotionalId: null,
      autoTrialIntent: submitted,
    })).toEqual({ kind: 'resume', inflight: autoJob });
  });

  it('a bare purchased intent still hands off', () => {
    expect(resolveGeneratingEntry({
      inflight: null,
      params: {},
      sessionDevotionalId: null,
      autoTrialIntent: { intentId: 'intent-1', status: 'purchased', jobId: null, devotionalId: null },
    })).toEqual({ kind: 'auto-trial-handoff', intentId: 'intent-1' });
  });

  it('hands off submitted or landed when autoTrialIntentId matches', () => {
    expect(resolveGeneratingEntry({
      inflight: null,
      params: { autoTrialIntentId: 'intent-1' },
      sessionDevotionalId: null,
      autoTrialIntent: submitted,
    })).toEqual({ kind: 'auto-trial-handoff', intentId: 'intent-1' });
    expect(resolveGeneratingEntry({
      inflight: null,
      params: { autoTrialIntentId: 'intent-1' },
      sessionDevotionalId: null,
      autoTrialIntent: { ...submitted, status: 'landed' },
    })).toEqual({ kind: 'auto-trial-handoff', intentId: 'intent-1' });
  });

  it('keeps a mismatched autoTrialIntentId on the legacy path', () => {
    expect(resolveGeneratingEntry({
      inflight: autoJob,
      params: { autoTrialIntentId: 'intent-other' },
      sessionDevotionalId: null,
      autoTrialIntent: submitted,
    })).toEqual({ kind: 'resume', inflight: autoJob });
    expect(resolveGeneratingEntry({
      inflight: null,
      params: { autoTrialIntentId: 'intent-other' },
      sessionDevotionalId: null,
      autoTrialIntent: { ...submitted, status: 'landed' },
    })).toEqual({ kind: 'submit' });
  });

  it('submits a failed intent when a fresh new-series request id is present', () => {
    expect(resolveGeneratingEntry({
      inflight: null,
      params: {},
      sessionDevotionalId: null,
      autoTrialIntent: { intentId: 'intent-1', status: 'failed', jobId: 'job-auto', devotionalId: 'dev-auto' },
      initialGenerationRequestId: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
    })).toEqual({ kind: 'submit' });
  });

  it('hands off purchased or failed intents with no params', () => {
    expect(resolveGeneratingEntry({
      inflight: null,
      params: {},
      sessionDevotionalId: null,
      autoTrialIntent: { intentId: 'intent-1', status: 'purchased', jobId: null, devotionalId: null },
    })).toEqual({ kind: 'auto-trial-handoff', intentId: 'intent-1' });
    expect(resolveGeneratingEntry({
      inflight: null,
      params: {},
      sessionDevotionalId: null,
      autoTrialIntent: { intentId: 'intent-1', status: 'failed', jobId: 'job-auto', devotionalId: 'dev-auto' },
    })).toEqual({ kind: 'auto-trial-handoff', intentId: 'intent-1' });
  });

  it('resolves abandoned, revealed, completed, and a non-auto jobId as today', () => {
    expect(resolveGeneratingEntry({
      inflight: null,
      params: {},
      sessionDevotionalId: null,
      autoTrialIntent: { intentId: 'intent-1', status: 'abandoned', jobId: null, devotionalId: null },
    })).toEqual({ kind: 'submit' });
    expect(resolveGeneratingEntry({
      inflight: liveRecord,
      params: {},
      sessionDevotionalId: null,
      autoTrialIntent: { intentId: 'intent-1', status: 'revealed', jobId: 'job-auto', devotionalId: 'dev-auto' },
    })).toEqual({ kind: 'resume', inflight: liveRecord });
    expect(resolveGeneratingEntry({
      inflight: null,
      params: pushParams,
      sessionDevotionalId: null,
      autoTrialIntent: { intentId: 'intent-1', status: 'completed', jobId: 'job-auto', devotionalId: 'dev-auto' },
    })).toEqual({ kind: 'poll-from-push', jobId: 'job-failed', devotionalId: 'dev-failed' });
    expect(resolveGeneratingEntry({
      inflight: liveRecord,
      params: { jobId: 'job-other' },
      sessionDevotionalId: null,
      autoTrialIntent: submitted,
    })).toEqual({ kind: 'stale-push', jobId: 'job-other' });
  });
});
