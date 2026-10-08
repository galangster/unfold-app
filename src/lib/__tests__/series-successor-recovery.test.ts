/* eslint-disable import/first */
/**
 * Today emptied by the end of its series recovers on its own, and only onto
 * the series the server writes.
 *
 * Greptile P1 on #207: the full sync a pull asks for joins a request already
 * in flight, which can have left before the new series existed. When it lands
 * without that series, one more pull fetches it.
 *
 * MEDIUM-1 on #207: the series Today showed until its end is kept in the
 * store (awaitingSuccessorOf), so every later sync, also after a restart, can
 * hand Today to the series that took its place by the successor rule.
 *
 * These run the real full sync over a stubbed fetch.
 */
function getMockMmkvStore(): Map<string, string> {
  return (globalThis as typeof globalThis & { __unfoldSuccessorMmkv: Map<string, string> })
    .__unfoldSuccessorMmkv;
}

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
  (globalThis as typeof globalThis & { __unfoldSuccessorMmkv: Map<string, string> })
    .__unfoldSuccessorMmkv = store;
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

import { applyPulledDevotionalContent } from '../devotional-pulled-content';
import type { PulledDevotionalContent } from '../devotional-sync-pull';
import { resetUserDataPullForTesting, triggerUserDataPull } from '../full-sync-pull';
import { applyInitialArcResult } from '../initial-arc-result';
import { persistOnboardingFirstReading } from '../onboarding-first-reading';
import { flushUnfoldStorePersist, updateSyncedDevotionals, useUnfoldStore, type Devotional } from '../store';
import { replaceSyncOutbox } from '../sync-outbox';
import { beginLocalResetSession, captureSyncSession, endLocalResetSession } from '../sync-session-fence';
import type { SyncPullResponse, SyncPulledRecord } from '../sync-types';

const NOW = '2026-09-12T18:00:00.000Z';
// Another device ends series-x, which this device shows on Today, and starts
// series-n.
const ENDED_AT = '2026-09-12T16:00:00.000Z';
const STARTED_AT = '2026-09-12T16:05:00.000Z';

type Lifecycle = Pick<Devotional, 'archivedAt' | 'archivedStateAt'>;

function series(id: string, overrides: Partial<Devotional> = {}): Devotional {
  return {
    id,
    title: id,
    totalDays: 7,
    currentDay: 1,
    days: [{
      id: `day-${id}-1`,
      devotionalId: id,
      dayNumber: 1,
      title: 'Day 1',
      scriptureReference: 'John 1:1',
      scriptureText: 'In the beginning',
      bodyText: 'Body',
      quotableLine: 'Line',
      isRead: false,
    }],
    createdAt: '2026-09-05T00:00:00.000Z',
    seriesStartDate: '2026-09-05T00:00:00.000Z',
    updatedAt: '2026-09-05T00:00:00.000Z',
    generationMode: 'progressive',
    userContext: { name: '', aboutMe: '', currentSituation: '', emotionalState: '' },
    ...overrides,
  };
}

const ended = (at: string): Lifecycle => ({ archivedAt: at, archivedStateAt: at });

// The server's copy of a series row, as a pull of one series returns it.
function seriesRow(local: Devotional, lifecycle: Lifecycle | Record<string, never> = {}) {
  return {
    id: local.id,
    createdAt: local.createdAt,
    generationMode: local.generationMode,
    title: local.title,
    totalDays: local.totalDays,
    currentDay: local.currentDay,
    seriesStartDate: local.seriesStartDate,
    updatedAt: ENDED_AT,
    ...lifecycle,
  };
}

// Today or Reading pulls one series; the response carries every changed row.
function pullOneSeries(devotionalId: string, rows: ReturnType<typeof seriesRow>[]): void {
  const pulled: PulledDevotionalContent = {
    devotional: rows.find((row) => row.id === devotionalId),
    canonicalSeries: rows,
    days: [],
    timestamp: ENDED_AT,
  };
  applyPulledDevotionalContent({
    devotionalId,
    pulled,
    updateDevotionalDays: useUnfoldStore.getState().updateDevotionalDays,
    updateDevotionals: updateSyncedDevotionals,
  });
}

