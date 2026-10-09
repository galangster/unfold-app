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

import {
  createAutoTrialIntent,
  readAutoTrialIntent,
  settleLandedAutoTrialSeries,
  transitionAutoTrialIntent,
} from '../auto-trial-intent';
import { withOnboardingFirstReadingArc } from '../auto-trial-series';
import { logBugError, logBugEvent } from '../bug-logger';
import { applyPulledUserData } from '../full-sync-pull';
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
import { captureSyncSession } from '../generation-session';
import { mmkvStorage } from '../mmkv-storage';
import { flushUnfoldStorePersist, useUnfoldStore, type Devotional, type DevotionalDay, type UserProfile } from '../store';
import { peekSyncOutbox, replaceSyncOutbox } from '../sync-outbox';
import { bindReplacementSeries, readReplacedSeries, readReplacedSeriesState, recordReplacedSeries } from '../series-replacement';
import { clearInitialGenerationRequestId, ensureInitialGenerationRequestId, readInitialGenerationRequestId } from '../initial-generation-request';

const NOW = 1_800_000_000_000;

/** /generating binds a waiting replacement for the request it submitted. */
function bindForStoredRequest(devotionalId: string): void {
  ensureInitialGenerationRequestId();
  bindReplacementSeries(devotionalId);
}

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
    const applied = applyInitialArcResult(result, { user, devotionalLength: 7, session: captureSyncSession() });

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

  it('keeps the server series anchor when a completed job is recovered days later', () => {
    const recovered = {
      ...result,
      seriesStartDate: '2026-09-04T08:05:00.000Z',
    };

    applyInitialArcResult(recovered, { user, devotionalLength: 7, session: captureSyncSession() });

    expect(useUnfoldStore.getState().devotionals[0]).toMatchObject({
      createdAt: recovered.seriesStartDate,
      seriesStartDate: recovered.seriesStartDate,
    });
  });

  it('uses the generated day timestamp for completed jobs created before the series anchor response field', () => {
    const generatedAt = '2026-09-04T08:04:00.000Z';
    applyInitialArcResult(
      { ...result, devotionalDay: { ...day1, generatedAt } },
      { user, devotionalLength: 7, session: captureSyncSession() },
    );

    expect(useUnfoldStore.getState().devotionals[0].seriesStartDate).toBe(generatedAt);
  });

  it('falls back to the default title and the reader\'s series length', () => {
    applyInitialArcResult({ devotionalId: 'devo-1', devotionalDay: day1 }, { user: null, devotionalLength: 7, session: captureSyncSession() });

    const devotional = useUnfoldStore.getState().devotionals[0];
    expect(devotional.title).toBe(DEFAULT_SERIES_TITLE);
    expect(devotional.totalDays).toBe(7);
    expect(devotional.userContext).toEqual({ name: '', aboutMe: '', currentSituation: '', emotionalState: '' });
    expect(devotional.devotionalType).toBe('personal');
  });

  it('only adds the day when the shell already exists, and never duplicates it', () => {
    applyInitialArcResult(result, { user, devotionalLength: 7, session: captureSyncSession() });
    useUnfoldStore.getState().updateDevotionalDays('devo-1', [], 'Renamed by sync');

    applyInitialArcResult(result, { user, devotionalLength: 7, session: captureSyncSession() });
    applyInitialArcResult(result, { user, devotionalLength: 7, session: captureSyncSession() });

    const state = useUnfoldStore.getState();
    expect(state.devotionals).toHaveLength(1);
    expect(state.devotionals[0].title).toBe('Renamed by sync');
    expect(state.devotionals[0].days.map((d) => d.dayNumber)).toEqual([1]);
  });

  it('records the used scripture with its book', () => {
    applyInitialArcResult(result, { user, devotionalLength: 7, session: captureSyncSession() });

    expect(useUnfoldStore.getState().usedScriptures).toEqual([
      expect.objectContaining({ reference: 'Psalm 56:3-4', book: 'Psalm', devotionalId: 'devo-1' }),
    ]);
  });

  it('keys a numbered book the way the scripture variance engine does', () => {
    const reference = '1 Corinthians 13:4-7';
    applyInitialArcResult({ ...result, devotionalDay: { ...day1, scriptureReference: reference } }, { user, devotionalLength: 7, session: captureSyncSession() });

    expect(extractBookFromReference(reference)).toBe('1 Corinthians');
    expect(useUnfoldStore.getState().usedScriptures).toEqual([
      expect.objectContaining({ reference, book: extractBookFromReference(reference), devotionalId: 'devo-1' }),
    ]);
  });

  it('removes the in-flight record and completes the session with the series title', () => {
    applyInitialArcResult(result, { user, devotionalLength: 7, session: captureSyncSession() });

    expect(mmkvStorage.removeItem).toHaveBeenCalledWith(INFLIGHT_GENERATION_JOB_KEY);
    expect(readInflightGenerationJob()).toBeNull();
    expect(useUnfoldStore.getState().generationSession).toMatchObject({
      status: 'complete',
      title: 'Learning to Trust Again',
      devotionalId: 'devo-1',
    });
  });

  // 2026-10-09 release audit round 2: the store writes to disk on a delay, and
  // the in-flight record is the only way to land the series again after a crash.
  it('writes the new series to disk before it clears the in-flight record', () => {
    flushUnfoldStorePersist();
    mmkvStorage.removeItem('unfold-storage');
    const removeItem = jest.mocked(mmkvStorage.removeItem);
    const original = removeItem.getMockImplementation()!;
    let storedWhenCleared: string | null | undefined;
    removeItem.mockImplementation((key: string) => {
      if (key === INFLIGHT_GENERATION_JOB_KEY && storedWhenCleared === undefined) {
        storedWhenCleared = mmkvStorage.getItem('unfold-storage') as string | null;
      }
      return original(key);
    });
    try {
      applyInitialArcResult(result, { user, devotionalLength: 7, session: captureSyncSession() });
    } finally {
      removeItem.mockImplementation(original);
    }

    const stored = JSON.parse(storedWhenCleared!);
    expect(stored.state.devotionals).toEqual([
      expect.objectContaining({ id: 'devo-1', days: [expect.objectContaining({ dayNumber: 1 })] }),
    ]);
  });

  // 2026-10-09 release audit round 3: another device can change either series
  // before this result lands here.
  describe('the series it replaces', () => {
    beforeEach(() => replaceSyncOutbox([]));

    const replaced = (over: Partial<Devotional> = {}): Devotional => ({
      id: 'old-series', title: 'Old', totalDays: 7, currentDay: 3, days: [], createdAt: '2026-10-01T08:00:00.000Z',
      updatedAt: '2026-10-08T08:00:00.000Z', generationMode: 'progressive', ...over,
    } as Devotional);

    // 2026-10-09 release audit round 4: a notification for an earlier attempt
    // can land that job while the reader answers the new questionnaire.
    it('leaves it to the series started in its place when an unrelated job lands first', () => {
      useUnfoldStore.setState({ devotionals: [replaced()], currentDevotionalId: 'old-series' });
      recordReplacedSeries('old-series', '');
      applyInitialArcResult({ ...result, devotionalId: 'earlier-attempt', seriesStartDate: '2026-10-08T07:00:00.000Z' }, { user, devotionalLength: 7, session: captureSyncSession() });

      expect(useUnfoldStore.getState().devotionals.find((d) => d.id === 'old-series')?.archivedAt).toBeFalsy();
      expect(peekSyncOutbox().filter((c) => c.table === 'devotionals' && c.id === 'old-series')).toEqual([]);
      // Both stay live, and Today follows the newer one, the series the server writes.
      expect(useUnfoldStore.getState().currentDevotionalId).toBe('earlier-attempt');
      expect(readReplacedSeries()).toBe('old-series');

      bindForStoredRequest('devo-1');
      applyInitialArcResult(result, { user, devotionalLength: 7, session: captureSyncSession() });
      expect(useUnfoldStore.getState().devotionals.find((d) => d.id === 'old-series')?.archivedAt).toBeTruthy();
      expect(readReplacedSeries()).toBeNull();
    });

    // 2026-10-09 release audit round 6: a late older result put Today back on
    // the previous series though a newer live series wins on the server.
    it('leaves Today empty when a late older result lands beside a newer live series', () => {
      const newer = replaced({ id: 'newer-series', title: 'Newer', createdAt: '2026-10-05T08:00:00.000Z' });
      useUnfoldStore.setState({ devotionals: [replaced(), newer], currentDevotionalId: 'old-series' });
      applyInitialArcResult({ ...result, seriesStartDate: '2026-10-03T08:00:00.000Z' }, { user, devotionalLength: 7, session: captureSyncSession() });

      expect(useUnfoldStore.getState().devotionals.map((d) => d.id)).toContain('devo-1');
      expect(useUnfoldStore.getState().currentDevotionalId).toBeNull();
    });

    // Round 6 again: an earlier result without server dates is stored with
    // this phone's guess for its start, which outranks the chosen series here.
    it('never moves Today to another held series when a late older result lands', () => {
      const chosen = replaced({ id: 'chosen-series', title: 'Chosen', createdAt: '2026-10-05T08:00:00.000Z' });
      const guessed = replaced({ id: 'guessed-series', title: 'Guessed', createdAt: '2026-10-09T08:00:00.000Z' });
      useUnfoldStore.setState({ devotionals: [chosen, guessed], currentDevotionalId: 'chosen-series' });
      applyInitialArcResult({ ...result, seriesStartDate: '2026-10-03T08:00:00.000Z' }, { user, devotionalLength: 7, session: captureSyncSession() });

      expect(useUnfoldStore.getState().currentDevotionalId).not.toBe('guessed-series');
    });

    it('leaves Today empty when no series wins on the server', () => {
      const twin = replaced({ id: 'twin-series', title: 'Twin' });
      useUnfoldStore.setState({ devotionals: [replaced(), twin], currentDevotionalId: 'old-series' });
      applyInitialArcResult(result, { user, devotionalLength: 7, session: captureSyncSession() });

      expect(useUnfoldStore.getState().currentDevotionalId).toBeNull();
    });

    it('keeps Today on a chosen series when a result without server dates lands', () => {
      useUnfoldStore.setState({ devotionals: [replaced()], currentDevotionalId: 'old-series' });
      applyInitialArcResult(result, { user, devotionalLength: 7, session: captureSyncSession() });

      expect(useUnfoldStore.getState().devotionals.map((d) => d.id)).toContain('devo-1');
      expect(useUnfoldStore.getState().currentDevotionalId).toBe('old-series');
    });

    it('records the replaced series\' lifecycle clock when the reader confirms the replacement', () => {
      useUnfoldStore.setState({ devotionals: [replaced({ archivedStateAt: '2026-10-08T07:00:00.000Z' } as Partial<Devotional>)], currentDevotionalId: 'old-series' });
      useUnfoldStore.getState().archiveCurrentDevotional();

      expect(readReplacedSeries()).toBe('old-series');
      expect(readReplacedSeriesState()).toBe('2026-10-08T07:00:00.000Z');
    });

    it('ends it when nothing newer was decided about it', () => {
      useUnfoldStore.setState({ devotionals: [replaced()], currentDevotionalId: 'old-series' });
      recordReplacedSeries('old-series', '');
      bindForStoredRequest('devo-1');
      applyInitialArcResult(result, { user, devotionalLength: 7, session: captureSyncSession() });

      expect(useUnfoldStore.getState().devotionals.find((d) => d.id === 'old-series')?.archivedAt).toBeTruthy();
      expect(readReplacedSeries()).toBeNull();
    });

    it('keeps it, and keeps it on Today, when the reader resumed it after choosing to replace it', () => {
      const resumedAt = '2026-10-09T09:00:00.000Z';
      useUnfoldStore.setState({ devotionals: [replaced({ archivedAt: null, archivedStateAt: resumedAt } as Partial<Devotional>)], currentDevotionalId: 'old-series' });
      recordReplacedSeries('old-series', '');
      bindForStoredRequest('devo-1');
      // The new series started before that resume, so the server writes the resumed one.
      applyInitialArcResult({ ...result, seriesStartDate: '2026-10-09T08:30:00.000Z' }, { user, devotionalLength: 7, session: captureSyncSession() });

      const kept = useUnfoldStore.getState().devotionals.find((d) => d.id === 'old-series');
      expect(kept?.archivedAt).toBeFalsy();
      expect(kept?.archivedStateAt).toBe(resumedAt);
      expect(useUnfoldStore.getState().currentDevotionalId).toBe('old-series');
      expect(peekSyncOutbox().filter((c) => c.table === 'devotionals' && c.id === 'old-series')).toEqual([]);
      expect(readReplacedSeries()).toBeNull();
    });

    it('still ends it when its clock is ahead of this phone but unchanged since the choice', () => {
      const earlierResume = '2099-01-01T00:00:00.000Z';
      useUnfoldStore.setState({ devotionals: [replaced({ archivedAt: null, archivedStateAt: earlierResume } as Partial<Devotional>)], currentDevotionalId: 'old-series' });
      recordReplacedSeries('old-series', earlierResume);
      bindForStoredRequest('devo-1');
      applyInitialArcResult(result, { user, devotionalLength: 7, session: captureSyncSession() });

      expect(useUnfoldStore.getState().devotionals.find((d) => d.id === 'old-series')?.archivedAt).toBeTruthy();
    });

    // 2026-10-09 release audit round 7: the end was dated when the new series
    // landed, which beat a resume the reader made elsewhere after the choice.
    it('dates the end from the reader\'s choice', () => {
      useUnfoldStore.setState({ devotionals: [replaced()], currentDevotionalId: 'old-series' });
      recordReplacedSeries('old-series', '', '2026-10-09T09:00:00.000Z');
      bindForStoredRequest('devo-1');
      applyInitialArcResult(result, { user, devotionalLength: 7, session: captureSyncSession() });

      expect(useUnfoldStore.getState().devotionals.find((d) => d.id === 'old-series')?.archivedStateAt).toBe('2026-10-09T09:00:00.000Z');
      expect(peekSyncOutbox().find((c) => c.table === 'devotionals' && c.id === 'old-series')?.data.archivedStateAt).toBe('2026-10-09T09:00:00.000Z');
    });

    it('dates the end just past a lifecycle clock that runs ahead of this phone', () => {
      const aheadAt = '2099-01-01T00:00:00.000Z';
      useUnfoldStore.setState({ devotionals: [replaced({ archivedAt: null, archivedStateAt: aheadAt } as Partial<Devotional>)], currentDevotionalId: 'old-series' });
      recordReplacedSeries('old-series', aheadAt, '2026-10-09T09:00:00.000Z');
      bindForStoredRequest('devo-1');
      applyInitialArcResult(result, { user, devotionalLength: 7, session: captureSyncSession() });

      expect(useUnfoldStore.getState().devotionals.find((d) => d.id === 'old-series')?.archivedStateAt).toBe('2099-01-01T00:00:00.001Z');
    });

    it('keeps it when the replacement was already paused', () => {
      const paused = { ...replaced({ id: 'devo-1', title: 'New', currentDay: 1 }), archivedAt: '2026-10-09T09:00:00.000Z', archivedStateAt: '2026-10-09T09:00:00.000Z' } as Devotional;
      useUnfoldStore.setState({ devotionals: [replaced(), paused], currentDevotionalId: 'old-series' });
      recordReplacedSeries('old-series', '');
      bindForStoredRequest('devo-1');
      applyInitialArcResult(result, { user, devotionalLength: 7, session: captureSyncSession() });

      expect(useUnfoldStore.getState().devotionals.find((d) => d.id === 'old-series')?.archivedAt).toBeFalsy();
      expect(useUnfoldStore.getState().currentDevotionalId).toBe('old-series');
    });
  });

  it('lands the series in memory and clears the recovery records when the disk write fails', () => {
    flushUnfoldStorePersist();
    const setItem = jest.mocked(mmkvStorage.setItem);
    const original = setItem.getMockImplementation()!;
    setItem.mockImplementation((key: string, value: string) => {
      if (key === 'unfold-storage') throw new Error('disk full');
      return original(key, value);
    });
    recordReplacedSeries('old-series');
    bindForStoredRequest('devo-1');
    try {
      expect(() => applyInitialArcResult(result, { user, devotionalLength: 7, session: captureSyncSession() })).not.toThrow();
    } finally {
      setItem.mockImplementation(original);
    }

    // The server holds the series and brings it back on the next pull. A kept
    // record would offer the finished job again as pending work.
    expect(useUnfoldStore.getState().devotionals.map((d) => d.id)).toContain('devo-1');
    expect(readInflightGenerationJob()).toBeNull();
    expect(readReplacedSeries()).toBeNull();
    expect(logBugError).toHaveBeenCalledWith('generation', expect.any(Error), { phase: 'persist-landed-series' });
  });

  it('throws before touching the store when the result has no devotional id', () => {
    expect(() => applyInitialArcResult({ devotionalDay: day1 }, { user, devotionalLength: 7, session: captureSyncSession() })).toThrow(
      /did not return a canonical devotionalId/,
    );
    expect(useUnfoldStore.getState().devotionals).toHaveLength(0);
    expect(readInflightGenerationJob()).not.toBeNull();
  });
});

