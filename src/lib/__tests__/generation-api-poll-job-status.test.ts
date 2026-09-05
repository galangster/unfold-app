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

import { ApiError, pollJobStatus } from '../generation-api';
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