// A full sync's rows: each series with its first day, the way the server
// writes a series when it lands, or with only a lifecycle change.
function fullSync(...entries: Array<[Devotional, Lifecycle?]>): SyncPullResponse {
  const devotionals: SyncPulledRecord[] = [];
  const days: SyncPulledRecord[] = [];
  for (const [local, lifecycle] of entries) {
    const clock = lifecycle?.archivedStateAt ?? local.createdAt;
    devotionals.push({
      id: local.id,
      updatedAt: clock,
      deleted: false,
      data: {
        title: local.title,
        totalDays: local.totalDays,
        currentDay: 1,
        createdAt: local.createdAt,
        seriesStartDate: local.seriesStartDate,
        generationMode: 'progressive',
        clientUpdatedAt: clock,
        ...lifecycle,
      },
    });
    days.push({
      id: `day-${local.id}-1`,
      updatedAt: local.createdAt,
      deleted: false,
      data: {
        devotionalId: local.id,
        dayNumber: 1,
        title: 'Day 1',
        scriptureReference: 'John 1:1',
        scriptureText: 'In the beginning',
        bodyText: 'Body',
        quotableLine: 'Line',
        isRead: false,
        clientUpdatedAt: local.createdAt,
      },
    });
  }
  return { timestamp: NOW, changes: { devotionals, devotional_days: days } };
}

// A launch starts from the store's initial state and reads the saved one.
async function restartWith(saved: string): Promise<void> {
  useUnfoldStore.setState(useUnfoldStore.getInitialState(), true);
  flushUnfoldStorePersist();
  getMockMmkvStore().set('unfold-storage', saved);
  await useUnfoldStore.persist.rehydrate();
}

// Each request to /api/sync/pull waits here until the test answers it.
type PullReply = SyncPullResponse | 'network-error';
const pullRequests: Array<(reply: PullReply) => void> = [];
const mockFetch = jest.fn(async (input: RequestInfo) => {
  if (!String(input).endsWith('/api/sync/pull')) throw new Error(`unexpected request ${String(input)}`);
  const reply = await new Promise<PullReply>((resolve) => {
    pullRequests.push(resolve);
  });
  if (reply === 'network-error') throw new TypeError('Network request failed');
  return { ok: true, status: 200, json: async () => reply };
});

async function settle(): Promise<void> {
  for (let i = 0; i < 25; i += 1) {
    await new Promise((resolve) => setImmediate(resolve));
  }
}

async function failEveryPull(): Promise<void> {
  for (let round = 0; round < 3; round += 1) {
    pullRequests.forEach((answer) => answer('network-error'));
    await settle();
  }
}

const today = () => useUnfoldStore.getState().currentDevotionalId;

beforeEach(() => {
  jest.useFakeTimers({ doNotFake: ['queueMicrotask', 'setImmediate', 'nextTick'] });
  jest.setSystemTime(new Date(NOW));
  global.fetch = mockFetch as unknown as typeof fetch;
  mockFetch.mockClear();
  pullRequests.length = 0;
  getMockMmkvStore().clear();
  resetUserDataPullForTesting();
  replaceSyncOutbox([]);
  useUnfoldStore.getState().reset();
});

afterEach(async () => {
  // Ends a follow-up a test left waiting, so it cannot reach the next test.
  await failEveryPull();
  jest.useRealTimers();
});

