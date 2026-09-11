/* eslint-disable import/first */
let mockDeviceId = 'device-1';

jest.mock('../mmkv-storage', () => ({
  getDeviceId: jest.fn(() => mockDeviceId),
}));

jest.mock('../logger', () => ({
  logger: { log: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

import * as SecureStore from 'expo-secure-store';
import { getAuthHeaders, PRIMARY_BACKEND_URL } from '../api-config';
import {
  authenticatedFetch,
  clearDeviceCredential,
  DEVICE_CREDENTIAL_STORE_KEY,
  ensureDeviceCredential,
  getCachedDeviceCredential,
  loadDeviceCredential,
  resetDeviceCredentialForTesting,
} from '../device-credential';

const getItemAsync = SecureStore.getItemAsync as jest.Mock;
const setItemAsync = SecureStore.setItemAsync as jest.Mock;
const deleteItemAsync = SecureStore.deleteItemAsync as jest.Mock;

const mockFetch = jest.fn();

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    clone() {
      return jsonResponse(body, status);
    },
  } as Response;
}

beforeEach(async () => {
  mockDeviceId = 'device-1';
  resetDeviceCredentialForTesting();
  mockFetch.mockReset();
  getItemAsync.mockReset();
  setItemAsync.mockReset();
  deleteItemAsync.mockReset();
  getItemAsync.mockResolvedValue(null);
  setItemAsync.mockResolvedValue(undefined);
  deleteItemAsync.mockResolvedValue(undefined);
  global.fetch = mockFetch as unknown as typeof fetch;
});

describe('device credential', () => {
  it('headers include the credential when cached and omit it otherwise', async () => {
    const without = await getAuthHeaders();
    expect(without['X-Device-Credential']).toBeUndefined();
    expect(without['X-Device-ID']).toBe('device-1');

    mockFetch.mockResolvedValueOnce(jsonResponse({ credential: 'cred-live' }));
    await expect(ensureDeviceCredential()).resolves.toBe('cred-live');

    const withCred = await getAuthHeaders();
    expect(withCred['X-Device-Credential']).toBe('cred-live');
    expect(withCred['X-Device-ID']).toBe('device-1');
  });

  it('ensureDeviceCredential registers once for concurrent calls and persists the result', async () => {
    let resolveRegister: ((value: Response) => void) | undefined;
    mockFetch.mockImplementationOnce(
      () =>
        new Promise<Response>((resolve) => {
          resolveRegister = resolve;
        }),
    );

    const pending = Promise.all([ensureDeviceCredential(), ensureDeviceCredential()]);
    for (let i = 0; i < 10 && mockFetch.mock.calls.length === 0; i += 1) {
      await Promise.resolve();
    }
    expect(mockFetch).toHaveBeenCalledTimes(1);

    resolveRegister?.(jsonResponse({ credential: 'cred-shared' }));
    await expect(pending).resolves.toEqual(['cred-shared', 'cred-shared']);
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(mockFetch.mock.calls[0][0]).toBe(`${PRIMARY_BACKEND_URL}/api/devices/register`);
    expect(JSON.parse(mockFetch.mock.calls[0][1].body as string)).toEqual({ deviceId: 'device-1' });
    expect(setItemAsync).toHaveBeenCalledTimes(1);
    expect(setItemAsync).toHaveBeenCalledWith(
      DEVICE_CREDENTIAL_STORE_KEY,
      JSON.stringify({ deviceId: 'device-1', credential: 'cred-shared' }),
      { keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK },
    );
    expect(getCachedDeviceCredential()).toBe('cred-shared');
  });

  it('a stored record for a different device id is discarded', async () => {
    getItemAsync.mockResolvedValueOnce(
      JSON.stringify({ deviceId: 'other-device', credential: 'stale-cred' }),
    );

    await loadDeviceCredential();

    expect(getCachedDeviceCredential()).toBeNull();
    expect(deleteItemAsync).toHaveBeenCalledWith(DEVICE_CREDENTIAL_STORE_KEY);
    const headers = await getAuthHeaders();
    expect(headers['X-Device-Credential']).toBeUndefined();
  });

  it('ephemeral device ids skip registration', async () => {
    mockDeviceId = 'ephemeral-recovery';

    await expect(ensureDeviceCredential()).resolves.toBeNull();
    expect(mockFetch).not.toHaveBeenCalled();
    expect(setItemAsync).not.toHaveBeenCalled();
  });

  it('a 401 device_credential_required clears and re-registers once', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ credential: 'cred-old' }));
    await ensureDeviceCredential();
    expect(getCachedDeviceCredential()).toBe('cred-old');
    mockFetch.mockClear();

    mockFetch.mockImplementation((url: string) => {
      if (String(url).includes('/api/devices/register')) {
        return Promise.resolve(jsonResponse({ credential: 'cred-new' }));
      }
      return Promise.resolve(jsonResponse({ error: 'device_credential_required' }, 401));
    });

    const [first, second] = await Promise.all([
      authenticatedFetch(`${PRIMARY_BACKEND_URL}/api/sync/push`),
      authenticatedFetch(`${PRIMARY_BACKEND_URL}/api/sync/pull`),
    ]);

    expect(first.status).toBe(401);
    expect(second.status).toBe(401);
    expect(deleteItemAsync).toHaveBeenCalledWith(DEVICE_CREDENTIAL_STORE_KEY);
    const registerCalls = mockFetch.mock.calls.filter(([url]: [string]) =>
      String(url).includes('/api/devices/register'),
    );
    expect(registerCalls).toHaveLength(1);
    expect(getCachedDeviceCredential()).toBe('cred-new');
    expect((await getAuthHeaders())['X-Device-Credential']).toBe('cred-new');
  });
});