describe('settleInflightInitialArcWatch', () => {
  it('lands a completed job the way /generating does and logs the completion', () => {
    settleInflightInitialArcWatch({ kind: 'complete', result: { ...result, devotionalDay: { ...day1, devotionalId: 'devo-1', id: 'devo-1:1' } } }, { jobId: 'job-1', session: captureSyncSession() });

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
      { jobId: 'job-1', session: captureSyncSession() },
    );

    expect(readInflightGenerationJob()).toBeNull();
    expect(useUnfoldStore.getState().generationSession).toMatchObject({ status: 'error', error: 'Model overloaded' });
    expect(useUnfoldStore.getState().devotionals).toHaveLength(0);
    expect(logBugError).toHaveBeenCalledWith('generation', expect.any(Error), { jobId: 'job-1', phase: 'server-poll' });
  });

  // 2026-10-09 release audit round 3: Today's Try again resubmits the stored
  // request, and the server answers it with the same failed job.
  it('retires the request a failed job answered, and keeps a newer one', () => {
    const answered = ensureInitialGenerationRequestId(() => '11111111-1111-4111-8111-111111111111');
    writeInflightGenerationJob({ jobId: 'job-1', devotionalId: 'devo-1', submittedAt: NOW - 30_000, requestId: answered });
    settleInflightInitialArcWatch(
      { kind: 'failed', message: 'Model overloaded', phase: 'server-poll', canRetry: false },
      { jobId: 'job-1', session: captureSyncSession() },
    );
    expect(readInitialGenerationRequestId()).toBeNull();

    ensureInitialGenerationRequestId(() => '22222222-2222-4222-8222-222222222222');
    writeInflightGenerationJob({ jobId: 'job-2', devotionalId: 'devo-1', submittedAt: NOW - 30_000, requestId: answered });
    settleInflightInitialArcWatch(
      { kind: 'failed', message: 'Model overloaded', phase: 'server-poll', canRetry: false },
      { jobId: 'job-2', session: captureSyncSession() },
    );
    expect(readInitialGenerationRequestId()).toBe('22222222-2222-4222-8222-222222222222');
  });

  // 2026-10-09 release audit round 4: a job /generating adopted carries no
  // binding, but it answered the request made after the choice.
  it('ends a waiting replaced series with the job that answered the stored request, and only that job', () => {
    replaceSyncOutbox([]);
    const old = {
      id: 'old-series', title: 'Old', totalDays: 7, currentDay: 3, days: [], createdAt: '2026-10-01T08:00:00.000Z',
      updatedAt: '2026-10-08T08:00:00.000Z', generationMode: 'progressive',
    } as unknown as Devotional;
    const landed = { kind: 'complete' as const, result: { ...result, devotionalDay: { ...day1, devotionalId: 'devo-1', id: 'devo-1:1' } } };
    const archivedAt = () => useUnfoldStore.getState().devotionals.find((d) => d.id === 'old-series')?.archivedAt;

    useUnfoldStore.setState({ devotionals: [old], currentDevotionalId: 'old-series' });
    recordReplacedSeries('old-series', '');
    ensureInitialGenerationRequestId(() => '33333333-3333-4333-8333-333333333333');
    writeInflightGenerationJob({ jobId: 'job-1', devotionalId: 'devo-1', submittedAt: NOW - 30_000, requestId: 'an-earlier-request' });
    settleInflightInitialArcWatch(landed, { jobId: 'job-1', session: captureSyncSession() });
    expect(archivedAt()).toBeFalsy();
    expect(readReplacedSeries()).toBe('old-series');

    resetStore();
    useUnfoldStore.setState({ devotionals: [old], currentDevotionalId: 'old-series' });
    const current = ensureInitialGenerationRequestId(() => '44444444-4444-4444-8444-444444444444');
    writeInflightGenerationJob({ jobId: 'job-1', devotionalId: 'devo-1', submittedAt: NOW - 30_000, requestId: current });
    settleInflightInitialArcWatch(landed, { jobId: 'job-1', session: captureSyncSession() });
    expect(archivedAt()).toBeTruthy();
    expect(readReplacedSeries()).toBeNull();
  });

  // 2026-10-09 release audit round 5: a failed replacement retired its
  // request on Today, but its binding refused the series Try again generated.
  it('lets the next request bind a waiting replacement once a failed job retires its request', () => {
    replaceSyncOutbox([]);
    useUnfoldStore.setState({
      devotionals: [{
        id: 'old-series', title: 'Old', totalDays: 7, currentDay: 3, days: [], createdAt: '2026-10-01T08:00:00.000Z',
        updatedAt: '2026-10-08T08:00:00.000Z', generationMode: 'progressive',
      } as unknown as Devotional],
      currentDevotionalId: 'old-series',
    });
    recordReplacedSeries('old-series', '');
    const failedRequest = ensureInitialGenerationRequestId(() => '55555555-5555-4555-8555-555555555555');
    bindReplacementSeries('devo-failed');
    writeInflightGenerationJob({ jobId: 'job-1', devotionalId: 'devo-failed', submittedAt: NOW - 30_000, requestId: failedRequest });
    settleInflightInitialArcWatch(
      { kind: 'failed', message: 'Model overloaded', phase: 'server-poll', canRetry: false },
      { jobId: 'job-1', session: captureSyncSession() },
    );
    expect(readInitialGenerationRequestId()).toBeNull();
    expect(readReplacedSeries()).toBe('old-series');

    ensureInitialGenerationRequestId(() => '66666666-6666-4666-8666-666666666666');
    bindForStoredRequest('devo-1');
    applyInitialArcResult(result, { user, devotionalLength: 7, session: captureSyncSession() });

    expect(useUnfoldStore.getState().devotionals.find((d) => d.id === 'old-series')?.archivedAt).toBeTruthy();
    expect(readReplacedSeries()).toBeNull();
  });

  // 2026-10-09 release audit round 5: Dismiss after a lost connection retires
  // the request but keeps the job, and that job's result must still end the
  // series it replaces.
  it('ends a waiting replaced series with a job that outlived a dismissed request', () => {
    replaceSyncOutbox([]);
    useUnfoldStore.setState({
      devotionals: [{
        id: 'old-series', title: 'Old', totalDays: 7, currentDay: 3, days: [], createdAt: '2026-10-01T08:00:00.000Z',
        updatedAt: '2026-10-08T08:00:00.000Z', generationMode: 'progressive',
      } as unknown as Devotional],
      currentDevotionalId: 'old-series',
    });
    recordReplacedSeries('old-series', '');
    const requestId = ensureInitialGenerationRequestId(() => '77777777-7777-4777-8777-777777777777');
    bindReplacementSeries('devo-1');
    writeInflightGenerationJob({ jobId: 'job-1', devotionalId: 'devo-1', submittedAt: NOW - 30_000, requestId });
    clearInitialGenerationRequestId();

    settleInflightInitialArcWatch(
      { kind: 'complete', result: { ...result, devotionalDay: { ...day1, devotionalId: 'devo-1', id: 'devo-1:1' } } },
      { jobId: 'job-1', session: captureSyncSession() },
    );

    expect(useUnfoldStore.getState().devotionals.find((d) => d.id === 'old-series')?.archivedAt).toBeTruthy();
    expect(readReplacedSeries()).toBeNull();
  });

  // 2026-10-09 release audit sweep: a failed replacement's verdict retired its
  // request, and a Try again from the failure push then landed the same
  // series without ending the one it replaces.
  it('ends a waiting replaced series when its bound series lands after its request retired', () => {
    replaceSyncOutbox([]);
    useUnfoldStore.setState({
      devotionals: [{
        id: 'old-series', title: 'Old', totalDays: 7, currentDay: 3, days: [], createdAt: '2026-10-01T08:00:00.000Z',
        updatedAt: '2026-10-08T08:00:00.000Z', generationMode: 'progressive',
      } as unknown as Devotional],
      currentDevotionalId: 'old-series',
    });
    recordReplacedSeries('old-series', '');
    ensureInitialGenerationRequestId(() => '88888888-8888-4888-8888-888888888888');
    bindReplacementSeries('devo-1');
    clearInitialGenerationRequestId();
    writeInflightGenerationJob({ jobId: 'job-1', devotionalId: 'devo-1', submittedAt: NOW - 30_000 });

    settleInflightInitialArcWatch(
      { kind: 'complete', result: { ...result, devotionalDay: { ...day1, devotionalId: 'devo-1', id: 'devo-1:1' } } },
      { jobId: 'job-1', session: captureSyncSession() },
    );

    expect(useUnfoldStore.getState().devotionals.find((d) => d.id === 'old-series')?.archivedAt).toBeTruthy();
    expect(readReplacedSeries()).toBeNull();
  });

  it('keeps the record and fails the session when the server could not be reached', () => {
    settleInflightInitialArcWatch({ kind: 'unreachable', message: 'Unable to connect' }, { jobId: 'job-1', session: captureSyncSession() });

    expect(readInflightGenerationJob()).not.toBeNull();
    expect(useUnfoldStore.getState().generationSession).toMatchObject({ status: 'error', error: 'Unable to connect' });
    expect(useUnfoldStore.getState().devotionals).toHaveLength(0);
    expect(logBugError).toHaveBeenCalledWith('generation', expect.any(Error), { jobId: 'job-1', phase: 'server-poll-unreachable' });
  });

  it('treats a result it cannot land as a failure instead of leaving the record live', () => {
    settleInflightInitialArcWatch(
      { kind: 'complete', result: { devotionalDay: { ...day1, devotionalId: '', id: '' }, devotionalId: '' } },
      { jobId: 'job-1', session: captureSyncSession() },
    );

    expect(readInflightGenerationJob()).toBeNull();
    expect(useUnfoldStore.getState().generationSession.status).toBe('error');
    expect(logBugError).toHaveBeenCalledWith('generation', expect.any(Error), { jobId: 'job-1', phase: 'today-apply-initial-arc' });
  });

  it('leaves everything in place when the watch was cancelled', () => {
    settleInflightInitialArcWatch({ kind: 'cancelled' }, { jobId: 'job-1', session: captureSyncSession() });

    expect(readInflightGenerationJob()).not.toBeNull();
    expect(useUnfoldStore.getState().generationSession.status).toBe('running');
    expect(logBugError).not.toHaveBeenCalled();
  });
});