describe('a full sync already in flight when a pull sees the new series', () => {
  const liveX = series('series-x');
  const newN = series('series-n', { createdAt: STARTED_AT, seriesStartDate: STARTED_AT });

  // The app-start request leaves before series-n exists. Today's pull of
  // series-x then sees series-x ended and series-n started.
  async function endSeriesXWhileAppStartPullIsInFlight(): Promise<void> {
    useUnfoldStore.setState({ devotionals: [liveX], currentDevotionalId: 'series-x' });
    void triggerUserDataPull('app-start');
    await settle();
    expect(pullRequests).toHaveLength(1);

    pullOneSeries('series-x', [seriesRow(liveX, ended(ENDED_AT)), seriesRow(newN)]);
    expect(today()).toBeNull();
    await settle();
    // The full sync the pull asks for joins the request already in flight.
    expect(pullRequests).toHaveLength(1);
  }

  it('pulls once more when the joined request lands without the new series, then follows it', async () => {
    await endSeriesXWhileAppStartPullIsInFlight();

    pullRequests[0](fullSync());
    await settle();
    expect(today()).toBeNull();
    expect(pullRequests).toHaveLength(2);

    pullRequests[1](fullSync([newN]));
    await settle();
    expect(today()).toBe('series-n');
    expect(useUnfoldStore.getState().awaitingSuccessorOf).toBeNull();
  });

  it('pulls once more and no further when that pull misses the new series too', async () => {
    await endSeriesXWhileAppStartPullIsInFlight();

    pullRequests[0](fullSync());
    await settle();
    expect(pullRequests).toHaveLength(2);
    pullRequests[1](fullSync());
    await settle();
    jest.advanceTimersByTime(24 * 60 * 60 * 1000);
    await settle();

    expect(pullRequests).toHaveLength(2);
    expect(today()).toBeNull();
  });

  it('asks for nothing more when Today took a series meanwhile', async () => {
    const liveY = series('series-y', { createdAt: '2026-09-02T00:00:00.000Z' });
    useUnfoldStore.setState({ devotionals: [liveX, liveY], currentDevotionalId: 'series-x' });
    void triggerUserDataPull('app-start');
    await settle();
    pullOneSeries('series-x', [seriesRow(liveX, ended(ENDED_AT)), seriesRow(newN)]);
    await settle();
    useUnfoldStore.getState().setCurrentDevotional('series-y');

    pullRequests[0](fullSync());
    await settle();

    expect(pullRequests).toHaveLength(1);
    expect(today()).toBe('series-y');
  });

  it('asks for nothing more once the new series is here, also when it does not take Today', async () => {
    const startedBeforeTheEnd = series('series-n', { createdAt: '2026-09-12T15:30:00.000Z', seriesStartDate: '2026-09-12T15:30:00.000Z' });
    useUnfoldStore.setState({ devotionals: [liveX], currentDevotionalId: 'series-x' });
    void triggerUserDataPull('app-start');
    await settle();
    pullOneSeries('series-x', [seriesRow(liveX, ended(ENDED_AT)), seriesRow(startedBeforeTheEnd)]);
    await settle();

    pullRequests[0](fullSync([startedBeforeTheEnd]));
    await settle();

    // It began before series-x ended, so it is no successor of series-x.
    expect(today()).toBeNull();
    expect(pullRequests).toHaveLength(1);
  });

  it('asks for nothing more when the account was reset meanwhile', async () => {
    await endSeriesXWhileAppStartPullIsInFlight();
    endLocalResetSession(beginLocalResetSession());

    pullRequests[0](fullSync());
    await settle();

    expect(pullRequests).toHaveLength(1);
  });

  // The reader signs in to another account while the old account's request
  // is in flight. Its series-r was continued at 16:02, before series-n began.
  it('lets the next account\'s first full sync ignore the rows the old account\'s pull saw', async () => {
    const resumedR = series('series-r', { createdAt: '2026-09-01T00:00:00.000Z' });
    await endSeriesXWhileAppStartPullIsInFlight();
    const reset = beginLocalResetSession();
    useUnfoldStore.getState().reset();
    endLocalResetSession(reset);

    void triggerUserDataPull('app-start');
    await settle();
    expect(pullRequests).toHaveLength(2);
    pullRequests[1](fullSync([resumedR, { archivedAt: null, archivedStateAt: '2026-09-12T16:02:00.000Z' }]));
    await settle();
    expect(today()).toBe('series-r');

    pullRequests[0](fullSync());
    await settle();
    expect(pullRequests).toHaveLength(2);
    expect(today()).toBe('series-r');
  });

  // Elsewhere series-x ended, series-q began and ended, and series-n began,
  // all while the app-start request was in flight. Its rows show series-q
  // live; the pull of series-x already showed it ended.
  it('never hands Today to a series the joined request shows live after the pull saw it end', async () => {
    const shortQ = series('series-q', { createdAt: '2026-09-12T16:01:00.000Z', seriesStartDate: '2026-09-12T16:01:00.000Z' });
    const qEndedAt = '2026-09-12T16:03:00.000Z';
    useUnfoldStore.setState({ devotionals: [liveX], currentDevotionalId: 'series-x' });
    void triggerUserDataPull('app-start');
    await settle();
    pullOneSeries('series-x', [
      seriesRow(liveX, ended(ENDED_AT)),
      seriesRow(shortQ, ended(qEndedAt)),
      seriesRow(newN),
    ]);
    await settle();

    pullRequests[0](fullSync([liveX, ended(ENDED_AT)], [shortQ]));
    await settle();
    expect(useUnfoldStore.getState().devotionals.some((item) => item.id === 'series-q')).toBe(true);
    expect(today()).toBeNull();
    expect(pullRequests).toHaveLength(2);

    pullRequests[1](fullSync([shortQ, ended(qEndedAt)], [newN]));
    await settle();
    expect(today()).toBe('series-n');
  });
});

