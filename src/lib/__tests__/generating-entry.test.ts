import {
  INFLIGHT_MAX_AGE_MS,
  parseInflightRecord,
  resolveGeneratingEntry,
} from '../generating-entry';

const NOW = 1_700_000_000_000;
const freshRecord = JSON.stringify({ jobId: 'job-live', devotionalId: 'dev-live', submittedAt: NOW - 60_000 });
const pushParams = { jobId: 'job-failed', devotionalId: 'dev-failed' };

describe('parseInflightRecord', () => {
  it('returns the record while it is fresh', () => {
    expect(parseInflightRecord(freshRecord, NOW)).toEqual({
      jobId: 'job-live',
      devotionalId: 'dev-live',
      submittedAt: NOW - 60_000,
    });
  });

  it('rejects a record older than the resume window', () => {
    const stale = JSON.stringify({ jobId: 'job-old', submittedAt: NOW - INFLIGHT_MAX_AGE_MS });
    expect(parseInflightRecord(stale, NOW)).toBeNull();
  });

  it('rejects an absent, malformed, or incomplete record', () => {
    expect(parseInflightRecord(null, NOW)).toBeNull();
    expect(parseInflightRecord('', NOW)).toBeNull();
    expect(parseInflightRecord('{not json', NOW)).toBeNull();
    expect(parseInflightRecord(JSON.stringify({ submittedAt: NOW }), NOW)).toBeNull();
    expect(parseInflightRecord(JSON.stringify({ jobId: 'job-x' }), NOW)).toBeNull();
  });

  it('drops a non-string devotionalId instead of resuming with garbage', () => {
    const record = JSON.stringify({ jobId: 'job-live', devotionalId: 42, submittedAt: NOW });
    expect(parseInflightRecord(record, NOW)).toEqual({ jobId: 'job-live', devotionalId: undefined, submittedAt: NOW });
  });
});

describe('resolveGeneratingEntry', () => {
  it('resumes a fresh inflight record even when the push named a job', () => {
    expect(resolveGeneratingEntry({ inflightRaw: freshRecord, params: pushParams, nowMs: NOW })).toEqual({
      kind: 'resume',
      inflight: { jobId: 'job-live', devotionalId: 'dev-live', submittedAt: NOW - 60_000 },
    });
  });

  it('lands on the failed job from the push when the inflight record is gone', () => {
    expect(resolveGeneratingEntry({ inflightRaw: null, params: pushParams, nowMs: NOW })).toEqual({
      kind: 'failed-from-push',
      jobId: 'job-failed',
      devotionalId: 'dev-failed',
    });
  });

  it('lands on the failed job when the inflight record expired or is malformed', () => {
    const stale = JSON.stringify({ jobId: 'job-old', submittedAt: NOW - INFLIGHT_MAX_AGE_MS - 1 });
    expect(resolveGeneratingEntry({ inflightRaw: stale, params: pushParams, nowMs: NOW })).toMatchObject({
      kind: 'failed-from-push',
      jobId: 'job-failed',
    });
    expect(resolveGeneratingEntry({ inflightRaw: '{oops', params: pushParams, nowMs: NOW })).toMatchObject({
      kind: 'failed-from-push',
      jobId: 'job-failed',
    });
  });

  it('carries a null devotionalId when the push had none, and unwraps array params', () => {
    expect(resolveGeneratingEntry({ inflightRaw: null, params: { jobId: 'job-failed' }, nowMs: NOW })).toEqual({
      kind: 'failed-from-push',
      jobId: 'job-failed',
      devotionalId: null,
    });
    expect(
      resolveGeneratingEntry({ inflightRaw: null, params: { jobId: ['job-a', 'job-b'], devotionalId: ['dev-a'] }, nowMs: NOW }),
    ).toEqual({ kind: 'failed-from-push', jobId: 'job-a', devotionalId: 'dev-a' });
  });

  it('submits fresh with neither a record nor a job in the params', () => {
    expect(resolveGeneratingEntry({ inflightRaw: null, params: {}, nowMs: NOW })).toEqual({ kind: 'submit' });
    expect(resolveGeneratingEntry({ inflightRaw: undefined, params: undefined, nowMs: NOW })).toEqual({ kind: 'submit' });
    expect(resolveGeneratingEntry({ inflightRaw: null, params: { jobId: '' }, nowMs: NOW })).toEqual({ kind: 'submit' });
  });
});
