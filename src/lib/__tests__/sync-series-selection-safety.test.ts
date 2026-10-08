/* eslint-disable import/first */
/**
 * A sync never moves Today to a series the server does not write. A sync
 * takes a new series only through an explicit resume that outranks every
 * other live series, held here or only pulled. Anything else leaves Today
 * empty: a wrong series on Today is worse than none, because the server
 * refuses to continue it.
 *
 * Another device resumed series-b ("Continue this series"), which paused
 * series-x, and the reader may then have started series-n there. The server
 * writes the strict active winner: series-n once it exists, else series-b.
 *
 * These run the real store, the real scoped apply and the real full sync
 * over a stubbed fetch.
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

import { isStrictActiveSeriesWinner } from '../devotional-active-selection';
import { applyPulledDevotionalContent } from '../devotional-pulled-content';
import type { PulledDevotionalContent } from '../devotional-sync-pull';
import { resetUserDataPullForTesting, triggerUserDataPull } from '../full-sync-pull';
import { updateSyncedDevotionals, useUnfoldStore, type Devotional } from '../store';
import { replaceSyncOutbox } from '../sync-outbox';
import type { SyncPullResponse, SyncPulledRecord } from '../sync-types';

const NOW = '2026-09-12T18:00:00.000Z';
const PAUSED_AT = '2026-09-10T00:00:00.000Z';
// "Continue this series" elsewhere: series-b resumed, series-x paused.
const RESUME_AT = '2026-09-12T16:00:00.000Z';
// series-n started elsewhere after the resume.
const STARTED_AT = '2026-09-12T16:20:00.000Z';

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
const resumed = (at: string): Lifecycle => ({ archivedAt: null, archivedStateAt: at });

const liveX = series('series-x');
const pausedB = series('series-b', { createdAt: '2026-09-01T00:00:00.000Z', ...ended(PAUSED_AT) });
const newN = series('series-n', { createdAt: STARTED_AT, seriesStartDate: STARTED_AT });
const pausedZ = series('series-z', { createdAt: '2026-08-20T00:00:00.000Z', ...ended(PAUSED_AT) });

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
    updatedAt: RESUME_AT,
    ...lifecycle,
  };
}

// Today or Reading pulls one series; the response carries every changed row.
function pullOneSeries(devotionalId: string, rows: ReturnType<typeof seriesRow>[]): void {
  const pulled: PulledDevotionalContent = {
    devotional: rows.find((row) => row.id === devotionalId),
    canonicalSeries: rows,
    days: [],
    timestamp: RESUME_AT,
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
function fullSyncReply(...entries: Array<[Devotional, Lifecycle?]>): SyncPullResponse {
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

// The next reconnect or app-start full sync. It joins a full sync already in
// flight, and every request it sends gets the same reply.
async function runFullSync(reply: SyncPullResponse): Promise<void> {
  const done = triggerUserDataPull('reconnect');
  for (let round = 0; round < 3; round += 1) {
    await settle();
    pullRequests.splice(0).forEach((answer) => answer(reply));
  }
  await done;
  await settle();
}

const today = () => useUnfoldStore.getState().currentDevotionalId;

beforeEach(() => {
  jest.useFakeTimers({ doNotFake: ['queueMicrotask', 'setImmediate', 'nextTick'] });
  jest.setSystemTime(new Date(NOW));
  global.fetch = mockFetch as unknown as typeof fetch;
  mockFetch.mockClear();
  pullRequests.length = 0;
  resetUserDataPullForTesting();
  replaceSyncOutbox([]);
  useUnfoldStore.getState().reset();
  useUnfoldStore.setState({ devotionals: [liveX, pausedB], currentDevotionalId: 'series-x' });
});

afterEach(async () => {
  // Ends any request a test left waiting, so it cannot reach the next test.
  for (let round = 0; round < 3; round += 1) {
    pullRequests.splice(0).forEach((answer) => answer('network-error'));
    await settle();
  }
  jest.useRealTimers();
});

describe('a sync never moves Today to a series the server does not write', () => {
  // Greptile P1 on #207 (review comment 4213624594). Reading's missing-day
  // pull of series-x left before series-n existed and stays alive while the
  // reader switches tabs. A newer Today pull lands first.
  it.each([
    ['the resume and the pause', [seriesRow(liveX, ended(RESUME_AT)), seriesRow(pausedB, resumed(RESUME_AT))]],
    ['only the series it asked for', [seriesRow(liveX)]],
  ])('keeps Today empty, never on series-b, when Reading\'s older reply carries %s', async (_label, readingRows) => {
    pullOneSeries('series-x', [
      seriesRow(liveX, ended(RESUME_AT)),
      seriesRow(pausedB, resumed(RESUME_AT)),
      seriesRow(newN),
    ]);
    expect(today()).toBeNull();

    pullOneSeries('series-x', readingRows);
    expect(today()).toBeNull();

    await runFullSync(fullSyncReply([liveX, ended(RESUME_AT)], [pausedB, resumed(RESUME_AT)], [newN]));

    const { devotionals } = useUnfoldStore.getState();
    expect(devotionals.some((item) => item.id === 'series-n')).toBe(true);
    expect(isStrictActiveSeriesWinner('series-b', devotionals)).toBe(false);
    // series-n arrives with no explicit resume, so nothing proves it here.
    expect(today()).toBeNull();
  });

  // The earlier P1: series-b resumed and series-n started elsewhere, and one
  // pull of series-x carries both with the pause.
  it('keeps Today empty, never on series-b, when one pull carries the resume, the pause and a newer series', async () => {
    pullOneSeries('series-x', [
      seriesRow(liveX, ended(RESUME_AT)),
      seriesRow(pausedB, resumed(RESUME_AT)),
      seriesRow(newN),
    ]);
    expect(today()).toBeNull();
    expect(useUnfoldStore.getState().devotionals.find((item) => item.id === 'series-b'))
      .toMatchObject(resumed(RESUME_AT));

    await runFullSync(fullSyncReply([liveX, ended(RESUME_AT)], [pausedB, resumed(RESUME_AT)], [newN]));

    expect(today()).toBeNull();
  });

  // Ending a series stamps the clock of the device that ends it. One running
  // slow stamps the end of series-x before series-y's last resume, though
  // series-x began after it. The reader started series-n there afterwards.
  it('keeps Today empty, never on the older series, when a slow clock stamped the end', async () => {
    const startedX = series('series-x', { createdAt: '2026-09-12T16:00:00.000Z', seriesStartDate: '2026-09-12T16:00:00.000Z' });
    const olderY = series('series-y', { createdAt: '2026-09-01T00:00:00.000Z', ...resumed('2026-09-12T15:00:00.000Z') });
    useUnfoldStore.setState({ devotionals: [startedX, olderY], currentDevotionalId: 'series-x' });

    pullOneSeries('series-x', [seriesRow(startedX, ended('2026-09-12T14:00:00.000Z'))]);
    expect(today()).toBeNull();

    await runFullSync(fullSyncReply([olderY, resumed('2026-09-12T15:00:00.000Z')], [newN]));

    expect(today()).toBeNull();
  });

  // The pause of series-x reaches the server after series-b's resume, and
  // this device pulls the two separately. While series-x stays current and
  // live, a pull leaves series-b's resume for the full sync, as on main. The
  // pull that lands the pause leaves Today empty, and the next full sync
  // moves Today to series-b, the series the server writes. The third case is
  // a pull of a paused series that is not on Today: only the end of the
  // current series opens the other rows' clocks.
  it.each([
    ['carries only the resume', 'series-x', [seriesRow(pausedB, resumed(RESUME_AT))]],
    ['carries the resume with series-x still live', 'series-x', [seriesRow(liveX), seriesRow(pausedB, resumed(RESUME_AT))]],
    ['of another paused series carries the resume', 'series-z', [seriesRow(pausedZ, ended(PAUSED_AT)), seriesRow(pausedB, resumed(RESUME_AT))]],
  ])('moves Today to series-b at the next full sync when a pull %s and the pause lands later', async (_label, requestedId, firstRows) => {
    useUnfoldStore.setState({ devotionals: [liveX, pausedB, pausedZ], currentDevotionalId: 'series-x' });

    pullOneSeries(requestedId, firstRows);
    expect(today()).toBe('series-x');
    expect(useUnfoldStore.getState().devotionals.find((item) => item.id === 'series-b'))
      .toMatchObject(ended(PAUSED_AT));

    pullOneSeries('series-x', [seriesRow(liveX, ended(RESUME_AT))]);
    expect(today()).toBeNull();

    await runFullSync(fullSyncReply([liveX, ended(RESUME_AT)], [pausedB, resumed(RESUME_AT)]));

    expect(isStrictActiveSeriesWinner('series-b', useUnfoldStore.getState().devotionals)).toBe(true);
    expect(today()).toBe('series-b');
  });

  it('moves Today to the resumed series when one pull carries the resume and the pause', () => {
    pullOneSeries('series-x', [seriesRow(liveX, ended(RESUME_AT)), seriesRow(pausedB, resumed(RESUME_AT))]);

    expect(today()).toBe('series-b');
  });
});
