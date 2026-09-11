/* eslint-disable import/first */
jest.mock('../api-config', () => ({
  PRIMARY_BACKEND_URL: 'https://example.test',
  getAuthHeaders: jest.fn(async () => ({ 'Content-Type': 'application/json' })),
}));

import {
  parseRemoteConfig,
  readAutoTrialSwitchSnapshot,
  refreshRemoteConfig,
  resetRemoteConfigForTesting,
  type RemoteConfigV1,
} from '../remote-config';

const VALID_BODY: RemoteConfigV1 & { ttlSeconds?: number } = {
  version: 1,
  autoTrialSeries: { enabled: true, platforms: ['ios'], maxTrialDays: 7 },
  source: 'db',
  ttlSeconds: 30,
};

function jsonResponse(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response;
}

describe('E1 remote-config outcomes', () => {
  beforeEach(() => {
    resetRemoteConfigForTesting();
  });

  it('accepts a valid db body and ignores extra keys', async () => {
    const fetchImpl = jest.fn(async () => jsonResponse(VALID_BODY));
    const state = await refreshRemoteConfig({ fetchImpl, nowMs: 1_000 });
    expect(state).toEqual({
      status: 'ok',
      config: {
        version: 1,
        autoTrialSeries: { enabled: true, platforms: ['ios'], maxTrialDays: 7 },
        source: 'db',
      },
      fetchedAtMs: 1_000,
    });
    expect(parseRemoteConfig({ ...VALID_BODY, extra: true })).toMatchObject({ source: 'db' });
  });

  it('treats a missing source, version 2, string enabled, and bad platforms as parse errors', async () => {
    const { ttlSeconds: _ttl, ...noSource } = VALID_BODY;
    void _ttl;
    const { source: _source, ...withoutSource } = noSource;
    void _source;
    expect(parseRemoteConfig(withoutSource)).toBeNull();
    expect(parseRemoteConfig({ ...VALID_BODY, version: 2 })).toBeNull();
    expect(parseRemoteConfig({
      ...VALID_BODY,
      autoTrialSeries: { ...VALID_BODY.autoTrialSeries, enabled: 'true' },
    })).toBeNull();
    expect(parseRemoteConfig({
      ...VALID_BODY,
      autoTrialSeries: { ...VALID_BODY.autoTrialSeries, platforms: ['ios', 'web'] },
    })).toBeNull();

    const fetchImpl = jest.fn(async () => jsonResponse(withoutSource));
    const state = await refreshRemoteConfig({ fetchImpl, nowMs: 1_000 });
    expect(state).toEqual({ status: 'error', failedAtMs: 1_000, reason: 'parse' });
  });

  it('maps source fallback, http 500, abort, and throw to the documented reasons', async () => {
    expect(await refreshRemoteConfig({
      fetchImpl: jest.fn(async () => jsonResponse({ ...VALID_BODY, source: 'fallback' })),
      nowMs: 10,
    })).toEqual({ status: 'error', failedAtMs: 10, reason: 'server_fallback' });
    expect(readAutoTrialSwitchSnapshot(10, 'ios')).toMatchObject({
      enabled: false,
      reason: 'fetch_failed',
    });

    resetRemoteConfigForTesting();
    expect(await refreshRemoteConfig({
      fetchImpl: jest.fn(async () => jsonResponse('err', 500)),
      nowMs: 20,
    })).toEqual({ status: 'error', failedAtMs: 20, reason: 'http' });

    resetRemoteConfigForTesting();
    const hanging = jest.fn((_url: string, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => {
        const error = new Error('aborted');
        error.name = 'AbortError';
        reject(error);
      });
    }));
    jest.useFakeTimers();
    const pending = refreshRemoteConfig({ fetchImpl: hanging, nowMs: 30 });
    await jest.advanceTimersByTimeAsync(4_000);
    await expect(pending).resolves.toEqual({ status: 'error', failedAtMs: 30, reason: 'timeout' });
    jest.useRealTimers();

    resetRemoteConfigForTesting();
    expect(await refreshRemoteConfig({
      fetchImpl: jest.fn(async () => {
        throw new Error('offline');
      }),
      nowMs: 40,
    })).toEqual({ status: 'error', failedAtMs: 40, reason: 'network' });
  });

  it('shares one in-flight fetch across concurrent refreshes', async () => {
    let release: ((value: Response) => void) | undefined;
    const fetchImpl = jest.fn(() => new Promise<Response>((resolve) => {
      release = resolve;
    }));
    const first = refreshRemoteConfig({ fetchImpl, nowMs: 50 });
    const second = refreshRemoteConfig({ fetchImpl, nowMs: 50 });
    // fetchConfig awaits getAuthHeaders before calling fetch; let that settle.
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    release?.(jsonResponse(VALID_BODY));
    const [a, b] = await Promise.all([first, second]);
    expect(a.status).toBe('ok');
    expect(b.status).toBe('ok');
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});

