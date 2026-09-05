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
  GENERATING_SESSION_TITLE_PLACEHOLDER,
  PREPARING_FIRST_SERIES_FALLBACK_TITLE,
  clearInflightGenerationJob,
  hasInflightSeriesLanded,
  markInflightJobLeftForHome,
  parseInflightGenerationJob,
  readInflightGenerationJob,
  resolveInflightResume,
  resolvePreparingFirstSeriesTitle,
  resolveTodayInflightAction,
  supersedeInflightGenerationJob,
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
    expect(parseInflightGenerationJob(null)).toBeNull();
    expect(parseInflightGenerationJob('')).toBeNull();
  });

  it('returns invalid for malformed JSON or a record without a job id or clock', () => {
    expect(parseInflightGenerationJob('{not json')).toBeNull();
    expect(parseInflightGenerationJob(JSON.stringify({ devotionalId: 'devo-1', submittedAt: NOW }))).toBeNull();
    expect(parseInflightGenerationJob(JSON.stringify({ jobId: 'job-1' }))).toBeNull();
    expect(parseInflightGenerationJob('null')).toBeNull();
  });

  // Jordan (item 7): the wall clock is never a verdict. A record older than
  // any worker budget is still the server's to settle, so it stays active
  // and the screen that reads it asks the server.
  it('has no expiry: a record hours old is still active', () => {
    const old = { ...fresh, submittedAt: NOW - 3 * 60 * 60 * 1000 };
    expect(parseInflightGenerationJob(JSON.stringify(old))).toEqual(old);
  });

  it('returns active for a fresh record and keeps only a true leftForHome marker', () => {
    expect(parseInflightGenerationJob(JSON.stringify(fresh))).toEqual(fresh);
    expect(parseInflightGenerationJob(JSON.stringify({ ...fresh, leftForHome: true }))).toEqual({ ...fresh, leftForHome: true });
    expect(parseInflightGenerationJob(JSON.stringify({ ...fresh, leftForHome: 'yes' }))).toEqual(fresh);
  });
});

describe('readInflightGenerationJob', () => {
  it('reads the record under the shared key', () => {
    writeInflightGenerationJob(fresh);
    expect(mmkvStorage.setItem).toHaveBeenCalledWith(INFLIGHT_GENERATION_JOB_KEY, JSON.stringify(fresh));
    expect(readInflightGenerationJob()).toEqual(fresh);
  });

  it('drops an unreadable record on read, as both screens always did, and never an old one', () => {
    writeInflightGenerationJob({ ...fresh, submittedAt: NOW - 24 * 60 * 60 * 1000 });
    expect(readInflightGenerationJob()).not.toBeNull();
    expect(mmkvStorage.removeItem).not.toHaveBeenCalled();

    mmkvStorage.setItem(INFLIGHT_GENERATION_JOB_KEY, '{oops');
    expect(readInflightGenerationJob()).toBeNull();
    expect(mmkvStorage.removeItem).toHaveBeenCalledWith(INFLIGHT_GENERATION_JOB_KEY);
    expect(readInflightGenerationJob()).toBeNull();
  });
});

describe('resolveTodayInflightAction', () => {
  it('sends an active record without the marker back to /generating (app-kill recovery)', () => {
    for (const sessionStatus of ['idle', 'running', 'error', 'complete'] as const) {
      expect(resolveTodayInflightAction(fresh, sessionStatus)).toEqual({
        action: 'resume-on-generating',
        job: fresh,
      });
    }
  });

  it('keeps a record the reader left for home on Today', () => {
    const left = { ...fresh, leftForHome: true };
    for (const sessionStatus of ['idle', 'running', 'complete'] as const) {
      expect(resolveTodayInflightAction(left, sessionStatus)).toEqual({ action: 'watch-on-today', job: left });
    }
  });

  it('leaves a marked record to the failed card while the session holds the watch\'s own give-up', () => {
    // The watch could not reach the server six polls running: it kept the
    // record and failed the session. Restarting the watch on that session
    // change would loop; the card's Try again re-enters /generating instead.
    const left = { ...fresh, leftForHome: true };
    expect(resolveTodayInflightAction(left, 'error')).toEqual({ action: 'none' });
  });

  it('does nothing without a record', () => {
    expect(resolveTodayInflightAction(null, 'running')).toEqual({ action: 'none' });
  });
});

describe('resolveInflightResume — Today asks the server before routing back', () => {
  it('resumes only when the server reports the job alive or complete', () => {
    for (const status of ['pending', 'processing', 'complete']) {
      expect(resolveInflightResume({ status: { status } })).toBe('resume');
    }
  });

  it('discards a failed job and keeps the record when the status could not be fetched', () => {
    expect(resolveInflightResume({ status: { status: 'failed' } })).toBe('discard');
    expect(resolveInflightResume({ error: new Error('offline') })).toBe('keep');
    expect(resolveInflightResume({ error: { status: 503 } })).toBe('keep');
    expect(resolveInflightResume({ status: { status: 'garbage' } })).toBe('keep');
  });
});

