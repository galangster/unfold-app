/* eslint-disable import/first */
/**
 * P3-4 item 3 — DELETE /api/users/me client contract.
 */
let mockDeviceId = 'device-123';

jest.mock('../mmkv-storage', () => ({
  getDeviceId: jest.fn(() => mockDeviceId),
}));

jest.mock('../logger', () => ({
  logger: { log: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

import { requestServerAccountErase, SERVER_ERASE_TIMEOUT_MS } from '../account-erase';
import { PRIMARY_BACKEND_URL } from '../api-config';

const mockFetch = jest.fn();

function response(body: unknown, status = 200, json = true) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: json ? async () => body : async () => { throw new Error('not json'); },
  };
}

beforeEach(() => {
  mockDeviceId = 'device-123';
  mockFetch.mockReset();
  global.fetch = mockFetch as unknown as typeof fetch;
});

describe('requestServerAccountErase', () => {
  it('sends DELETE /api/users/me with the device-auth headers and confirms on { deleted: true }', async () => {
    mockFetch.mockResolvedValue(response({ deleted: true }));

    await expect(requestServerAccountErase()).resolves.toEqual({ ok: true });

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${PRIMARY_BACKEND_URL}/api/users/me`);
    expect(init.method).toBe('DELETE');
    const headers = init.headers as Record<string, string>;
    expect(headers['X-Device-ID']).toBe('device-123');
    expect(headers['Content-Type']).toBe('application/json');
    expect(headers['User-Agent']).toMatch(/^Unfold\//);
    expect(init.body).toBeUndefined();
    expect(init.signal).toBeDefined();
  });

  it('uses a short default timeout', () => {
    expect(SERVER_ERASE_TIMEOUT_MS).toBeLessThanOrEqual(10_000);
  });

  it('reports HTTP errors with their status', async () => {
    mockFetch.mockResolvedValue(response({ error: 'nope' }, 503));
    await expect(requestServerAccountErase()).resolves.toEqual({ ok: false, reason: 'http-error', status: 503 });

    mockFetch.mockResolvedValue(response(null, 404, false));
    await expect(requestServerAccountErase()).resolves.toEqual({ ok: false, reason: 'http-error', status: 404 });
  });

  it('treats a 200 without { deleted: true } as not confirmed', async () => {
    mockFetch.mockResolvedValue(response({ deleted: false }));
    await expect(requestServerAccountErase()).resolves.toEqual({ ok: false, reason: 'unexpected-response', status: 200 });

    mockFetch.mockResolvedValue(response({}));
    await expect(requestServerAccountErase()).resolves.toEqual({ ok: false, reason: 'unexpected-response', status: 200 });

    mockFetch.mockResolvedValue(response(null, 200, false));
    await expect(requestServerAccountErase()).resolves.toEqual({ ok: false, reason: 'unexpected-response', status: 200 });
  });

  it('reports network failures without throwing', async () => {
    mockFetch.mockRejectedValue(new TypeError('Network request failed'));
    await expect(requestServerAccountErase()).resolves.toEqual({ ok: false, reason: 'network' });
  });

  it('aborts after the timeout and reports it', async () => {
    mockFetch.mockImplementation(
      (_url: string, init: RequestInit) =>
        new Promise((_resolve, reject) => {
          init.signal?.addEventListener('abort', () =>
            reject(Object.assign(new Error('Aborted'), { name: 'AbortError' })),
          );
        }),
    );

    await expect(requestServerAccountErase({ timeoutMs: 20 })).resolves.toEqual({ ok: false, reason: 'timeout' });
  });

  it('never calls the server under an ephemeral recovery identity', async () => {
    mockDeviceId = 'ephemeral-abc';
    await expect(requestServerAccountErase()).resolves.toEqual({ ok: false, reason: 'identity-unavailable' });
    expect(mockFetch).not.toHaveBeenCalled();
  });
});
