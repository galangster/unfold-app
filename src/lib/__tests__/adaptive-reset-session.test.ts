/* eslint-disable import/first */
/**
 * AQ-1: adaptive, diagnostic, and mirror-back work must keep the originating
 * reset token. A delayed body read after reset must not start legacy fallback
 * or write rate-limit state, even when device identity is unchanged.
 */
jest.mock('../api-config', () => ({
  PRIMARY_BACKEND_URL: 'https://example.test',
  getAuthHeaders: jest.fn(async () => ({
    'Content-Type': 'application/json',
    'X-Device-ID': (globalThis as { __aq1Identity?: string }).__aq1Identity ?? 'synthetic-old',
  })),
  getBackendCandidates: () => ['https://example.test'],
  sanitizeForPrompt: (s: string | undefined, max: number) => (s ?? '').slice(0, max),
}));

jest.mock('@react-native-community/netinfo', () => ({
  addEventListener: jest.fn(() => jest.fn()),
}));

jest.mock('../bug-logger', () => ({
  logBugError: jest.fn(),
  logBugEvent: jest.fn(),
}));

jest.mock('../logger', () => ({
  logger: { log: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

jest.mock('../mmkv-storage', () => {
  const store = new Map<string, string>();
  return {
    mmkvStorage: {
      getItem: jest.fn((key: string) => store.get(key) ?? null),
      setItem: jest.fn((key: string, value: string) => {
        store.set(key, value);
      }),
      removeItem: jest.fn((key: string) => {
        store.delete(key);
      }),
    },
    getDeviceId: jest.fn(() => (globalThis as { __aq1Identity?: string }).__aq1Identity ?? 'synthetic-old'),
    getSharedEncryptionKey: jest.fn(() => 'test-key'),
    isRecoverySession: jest.fn(() => false),
  };
});

jest.mock('../story-service', () => ({
  fetchStoriesForGeneration: jest.fn(async () => []),
  formatStoriesForPrompt: jest.fn(() => ''),
}));

jest.mock('../report-error', () => ({ reportError: jest.fn() }));

import {
  generateAdaptiveQuestion,
  generateDiagnosticQuestions,
  generateMirrorBackText,
} from '../devotional-service';
import {
  beginLocalResetSession,
  captureSyncSession,
  endLocalResetSession,
  resetSyncSessionFenceForTesting,
  SyncSessionInvalidatedError,
} from '../generation-session';
import { mmkvStorage } from '../mmkv-storage';
import { RATE_LIMIT_STORAGE_KEY } from '../rate-limit';

const SYNTHETIC = 'Synthetic private old context';
const RATE_KEY = `${RATE_LIMIT_STORAGE_KEY}_adaptive-question`;

const previousAnswers = [{ question: 'Synthetic question', answer: SYNTHETIC }];
const nextQuestionBase = { question: 'Base?', subtext: 'Base' };

function identity(): string {
  return (globalThis as { __aq1Identity?: string }).__aq1Identity ?? 'synthetic-old';
}

function setIdentity(value: string): void {
  (globalThis as { __aq1Identity?: string }).__aq1Identity = value;
}

function completeResetWithoutRotatingIdentity(): void {
  const token = beginLocalResetSession();
  endLocalResetSession(token);
}

function rateEntries(): [string, unknown][] {
  const raw = mmkvStorage.getItem(RATE_KEY) as string | null;
  if (!raw) return [];
  return [[RATE_KEY, JSON.parse(raw)]];
}

async function flush(): Promise<void> {
  await new Promise<void>((resolve) => {
    setImmediate(resolve);
  });
}

function deferredBodyResponse(): {
  response: { ok: true; status: number; json: () => Promise<unknown>; text: () => Promise<string> };
  resolveJson: (value: unknown) => void;
} {
  let resolveJson: (value: unknown) => void = () => undefined;
  const json = new Promise((resolve) => {
    resolveJson = resolve;
  });
  return {
    response: {
      ok: true,
      status: 200,
      json: () => json,
      text: async () => '',
    },
    resolveJson,
  };
}

const fetchMock = jest.fn();
const requests: { path: string; deviceId: string | undefined; containsOldContext: boolean }[] = [];

function recordRequest(url: string, opts: { headers?: Record<string, string>; body?: string }): void {
  requests.push({
    path: new URL(url).pathname,
    deviceId: opts.headers?.['X-Device-ID'],
    containsOldContext: typeof opts.body === 'string' && opts.body.includes(SYNTHETIC),
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  resetSyncSessionFenceForTesting();
  setIdentity('synthetic-old');
  mmkvStorage.removeItem(RATE_KEY);
  requests.length = 0;
  fetchMock.mockReset();
  (globalThis as { fetch: typeof fetch }).fetch = fetchMock as unknown as typeof fetch;
});

afterEach(() => {
  resetSyncSessionFenceForTesting();
});

describe('adaptive / diagnostic / mirror-back reset ownership', () => {
  it.each([
    [
      'adaptive',
      (session: number) => generateAdaptiveQuestion(previousAnswers, nextQuestionBase, 'longing', undefined, session),
    ],
    [
      'mirror-back',
      (session: number) => generateMirrorBackText({ name: 'Synthetic', aboutMe: SYNTHETIC }, session),
    ],
    [
      'diagnostic',
      (session: number) => generateDiagnosticQuestions({ currentSituation: SYNTHETIC }, session),
    ],
  ])('%s rejects a caller token after reset without fetching', async (_name, call) => {
    const session = captureSyncSession();
    completeResetWithoutRotatingIdentity();

    await expect(call(session)).rejects.toBeInstanceOf(SyncSessionInvalidatedError);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(rateEntries()).toEqual([]);
  });

  it.each([
    ['adaptive', () => generateAdaptiveQuestion(previousAnswers, nextQuestionBase, 'longing')],
    ['mirror-back', () => generateMirrorBackText({ name: 'Synthetic', aboutMe: SYNTHETIC })],
    ['diagnostic', () => generateDiagnosticQuestions({ currentSituation: SYNTHETIC })],
  ])('%s does not start a request while reset is in progress', async (_name, call) => {
    beginLocalResetSession();

    await expect(call()).rejects.toBeInstanceOf(SyncSessionInvalidatedError);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(rateEntries()).toEqual([]);
  });

  it('does not start adaptive legacy fallback after a delayed empty insight body and reset', async () => {
    const deferred = deferredBodyResponse();
    fetchMock.mockImplementation(async (url: string, opts: { headers?: Record<string, string>; body?: string }) => {
      recordRequest(url, opts);
      return deferred.response;
    });

    const pending = generateAdaptiveQuestion(previousAnswers, nextQuestionBase, 'longing');
    await flush();
    expect(typeof deferred.resolveJson).toBe('function');

    completeResetWithoutRotatingIdentity();
    setIdentity('synthetic-new');
    deferred.resolveJson({});

    await expect(pending).rejects.toBeInstanceOf(SyncSessionInvalidatedError);
    expect(requests).toEqual([
      expect.objectContaining({
        path: '/api/generate/onboarding-insight',
        deviceId: 'synthetic-old',
        containsOldContext: true,
      }),
    ]);
    expect(rateEntries()).toEqual([]);
  });

  it('does not start mirror-back legacy fallback after a delayed empty insight body and reset', async () => {
    const deferred = deferredBodyResponse();
    fetchMock.mockImplementation(async (url: string, opts: { headers?: Record<string, string>; body?: string }) => {
      recordRequest(url, opts);
      return deferred.response;
    });

    const pending = generateMirrorBackText({ name: 'Synthetic', aboutMe: SYNTHETIC });
    await flush();
    completeResetWithoutRotatingIdentity();
    deferred.resolveJson({});

    await expect(pending).rejects.toBeInstanceOf(SyncSessionInvalidatedError);
    expect(requests).toHaveLength(1);
    expect(requests[0].path).toBe('/api/generate/onboarding-insight');
    expect(rateEntries()).toEqual([]);
  });

  it('does not recreate the diagnostic rate counter after a delayed success body and reset', async () => {
    const deferred = deferredBodyResponse();
    fetchMock.mockImplementation(async (url: string, opts: { headers?: Record<string, string>; body?: string }) => {
      recordRequest(url, opts);
      return deferred.response;
    });

    const pending = generateDiagnosticQuestions({ currentSituation: SYNTHETIC });
    await flush();
    completeResetWithoutRotatingIdentity();
    deferred.resolveJson({ questions: [{ question: 'Synthetic diagnostic?', subtext: '', chips: [] }] });

    await expect(pending).rejects.toBeInstanceOf(SyncSessionInvalidatedError);
    expect(requests).toHaveLength(1);
    expect(rateEntries()).toEqual([]);
  });

  it('invalidates a delayed adaptive body while reset is still in progress', async () => {
    const deferred = deferredBodyResponse();
    fetchMock.mockImplementation(async (url: string, opts: { headers?: Record<string, string>; body?: string }) => {
      recordRequest(url, opts);
      return deferred.response;
    });

    const pending = generateAdaptiveQuestion(previousAnswers, nextQuestionBase, 'longing');
    await flush();
    const token = beginLocalResetSession();
    deferred.resolveJson({ question: 'Stale after in-progress reset?' });
    await expect(pending).rejects.toBeInstanceOf(SyncSessionInvalidatedError);
    endLocalResetSession(token);
    expect(requests).toHaveLength(1);
    expect(rateEntries()).toEqual([]);
  });

  it('keeps current-session adaptive insight success', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ question: 'Current valid?', subtext: '', chips: [] }),
      text: async () => '',
    });

    await expect(generateAdaptiveQuestion(previousAnswers, nextQuestionBase, 'longing')).resolves.toEqual(
      expect.objectContaining({ question: 'Current valid?', source: 'backend' }),
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(identity()).toBe('synthetic-old');
  });

  it('keeps current-session adaptive legacy fallback after an empty insight body', async () => {
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({}),
        text: async () => '',
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ question: 'Legacy valid?', subtext: 'Legacy', chips: [] }),
        text: async () => '',
      });

    await expect(generateAdaptiveQuestion(previousAnswers, nextQuestionBase, 'longing')).resolves.toEqual(
      expect.objectContaining({ question: expect.stringContaining('Legacy valid'), source: 'backend' }),
    );
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(new URL(fetchMock.mock.calls[1][0]).pathname).toBe('/api/generate/adaptive-question');
    expect(fetchMock.mock.calls[1][1].headers['X-Device-ID']).toBe('synthetic-old');
    expect(rateEntries()[0][1]).toEqual(expect.objectContaining({ count: 1 }));
  });

  it('keeps current-session mirror-back legacy fallback after an empty insight body', async () => {
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({}),
        text: async () => '',
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          reflection: 'Synthetic reflection',
          verse: '',
          verseRef: '',
          anticipation: '',
        }),
        text: async () => '',
      });

    await expect(generateMirrorBackText({ name: 'Synthetic', aboutMe: SYNTHETIC })).resolves.toEqual({
      content: expect.objectContaining({ reflection: 'Synthetic reflection' }),
      source: 'backend',
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(new URL(fetchMock.mock.calls[1][0]).pathname).toBe('/api/generate/adaptive-question');
  });

  it('keeps current-session diagnostic success and increments the rate counter', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ questions: [{ question: 'Synthetic diagnostic?', subtext: '', chips: [] }] }),
      text: async () => '',
    });

    await expect(generateDiagnosticQuestions({ currentSituation: SYNTHETIC })).resolves.toEqual({
      questions: [expect.objectContaining({ question: 'Synthetic diagnostic?' })],
    });
    expect(rateEntries()[0][1]).toEqual(expect.objectContaining({ count: 1 }));
  });

  it('still returns ordinary current-session adaptive fallback after a network failure', async () => {
    fetchMock.mockRejectedValue(new Error('network request failed'));

    await expect(generateAdaptiveQuestion(previousAnswers, nextQuestionBase, 'longing')).resolves.toEqual({
      ...nextQuestionBase,
      source: 'fallback',
    });
  });

  it('still returns ordinary current-session diagnostic null after a network failure', async () => {
    fetchMock.mockRejectedValue(new Error('network request failed'));

    await expect(generateDiagnosticQuestions({ currentSituation: SYNTHETIC })).resolves.toBeNull();
  });
});
