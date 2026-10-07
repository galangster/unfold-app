jest.mock('../bug-logger', () => ({
  logBugError: jest.fn(),
  logBugEvent: jest.fn(),
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
  };
});

jest.mock('@react-native-community/netinfo', () => ({
  addEventListener: jest.fn(() => jest.fn()),
}));

// The full sync a pull asks for is observed and run by hand; it applies with
// the real full-sync mappers.
jest.mock('../full-sync-pull', () => ({
  ...jest.requireActual('../full-sync-pull'),
  triggerUserDataPull: jest.fn(() => Promise.resolve()),
}));

// eslint-disable-next-line import/first -- store import must run after Jest module mocks are registered.
import { applyPulledDevotionalContent } from '../devotional-pulled-content';
// eslint-disable-next-line import/first
import { applyPulledUserData, triggerUserDataPull } from '../full-sync-pull';
// eslint-disable-next-line import/first
import { isStrictActiveSeriesWinner } from '../devotional-active-selection';
// eslint-disable-next-line import/first
import type { PulledDevotionalContent } from '../devotional-sync-pull';
// eslint-disable-next-line import/first
import { updateSyncedDevotionals, useUnfoldStore, type Devotional } from '../store';
// eslint-disable-next-line import/first
import { buildPersonalDataSyncChange } from '../personal-data-sync-records';
// eslint-disable-next-line import/first
import { peekSyncOutbox, replaceSyncOutbox } from '../sync-outbox';

const PAUSED_AT = '2026-09-10T00:00:00.000Z';
const RESUME_AT = '2026-09-12T16:00:00.000Z';
const NEWER_LOCAL_AT = '2026-09-12T16:30:00.000Z';

function series(id: string, overrides: Partial<Devotional> = {}): Devotional {
  return {
    id,
    title: id,
    totalDays: 7,
    currentDay: 3,
    days: [{
      id: `day-${id}-1`,
      dayNumber: 1,
      title: 'Day 1',
      scriptureReference: 'John 1:1',
      scriptureText: 'In the beginning',
      bodyText: 'Body',
      quotableLine: 'Line',
      isRead: true,
      readAt: '2026-09-11T12:00:00.000Z',
    }],
    createdAt: '2026-09-01T00:00:00.000Z',
    seriesStartDate: '2026-09-01T00:00:00.000Z',
    updatedAt: '2026-09-11T12:00:00.000Z',
    generationMode: 'progressive',
    userContext: { name: '', aboutMe: '', currentSituation: '', emotionalState: '' },
    ...overrides,
  };
}