describe('markInflightJobLeftForHome', () => {
  it('rewrites the active record under the same key with the marker set and returns it', () => {
    writeInflightGenerationJob(fresh);
    const record = markInflightJobLeftForHome();
    expect(record).toEqual({ ...fresh, leftForHome: true });
    expect(mmkvStorage.setItem).toHaveBeenLastCalledWith(
      INFLIGHT_GENERATION_JOB_KEY,
      JSON.stringify({ ...fresh, leftForHome: true }),
    );
    expect(resolveTodayInflightAction(readInflightGenerationJob(), 'running').action).toBe('watch-on-today');
  });

  it('writes nothing and returns null when there is no active record', () => {
    expect(markInflightJobLeftForHome()).toBeNull();
    expect(mmkvStorage.setItem).not.toHaveBeenCalled();
  });

  // /generating "Try again" after a failure: the failed job already cleared
  // the record, so "Go home" during the awaited retry finds nothing to mark.
  // The retry then resolves on the unmounted screen and writes the record
  // itself. It has to carry the marker on its own, or Today reads the fresh
  // record as app-kill recovery and bounces the reader back — the symptom
  // Jordan reported, re-created on the retry path.
  it('leaves a job that resolves after the tap to carry the marker itself', () => {
    expect(markInflightJobLeftForHome()).toBeNull();

    const retried: InflightGenerationJob = { ...fresh, jobId: 'job-2', leftForHome: true };
    writeInflightGenerationJob(retried);
    expect(resolveTodayInflightAction(readInflightGenerationJob(), 'running')).toEqual({ action: 'watch-on-today', job: retried });

    writeInflightGenerationJob({ ...fresh, jobId: 'job-2' });
    expect(resolveTodayInflightAction(readInflightGenerationJob(), 'running').action).toBe('resume-on-generating');
  });
});

describe('hasInflightSeriesLanded', () => {
  const devotionals = [{ id: 'devo-old' }];

  it('is true only once the named series is in the store', () => {
    expect(hasInflightSeriesLanded('devo-1', devotionals, true)).toBe(false);
    expect(hasInflightSeriesLanded('devo-1', [...devotionals, { id: 'devo-1' }], true)).toBe(true);
  });

  it('does not mistake the finished journey the reader started the new series from for the new series', () => {
    // "Start study" on a completed journey, then "Go home": the old series is
    // current, the new one is not in the store. Today must show preparing.
    expect(hasInflightSeriesLanded('devo-1', devotionals, true)).toBe(false);
  });

  it('falls back to whether any series is current when the record has no id', () => {
    expect(hasInflightSeriesLanded(undefined, [], false)).toBe(false);
    expect(hasInflightSeriesLanded(null, devotionals, true)).toBe(true);
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

// Jordan (item 8, follow-up): "Start over with new answers" used to delete the
// record. With no record and no session, the "We hit a snag" push iOS kept for
// the abandoned job polled it back to life, and Try again re-ran the answers
// the reader had just walked away from. The record now stays, marked
// superseded: nothing to resume, nothing to watch, and the push reads as stale.
describe('supersedeInflightGenerationJob', () => {
  it('keeps the abandoned job under the same key with the marker set', () => {
    writeInflightGenerationJob(fresh);
    supersedeInflightGenerationJob('job-1');
    expect(mmkvStorage.setItem).toHaveBeenLastCalledWith(INFLIGHT_GENERATION_JOB_KEY, expect.any(String));
    expect(readInflightGenerationJob()).toEqual({ jobId: 'job-1', submittedAt: expect.any(Number), superseded: true });
  });

  it('clears the record when no job was ever known', () => {
    writeInflightGenerationJob(fresh);
    supersedeInflightGenerationJob(null);
    expect(readInflightGenerationJob()).toBeNull();
  });

  it('parses the marker only when it is exactly true', () => {
    expect(parseInflightGenerationJob(JSON.stringify({ ...fresh, superseded: true }))).toEqual({ ...fresh, superseded: true });
    expect(parseInflightGenerationJob(JSON.stringify({ ...fresh, superseded: 'yes' }))).toEqual(fresh);
  });

  it('is none on Today, whatever the session holds', () => {
    const superseded = { ...fresh, superseded: true };
    for (const sessionStatus of ['idle', 'running', 'error', 'complete'] as const) {
      expect(resolveTodayInflightAction(superseded, sessionStatus)).toEqual({ action: 'none' });
    }
  });

  it('is nothing to mark for home: the record is left as it is', () => {
    writeInflightGenerationJob({ ...fresh, superseded: true });
    expect(markInflightJobLeftForHome()).toBeNull();
    expect(readInflightGenerationJob()).toEqual({ ...fresh, superseded: true });
  });

  it('is replaced by the next submission\'s write', () => {
    supersedeInflightGenerationJob('job-1');
    writeInflightGenerationJob({ jobId: 'job-2', devotionalId: 'devo-2', submittedAt: NOW });
    expect(readInflightGenerationJob()).toEqual({ jobId: 'job-2', devotionalId: 'devo-2', submittedAt: NOW });
  });
});

// A record whose job the server does not hold (a deleted row, another backend
// environment, another device id) read as "could not fetch": keep, once per
// focus, forever — and no new series could ever be submitted over it.
describe('resolveInflightResume — a job the server does not hold is a verdict', () => {
  it('discards the record on a 404 / 400 poll failure instead of keeping it for the next focus', () => {
    expect(resolveInflightResume({ error: { status: 404 } })).toBe('discard');
  });

  it('still keeps the record when the server could not be reached', () => {
    expect(resolveInflightResume({ error: { status: 500 } })).toBe('keep');
    expect(resolveInflightResume({ error: new Error('offline') })).toBe('keep');
    expect(resolveInflightResume({ status: { status: 'pending' } })).toBe('resume');
  });
});