const PULLED_AT = '2026-09-04T08:06:00.000Z';
const ARCHIVED_AT = '2026-09-04T07:59:00.000Z';

function localSeries(id: string, overrides: Partial<Devotional> = {}): Devotional {
  return {
    id,
    title: `Series ${id}`,
    totalDays: 3,
    currentDay: 1,
    days: [{ ...day1, id: `${id}:1`, devotionalId: id }],
    createdAt: '2026-08-20T08:00:00.000Z',
    seriesStartDate: '2026-08-20T08:00:00.000Z',
    userContext: { name: '', aboutMe: '', currentSituation: '', emotionalState: '' },
    generationMode: 'progressive',
    ...overrides,
  };
}

// Onboarding's first reading as each check alone knows it: the sample's id
// with no first-reading arc, and the first-reading arc on a server id.
const FIRST_READING_ROWS: [string, Devotional][] = [
  ['the onboarding sample', localSeries('onboarding-sample-anon_x', { totalDays: 1 })],
  ['onboarding\'s first reading', localSeries('devo-first-reading', {
    totalDays: 1,
    createdAt: '2026-08-01T08:00:00.000Z',
    seriesStartDate: '2026-08-01T08:00:00.000Z',
    seriesArc: withOnboardingFirstReadingArc(undefined, '2026-08-01T08:00:00.000Z'),
  })],
];