describe('Today emptied by the end of its series', () => {
  const liveX = series('series-x');
  const newN = series('series-n', { createdAt: STARTED_AT, seriesStartDate: STARTED_AT });

  it('follows the new series from a later full sync when the full syncs the pull asked for fail', async () => {
    useUnfoldStore.setState({ devotionals: [liveX], currentDevotionalId: 'series-x' });
    pullOneSeries('series-x', [seriesRow(liveX, ended(ENDED_AT)), seriesRow(newN)]);
    expect(today()).toBeNull();
    await settle();
    await failEveryPull();
    expect(today()).toBeNull();

    // The next reconnect or app start.
    void triggerUserDataPull('reconnect');
    await settle();
    pullRequests[pullRequests.length - 1](fullSync([newN]));
    await settle();

    expect(today()).toBe('series-n');
  });

  // Once the follow-up ends, the rows the pull saw no longer count. Elsewhere
  // the reader deleted series-n and continued series-m on a device whose
  // clock runs slow, so series-m ranks below series-n.
  it('selects from what a later full sync brings once the follow-up ended', async () => {
    const pausedM = series('series-m', { createdAt: '2026-09-01T00:00:00.000Z', ...ended('2026-09-10T00:00:00.000Z') });
    useUnfoldStore.setState({ devotionals: [liveX, pausedM], currentDevotionalId: 'series-x' });
    pullOneSeries('series-x', [seriesRow(liveX, ended(ENDED_AT)), seriesRow(newN)]);
    await settle();
    await failEveryPull();
    expect(today()).toBeNull();

    void triggerUserDataPull('reconnect');
    await settle();
    const reply = fullSync([pausedM, { archivedAt: null, archivedStateAt: '2026-09-12T16:02:00.000Z' }]);
    reply.changes.devotionals!.push({
      id: 'series-n',
      updatedAt: '2026-09-12T16:10:00.000Z',
      deleted: true,
      data: { deletedAt: '2026-09-12T16:10:00.000Z', clientUpdatedAt: '2026-09-12T16:10:00.000Z' },
    });
    pullRequests[pullRequests.length - 1](reply);
    await settle();

    expect(today()).toBe('series-m');
  });

  // An app-start full sync lands the end of series-x before series-n exists.
  it('waits when a full sync ends the series Today shows, and follows the series a later full sync brings', async () => {
    useUnfoldStore.setState({ devotionals: [liveX], currentDevotionalId: 'series-x' });
    void triggerUserDataPull('app-start');
    await settle();
    pullRequests[0](fullSync([liveX, ended(ENDED_AT)]));
    await settle();
    expect(today()).toBeNull();
    expect(useUnfoldStore.getState().awaitingSuccessorOf).toBe('series-x');

    void triggerUserDataPull('reconnect');
    await settle();
    pullRequests[1](fullSync([newN]));
    await settle();
    expect(today()).toBe('series-n');
    expect(useUnfoldStore.getState().awaitingSuccessorOf).toBeNull();
  });

  it('stops waiting once a sync puts the new series on Today', async () => {
    const laterM = series('series-m', { createdAt: '2026-09-12T17:00:00.000Z', seriesStartDate: '2026-09-12T17:00:00.000Z' });
    useUnfoldStore.setState({ devotionals: [liveX], currentDevotionalId: 'series-x' });
    pullOneSeries('series-x', [seriesRow(liveX, ended(ENDED_AT))]);
    void triggerUserDataPull('reconnect');
    await settle();
    pullRequests[0](fullSync([newN]));
    await settle();
    expect(today()).toBe('series-n');

    // Deleting that series empties Today without ending a series elsewhere,
    // so a series started later elsewhere does not take Today.
    useUnfoldStore.getState().removeDevotional('series-n');
    void triggerUserDataPull('reconnect');
    await settle();
    pullRequests[1](fullSync([laterM]));
    await settle();

    expect(today()).toBeNull();
  });

  // The reader started series-p here, which ended series-o. Another device
  // picked series-p up, ended it and started series-n. The reconnect full
  // sync lands both before this device's job poll returns series-p.
  it('follows the series the server writes when the series started here was ended elsewhere first', async () => {
    const liveO = series('series-o', { createdAt: '2026-09-01T00:00:00.000Z' });
    const startedP = series('series-p', { createdAt: '2026-09-12T15:01:00.000Z', seriesStartDate: '2026-09-12T15:01:00.000Z' });
    jest.setSystemTime(new Date('2026-09-12T15:00:00.000Z'));
    useUnfoldStore.setState({ devotionals: [liveO], currentDevotionalId: 'series-o' });
    useUnfoldStore.getState().archiveCurrentDevotional();
    expect(today()).toBeNull();
    jest.setSystemTime(new Date(NOW));

    void triggerUserDataPull('reconnect');
    await settle();
    pullRequests[0](fullSync([startedP, ended(ENDED_AT)], [newN]));
    await settle();
    expect(today()).toBe('series-n');

    // The job result for series-p arrives: it is ended and stays off Today.
    applyInitialArcResult(
      { devotionalId: 'series-p', devotionalDay: startedP.days[0], seriesTitle: 'series-p', totalDays: 7 },
      { user: null, devotionalLength: 7, session: captureSyncSession() },
    );
    expect(today()).toBe('series-n');
  });

  it('keeps waiting across a restart and follows the new series from the next full sync', async () => {
    useUnfoldStore.setState({ devotionals: [liveX], currentDevotionalId: 'series-x' });
    // The other device has not started series-n yet.
    pullOneSeries('series-x', [seriesRow(liveX, ended(ENDED_AT))]);
    expect(today()).toBeNull();
    flushUnfoldStorePersist();
    await restartWith(getMockMmkvStore().get('unfold-storage')!);
    expect(useUnfoldStore.getState().devotionals.map((item) => item.id)).toEqual(['series-x']);

    void triggerUserDataPull('app-start');
    await settle();
    pullRequests[0](fullSync([newN]));
    await settle();

    expect(today()).toBe('series-n');
  });

  it('follows the new series when a pull of that series brings it', async () => {
    useUnfoldStore.setState({ devotionals: [liveX], currentDevotionalId: 'series-x' });
    pullOneSeries('series-x', [seriesRow(liveX, ended(ENDED_AT))]);
    expect(today()).toBeNull();

    // A notification for series-n opens Reading, which pulls series-n.
    pullOneSeries('series-n', [seriesRow(newN)]);

    expect(today()).toBe('series-n');
  });

  // Elsewhere the reader continued series-x and then started series-m. The
  // end of series-x that starting series-m queued has not reached the server.
  it('follows a resume of the ended series only while the server writes it', async () => {
    const resumedAt = '2026-09-12T16:30:00.000Z';
    const laterM = series('series-m', { createdAt: '2026-09-12T16:40:00.000Z', seriesStartDate: '2026-09-12T16:40:00.000Z' });
    useUnfoldStore.setState({ devotionals: [liveX], currentDevotionalId: 'series-x' });
    pullOneSeries('series-x', [seriesRow(liveX, ended(ENDED_AT))]);
    expect(today()).toBeNull();

    void triggerUserDataPull('reconnect');
    await settle();
    pullRequests[0](fullSync([liveX, { archivedAt: null, archivedStateAt: resumedAt }], [laterM]));
    await settle();
    expect(today()).toBe('series-m');

    // Without a newer series the resumed one is the server's series.
    useUnfoldStore.setState({ devotionals: [liveX], currentDevotionalId: 'series-x' });
    pullOneSeries('series-x', [seriesRow(liveX, ended(ENDED_AT))]);
    void triggerUserDataPull('reconnect');
    await settle();
    pullRequests[1](fullSync([liveX, { archivedAt: null, archivedStateAt: resumedAt }]));
    await settle();
    expect(today()).toBe('series-x');
  });

  it('reads a state saved before this release as waiting on nothing', async () => {
    useUnfoldStore.setState({ devotionals: [{ ...liveX, ...ended(ENDED_AT) }], currentDevotionalId: null });
    flushUnfoldStorePersist();
    const saved = JSON.parse(getMockMmkvStore().get('unfold-storage')!) as { state: Record<string, unknown>; version: number };
    delete saved.state.awaitingSuccessorOf;
    await restartWith(JSON.stringify(saved));

    expect(useUnfoldStore.getState().awaitingSuccessorOf).toBeNull();
    void triggerUserDataPull('app-start');
    await settle();
    pullRequests[0](fullSync([newN]));
    await settle();
    expect(today()).toBeNull();
  });

  it('stops waiting once the reader picks a series from the Library', async () => {
    const liveY = series('series-y', { createdAt: '2026-09-02T00:00:00.000Z' });
    useUnfoldStore.setState({ devotionals: [liveX, liveY], currentDevotionalId: 'series-x' });
    pullOneSeries('series-x', [seriesRow(liveX, ended(ENDED_AT))]);
    expect(today()).toBeNull();

    useUnfoldStore.getState().setCurrentDevotional('series-y');
    expect(useUnfoldStore.getState().awaitingSuccessorOf).toBeNull();
    // Deleting that series empties Today without ending a series elsewhere,
    // so the series that took series-x's place does not take Today.
    useUnfoldStore.getState().removeDevotional('series-y');
    void triggerUserDataPull('reconnect');
    await settle();
    pullRequests[0](fullSync([newN]));
    await settle();

    expect(today()).toBeNull();
  });

  it('stops waiting when the reader continues a paused series', () => {
    const pausedB = series('series-b', ended('2026-09-10T00:00:00.000Z'));
    useUnfoldStore.setState({ devotionals: [liveX, pausedB], currentDevotionalId: 'series-x' });
    pullOneSeries('series-x', [seriesRow(liveX, ended(ENDED_AT))]);
    expect(useUnfoldStore.getState().awaitingSuccessorOf).toBe('series-x');

    expect(useUnfoldStore.getState().activateAcknowledgedDevotionalResume(
      'series-b', null, pausedB.archivedStateAt, NOW,
    )).toBe(true);

    expect(today()).toBe('series-b');
    expect(useUnfoldStore.getState().awaitingSuccessorOf).toBeNull();
  });

  it('stops waiting when a new series or onboarding\'s first reading takes Today', () => {
    const waitOnSeriesX = () => {
      useUnfoldStore.setState({ devotionals: [liveX], currentDevotionalId: 'series-x' });
      pullOneSeries('series-x', [seriesRow(liveX, ended(ENDED_AT))]);
      expect(useUnfoldStore.getState().awaitingSuccessorOf).toBe('series-x');
    };

    waitOnSeriesX();
    useUnfoldStore.getState().addDevotional(newN);
    expect(today()).toBe('series-n');
    expect(useUnfoldStore.getState().awaitingSuccessorOf).toBeNull();

    waitOnSeriesX();
    expect(persistOnboardingFirstReading({ id: 'onboarding-sample-device', day: series('onboarding-sample-device').days[0] })).toBe(true);
    expect(today()).toBe('onboarding-sample-device');
    expect(useUnfoldStore.getState().awaitingSuccessorOf).toBeNull();
  });

  it('never waits on onboarding\'s sample reading, and a reset forgets the wait', () => {
    const sample = series('onboarding-sample-device', { totalDays: 1 });
    useUnfoldStore.setState({ devotionals: [sample, liveX], currentDevotionalId: sample.id });
    pullOneSeries(sample.id, [seriesRow(sample, ended(ENDED_AT))]);
    expect(today()).toBeNull();
    expect(useUnfoldStore.getState().awaitingSuccessorOf).toBeNull();

    useUnfoldStore.setState({ currentDevotionalId: 'series-x' });
    pullOneSeries('series-x', [seriesRow(liveX, ended(ENDED_AT))]);
    expect(useUnfoldStore.getState().awaitingSuccessorOf).toBe('series-x');
    useUnfoldStore.getState().reset();
    expect(useUnfoldStore.getState().awaitingSuccessorOf).toBeNull();
  });

  it('waits on the series the reader ends here, never on onboarding\'s sample reading', () => {
    const sample = series('onboarding-sample-device', { totalDays: 1 });
    useUnfoldStore.setState({ devotionals: [sample, liveX], currentDevotionalId: sample.id });
    useUnfoldStore.getState().archiveCurrentDevotional();
    expect(today()).toBeNull();
    expect(useUnfoldStore.getState().awaitingSuccessorOf).toBeNull();

    useUnfoldStore.setState({ currentDevotionalId: 'series-x' });
    useUnfoldStore.getState().archiveCurrentDevotional();
    expect(today()).toBeNull();
    expect(useUnfoldStore.getState().awaitingSuccessorOf).toBe('series-x');
  });

  // Ending a series stamps the clock of the device that ends it. A clock
  // running slow can stamp the end of series-x before an older series was
  // last resumed, though series-x began after that resume.
  it('never follows a series older than the one that ended, also when a slow clock stamped the end', async () => {
    const startedX = series('series-x', { createdAt: '2026-09-12T16:00:00.000Z', seriesStartDate: '2026-09-12T16:00:00.000Z' });
    const olderY = series('series-y', { createdAt: '2026-09-01T00:00:00.000Z', archivedAt: null, archivedStateAt: '2026-09-12T15:00:00.000Z' });
    const startedBeforeTheEnd = series('series-n', { createdAt: '2026-09-12T15:30:00.000Z', seriesStartDate: '2026-09-12T15:30:00.000Z' });
    useUnfoldStore.setState({ devotionals: [startedX, olderY], currentDevotionalId: 'series-x' });
    pullOneSeries('series-x', [seriesRow(startedX, ended('2026-09-12T14:00:00.000Z'))]);
    expect(today()).toBeNull();
    expect(useUnfoldStore.getState().awaitingSuccessorOf).toBe('series-x');

    void triggerUserDataPull('reconnect');
    await settle();
    pullRequests[0](fullSync([olderY, { archivedAt: null, archivedStateAt: '2026-09-12T15:00:00.000Z' }]));
    await settle();
    expect(today()).toBeNull();

    // Elsewhere series-y ended, and a series older than series-x is live.
    void triggerUserDataPull('reconnect');
    await settle();
    pullRequests[1](fullSync([olderY, ended('2026-09-12T15:20:00.000Z')], [startedBeforeTheEnd]));
    await settle();
    expect(today()).toBeNull();
  });
});
