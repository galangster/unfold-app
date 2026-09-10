/**
 * NT-2: push registration success and in-flight state are owned by the
 * originating reset session and device identity. Native Expo token/permission
 * APIs are mocked; getExpoPushTokenAsync is never pointed at a real device.
 */
import * as Notifications from 'expo-notifications';
import {
  registerPushToken,
  resetPushRegistrationSession,
} from '../push-notifications';
import { getAuthHeaders } from '../api-config';
import {
  beginLocalResetSession,
  endLocalResetSession,
  resetSyncSessionFenceForTesting,
} from '../sync-session-fence';
import * as mmkvStorage from '../mmkv-storage';

const mockDeviceState = { isDevice: true };
const mockConstantsState: { projectId: string | undefined } = {
  projectId: 'synthetic-project',
};

jest.mock('expo-device', () => ({
  get isDevice() {
    return mockDeviceState.isDevice;
  },
}));

jest.mock('expo-constants', () => ({
  expoConfig: {
    extra: {
      eas: {
        get projectId() {
          return mockConstantsState.projectId;
        },
      },
    },
  },
}));

jest.mock('expo-router', () => ({
  router: { replace: jest.fn() },
}));

jest.mock('expo-notifications', () => ({
  __esModule: true,
  getPermissionsAsync: jest.fn(),
  requestPermissionsAsync: jest.fn(async () => ({ status: 'denied' })),
  getExpoPushTokenAsync: jest.fn(),
  setNotificationChannelAsync: jest.fn(async () => undefined),
  AndroidImportance: { MAX: 5 },
  setNotificationHandler: jest.fn(),
  addNotificationResponseReceivedListener: jest.fn(() => ({ remove: jest.fn() })),
  getLastNotificationResponseAsync: jest.fn(async () => null),
  clearLastNotificationResponseAsync: jest.fn(async () => undefined),
}));

jest.mock('../mmkv-storage', () => {
  let deviceId = 'synthetic-old';
  return {
    getDeviceId: jest.fn(() => deviceId),
    __setDeviceId(next: string) {
      deviceId = next;
    },
    __resetDeviceId() {
      deviceId = 'synthetic-old';
    },
  };
});

jest.mock('../api-config', () => {
  const { getDeviceId } = jest.requireMock('../mmkv-storage');
  return {
    PRIMARY_BACKEND_URL: 'https://example.invalid',
    getAuthHeaders: jest.fn(async () => ({
      'Content-Type': 'application/json',
      'X-Device-ID': getDeviceId(),
    })),
  };
});

jest.mock('../store', () => ({
  useUnfoldStore: {
    getState: () => ({
      user: { reminderTime: '8:00 AM' },
      updateUser: jest.fn(),
    }),
  },
}));

