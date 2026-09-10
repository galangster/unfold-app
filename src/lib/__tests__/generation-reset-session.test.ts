/* eslint-disable import/first */
/**
 * MD-5: generation work captured before reset must not persist, retry, or
 * apply after the originating session is invalidated — even when identity
 * rotation fails and a stale caller could recapture a fresh session.
 */
jest.mock('../api-config', () => ({
  PRIMARY_BACKEND_URL: 'https://example.test',
  getAuthHeaders: jest.fn(async () => ({ 'Content-Type': 'application/json', 'X-Device-ID': 'synthetic-old' })),
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
      setItem: jest.fn((key: string, value: string) => store.set(key, value)),
      removeItem: jest.fn((key: string) => store.delete(key)),
    },
    getDeviceId: jest.fn(() => 'synthetic-old'),
    getSharedEncryptionKey: jest.fn(() => 'test-key'),
    isRecoverySession: jest.fn(() => false),
  };
});

jest.mock('../rate-limit', () => ({
  checkRateLimit: jest.fn(async () => ({ allowed: true, remaining: 5, resetTime: Date.now() + 3_600_000 })),
  incrementRateLimit: jest.fn(async () => undefined),
  getTimeUntilReset: jest.fn(() => '1 hour'),
}));

jest.mock('../story-service', () => ({
  fetchStoriesForGeneration: jest.fn(async () => []),
  formatStoriesForPrompt: jest.fn(() => ''),
}));

jest.mock('../report-error', () => ({ reportError: jest.fn() }));

import { submitGenerationJob, recoverCompletedGenerationResult } from '../generation-api';
import { postJsonWithBackendFallback } from '../devotional-service';
import {
  applyInitialArcResult,
  settleInflightInitialArcWatch,
} from '../initial-arc-result';
import {
  beginLocalResetSession,
  captureSyncSession,
  endLocalResetSession,
  resetSyncSessionFenceForTesting,
  shouldReuseInflightGenerationPromise,
  SyncSessionInvalidatedError,
} from '../generation-session';
import {
  INFLIGHT_GENERATION_JOB_KEY,
  readInflightGenerationJob,
  writeInflightGenerationJob,
} from '../inflight-generation-job';
import {
  getOnboardingSampleJob,
  saveOnboardingSampleJob,
} from '../onboarding-sample-job-store';
import { runOnboardingSampleFallback } from '../onboarding-segue-poll';
import { mmkvStorage } from '../mmkv-storage';
import { useUnfoldStore, type DevotionalDay, type UserProfile } from '../store';
import * as ts from 'typescript';

const NOW = 1_800_000_000_000;

const day1: DevotionalDay = {
  dayNumber: 1,
  title: 'Trust before understanding',
  scriptureReference: 'Psalm 56:3-4',
  scriptureText: 'When I am afraid, I put my trust in you.',
  bodyText: 'Body',
  quotableLine: 'Line',
  isRead: false,
};

const result = {
  devotionalId: 'devo-1',
  devotionalDay: day1,
  seriesTitle: 'Learning to Trust Again',
  totalDays: 3,
};

const user = {
  name: 'Jordan',
  aboutMe: 'New to this',
  currentSituation: 'Between jobs',
  emotionalState: 'anxious',
  selectedTheme: 'trust',
  selectedType: 'personal',
  devotionalLength: 3,
} as unknown as UserProfile;

function completeResetWithoutRotatingIdentity(): void {
  const token = beginLocalResetSession();
  endLocalResetSession(token);
}

function resetStore() {
  useUnfoldStore.setState({
    devotionals: [],
    currentDevotionalId: null,
    usedScriptures: [],
    user,
    generationSession: { status: 'running', devotionalId: 'devo-1', totalDays: 3, generatedDayNumbers: [] },
  });
}

const fetchMock = jest.fn();

