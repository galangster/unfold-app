import { resolveGeneratingEntry } from '../generating-entry';
import type { InflightGenerationJob } from '../inflight-generation-job';

const NOW = 1_700_000_000_000;
const liveRecord: InflightGenerationJob = { jobId: 'job-live', devotionalId: 'dev-live', submittedAt: NOW - 60_000 };
const pushParams = { jobId: 'job-failed', devotionalId: 'dev-failed' };

describe('resolveGeneratingEntry', () => {
  it('resumes the in-flight record when nothing named a job', () => {
    expect(resolveGeneratingEntry({ inflight: liveRecord, params: {}, currentDevotionalId: null })).toEqual({
      kind: 'resume',
      inflight: liveRecord,
    });
    // A record the reader left for Today resumes here just the same.
    const left = { ...liveRecord, leftForHome: true as const };
    expect(resolveGeneratingEntry({ inflight: left, params: undefined, currentDevotionalId: 'dev-old' })).toEqual({
      kind: 'resume',
      inflight: left,
    });
  });

  it('resumes the record for the very job the push named, whatever is current', () => {
    // App killed mid-generation, the job failed, the push arrived: polling
    // the record reaches the same failed status with the server's own text.
    const record = { ...liveRecord, jobId: 'job-failed', devotionalId: 'dev-failed' };
    expect(resolveGeneratingEntry({ inflight: record, params: pushParams, currentDevotionalId: 'dev-old' })).toEqual({
      kind: 'resume',
      inflight: record,
    });
  });

  it('polls the job the push named when the inflight record is gone', () => {
    expect(resolveGeneratingEntry({ inflight: null, params: pushParams, currentDevotionalId: null })).toEqual({
      kind: 'poll-from-push',
      jobId: 'job-failed',
      devotionalId: 'dev-failed',
    });
    // The pushed series is the current one: still that job's own failure.
    expect(resolveGeneratingEntry({ inflight: null, params: pushParams, currentDevotionalId: 'dev-failed' })).toMatchObject({
      kind: 'poll-from-push',
      jobId: 'job-failed',
    });
  });

  it('carries a null devotionalId when the push had none, and unwraps array params', () => {
    expect(resolveGeneratingEntry({ inflight: null, params: { jobId: 'job-failed' }, currentDevotionalId: null })).toEqual({
      kind: 'poll-from-push',
      jobId: 'job-failed',
      devotionalId: null,
    });
    expect(
      resolveGeneratingEntry({
        inflight: null,
        params: { jobId: ['job-a', 'job-b'], devotionalId: ['dev-a'] },
        currentDevotionalId: null,
      }),
    ).toEqual({ kind: 'poll-from-push', jobId: 'job-a', devotionalId: 'dev-a' });
  });

  // A "We hit a snag" push outlives the job it names: iOS keeps it in
  // Notification Center after the reader recovered. Landing on the old job's
  // failed state let Try again resurrect a superseded series.
  describe('a stale push goes to Today instead of the failed state', () => {
    it('when the reader started over and a new series is current', () => {
      expect(resolveGeneratingEntry({ inflight: null, params: pushParams, currentDevotionalId: 'dev-new' })).toEqual({
        kind: 'stale-push',
        jobId: 'job-failed',
      });
    });

    it('when a different job is in flight, marked for Today or not', () => {
      expect(resolveGeneratingEntry({ inflight: liveRecord, params: pushParams, currentDevotionalId: null })).toEqual({
        kind: 'stale-push',
        jobId: 'job-failed',
      });
      const left = { ...liveRecord, leftForHome: true as const };
      expect(resolveGeneratingEntry({ inflight: left, params: pushParams, currentDevotionalId: 'dev-old' })).toEqual({
        kind: 'stale-push',
        jobId: 'job-failed',
      });
    });

    it('when the push lost its devotionalId but the reader already has a series', () => {
      expect(
        resolveGeneratingEntry({ inflight: null, params: { jobId: 'job-failed' }, currentDevotionalId: 'dev-new' }),
      ).toEqual({ kind: 'stale-push', jobId: 'job-failed' });
    });
  });

  it('never asserts a failure itself: the named job is polled, whatever the push claimed', () => {
    const entry = resolveGeneratingEntry({ inflight: null, params: pushParams, currentDevotionalId: null });
    expect(entry.kind).toBe('poll-from-push');
    expect(entry).not.toHaveProperty('error');
    expect(entry).not.toHaveProperty('canRetry');
  });

  it('submits fresh with neither a record nor a job in the params', () => {
    expect(resolveGeneratingEntry({ inflight: null, params: {}, currentDevotionalId: null })).toEqual({ kind: 'submit' });
    expect(resolveGeneratingEntry({ inflight: null, params: undefined, currentDevotionalId: null })).toEqual({ kind: 'submit' });
    expect(resolveGeneratingEntry({ inflight: null, params: { jobId: '' }, currentDevotionalId: null })).toEqual({ kind: 'submit' });
    // "Start study" on a finished journey enters with no params and a
    // current series: that is a new submission, not a stale push.
    expect(resolveGeneratingEntry({ inflight: null, params: {}, currentDevotionalId: 'dev-done' })).toEqual({ kind: 'submit' });
  });
});