jest.mock('../logger', () => ({
  logger: {
    log: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

const mockGetAuthHeaders = getAuthHeaders as jest.MockedFunction<typeof getAuthHeaders>;
const mockGetPermissionsAsync = Notifications.getPermissionsAsync as jest.Mock;
const mockRequestPermissionsAsync = Notifications.requestPermissionsAsync as jest.Mock;
const mockGetExpoPushTokenAsync = Notifications.getExpoPushTokenAsync as jest.Mock;
const mockSetNotificationChannelAsync = Notifications.setNotificationChannelAsync as jest.Mock;

type PushPost = {
  identity: string | undefined;
  signal: AbortSignal | undefined;
};

const SYNTHETIC_TOKEN = { data: 'ExponentPushToken[synthetic-only]' };
const OK_RESPONSE = {
  ok: true,
  status: 200,
  statusText: 'OK',
  json: async () => ({ success: true }),
};

let permissionMode: 'granted' | 'denied' | 'deferred' = 'granted';
let resolvePermission: ((value: { status: string }) => void) | undefined;
let tokenMode: 'immediate' | 'deferred' = 'immediate';
let resolveToken: ((value: { data: string }) => void) | undefined;
let tokenEntered = false;
let pushPosts: PushPost[] = [];

function setDeviceId(next: string): void {
  (mmkvStorage as unknown as { __setDeviceId: (id: string) => void }).__setDeviceId(next);
}

function resetDeviceId(): void {
  (mmkvStorage as unknown as { __resetDeviceId: () => void }).__resetDeviceId();
}

function headerValue(
  headers: HeadersInit | undefined,
  name: string,
): string | undefined {
  if (!headers) return undefined;
  if (headers instanceof Headers) return headers.get(name) ?? undefined;
  if (Array.isArray(headers)) {
    const match = headers.find(([key]) => key.toLowerCase() === name.toLowerCase());
    return match?.[1];
  }
  const record = headers as Record<string, string>;
  return record[name] ?? record[name.toLowerCase()];
}

function deferred<T>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason?: unknown) => void;
} {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function flush(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

async function waitFor(predicate: () => boolean): Promise<void> {
  for (let i = 0; i < 40; i += 1) {
    if (predicate()) return;
    await flush();
  }
  throw new Error('Synthetic boundary not reached');
}

function simulateReset(nextId = 'synthetic-new'): void {
  const token = beginLocalResetSession();
  setDeviceId(nextId);
  endLocalResetSession(token);
}

function installInstantFetch(): void {
  global.fetch = jest.fn(async (_url, init) => {
    pushPosts.push({
      identity: headerValue(init?.headers, 'X-Device-ID'),
      signal: init?.signal ?? undefined,
    });
    return OK_RESPONSE;
  }) as unknown as typeof fetch;
}

beforeEach(() => {
  resetPushRegistrationSession();
  resetSyncSessionFenceForTesting();
  resetDeviceId();
  mockDeviceState.isDevice = true;
  mockConstantsState.projectId = 'synthetic-project';
  permissionMode = 'granted';
  resolvePermission = undefined;
  tokenMode = 'immediate';
  resolveToken = undefined;
  tokenEntered = false;
  pushPosts = [];
  mockGetAuthHeaders.mockClear();
  mockGetPermissionsAsync.mockClear();
  mockRequestPermissionsAsync.mockClear();
  mockGetExpoPushTokenAsync.mockClear();
  mockSetNotificationChannelAsync.mockClear();

  mockGetPermissionsAsync.mockImplementation(async () => {
    if (permissionMode === 'deferred') {
      return new Promise((resolve) => {
        resolvePermission = resolve;
      });
    }
    return { status: permissionMode };
  });

  mockGetExpoPushTokenAsync.mockImplementation(async () => {
    tokenEntered = true;
    if (tokenMode === 'deferred') {
      return new Promise((resolve) => {
        resolveToken = resolve;
      });
    }
    return SYNTHETIC_TOKEN;
  });

  installInstantFetch();
});

afterEach(() => {
  expect(mockRequestPermissionsAsync).not.toHaveBeenCalled();
  expect(mockGetExpoPushTokenAsync.mock.calls.every((call) => {
    const projectId = (call[0] as { projectId?: string } | undefined)?.projectId;
    return projectId === 'synthetic-project';
  })).toBe(true);
});

describe('push registration identity ownership', () => {
  it('POSTs again for a fresh identity after a completed registration and reset', async () => {
    const first = await registerPushToken();
    simulateReset();
    const second = await registerPushToken();

    expect(first).toBe('registered');
    expect(second).toBe('registered');
    expect(pushPosts.map((post) => post.identity)).toEqual([
      'synthetic-old',
      'synthetic-new',
    ]);
  });

  it('does not authenticate or POST when permission resolves after reset', async () => {
    permissionMode = 'deferred';
    const pending = registerPushToken();
    await waitFor(() => resolvePermission !== undefined);

    simulateReset();
    permissionMode = 'granted';
    resolvePermission?.({ status: 'granted' });
    const result = await pending;

    expect(result).toBe('skipped');
    expect(pushPosts).toHaveLength(0);
    expect(mockGetAuthHeaders).not.toHaveBeenCalled();
    expect(mockGetExpoPushTokenAsync).not.toHaveBeenCalled();
  });

  it('does not authenticate or POST when the Expo token resolves after reset', async () => {
    tokenMode = 'deferred';
    const pending = registerPushToken();
    await waitFor(() => tokenEntered);

    simulateReset();
    resolveToken?.(SYNTHETIC_TOKEN);
    const result = await pending;

    expect(result).toBe('skipped');
    expect(pushPosts).toHaveLength(0);
    expect(mockGetAuthHeaders).not.toHaveBeenCalled();
  });

  it('lets a fresh identity POST while an old POST is still waiting', async () => {
    const oldGate = deferred<typeof OK_RESPONSE>();
    const newGate = deferred<typeof OK_RESPONSE>();
    global.fetch = jest.fn(async (_url, init) => {
      const identity = headerValue(init?.headers, 'X-Device-ID');
      pushPosts.push({ identity, signal: init?.signal ?? undefined });
      return identity === 'synthetic-old' ? oldGate.promise : newGate.promise;
    }) as unknown as typeof fetch;

    const oldCall = registerPushToken();
    await waitFor(() => pushPosts.length === 1);

    simulateReset();
    const newCall = registerPushToken();
    await waitFor(() => pushPosts.length === 2);

    expect(pushPosts.map((post) => post.identity)).toEqual([
      'synthetic-old',
      'synthetic-new',
    ]);
    expect(pushPosts[0]?.signal?.aborted).toBe(true);

    oldGate.resolve(OK_RESPONSE);
    newGate.resolve(OK_RESPONSE);
    expect(await oldCall).toBe('skipped');
    expect(await newCall).toBe('registered');
  });

  it('does not let a delayed old POST success mark a fresh registration complete', async () => {
    const oldGate = deferred<typeof OK_RESPONSE>();
    const newGate = deferred<typeof OK_RESPONSE>();
    global.fetch = jest.fn(async (_url, init) => {
      pushPosts.push({
        identity: headerValue(init?.headers, 'X-Device-ID'),
        signal: init?.signal ?? undefined,
      });
      return pushPosts.length === 1 ? oldGate.promise : newGate.promise;
    }) as unknown as typeof fetch;

    const oldCall = registerPushToken();
    await waitFor(() => pushPosts.length === 1);
    simulateReset();
    const newCall = registerPushToken();
    await waitFor(() => pushPosts.length === 2);

    let thirdSettledBeforeFresh = false;
    const thirdCall = registerPushToken().then((result) => {
      thirdSettledBeforeFresh = true;
      return result;
    });
    await flush();

    oldGate.resolve(OK_RESPONSE);
    const oldResult = await oldCall;
    await flush();

    expect(oldResult).toBe('skipped');
    expect(thirdSettledBeforeFresh).toBe(false);

    newGate.resolve(OK_RESPONSE);
    expect(await newCall).toBe('registered');
    expect(await thirdCall).toBe('registered');
    expect(pushPosts.map((post) => post.identity)).toEqual([
      'synthetic-old',
      'synthetic-new',
    ]);
  });

  it('does not let a delayed old POST failure start a third POST or clear the fresh finalizer', async () => {
    const oldGate = deferred<typeof OK_RESPONSE>();
    const newGate = deferred<typeof OK_RESPONSE>();
    global.fetch = jest.fn(async (_url, init) => {
      pushPosts.push({
        identity: headerValue(init?.headers, 'X-Device-ID'),
        signal: init?.signal ?? undefined,
      });
      return pushPosts.length === 1 ? oldGate.promise : newGate.promise;
    }) as unknown as typeof fetch;

    const oldCall = registerPushToken();
    await waitFor(() => pushPosts.length === 1);
    simulateReset();
    const newCall = registerPushToken();
    await waitFor(() => pushPosts.length === 2);

    let thirdSettledBeforeFresh = false;
    const thirdCall = registerPushToken().then((result) => {
      thirdSettledBeforeFresh = true;
      return result;
    });
    await flush();

    oldGate.reject(new Error('synthetic old POST failure'));
    const oldResult = await oldCall;
    await flush();

    expect(oldResult).toBe('skipped');
    expect(thirdSettledBeforeFresh).toBe(false);

    newGate.resolve(OK_RESPONSE);
    expect(await newCall).toBe('registered');
    expect(await thirdCall).toBe('registered');
    expect(pushPosts.map((post) => post.identity)).toEqual([
      'synthetic-old',
      'synthetic-new',
    ]);
  });

  it('deduplicates concurrent callers in the same session', async () => {
    const [first, second] = await Promise.all([
      registerPushToken(),
      registerPushToken(),
    ]);

    expect(first).toBe('registered');
    expect(second).toBe('registered');
    expect(pushPosts).toHaveLength(1);
    expect(pushPosts[0]?.identity).toBe('synthetic-old');
  });

  it('retries after a failed POST in the same session', async () => {
    let requests = 0;
    global.fetch = jest.fn(async (_url, init) => {
      requests += 1;
      pushPosts.push({
        identity: headerValue(init?.headers, 'X-Device-ID'),
        signal: init?.signal ?? undefined,
      });
      if (requests === 1) {
        return { ok: false, status: 503, statusText: 'synthetic' };
      }
      return OK_RESPONSE;
    }) as unknown as typeof fetch;

    const failed = await registerPushToken();
    const retry = await registerPushToken();

    expect(failed).toBe('failed');
    expect(retry).toBe('registered');
    expect(requests).toBe(2);
  });

  it('skips when permission is denied and does not POST', async () => {
    permissionMode = 'denied';
    const result = await registerPushToken();

    expect(result).toBe('skipped');
    expect(pushPosts).toHaveLength(0);
    expect(mockGetExpoPushTokenAsync).not.toHaveBeenCalled();
    expect(mockGetAuthHeaders).not.toHaveBeenCalled();
  });

  it('skips while a reset session is in progress', async () => {
    const resetToken = beginLocalResetSession();
    const result = await registerPushToken();
    endLocalResetSession(resetToken);

    expect(result).toBe('skipped');
    expect(pushPosts).toHaveLength(0);
    expect(mockGetAuthHeaders).not.toHaveBeenCalled();
  });

  it('invalidates cached success when the device identity rotates without a reset session', async () => {
    const first = await registerPushToken();
    setDeviceId('synthetic-rotated');
    const second = await registerPushToken();

    expect(first).toBe('registered');
    expect(second).toBe('registered');
    expect(pushPosts.map((post) => post.identity)).toEqual([
      'synthetic-old',
      'synthetic-rotated',
    ]);
  });

  it('skips on a simulator without reading permission or posting', async () => {
    mockDeviceState.isDevice = false;
    const result = await registerPushToken();

    expect(result).toBe('skipped');
    expect(mockGetPermissionsAsync).not.toHaveBeenCalled();
    expect(pushPosts).toHaveLength(0);
  });

  it('skips when the EAS project id is missing', async () => {
    mockConstantsState.projectId = undefined;
    const result = await registerPushToken();

    expect(result).toBe('skipped');
    expect(mockGetExpoPushTokenAsync).not.toHaveBeenCalled();
    expect(pushPosts).toHaveLength(0);
  });
});