beforeEach(() => {
  jest.clearAllMocks();
  resetSyncSessionFenceForTesting();
  mmkvStorage.removeItem(INFLIGHT_GENERATION_JOB_KEY);
  resetStore();
  writeInflightGenerationJob({ jobId: 'job-1', devotionalId: 'devo-1', submittedAt: NOW - 30_000, leftForHome: true });
  fetchMock.mockReset();
  (globalThis as { fetch: unknown }).fetch = fetchMock;
});

describe('apply and settle after reset', () => {
  it('lands a current-session completion', () => {
    const applied = applyInitialArcResult(result, {
      user,
      devotionalLength: 7,
      session: captureSyncSession(),
    });

    expect(applied.devotionalId).toBe('devo-1');
    expect(useUnfoldStore.getState().currentDevotionalId).toBe('devo-1');
    expect(useUnfoldStore.getState().generationSession.status).toBe('complete');
  });

  it('rejects old completion after reset even when identity is unchanged', () => {
    const session = captureSyncSession();
    completeResetWithoutRotatingIdentity();

    expect(() => applyInitialArcResult(result, { user, devotionalLength: 7, session }))
      .toThrow(SyncSessionInvalidatedError);
    expect(useUnfoldStore.getState().devotionals).toHaveLength(0);
    expect(useUnfoldStore.getState().generationSession.status).toBe('running');
    expect(readInflightGenerationJob()).not.toBeNull();
  });

  it('does not fail or clear a fresh session when an old watch error settles', () => {
    const stale = captureSyncSession();
    completeResetWithoutRotatingIdentity();
    useUnfoldStore.getState().startGenerationSession({ devotionalId: 'fresh-devo', totalDays: 7 });
    writeInflightGenerationJob({ jobId: 'fresh-job', submittedAt: NOW, leftForHome: true });

    settleInflightInitialArcWatch(
      { kind: 'failed', message: 'old writer failed', phase: 'server-poll', canRetry: true },
      { jobId: 'job-1', session: stale },
    );

    expect(useUnfoldStore.getState().generationSession).toMatchObject({
      status: 'running',
      devotionalId: 'fresh-devo',
    });
    expect(readInflightGenerationJob()?.jobId).toBe('fresh-job');
  });

  it('recovers a current-session completed job and refuses a stale 409 adoption', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        jobId: 'existing-job',
        status: 'complete',
        result: { ...result, devotionalDay: { ...day1, devotionalId: 'devo-1', id: 'devo-1:1' } },
      }),
    });

    const session = captureSyncSession();
    await expect(recoverCompletedGenerationResult({
      devotionalId: 'devo-1',
      dayNumber: 1,
      existingJobId: 'existing-job',
      session,
    })).resolves.toEqual(expect.objectContaining({ devotionalId: 'devo-1' }));

    completeResetWithoutRotatingIdentity();
    await expect(recoverCompletedGenerationResult({
      devotionalId: 'devo-1',
      dayNumber: 1,
      existingJobId: 'existing-job',
      session,
    })).rejects.toBeInstanceOf(SyncSessionInvalidatedError);
    expect(() => applyInitialArcResult(result, { user, devotionalLength: 7, session }))
      .toThrow(SyncSessionInvalidatedError);
  });
});

describe('shared retry and inflight isolation', () => {
  it('does not reuse a stale inflight promise for fresh generation after reset', () => {
    const stale = captureSyncSession();
    expect(shouldReuseInflightGenerationPromise(stale, stale)).toBe(true);

    completeResetWithoutRotatingIdentity();
    const fresh = captureSyncSession();
    expect(shouldReuseInflightGenerationPromise(stale, fresh)).toBe(false);
    expect(shouldReuseInflightGenerationPromise(stale, stale)).toBe(false);
  });

  it('rejects a stale post before transport and does not retry', async () => {
    const session = captureSyncSession();
    completeResetWithoutRotatingIdentity();

    await expect(postJsonWithBackendFallback('/api/generate/devotional', { ping: true }, { session }))
      .rejects.toBeInstanceOf(SyncSessionInvalidatedError);
    expect(fetchMock).not.toHaveBeenCalled();
  });

});