/**
 * The rows the worker commits with a finished initial_arc job, as the
 * app-start (or reconnect) full-sync pull hands them over: the series with no
 * lifecycle clock, and its day 1. `alongside` adds other live series the same
 * pull brings, by id and creation time.
 */
function pullLandedSeries(lifecycle: { archivedAt: string | null; archivedStateAt: string | null } = {
  archivedAt: null,
  archivedStateAt: null,
}, alongside: { id: string; createdAt: string }[] = []) {
  applyPulledUserData({
    timestamp: PULLED_AT,
    changes: {
      devotionals: [{
        id: 'devo-1',
        updatedAt: PULLED_AT,
        deleted: false,
        data: {
          title: 'Learning to Trust Again',
          totalDays: 3,
          currentDay: 1,
          generationMode: 'progressive',
          seriesArc: result.arc,
          seriesStartDate: '2026-09-04T08:05:00.000Z',
          createdAt: '2026-09-04T08:05:00.000Z',
          ...lifecycle,
        },
      }, ...alongside.map(({ id, createdAt }) => ({
        id,
        updatedAt: PULLED_AT,
        deleted: false,
        data: { title: `Series ${id}`, totalDays: 3, currentDay: 1, generationMode: 'progressive', seriesStartDate: createdAt, createdAt },
      }))],
      devotional_days: [{
        id: 'devo-1:1',
        updatedAt: PULLED_AT,
        deleted: false,
        data: {
          devotionalId: 'devo-1',
          dayNumber: 1,
          title: day1.title,
          scriptureReference: day1.scriptureReference,
          scriptureText: day1.scriptureText,
          bodyText: day1.bodyText,
          quotableLine: day1.quotableLine,
        },
      }],
    },
  });
}

