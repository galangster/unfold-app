/* eslint-disable import/first */
/**
 * `applyInitialArcResult` is the store side of /generating's completion
 * handler, moved so Today can land the same job after "Go home — we'll keep
 * writing". These pin the move: the shell, the scripture bookkeeping, the
 * in-flight record and the session end exactly as before.
 */
jest.mock('../api-config', () => ({
  PRIMARY_BACKEND_URL: 'https://example.test',
  getAuthHeaders: jest.fn(async () => ({ 'Content-Type': 'application/json' })),
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
    getDeviceId: jest.fn(() => 'test-device-id'),
    getSharedEncryptionKey: jest.fn(() => 'test-key'),
    isRecoverySession: jest.fn(() => false),
  };
});

import { logBugError, logBugEvent } from '../bug-logger';
import {
  INFLIGHT_GENERATION_JOB_KEY,
  readInflightGenerationJob,
  writeInflightGenerationJob,
} from '../inflight-generation-job';
import {
  DEFAULT_SERIES_TITLE,
  applyInitialArcResult,
  settleInflightInitialArcWatch,
} from '../initial-arc-result';
import { extractBookFromReference } from '../devotional-service';
import { mmkvStorage } from '../mmkv-storage';
import { useUnfoldStore, type DevotionalDay, type UserProfile } from '../store';

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
  arc: {
    totalDaysPlanned: 3,
    overarchingTheme: 'Trust',
    narrativeShape: 'arc',
    dayHints: [],
    isOpenEnded: false,
    createdAt: '2026-09-04T08:00:00.000Z',
  },
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

