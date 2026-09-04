/* eslint-disable import/first */
/**
 * Jordan (App Store 1.1.0, 2026-09-04): "Go home — we'll keep writing" on the
 * generating screen looked dead. The tap navigated, but Today read the
 * in-flight record as app-kill recovery and bounced straight back. The record
 * now carries a leftForHome marker and Today decides from it.
 */
jest.mock('../mmkv-storage', () => {
  const store = new Map<string, string>();
  return {
    mmkvStorage: {
      getItem: jest.fn((key: string) => store.get(key) ?? null),
      setItem: jest.fn((key: string, value: string) => store.set(key, value)),
      removeItem: jest.fn((key: string) => store.delete(key)),
    },
  };
});

import { mmkvStorage } from '../mmkv-storage';
import {
  INFLIGHT_GENERATION_JOB_KEY,
  INFLIGHT_JOB_TTL_MS,
  GENERATING_SESSION_TITLE_PLACEHOLDER,
  PREPARING_FIRST_SERIES_FALLBACK_TITLE,
  clearInflightGenerationJob,
  markInflightJobLeftForHome,
  parseInflightGenerationJob,
  readInflightGenerationJob,
  resolvePreparingFirstSeriesTitle,
  resolveTodayInflightAction,
  writeInflightGenerationJob,
  type InflightGenerationJob,
} from '../inflight-generation-job';

const NOW = 1_800_000_000_000;
const fresh: InflightGenerationJob = { jobId: 'job-1', devotionalId: 'devo-1', submittedAt: NOW - 30_000 };

beforeEach(() => {
  clearInflightGenerationJob();
  jest.clearAllMocks();
});

describe('INFLIGHT_GENERATION_JOB_KEY', () => {
  it('is the one key full-reset wipes', () => {
    // full-reset.ts lists this literal; a second key would survive a reset.
    expect(INFLIGHT_GENERATION_JOB_KEY).toBe('inflight-generation-job');
  });
});

describe('parseInflightGenerationJob', () => {
  it('returns none for a missing record', () => {
    expect(parseInflightGenerationJob(null, NOW)).toEqual({ kind: 'none' });
    expect(parseInflightGenerationJob('', NOW)).toEqual({ kind: 'none' });
  });

  it('returns invalid for malformed JSON or a record without a job id or clock', () => {
    expect(parseInflightGenerationJob('{not json', NOW)).toEqual({ kind: 'invalid' });
    expect(parseInflightGenerationJob(JSON.stringify({ devotionalId: 'devo-1', submittedAt: NOW }), NOW)).toEqual({ kind: 'invalid' });
    expect(parseInflightGenerationJob(JSON.stringify({ jobId: 'job-1' }), NOW)).toEqual({ kind: 'invalid' });
    expect(parseInflightGenerationJob('null', NOW)).toEqual({ kind: 'invalid' });
  });

  it('returns expired once the record is 15 minutes old', () => {
    const old = { ...fresh, submittedAt: NOW - INFLIGHT_JOB_TTL_MS };
    expect(parseInflightGenerationJob(JSON.stringify(old), NOW)).toEqual({ kind: 'expired', job: old });
  });

  it('returns active for a fresh record and keeps only a true leftForHome marker', () => {
    expect(parseInflightGenerationJob(JSON.stringify(fresh), NOW)).toEqual({ kind: 'active', job: fresh });
    expect(parseInflightGenerationJob(JSON.stringify({ ...fresh, leftForHome: true }), NOW)).toEqual({
      kind: 'active',
      job: { ...fresh, leftForHome: true },
    });
    expect(parseInflightGenerationJob(JSON.stringify({ ...fresh, leftForHome: 'yes' }), NOW)).toEqual({
      kind: 'active',
      job: fresh,
    });
  });
});