describe('a new series the sync pull lands before the job result', () => {
  beforeEach(() => {
    replaceSyncOutbox([]);
  });

  it('becomes current for a returning reader who started a new series', () => {
    // "Start a new series" archived the old series and left nothing current.
    useUnfoldStore.setState({
      devotionals: [localSeries('devo-old', { archivedAt: ARCHIVED_AT, archivedStateAt: ARCHIVED_AT })],
      currentDevotionalId: null,
    });
    pullLandedSeries();
    // The pull alone keeps its rule: a series with no resume clock is not adopted.
    expect(useUnfoldStore.getState().currentDevotionalId).toBeNull();

    applyInitialArcResult(result, { user, devotionalLength: 7, session: captureSyncSession() });

    const state = useUnfoldStore.getState();
    expect(state.currentDevotionalId).toBe('devo-1');
    expect(state.devotionals.find((row) => row.id === 'devo-1')?.days.map((d) => d.dayNumber)).toEqual([1]);
    expect(state.generationSession.status).toBe('complete');
    expect(readInflightGenerationJob()).toBeNull();
  });

  it.each(FIRST_READING_ROWS)('becomes current over %s', (_label, firstReading) => {
    useUnfoldStore.setState({ devotionals: [firstReading], currentDevotionalId: firstReading.id });
    pullLandedSeries();
    expect(useUnfoldStore.getState().currentDevotionalId).toBe(firstReading.id);

    applyInitialArcResult(result, { user, devotionalLength: 7, session: captureSyncSession() });

    expect(useUnfoldStore.getState().currentDevotionalId).toBe('devo-1');
  });

  it('becomes current over the finished journey the reader started it from', () => {
    const finished = localSeries('devo-finished', {
      totalDays: 1,
      days: [{ ...day1, id: 'devo-finished:1', devotionalId: 'devo-finished', isRead: true }],
    });
    useUnfoldStore.setState({ devotionals: [finished], currentDevotionalId: finished.id });
    pullLandedSeries();
    expect(useUnfoldStore.getState().currentDevotionalId).toBe(finished.id);

    applyInitialArcResult(result, { user, devotionalLength: 7, session: captureSyncSession() });

    expect(useUnfoldStore.getState().currentDevotionalId).toBe('devo-1');
  });

  it('becomes current when Today\'s watch settles after the pull', () => {
    useUnfoldStore.setState({
      devotionals: [localSeries('devo-old', { archivedAt: ARCHIVED_AT, archivedStateAt: ARCHIVED_AT })],
      currentDevotionalId: null,
    });
    pullLandedSeries();

    settleInflightInitialArcWatch(
      { kind: 'complete', result: { ...result, devotionalDay: { ...day1, devotionalId: 'devo-1', id: 'devo-1:1' } } },
      { jobId: 'job-1', session: captureSyncSession() },
    );

    const state = useUnfoldStore.getState();
    expect(state.currentDevotionalId).toBe('devo-1');
    expect(state.generationSession.status).toBe('complete');
    expect(readInflightGenerationJob()).toBeNull();
  });

  it('keeps the reader context the land-first shell would have stored', () => {
    useUnfoldStore.setState({ devotionals: [], currentDevotionalId: null });
    pullLandedSeries();

    applyInitialArcResult(result, { user, devotionalLength: 7, session: captureSyncSession() });

    expect(useUnfoldStore.getState().devotionals.find((row) => row.id === 'devo-1')).toMatchObject({
      title: 'Learning to Trust Again',
      themeCategory: 'trust',
      devotionalType: 'personal',
      userContext: { name: 'Jordan', aboutMe: 'New to this', currentSituation: 'Between jobs', emotionalState: 'anxious' },
    });
  });

  it.each([
    ['a newer series another device started', '2026-09-04T08:30:00.000Z', null],
    ['a series created at the same instant', '2026-09-04T08:05:00.000Z', null],
    ['an older live series', '2026-09-04T07:30:00.000Z', 'devo-1'],
  ])('with %s in the same pull, becomes current only as the series the server writes', (_label, otherCreatedAt, expected) => {
    // The pull brings both series and selects neither; then this device's
    // job finishes its local poll. Only a strict winner may take Today.
    useUnfoldStore.setState({
      devotionals: [localSeries('devo-old', { archivedAt: ARCHIVED_AT, archivedStateAt: ARCHIVED_AT })],
      currentDevotionalId: null,
    });
    pullLandedSeries(undefined, [{ id: 'devo-other', createdAt: otherCreatedAt }]);
    expect(useUnfoldStore.getState().currentDevotionalId).toBeNull();

    applyInitialArcResult(result, { user, devotionalLength: 7, session: captureSyncSession() });

    const state = useUnfoldStore.getState();
    expect(state.currentDevotionalId).toBe(expected);
    expect(state.devotionals.find((row) => row.id === 'devo-1')?.days.map((d) => d.dayNumber)).toEqual([1]);
    expect(state.generationSession.status).toBe('complete');
  });

  it.each([
    ['the finished journey the reader started it from', localSeries('devo-finished', {
      totalDays: 1,
      days: [{ ...day1, id: 'devo-finished:1', devotionalId: 'devo-finished', isRead: true }],
    })],
    ...FIRST_READING_ROWS,
  ] as [string, Devotional][])('keeps %s on Today beside a newer series another device started', (_label, held) => {
    // Today holds a row the landing may replace, but the same pull brought a
    // newer live series, so the server writes that one and not this one.
    useUnfoldStore.setState({ devotionals: [held], currentDevotionalId: held.id });
    pullLandedSeries(undefined, [{ id: 'devo-other', createdAt: '2026-09-04T08:30:00.000Z' }]);
    expect(useUnfoldStore.getState().currentDevotionalId).toBe(held.id);

    applyInitialArcResult(result, { user, devotionalLength: 7, session: captureSyncSession() });

    const state = useUnfoldStore.getState();
    expect(state.currentDevotionalId).toBe(held.id);
    expect(state.devotionals.find((row) => row.id === 'devo-1')?.days.map((d) => d.dayNumber)).toEqual([1]);
  });

  it('does not take Today from a live series the reader picked meanwhile', () => {
    const picked = localSeries('devo-picked');
    useUnfoldStore.setState({
      devotionals: [picked, localSeries('devo-old', { archivedAt: ARCHIVED_AT, archivedStateAt: ARCHIVED_AT })],
      currentDevotionalId: picked.id,
    });
    pullLandedSeries();

    applyInitialArcResult(result, { user, devotionalLength: 7, session: captureSyncSession() });

    const state = useUnfoldStore.getState();
    expect(state.currentDevotionalId).toBe(picked.id);
    expect(state.devotionals.find((row) => row.id === 'devo-1')?.days.map((d) => d.dayNumber)).toEqual([1]);
  });

  it('does not take Today from a live series a stale session and in-flight record name', () => {
    // A submission that adopted the server's existing job keeps the earlier
    // generation's session and records the job under its series. The reader
    // went back to that series meanwhile; the job lands another one.
    const picked = localSeries('devo-picked');
    useUnfoldStore.setState({
      devotionals: [picked],
      currentDevotionalId: picked.id,
      generationSession: { status: 'complete', devotionalId: picked.id, totalDays: 3, generatedDayNumbers: [] },
    });
    writeInflightGenerationJob({ jobId: 'job-1', devotionalId: picked.id, submittedAt: NOW - 30_000 });
    pullLandedSeries();

    applyInitialArcResult(result, { user, devotionalLength: 7, session: captureSyncSession() });

    expect(useUnfoldStore.getState().currentDevotionalId).toBe(picked.id);
  });

  it('never selects, and so never unarchives, a landed series archived elsewhere', () => {
    useUnfoldStore.setState({ devotionals: [], currentDevotionalId: null });
    pullLandedSeries({ archivedAt: PULLED_AT, archivedStateAt: PULLED_AT });

    applyInitialArcResult(result, { user, devotionalLength: 7, session: captureSyncSession() });

    const state = useUnfoldStore.getState();
    expect(state.currentDevotionalId).toBeNull();
    expect(state.devotionals.find((row) => row.id === 'devo-1')).toMatchObject({
      archivedAt: PULLED_AT,
      archivedStateAt: PULLED_AT,
    });
    expect(peekSyncOutbox().filter((change) => change.table === 'devotionals')).toEqual([]);
  });
});