describe('onboarding sample identity and canceled recovery', () => {
  it('keeps an originating-device record out of a new-identity reader', () => {
    saveOnboardingSampleJob({
      jobId: 'old-sample',
      devotionalId: 'old-devo',
      deviceId: 'synthetic-old',
    });

    expect(getOnboardingSampleJob({ deviceId: 'synthetic-old' })?.jobId).toBe('old-sample');
    expect(getOnboardingSampleJob({ deviceId: 'synthetic-new' })).toBeNull();
  });

  it('does not treat a canceled empty recovery as a reason to submit', async () => {
    const submitFallback = jest.fn(async () => {});
    const branch = await runOnboardingSampleFallback({
      persistedJobId: null,
      usePersistedJob: jest.fn(),
      recoverCompleted: async () => false,
      submitFallback,
      isCurrent: () => false,
    });

    expect(branch).toBe('canceled');
    expect(submitFallback).not.toHaveBeenCalled();
  });
});

describe('transport after reset', () => {
  it('does not submit with a stale originating session', async () => {
    const session = captureSyncSession();
    completeResetWithoutRotatingIdentity();

    await expect(submitGenerationJob({
      dayNumber: 1,
      jobType: 'initial_arc',
      session,
    })).rejects.toBeInstanceOf(SyncSessionInvalidatedError);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

const fs = require('fs') as typeof import('fs');
const path = require('path') as typeof import('path');
const vm = require('vm') as typeof import('vm');

function compileBindings(code: string, bindings: Record<string, unknown> = {}) {
  const context = { exports: {} as { run?: unknown; [key: string]: unknown }, setTimeout, clearTimeout, ...bindings };
  vm.runInNewContext(
    ts.transpileModule(code, {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText,
    context,
  );
  return context.exports;
}

function extractFn(sourceText: string, name: string, kind: ts.ScriptKind = ts.ScriptKind.TS): string {
  const source = ts.createSourceFile('extract.ts', sourceText, ts.ScriptTarget.Latest, true, kind);
  let found: ts.FunctionDeclaration | undefined;
  const walk = (node: ts.Node) => {
    if (ts.isFunctionDeclaration(node) && node.name?.text === name) found = node;
    ts.forEachChild(node, walk);
  };
  walk(source);
  if (!found) throw new Error(`Missing function ${name}`);
  return found.getText(source).replace(/^export\s+/, '');
}

const serviceSource = fs.readFileSync(path.join(__dirname, '../devotional-service.ts'), 'utf8');
const fenceSource = fs.readFileSync(path.join(__dirname, '../sync-session-fence.ts'), 'utf8');
const generationSource = fs.readFileSync(path.join(__dirname, '../generation-session.ts'), 'utf8');

function loadFenceAndGeneration() {
  const fence = compileBindings(fenceSource);
  const generation = compileBindings(generationSource, { require: () => fence });
  return { fence, generation };
}

describe('actual continuation and retry after reset', () => {
  const noop = () => undefined;

  function compileContinuation(generation: Record<string, unknown>, extras: Record<string, unknown>) {
    const bindings: Record<string, unknown> = {
      ...generation,
      logger: { log: noop, warn: noop, error: noop },
      logBugEvent: noop,
      sanitizeForPrompt: (value: string | undefined) => value ?? '',
      isNetworkError: () => false,
      ...extras,
    };
    bindings.generateBatchWithRetry = compileBindings(
      `exports.run=${extractFn(serviceSource, 'generateBatchWithRetry')}`,
      bindings,
    ).run;
    return compileBindings(
      `exports.run=${extractFn(serviceSource, 'continueGeneratingDays')}`,
      {
        ...bindings,
        inFlightContinuationRequests: extras.inFlightContinuationRequests,
        buildContinuationRequestKey: extras.buildContinuationRequestKey ?? (() => 'same'),
        reportError: extras.reportError,
      },
    ).run as (
      devotional: object,
      user: object,
    ) => Promise<{ dayNumber: number; title: string }[]>;
  }

  const sampleDevotional = {
    id: 'synthetic-same',
    title: 'Synthetic',
    totalDays: 2,
    days: [{ dayNumber: 1, title: 'Day 1' }],
    userContext: { name: 'Synthetic', aboutMe: 'Context', currentSituation: '', emotionalState: '' },
  };
  const sampleUser = { spiritualSeeking: '', readingDuration: 5, bibleTranslation: 'BSB' };

  it('normalizes a delayed legacy failure after reset and does not report the old id', async () => {
    const { fence, generation } = loadFenceAndGeneration();
    const reports: unknown[] = [];
    let rejectBatch!: (error: Error) => void;
    const continueFn = compileContinuation(generation, {
      generateBatch: () => new Promise((_resolve, reject) => {
        rejectBatch = reject;
      }),
      inFlightContinuationRequests: new Map(),
      reportError: (...args: unknown[]) => reports.push(args),
    });

    const task = continueFn(sampleDevotional, sampleUser).catch((error: Error) => error.name);
    const token = (fence.beginLocalResetSession as () => number)();
    (fence.endLocalResetSession as (token: number) => void)(token);
    rejectBatch(new Error('Synthetic delayed response body failure'));

    await expect(task).resolves.toBe('SyncSessionInvalidatedError');
    expect(reports).toHaveLength(0);
  });

  it('starts a fresh continuation without awaiting the stale inflight promise', async () => {
    const { fence, generation } = loadFenceAndGeneration();
    const reports: unknown[] = [];
    const batches: ((value: { title: string; days: { dayNumber: number; title: string }[] }) => void)[] = [];
    const inflight = new Map();
    const continueFn = compileContinuation(generation, {
      generateBatch: () => new Promise((resolve) => {
        batches.push(resolve);
      }),
      inFlightContinuationRequests: inflight,
      reportError: (...args: unknown[]) => reports.push(args),
    });

    const old = continueFn(sampleDevotional, sampleUser).catch((error: Error) => error.name);
    const token = (fence.beginLocalResetSession as () => number)();
    (fence.endLocalResetSession as (token: number) => void)(token);
    const fresh = continueFn(sampleDevotional, sampleUser);
    expect(batches).toHaveLength(2);

    batches[0]({ title: 'Old', days: [{ dayNumber: 2, title: 'Old' }] });
    await expect(old).resolves.toBe('SyncSessionInvalidatedError');

    const reused = continueFn(sampleDevotional, sampleUser);
    expect(batches).toHaveLength(2);
    batches[1]({ title: 'Fresh', days: [{ dayNumber: 2, title: 'Fresh' }] });
    const [freshDays, reusedDays] = await Promise.all([fresh, reused]);

    expect(freshDays[1].title).toBe('Fresh');
    expect(reusedDays[1].title).toBe('Fresh');
    expect(inflight.size).toBe(0);
    expect(reports).toHaveLength(0);
  });

  it('still reports an ordinary current-session continuation failure', async () => {
    const { generation } = loadFenceAndGeneration();
    const reports: unknown[] = [];
    const continueFn = compileContinuation(generation, {
      generateBatch: async () => {
        throw new Error('permanent model failure');
      },
      inFlightContinuationRequests: new Map(),
      reportError: (...args: unknown[]) => reports.push(args),
    });

    await expect(continueFn(sampleDevotional, sampleUser)).rejects.toThrow('permanent model failure');
    expect(reports).toHaveLength(1);
    expect(reports[0]).toEqual(expect.arrayContaining(['devotional-continuation']));
  });
});
