// The status request used to throw a bare Error for every non-OK response, so
// the callers could not tell "the server does not hold this job" (404 / 400)
// from "the server could not be reached". The status now rides on an ApiError.
jest.mock('../mmkv-storage', () => ({
  mmkvStorage: {
    getItem: jest.fn(() => null),
    setItem: jest.fn(),
    removeItem: jest.fn(),
  },
  getDeviceId: jest.fn(() => 'test-device-id'),
  getSharedEncryptionKey: jest.fn(() => 'test-key'),
}));
jest.mock('../api-config', () => ({
  PRIMARY_BACKEND_URL: 'https://backend.test',
  getAuthHeaders: jest.fn(async () => ({ 'X-Device-ID': 'test-device-id' })),
}));

import { ApiError, findDayJob, pollJobStatus, retryJob, submitGenerationJob } from '../generation-api';
import { classifyPollFailure } from '../generation-poll-outcome';

type ErrorBody = { error?: { code?: string; message?: string } };

function jsonResponse(status: number, body: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  };
}

const fetchMock = jest.fn();

beforeEach(() => {
  fetchMock.mockReset();
  (globalThis as { fetch: unknown }).fetch = fetchMock;
});

describe('pollJobStatus', () => {
  it('returns the job body and asks for the job by id', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { jobId: 'job-1', status: 'processing' }));

    await expect(pollJobStatus('job-1')).resolves.toEqual({ jobId: 'job-1', status: 'processing' });
    expect(fetchMock).toHaveBeenCalledWith(
      'https://backend.test/api/jobs/job-1',
      expect.objectContaining({ method: 'GET', headers: { 'X-Device-ID': 'test-device-id' } }),
    );
  });

  it('throws an ApiError carrying the 404 and its code, which the callers read as job-gone', async () => {
    const body: ErrorBody = { error: { code: 'NOT_FOUND', message: 'Job not found' } };
    fetchMock.mockResolvedValueOnce(jsonResponse(404, body));

    const err = await pollJobStatus('job-missing').catch((e: unknown) => e);

    expect(err).toBeInstanceOf(ApiError);
    expect(err).toMatchObject({ status: 404, code: 'NOT_FOUND', message: 'Poll job failed: 404 — Job not found' });
    expect(classifyPollFailure(err)).toBe('job-gone');
  });

  it('throws an ApiError for 400 INVALID_PARAMS (job-gone) and for a 503 (unreachable)', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(400, { error: { code: 'INVALID_PARAMS', message: 'Invalid job ID format' } }));
    const invalid = await pollJobStatus('not-a-uuid').catch((e: unknown) => e);
    expect(invalid).toMatchObject({ status: 400, code: 'INVALID_PARAMS' });
    expect(classifyPollFailure(invalid)).toBe('job-gone');

    fetchMock.mockResolvedValueOnce(jsonResponse(503, { error: { code: 'UNAVAILABLE' } }));
    const down = await pollJobStatus('job-1').catch((e: unknown) => e);
    expect(down).toMatchObject({ status: 503, code: 'UNAVAILABLE', message: 'Poll job failed: 503' });
    expect(classifyPollFailure(down)).toBe('unreachable');
  });

  it('survives an error body that is not JSON', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 502,
      json: async () => { throw new SyntaxError('Unexpected token <'); },
      text: async () => '<html>Bad gateway</html>',
    });

    const err = await pollJobStatus('job-1').catch((e: unknown) => e);

    expect(err).toBeInstanceOf(ApiError);
    expect(err).toMatchObject({ status: 502, code: 'POLL_FAILED', message: 'Poll job failed: 502' });
    expect(classifyPollFailure(err)).toBe('unreachable');
  });
});

describe('findDayJob', () => {
  it('discovers a day job through the owner-scoped identity route', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        jobId: 'job-day-2',
        jobType: 'day',
        status: 'processing',
        devotionalId: 'devotional/one',
        dayNumber: 2,
      }),
    });

    await expect(findDayJob('devotional/one', 2)).resolves.toMatchObject({ jobId: 'job-day-2' });
    expect(fetchMock).toHaveBeenCalledWith(
      'https://backend.test/api/jobs/find-day?devotionalId=devotional%2Fone&dayNumber=2',
      expect.objectContaining({ method: 'GET' }),
    );
  });

  it('returns null when no day job exists', async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 404 });

    await expect(findDayJob('devo-1', 2)).resolves.toBeNull();
  });

  it('rejects a non-positive day before making a request', async () => {
    await expect(findDayJob('devo-1', 0)).rejects.toThrow('dayNumber must be a positive integer');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('generation mutation errors', () => {
  it('preserves a DAY_NOT_READY response instead of flattening it into a connection error', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(425, {
      error: { code: 'DAY_NOT_READY', message: "Day 3 isn't ready yet." },
    }));

    const error = await submitGenerationJob({
      devotionalId: 'devo-1',
      dayNumber: 3,
      jobType: 'day',
    }).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 425, code: 'DAY_NOT_READY' });
  });

  it('preserves a SERIES_ARCHIVED retry response without exposing its raw body', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(409, {
      error: { code: 'SERIES_ARCHIVED', message: 'This series has ended.' },
    }));

    const error = await retryJob('job-1').catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 409, code: 'SERIES_ARCHIVED' });
    expect((error as Error).message).not.toContain(JSON.stringify({
      error: { code: 'SERIES_ARCHIVED', message: 'This series has ended.' },
    }));
  });

  it('carries AUTO_TRIAL_UNAVAILABLE reason from a 409 body', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(409, {
      error: {
        code: 'AUTO_TRIAL_UNAVAILABLE',
        message: 'Auto trial series is turned off.',
        reason: 'switch_off',
      },
    }));

    const error = await submitGenerationJob({
      dayNumber: 1,
      jobType: 'initial_arc',
    }).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({
      status: 409,
      code: 'AUTO_TRIAL_UNAVAILABLE',
      reason: 'switch_off',
      message: 'Auto trial series is turned off.',
    });
  });
});