function seedSubmittedIntent() {
  const created = createAutoTrialIntent({
    deviceId: 'test-device-id',
    entry: 'onboarding',
    surface: 'onboarding_paywall',
    source: 'purchase',
    simulated: false,
    trialDays: 3,
    purchasedAt: '2026-09-08T17:00:00.000Z',
    expiresAt: '2026-09-11T17:00:00.000Z',
    timeZone: 'America/Chicago',
    isSandbox: false,
    productIdentifier: 'unfold_premium_yearly',
    switchFetchedAt: '2026-09-08T17:00:00.000Z',
    nowMs: NOW,
  });
  return transitionAutoTrialIntent(
    'submitted',
    { jobId: 'job-1', devotionalId: 'devo-1' },
    { nowMs: NOW },
  ) ?? created;
}

describe('H8 applyInitialArcResult auto-trial settle', () => {
  beforeEach(() => {
    mmkvStorage.removeItem('auto-trial-series-intent-v1');
  });

  it('settles the matching id in the existing-shell branch', () => {
    seedSubmittedIntent();
    useUnfoldStore.setState({
      devotionals: [{
        id: 'devo-1',
        title: 'Shell',
        totalDays: 3,
        currentDay: 1,
        days: [],
        createdAt: '2026-09-08T17:00:00.000Z',
        seriesStartDate: '2026-09-08T17:00:00.000Z',
        userContext: { name: '', aboutMe: '', currentSituation: '', emotionalState: '' },
        themeCategory: 'trust',
        devotionalType: 'personal',
        generationMode: 'progressive',
        progressiveMemory: { fullDays: [], summaries: [], narrative: null },
      }],
      currentDevotionalId: 'other',
    });
    applyInitialArcResult(
      { ...result, arc: { ...result.arc, seriesKind: 'auto_trial' } },
      { user, devotionalLength: 3, session: captureSyncSession() },
    );
    expect(useUnfoldStore.getState().currentDevotionalId).toBe('devo-1');
    expect(readAutoTrialIntent()?.status).toBe('landed');
  });

  // 2026-10-09 release audit round 7: the trial step made its series current
  // after the landing had kept Today on a newer live series.
  it('leaves Today on a newer live series when an older trial lands', () => {
    seedSubmittedIntent();
    useUnfoldStore.setState({
      devotionals: [{
        id: 'newer-series', title: 'Newer', totalDays: 7, currentDay: 2, days: [], createdAt: '2026-10-09T08:00:00.000Z',
        updatedAt: '2026-10-09T08:00:00.000Z', generationMode: 'progressive',
      } as unknown as Devotional],
      currentDevotionalId: 'newer-series',
    });
    applyInitialArcResult(
      { ...result, seriesStartDate: '2026-09-08T17:00:00.000Z', arc: { ...result.arc, seriesKind: 'auto_trial' } },
      { user, devotionalLength: 3, session: captureSyncSession() },
    );
    expect(useUnfoldStore.getState().currentDevotionalId).toBe('newer-series');
  });

  // Round 7 again: retiring the current sample handed Today to the trial
  // before the winner check ran.
  it('leaves Today empty when an older trial retires the current sample beside a newer live series', () => {
    const intent = seedSubmittedIntent();
    const row = (id: string, createdAt: string, days: DevotionalDay[] = []) => ({
      id, title: id, totalDays: 3, currentDay: 1, days, createdAt, updatedAt: createdAt, generationMode: 'progressive',
    } as unknown as Devotional);
    useUnfoldStore.setState({
      devotionals: [
        row('onboarding-sample-1', '2026-09-08T16:00:00.000Z'),
        row('devo-1', '2026-09-08T17:00:00.000Z', [{ ...day1, devotionalId: 'devo-1', id: 'devo-1:1' }]),
        row('newer-series', '2026-10-09T08:00:00.000Z'),
      ],
      currentDevotionalId: 'onboarding-sample-1',
    });

    settleLandedAutoTrialSeries(intent, 'devo-1');

    expect(useUnfoldStore.getState().currentDevotionalId).toBeNull();
  });

  // Round 7 again: the check ran before retirement, so a saved first reading
  // dated after the trial outranked it and Today went empty.
  it('gives Today to the trial once retirement archives a saved first reading dated after it', () => {
    const intent = seedSubmittedIntent();
    useUnfoldStore.setState({
      devotionals: [
        {
          id: 'first-reading-1', title: 'First reading', totalDays: 1, currentDay: 1, days: [], createdAt: '2026-09-08T18:00:00.000Z',
          updatedAt: '2026-09-08T18:00:00.000Z', generationMode: 'progressive',
          seriesArc: withOnboardingFirstReadingArc(undefined, '2026-09-08T18:00:00.000Z'),
        } as unknown as Devotional,
        {
          id: 'devo-1', title: 'Trial', totalDays: 3, currentDay: 1, days: [{ ...day1, devotionalId: 'devo-1', id: 'devo-1:1' }],
          createdAt: '2026-09-08T17:00:00.000Z', updatedAt: '2026-09-08T17:00:00.000Z', generationMode: 'progressive',
        } as unknown as Devotional,
      ],
      currentDevotionalId: 'first-reading-1',
    });

    settleLandedAutoTrialSeries(intent, 'devo-1');

    expect(useUnfoldStore.getState().currentDevotionalId).toBe('devo-1');
  });

  it('settles the matching id in the else branch', () => {
    seedSubmittedIntent();
    applyInitialArcResult(
      { ...result, arc: { ...result.arc, seriesKind: 'auto_trial' } },
      { user, devotionalLength: 3, session: captureSyncSession() },
    );
    expect(useUnfoldStore.getState().currentDevotionalId).toBe('devo-1');
    expect(readAutoTrialIntent()?.status).toBe('landed');
  });

  it('does not settle a mismatched id', () => {
    seedSubmittedIntent();
    applyInitialArcResult(
      { ...result, devotionalId: 'devo-other', arc: { ...result.arc, seriesKind: 'auto_trial' } },
      { user, devotionalLength: 3, session: captureSyncSession() },
    );
    expect(readAutoTrialIntent()?.status).toBe('submitted');
  });

  it('settles a matching intent when the payload has no seriesKind', () => {
    seedSubmittedIntent();
    applyInitialArcResult(
      { devotionalId: 'devo-1', devotionalDay: day1, seriesTitle: 'Pulled Day 1' },
      { user, devotionalLength: 3, session: captureSyncSession() },
    );
    expect(readAutoTrialIntent()?.status).toBe('landed');
  });

  it('archives the current first sample when a matching auto intent lands', () => {
    seedSubmittedIntent();
    const sample = {
      id: 'onboarding-sample-anon_x',
      title: 'Sample',
      totalDays: 1,
      currentDay: 1,
      days: [day1],
      createdAt: '2026-09-08T17:00:00.000Z',
      seriesStartDate: '2026-09-08T17:00:00.000Z',
      userContext: { name: '', aboutMe: '', currentSituation: '', emotionalState: '' },
      themeCategory: 'trust' as const,
      devotionalType: 'personal' as const,
      generationMode: 'progressive' as const,
      progressiveMemory: { fullDays: [], summaries: [], narrative: null },
    };
    useUnfoldStore.setState({ devotionals: [sample], currentDevotionalId: sample.id });
    applyInitialArcResult(result, { user, devotionalLength: 3, session: captureSyncSession() });
    const state = useUnfoldStore.getState();
    const retained = state.devotionals.find((row) => row.id === sample.id);
    expect(retained?.days[0]?.bodyText).toBe(day1.bodyText);
    expect(retained?.archivedAt).toBeTruthy();
    expect(state.currentDevotionalId).toBe(result.devotionalId);
  });
});