// The rows a pull of the current series returns: the server's copy of each
// changed series, not only the one asked for.
function row(local: Devotional, lifecycle: Pick<Devotional, 'archivedAt' | 'archivedStateAt'>) {
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

function applyCurrentSeriesPull(devotionalId: string, rows: ReturnType<typeof row>[]): void {
  const pulled: PulledDevotionalContent = {
    devotional: rows.find((item) => item.id === devotionalId),
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

// "Continue this series" on another device resumes series-b and pauses the
// current series-x on the same clock. Today and Reading pull only the current
// series, but the response carries every changed row.
describe('pull of the current series when it was paused elsewhere', () => {
  const liveX = series('series-x', { createdAt: '2026-09-05T00:00:00.000Z', seriesStartDate: '2026-09-05T00:00:00.000Z' });
  const pausedB = series('series-b', { archivedAt: PAUSED_AT, archivedStateAt: PAUSED_AT });

  beforeEach(() => {
    useUnfoldStore.getState().reset();
    replaceSyncOutbox([]);
    useUnfoldStore.setState({ devotionals: [liveX, pausedB], currentDevotionalId: 'series-x' });
  });

  it('moves Today to the resumed series when one pull carries the resume and the pause', () => {
    applyCurrentSeriesPull('series-x', [
      row(liveX, { archivedAt: RESUME_AT, archivedStateAt: RESUME_AT }),
      row(pausedB, { archivedAt: null, archivedStateAt: RESUME_AT }),
    ]);

    const state = useUnfoldStore.getState();
    expect(state.currentDevotionalId).toBe('series-b');
    // Only the lifecycle of the other series changes. Its progress, content
    // and content clock wait for the full sync.
    expect(state.devotionals.find((item) => item.id === 'series-b')).toEqual({
      ...pausedB, archivedAt: null, archivedStateAt: RESUME_AT,
    });
    expect(state.devotionals.find((item) => item.id === 'series-x')).toMatchObject({
      archivedAt: RESUME_AT, archivedStateAt: RESUME_AT,
    });
    expect(peekSyncOutbox()).toEqual([]);
  });

  it('moves Today to the resumed series when the resume and the pause arrive in separate pulls', () => {
    applyCurrentSeriesPull('series-x', [row(pausedB, { archivedAt: null, archivedStateAt: RESUME_AT })]);
    // The pause has not reached the server yet: series-x stays current.
    expect(useUnfoldStore.getState().currentDevotionalId).toBe('series-x');

    applyCurrentSeriesPull('series-x', [row(liveX, { archivedAt: RESUME_AT, archivedStateAt: RESUME_AT })]);

    expect(useUnfoldStore.getState().currentDevotionalId).toBe('series-b');
    expect(peekSyncOutbox()).toEqual([]);
  });

  it('keeps a newer local decision for another series, also one still waiting in the outbox', () => {
    const archivedLocally = series('series-c', { archivedAt: NEWER_LOCAL_AT, archivedStateAt: NEWER_LOCAL_AT });
    // The local row holds an older clock than the archive still queued for it.
    const queuedOnly = series('series-d', { archivedAt: PAUSED_AT, archivedStateAt: PAUSED_AT });
    const queued = buildPersonalDataSyncChange('devotionals', 'series-d',
      { archivedAt: NEWER_LOCAL_AT, archivedStateAt: NEWER_LOCAL_AT }, queuedOnly.updatedAt!);
    useUnfoldStore.setState({ devotionals: [liveX, archivedLocally, queuedOnly], currentDevotionalId: 'series-x' });
    replaceSyncOutbox([queued]);

    applyCurrentSeriesPull('series-x', [
      row(archivedLocally, { archivedAt: null, archivedStateAt: RESUME_AT }),
      row(queuedOnly, { archivedAt: null, archivedStateAt: RESUME_AT }),
    ]);

    const state = useUnfoldStore.getState();
    expect(state.devotionals).toEqual([liveX, archivedLocally, queuedOnly]);
    expect(state.currentDevotionalId).toBe('series-x');
    expect(peekSyncOutbox()).toEqual([queued]);
  });

  it('does not add a series this device does not hold', () => {
    const elsewhere = series('series-elsewhere');
    applyCurrentSeriesPull('series-x', [row(elsewhere, { archivedAt: null, archivedStateAt: RESUME_AT })]);

    const state = useUnfoldStore.getState();
    expect(state.devotionals).toEqual([liveX, pausedB]);
    expect(state.currentDevotionalId).toBe('series-x');
  });
});

// The full sync's copy of a series this device does not hold yet: its row and
// its first day, as the server writes them when the series lands.
function fullPullOf(local: Devotional) {
  return {
    timestamp: local.createdAt,
    changes: {
      devotionals: [{
        id: local.id,
        updatedAt: local.createdAt,
        deleted: false,
        data: {
          title: local.title,
          totalDays: local.totalDays,
          currentDay: 1,
          createdAt: local.createdAt,
          seriesStartDate: local.seriesStartDate,
          generationMode: 'progressive',
          clientUpdatedAt: local.createdAt,
        },
      }],
      devotional_days: [{
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
      }],
    },
  };
}

// The series the server writes is the strict active winner of every series
// row, and a pull of the current series can carry one this device does not
// hold yet. Today never moves to an older series in its place: it waits for
// the full sync that brings the new one.
describe('pull of the current series when the series the server writes is not on this device', () => {
  const STARTED_AT = '2026-09-12T16:20:00.000Z';
  const liveX = series('series-x', { createdAt: '2026-09-05T00:00:00.000Z', seriesStartDate: '2026-09-05T00:00:00.000Z' });
  const pausedB = series('series-b', { archivedAt: PAUSED_AT, archivedStateAt: PAUSED_AT });

  let fullSync: Promise<void> | undefined;
  function runFullSyncWith(local: Devotional): void {
    jest.mocked(triggerUserDataPull).mockImplementationOnce(() => {
      fullSync = Promise.resolve().then(() => applyPulledUserData(fullPullOf(local)));
      return fullSync;
    });
  }

  beforeEach(() => {
    useUnfoldStore.getState().reset();
    replaceSyncOutbox([]);
    // Drops a full sync a previous test queued but never asked for.
    jest.mocked(triggerUserDataPull).mockReset();
    jest.mocked(triggerUserDataPull).mockImplementation(() => Promise.resolve());
    fullSync = undefined;
  });

  // Another device resumed series-b, which paused series-x, and then started
  // series-n before series-b's own pause reached the server.
  it('does not follow an older resume when a newer series was started elsewhere', async () => {
    const newN = series('series-n', { createdAt: STARTED_AT, seriesStartDate: STARTED_AT });
    useUnfoldStore.setState({ devotionals: [liveX, pausedB], currentDevotionalId: 'series-x' });
    runFullSyncWith(newN);

    applyCurrentSeriesPull('series-x', [
      row(liveX, { archivedAt: RESUME_AT, archivedStateAt: RESUME_AT }),
      row(pausedB, { archivedAt: null, archivedStateAt: RESUME_AT }),
      row(newN, {}),
    ]);

    expect(useUnfoldStore.getState().currentDevotionalId).toBeNull();
    expect(triggerUserDataPull).toHaveBeenCalledTimes(1);

    await fullSync;

    const state = useUnfoldStore.getState();
    expect(state.devotionals.some((item) => item.id === 'series-n')).toBe(true);
    expect(state.currentDevotionalId).toBe('series-n');
  });

  // An earlier build left series-m live, day 1 unread, while the reader moved
  // on to series-f. On another device the reader ended series-f and started
  // series-n; this device holds only series-f and series-m.
  it.each([
    ['after the end', '2026-09-12T16:20:00.000Z', 'series-n'],
    ['before the end', '2026-09-12T15:30:00.000Z', null],
  ] as const)('asks for a full sync, never the older series, when the new series started %s', async (_when, startedAt, landsOn) => {
    const strandedM = series('series-m', {
      createdAt: '2026-09-01T00:00:00.000Z',
      days: [{ ...series('series-m').days[0], isRead: false, readAt: undefined }],
    });
    const liveF = series('series-f', { createdAt: '2026-09-05T00:00:00.000Z', seriesStartDate: '2026-09-05T00:00:00.000Z' });
    const newN = series('series-n', { createdAt: startedAt, seriesStartDate: startedAt });
    useUnfoldStore.setState({ devotionals: [liveF, strandedM], currentDevotionalId: 'series-f' });
    runFullSyncWith(newN);

    applyCurrentSeriesPull('series-f', [
      row(liveF, { archivedAt: RESUME_AT, archivedStateAt: RESUME_AT }),
      row(newN, {}),
    ]);

    expect(useUnfoldStore.getState().currentDevotionalId).toBeNull();
    expect(triggerUserDataPull).toHaveBeenCalledTimes(1);

    await fullSync;

    const state = useUnfoldStore.getState();
    // Once the new series is here, the older one no longer proves itself the
    // server's series from the rows this device holds.
    expect(isStrictActiveSeriesWinner('series-m', state.devotionals)).toBe(false);
    expect(state.currentDevotionalId).toBe(landsOn);
  });

  it('still does not follow the older resume when the full sync brings nothing', async () => {
    const newN = series('series-n', { createdAt: STARTED_AT, seriesStartDate: STARTED_AT });
    useUnfoldStore.setState({ devotionals: [liveX, pausedB], currentDevotionalId: 'series-x' });
    jest.mocked(triggerUserDataPull).mockImplementationOnce(() => {
      fullSync = Promise.resolve();
      return fullSync;
    });

    applyCurrentSeriesPull('series-x', [
      row(liveX, { archivedAt: RESUME_AT, archivedStateAt: RESUME_AT }),
      row(pausedB, { archivedAt: null, archivedStateAt: RESUME_AT }),
      row(newN, {}),
    ]);
    await fullSync;

    expect(useUnfoldStore.getState().currentDevotionalId).toBeNull();
  });

  it('keeps a series Today took while the full sync ran', async () => {
    const newN = series('series-n', { createdAt: STARTED_AT, seriesStartDate: STARTED_AT });
    const liveY = series('series-y', { createdAt: '2026-09-02T00:00:00.000Z' });
    useUnfoldStore.setState({ devotionals: [liveX, liveY], currentDevotionalId: 'series-x' });
    jest.mocked(triggerUserDataPull).mockImplementationOnce(() => {
      fullSync = Promise.resolve().then(() => {
        useUnfoldStore.getState().setCurrentDevotional('series-y');
        applyPulledUserData(fullPullOf(newN));
      });
      return fullSync;
    });

    applyCurrentSeriesPull('series-x', [
      row(liveX, { archivedAt: RESUME_AT, archivedStateAt: RESUME_AT }),
      row(newN, {}),
    ]);
    expect(useUnfoldStore.getState().currentDevotionalId).toBeNull();

    await fullSync;

    expect(useUnfoldStore.getState().currentDevotionalId).toBe('series-y');
  });

  it('keeps a current series the pull leaves live and asks for nothing', () => {
    const newN = series('series-n', { createdAt: STARTED_AT, seriesStartDate: STARTED_AT });
    useUnfoldStore.setState({ devotionals: [liveX, pausedB], currentDevotionalId: 'series-x' });

    applyCurrentSeriesPull('series-x', [row(newN, {})]);

    expect(useUnfoldStore.getState().currentDevotionalId).toBe('series-x');
    expect(triggerUserDataPull).not.toHaveBeenCalled();
  });
});