function resetStore() {
  useUnfoldStore.setState({
    devotionals: [],
    currentDevotionalId: null,
    usedScriptures: [],
    user,
    generationSession: { status: 'running', devotionalId: 'devo-1', totalDays: 3, generatedDayNumbers: [] },
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  mmkvStorage.removeItem(INFLIGHT_GENERATION_JOB_KEY);
  resetStore();
  writeInflightGenerationJob({ jobId: 'job-1', devotionalId: 'devo-1', submittedAt: NOW - 30_000, leftForHome: true });
});

describe('applyInitialArcResult', () => {
  it('creates the devotional shell with day 1 and makes it current', () => {
    const applied = applyInitialArcResult(result, { user, devotionalLength: 7 });

    expect(applied).toEqual({ devotionalId: 'devo-1', seriesTitle: 'Learning to Trust Again', day1 });
    const state = useUnfoldStore.getState();
    expect(state.currentDevotionalId).toBe('devo-1');
    const devotional = state.devotionals.find((d) => d.id === 'devo-1');
    expect(devotional).toMatchObject({
      title: 'Learning to Trust Again',
      totalDays: 3,
      currentDay: 1,
      generationMode: 'progressive',
      seriesArc: result.arc,
      themeCategory: 'trust',
      devotionalType: 'personal',
      userContext: { name: 'Jordan', aboutMe: 'New to this', currentSituation: 'Between jobs', emotionalState: 'anxious' },
      progressiveMemory: { fullDays: [], summaries: [], narrative: null },
    });
    expect(devotional?.days).toHaveLength(1);
    expect(devotional?.days[0]).toMatchObject({ dayNumber: 1, title: 'Trust before understanding' });
    expect(devotional?.seriesStartDate).toBeTruthy();
  });

  it('falls back to the default title and the reader\'s series length', () => {
    applyInitialArcResult({ devotionalId: 'devo-1', devotionalDay: day1 }, { user: null, devotionalLength: 7 });

    const devotional = useUnfoldStore.getState().devotionals[0];
    expect(devotional.title).toBe(DEFAULT_SERIES_TITLE);
    expect(devotional.totalDays).toBe(7);
    expect(devotional.userContext).toEqual({ name: '', aboutMe: '', currentSituation: '', emotionalState: '' });
    expect(devotional.devotionalType).toBe('personal');
  });

  it('only adds the day when the shell already exists, and never duplicates it', () => {
    applyInitialArcResult(result, { user, devotionalLength: 7 });
    useUnfoldStore.getState().updateDevotionalDays('devo-1', [], 'Renamed by sync');

    applyInitialArcResult(result, { user, devotionalLength: 7 });
    applyInitialArcResult(result, { user, devotionalLength: 7 });

    const state = useUnfoldStore.getState();
    expect(state.devotionals).toHaveLength(1);
    expect(state.devotionals[0].title).toBe('Renamed by sync');
    expect(state.devotionals[0].days.map((d) => d.dayNumber)).toEqual([1]);
  });

  it('records the used scripture with its book', () => {
    applyInitialArcResult(result, { user, devotionalLength: 7 });

    expect(useUnfoldStore.getState().usedScriptures).toEqual([
      expect.objectContaining({ reference: 'Psalm 56:3-4', book: 'Psalm', devotionalId: 'devo-1' }),
    ]);
  });

  it('keys a numbered book the way the scripture variance engine does', () => {
    const reference = '1 Corinthians 13:4-7';
    applyInitialArcResult({ ...result, devotionalDay: { ...day1, scriptureReference: reference } }, { user, devotionalLength: 7 });

    expect(extractBookFromReference(reference)).toBe('1 Corinthians');
    expect(useUnfoldStore.getState().usedScriptures).toEqual([
      expect.objectContaining({ reference, book: extractBookFromReference(reference), devotionalId: 'devo-1' }),
    ]);
  });

  it('removes the in-flight record and completes the session with the series title', () => {
    applyInitialArcResult(result, { user, devotionalLength: 7 });

    expect(mmkvStorage.removeItem).toHaveBeenCalledWith(INFLIGHT_GENERATION_JOB_KEY);
    expect(readInflightGenerationJob()).toBeNull();
    expect(useUnfoldStore.getState().generationSession).toMatchObject({
      status: 'complete',
      title: 'Learning to Trust Again',
      devotionalId: 'devo-1',
    });
  });

  it('throws before touching the store when the result has no devotional id', () => {
    expect(() => applyInitialArcResult({ devotionalDay: day1 }, { user, devotionalLength: 7 })).toThrow(
      /did not return a canonical devotionalId/,
    );
    expect(useUnfoldStore.getState().devotionals).toHaveLength(0);
    expect(readInflightGenerationJob()).not.toBeNull();
  });
});

describe('settleInflightInitialArcWatch', () => {
  it('lands a completed job the way /generating does and logs the completion', () => {
    settleInflightInitialArcWatch({ kind: 'complete', result: { ...result, devotionalDay: { ...day1, devotionalId: 'devo-1', id: 'devo-1:1' } } }, { jobId: 'job-1' });

    const state = useUnfoldStore.getState();
    expect(state.currentDevotionalId).toBe('devo-1');
    expect(state.devotionals[0].totalDays).toBe(3);
    expect(state.generationSession.status).toBe('complete');
    expect(readInflightGenerationJob()).toBeNull();
    expect(logBugEvent).toHaveBeenCalledWith(
      'generation',
      'server-generation-complete',
      expect.objectContaining({ devotionalId: 'devo-1', landedOn: 'today' }),
    );
  });

  it('clears the record and fails the session on a failed job', () => {
    settleInflightInitialArcWatch(
      { kind: 'failed', message: 'Model overloaded', phase: 'server-poll', canRetry: true },
      { jobId: 'job-1' },
    );

    expect(readInflightGenerationJob()).toBeNull();
    expect(useUnfoldStore.getState().generationSession).toMatchObject({ status: 'error', error: 'Model overloaded' });
    expect(useUnfoldStore.getState().devotionals).toHaveLength(0);
    expect(logBugError).toHaveBeenCalledWith('generation', expect.any(Error), { jobId: 'job-1', phase: 'server-poll' });
  });

  it('keeps the record and fails the session when the server could not be reached', () => {
    settleInflightInitialArcWatch({ kind: 'unreachable', message: 'Unable to connect' }, { jobId: 'job-1' });

    expect(readInflightGenerationJob()).not.toBeNull();
    expect(useUnfoldStore.getState().generationSession).toMatchObject({ status: 'error', error: 'Unable to connect' });
    expect(useUnfoldStore.getState().devotionals).toHaveLength(0);
    expect(logBugError).toHaveBeenCalledWith('generation', expect.any(Error), { jobId: 'job-1', phase: 'server-poll-unreachable' });
  });

  it('treats a result it cannot land as a failure instead of leaving the record live', () => {
    settleInflightInitialArcWatch(
      { kind: 'complete', result: { devotionalDay: { ...day1, devotionalId: '', id: '' }, devotionalId: '' } },
      { jobId: 'job-1' },
    );

    expect(readInflightGenerationJob()).toBeNull();
    expect(useUnfoldStore.getState().generationSession.status).toBe('error');
    expect(logBugError).toHaveBeenCalledWith('generation', expect.any(Error), { jobId: 'job-1', phase: 'today-apply-initial-arc' });
  });

  it('leaves everything in place when the watch was cancelled', () => {
    settleInflightInitialArcWatch({ kind: 'cancelled' }, { jobId: 'job-1' });

    expect(readInflightGenerationJob()).not.toBeNull();
    expect(useUnfoldStore.getState().generationSession.status).toBe('running');
    expect(logBugError).not.toHaveBeenCalled();
  });
});
