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
  adoptStrandedInitialArcSeries,
  applyInitialArcResult,
  settleInflightInitialArcWatch,
} from '../initial-arc-result';
import { extractBookFromReference } from '../devotional-service';
import { captureSyncSession } from '../generation-session';
import { mmkvStorage } from '../mmkv-storage';
import { useUnfoldStore, type Devotional, type DevotionalDay, type UserProfile } from '../store';
import { peekSyncOutbox, replaceSyncOutbox } from '../sync-outbox';

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

/**
 * The rows the worker commits with a finished initial_arc job, as the
 * app-start (or reconnect) full-sync pull hands them over: the series with no
 * lifecycle clock, and its day 1.
 */
function pullLandedSeries(lifecycle: { archivedAt: string | null; archivedStateAt: string | null } = {
  archivedAt: null,
  archivedStateAt: null,
}) {
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
      }],
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

  it('becomes current over onboarding\'s first reading', () => {
    const sample = localSeries('onboarding-sample-anon_x', {
      totalDays: 1,
      seriesArc: withOnboardingFirstReadingArc(undefined, '2026-09-04T07:00:00.000Z'),
    });
    useUnfoldStore.setState({ devotionals: [sample], currentDevotionalId: sample.id });
    pullLandedSeries();
    expect(useUnfoldStore.getState().currentDevotionalId).toBe(sample.id);

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

describe('adoptStrandedInitialArcSeries', () => {
  // A reader an earlier build stranded: the pull landed the series, the job
  // result then completed the session without making the series current.
  function seedStranded(overrides: { landed?: Partial<Devotional>; currentDevotionalId?: string | null; others?: Devotional[] } = {}) {
    useUnfoldStore.setState({
      devotionals: [
        localSeries('devo-1', overrides.landed),
        localSeries('devo-old', { archivedAt: ARCHIVED_AT, archivedStateAt: ARCHIVED_AT }),
        ...(overrides.others ?? []),
      ],
      currentDevotionalId: overrides.currentDevotionalId ?? null,
      generationSession: { status: 'complete', devotionalId: 'devo-1', totalDays: 3, generatedDayNumbers: [], title: 'Series devo-1' },
    });
    mmkvStorage.removeItem(INFLIGHT_GENERATION_JOB_KEY);
    replaceSyncOutbox([]);
  }

  it('makes the finished session\'s unread series current when Today has none', () => {
    seedStranded();

    expect(adoptStrandedInitialArcSeries()).toBe(true);

    expect(useUnfoldStore.getState().currentDevotionalId).toBe('devo-1');
  });

  it('makes it current over onboarding\'s first reading', () => {
    const sample = localSeries('onboarding-sample-anon_x', {
      totalDays: 1,
      seriesArc: withOnboardingFirstReadingArc(undefined, '2026-09-04T07:00:00.000Z'),
    });
    seedStranded({ currentDevotionalId: sample.id, others: [sample] });

    expect(adoptStrandedInitialArcSeries()).toBe(true);

    expect(useUnfoldStore.getState().currentDevotionalId).toBe('devo-1');
  });

  it('leaves an archived series archived and Today empty', () => {
    seedStranded({ landed: { archivedAt: PULLED_AT, archivedStateAt: PULLED_AT } });

    expect(adoptStrandedInitialArcSeries()).toBe(false);

    const state = useUnfoldStore.getState();
    expect(state.currentDevotionalId).toBeNull();
    expect(state.devotionals.find((row) => row.id === 'devo-1')?.archivedAt).toBe(PULLED_AT);
    expect(peekSyncOutbox()).toEqual([]);
  });

  it('leaves a reader on a live series, or past day 1, where they are', () => {
    seedStranded({ currentDevotionalId: 'devo-picked', others: [localSeries('devo-picked')] });
    expect(adoptStrandedInitialArcSeries()).toBe(false);
    expect(useUnfoldStore.getState().currentDevotionalId).toBe('devo-picked');

    seedStranded({ landed: { days: [{ ...day1, id: 'devo-1:1', devotionalId: 'devo-1', isRead: true }] } });
    expect(adoptStrandedInitialArcSeries()).toBe(false);
    expect(useUnfoldStore.getState().currentDevotionalId).toBeNull();
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