describe('readInflightGenerationJob', () => {
  it('reads the record under the shared key', () => {
    writeInflightGenerationJob(fresh);
    expect(mmkvStorage.setItem).toHaveBeenCalledWith(INFLIGHT_GENERATION_JOB_KEY, JSON.stringify(fresh));
    expect(readInflightGenerationJob(NOW)).toEqual({ kind: 'active', job: fresh });
  });

  it('drops an expired or unreadable record on read, as both screens always did', () => {
    writeInflightGenerationJob({ ...fresh, submittedAt: NOW - INFLIGHT_JOB_TTL_MS - 1 });
    expect(readInflightGenerationJob(NOW).kind).toBe('expired');
    expect(mmkvStorage.removeItem).toHaveBeenCalledWith(INFLIGHT_GENERATION_JOB_KEY);
    expect(readInflightGenerationJob(NOW)).toEqual({ kind: 'none' });

    mmkvStorage.setItem(INFLIGHT_GENERATION_JOB_KEY, '{oops');
    expect(readInflightGenerationJob(NOW).kind).toBe('invalid');
    expect(readInflightGenerationJob(NOW)).toEqual({ kind: 'none' });
  });
});

describe('resolveTodayInflightAction', () => {
  it('sends an active record without the marker back to /generating (app-kill recovery)', () => {
    expect(resolveTodayInflightAction({ kind: 'active', job: fresh })).toEqual({
      action: 'resume-on-generating',
      job: fresh,
    });
  });

  it('keeps a record the reader left for home on Today', () => {
    const left = { ...fresh, leftForHome: true as const };
    expect(resolveTodayInflightAction({ kind: 'active', job: left })).toEqual({ action: 'watch-on-today', job: left });
  });

  it('does nothing for a missing, expired or invalid record', () => {
    expect(resolveTodayInflightAction({ kind: 'none' })).toEqual({ action: 'none' });
    expect(resolveTodayInflightAction({ kind: 'invalid' })).toEqual({ action: 'none' });
    expect(resolveTodayInflightAction({ kind: 'expired', job: fresh })).toEqual({ action: 'none' });
  });
});

describe('markInflightJobLeftForHome', () => {
  it('rewrites the active record under the same key with the marker set and returns it', () => {
    writeInflightGenerationJob(fresh);
    const record = markInflightJobLeftForHome(NOW);
    expect(record).toEqual({ ...fresh, leftForHome: true });
    expect(mmkvStorage.setItem).toHaveBeenLastCalledWith(
      INFLIGHT_GENERATION_JOB_KEY,
      JSON.stringify({ ...fresh, leftForHome: true }),
    );
    expect(resolveTodayInflightAction(readInflightGenerationJob(NOW)).action).toBe('watch-on-today');
  });

  it('writes nothing and returns null when there is no active record', () => {
    expect(markInflightJobLeftForHome(NOW)).toBeNull();
    expect(mmkvStorage.setItem).not.toHaveBeenCalled();
  });

  it('drops a stale record instead of marking it', () => {
    writeInflightGenerationJob({ ...fresh, submittedAt: NOW - INFLIGHT_JOB_TTL_MS });
    expect(markInflightJobLeftForHome(NOW)).toBeNull();
    expect(mmkvStorage.removeItem).toHaveBeenCalledWith(INFLIGHT_GENERATION_JOB_KEY);
    expect(mmkvStorage.getItem(INFLIGHT_GENERATION_JOB_KEY)).toBeNull();
  });
});

describe('resolvePreparingFirstSeriesTitle', () => {
  it('falls back while the session only holds the submission placeholder', () => {
    expect(resolvePreparingFirstSeriesTitle(undefined)).toBe(PREPARING_FIRST_SERIES_FALLBACK_TITLE);
    expect(resolvePreparingFirstSeriesTitle('')).toBe(PREPARING_FIRST_SERIES_FALLBACK_TITLE);
    expect(resolvePreparingFirstSeriesTitle(GENERATING_SESSION_TITLE_PLACEHOLDER)).toBe(PREPARING_FIRST_SERIES_FALLBACK_TITLE);
  });

  it('uses a real series title once there is one', () => {
    expect(resolvePreparingFirstSeriesTitle('Learning to Trust Again')).toBe('Learning to Trust Again');
  });
});