describe('H8 settleInflightInitialArcWatch intent writes', () => {
  beforeEach(() => {
    mmkvStorage.removeItem('auto-trial-series-intent-v1');
    seedSubmittedIntent();
  });

  it('writes failed for server-poll with canRetry false', () => {
    settleInflightInitialArcWatch(
      { kind: 'failed', message: 'done', phase: 'server-poll', canRetry: false },
      { jobId: 'job-1', session: captureSyncSession() },
    );
    expect(readAutoTrialIntent()?.status).toBe('failed');
    expect(readInflightGenerationJob()).toBeNull();
  });

  it('writes failed for server-poll-invalid-result', () => {
    settleInflightInitialArcWatch(
      { kind: 'failed', message: 'bad', phase: 'server-poll-invalid-result', canRetry: true },
      { jobId: 'job-1', session: captureSyncSession() },
    );
    expect(readAutoTrialIntent()?.status).toBe('failed');
    expect(readInflightGenerationJob()).toBeNull();
  });

  it('leaves submitted and drops the record when canRetry is true', () => {
    settleInflightInitialArcWatch(
      { kind: 'failed', message: 'retry', phase: 'server-poll', canRetry: true },
      { jobId: 'job-1', session: captureSyncSession() },
    );
    expect(readAutoTrialIntent()?.status).toBe('submitted');
    expect(readInflightGenerationJob()).toBeNull();
  });

  it('leaves submitted and drops the record when the job is gone', () => {
    settleInflightInitialArcWatch(
      { kind: 'failed', message: 'gone', phase: 'server-poll-not-found', canRetry: false },
      { jobId: 'job-1', session: captureSyncSession() },
    );
    expect(readAutoTrialIntent()?.status).toBe('submitted');
    expect(readInflightGenerationJob()).toBeNull();
  });
});