describe('E2 snapshot', () => {
  beforeEach(() => {
    resetRemoteConfigForTesting();
  });

  it('reports fetch_failed after a later failure, stale after 61 minutes, idle, and platform_off', async () => {
    expect(readAutoTrialSwitchSnapshot(0, 'ios')).toMatchObject({
      enabled: false,
      reason: 'not_fetched',
      fetchedAtMs: null,
      maxTrialDays: 7,
    });

    await refreshRemoteConfig({
      fetchImpl: jest.fn(async () => jsonResponse(VALID_BODY)),
      nowMs: 1_000,
    });
    expect(readAutoTrialSwitchSnapshot(1_000, 'ios').reason).toBe('on');

    await refreshRemoteConfig({
      force: true,
      fetchImpl: jest.fn(async () => {
        throw new Error('offline');
      }),
      nowMs: 2_000,
    });
    expect(readAutoTrialSwitchSnapshot(2_000, 'ios')).toMatchObject({
      enabled: false,
      reason: 'fetch_failed',
    });

    resetRemoteConfigForTesting();
    await refreshRemoteConfig({
      fetchImpl: jest.fn(async () => jsonResponse(VALID_BODY)),
      nowMs: 1_000,
    });
    expect(readAutoTrialSwitchSnapshot(1_000 + 61 * 60_000, 'ios')).toMatchObject({
      enabled: false,
      reason: 'stale',
    });

    resetRemoteConfigForTesting();
    await refreshRemoteConfig({
      fetchImpl: jest.fn(async () => jsonResponse({
        ...VALID_BODY,
        autoTrialSeries: { enabled: true, platforms: ['android'], maxTrialDays: 7 },
      })),
      nowMs: 1_000,
    });
    expect(readAutoTrialSwitchSnapshot(1_000, 'ios')).toMatchObject({
      enabled: false,
      reason: 'platform_off',
    });
  });
});

describe('E3 throttle', () => {
  beforeEach(() => {
    resetRemoteConfigForTesting();
  });

  it('does not refetch within 5 minutes of ok or 30 seconds of error unless forced', async () => {
    const ok = jest.fn(async () => jsonResponse(VALID_BODY));
    await refreshRemoteConfig({ fetchImpl: ok, nowMs: 0 });
    await refreshRemoteConfig({ fetchImpl: ok, nowMs: 5 * 60_000 - 1 });
    expect(ok).toHaveBeenCalledTimes(1);
    await refreshRemoteConfig({ force: true, fetchImpl: ok, nowMs: 5 * 60_000 - 1 });
    expect(ok).toHaveBeenCalledTimes(2);

    resetRemoteConfigForTesting();
    const fail = jest.fn(async () => {
      throw new Error('offline');
    });
    await refreshRemoteConfig({ fetchImpl: fail, nowMs: 0 });
    await refreshRemoteConfig({ fetchImpl: fail, nowMs: 29_999 });
    expect(fail).toHaveBeenCalledTimes(1);
  });

  it('refetches 30 s after a fallback body and turns the snapshot on for a later db body', async () => {
    const fallback = jest.fn(async () => jsonResponse({ ...VALID_BODY, source: 'fallback' }));
    await refreshRemoteConfig({ fetchImpl: fallback, nowMs: 0 });
    expect(readAutoTrialSwitchSnapshot(0, 'ios').reason).toBe('fetch_failed');

    const db = jest.fn(async () => jsonResponse({
      ...VALID_BODY,
      autoTrialSeries: { enabled: true, platforms: ['ios'], maxTrialDays: 7 },
    }));
    await refreshRemoteConfig({ fetchImpl: db, nowMs: 30_000 });
    expect(db).toHaveBeenCalledTimes(1);
    expect(readAutoTrialSwitchSnapshot(30_000, 'ios')).toMatchObject({
      enabled: true,
      reason: 'on',
    });
  });
});