describe('credential recovery', () => {
  it('getAuthHeaders registers on a cache miss and includes the new credential', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ credential: 'cred-boot' }));
    const headers = await getAuthHeaders();
    expect(headers['X-Device-Credential']).toBe('cred-boot');
    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${PRIMARY_BACKEND_URL}/api/devices/register`);
    const sent = init.headers as Record<string, string>;
    expect(sent['X-Device-ID']).toBe('device-1');
    expect(sent['User-Agent']).toContain('Unfold/');
    expect(sent['X-Device-Credential']).toBeUndefined();
  });

  it('retries the request once with the recovered credential', async () => {
    mockFetch.mockImplementation((url: string, init?: RequestInit) => {
      if (String(url).includes('/api/devices/register')) {
        return Promise.resolve(jsonResponse({ credential: 'cred-new' }));
      }
      const sent = new Headers(init?.headers);
      if (sent.get('X-Device-Credential') === 'cred-new') {
        return Promise.resolve(jsonResponse({ ok: true }));
      }
      return Promise.resolve(jsonResponse({ error: 'device_credential_invalid' }, 401));
    });

    const response = await authenticatedFetch(`${PRIMARY_BACKEND_URL}/api/users/me`, {
      method: 'DELETE',
      headers: { 'X-Device-ID': 'device-1', 'X-Device-Credential': 'cred-stale' },
    });

    expect(response.status).toBe(200);
    const eraseCalls = mockFetch.mock.calls.filter(([url]: [string]) =>
      String(url).includes('/api/users/me'),
    );
    expect(eraseCalls).toHaveLength(2);
    expect(getCachedDeviceCredential()).toBe('cred-new');
  });

  it('stops waiting for recovery when the caller aborts', async () => {
    const controller = new AbortController();
    mockFetch.mockImplementation((url: string) => {
      if (String(url).includes('/api/devices/register')) {
        return new Promise<Response>(() => {});
      }
      return Promise.resolve(jsonResponse({ error: 'device_credential_required' }, 401));
    });

    const pending = authenticatedFetch(`${PRIMARY_BACKEND_URL}/api/sync/pull`, {
      signal: controller.signal,
    });
    controller.abort();
    const response = await pending;

    expect(response.status).toBe(401);
    const pullCalls = mockFetch.mock.calls.filter(([url]: [string]) =>
      String(url).includes('/api/sync/pull'),
    );
    expect(pullCalls).toHaveLength(1);
  });

  it('discards a registration that finishes after the credential was cleared', async () => {
    let resolveRegister: ((value: Response) => void) | undefined;
    mockFetch.mockImplementationOnce(
      () =>
        new Promise<Response>((resolve) => {
          resolveRegister = resolve;
        }),
    );

    const pending = ensureDeviceCredential();
    for (let i = 0; i < 50 && mockFetch.mock.calls.length === 0; i += 1) {
      await Promise.resolve();
    }
    expect(mockFetch).toHaveBeenCalledTimes(1);

    await clearDeviceCredential();
    mockDeviceId = 'device-2';
    resolveRegister?.(jsonResponse({ credential: 'cred-stale' }));

    await expect(pending).resolves.toBeNull();
    expect(getCachedDeviceCredential('device-2')).toBeNull();
    expect(setItemAsync).not.toHaveBeenCalled();

    mockFetch.mockResolvedValueOnce(jsonResponse({ credential: 'cred-fresh' }));
    await expect(ensureDeviceCredential()).resolves.toBe('cred-fresh');
    expect(getCachedDeviceCredential('device-2')).toBe('cred-fresh');
  });
});

describe('clearDeviceCredential', () => {
  it('removes the stored record and the cache', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ credential: 'cred-clear' }));
    await ensureDeviceCredential();
    expect(getCachedDeviceCredential()).toBe('cred-clear');

    await clearDeviceCredential();

    expect(getCachedDeviceCredential()).toBeNull();
    expect(deleteItemAsync).toHaveBeenCalledWith(DEVICE_CREDENTIAL_STORE_KEY);
    expect((await getAuthHeaders())['X-Device-Credential']).toBeUndefined();
  });
});
