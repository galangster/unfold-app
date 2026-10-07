function getMockMmkvStore(): Map<string, string> {
  return (globalThis as typeof globalThis & { __unfoldMockMmkvStore: Map<string, string> })
    .__unfoldMockMmkvStore;
}

jest.mock('react-native-mmkv', () => ({
  MMKV: jest.fn().mockImplementation(() => {
    const mockMmkvStore = new Map<string, string>();
    (globalThis as typeof globalThis & { __unfoldMockMmkvStore: Map<string, string> })
      .__unfoldMockMmkvStore = mockMmkvStore;
    return {
      getString: jest.fn((key: string) => mockMmkvStore.get(key)),
      set: jest.fn((key: string, value: string) => {
        mockMmkvStore.set(key, value);
        return true;
      }),
      delete: jest.fn((key: string) => mockMmkvStore.delete(key)),
    };
  }),
}));

jest.mock('uuid', () => ({
  v4: jest.fn(() => '00000000-0000-4000-8000-000000000000'),
  v5: jest.fn((value: string) => `uuid-v5:${value}`),
}));

jest.mock('../bug-logger', () => ({
  logBugError: jest.fn(),
  logBugEvent: jest.fn(),
}));

// eslint-disable-next-line import/first -- store import must run after Jest module mocks are registered.
import { updateSyncedDevotionals, useUnfoldStore, type Devotional } from '../store';
// eslint-disable-next-line import/first
import { peekSyncOutbox, replaceSyncOutbox } from '../sync-outbox';
// eslint-disable-next-line import/first
import { logBugEvent } from '../bug-logger';

const CLOCK = '2026-09-12T15:00:00.000Z';
const CURRENT_ID = 'series-current';
const OTHER_ID = 'series-other';

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
    updatedAt: '2026-09-11T12:00:00.000Z',
    generationMode: 'progressive',
    userContext: {
      name: 'Nick',
      aboutMe: '',
      currentSituation: '',
      emotionalState: '',
    },
    ...overrides,
  };
}

test('metadata pull clears an archived current pointer without enqueueing a resume', () => {
  const current = series(CURRENT_ID);
  useUnfoldStore.setState({ devotionals: [current], currentDevotionalId: CURRENT_ID });
  replaceSyncOutbox([]);
  updateSyncedDevotionals((items) => items.map((item) => ({
    ...item, archivedAt: CLOCK, archivedStateAt: CLOCK,
  })));
  expect(useUnfoldStore.getState().currentDevotionalId).toBeNull();
  expect(useUnfoldStore.getState().devotionals[0].days).toEqual(current.days);
  expect(peekSyncOutbox()).toEqual([]);
});

test('metadata pull restores a newer accepted remote resume without enqueueing', () => {
  const current = series(CURRENT_ID, { archivedAt: CLOCK, archivedStateAt: CLOCK });
  const resumeAt = '2026-09-12T16:00:00.000Z';
  useUnfoldStore.setState({ devotionals: [current], currentDevotionalId: null });
  replaceSyncOutbox([]);
  updateSyncedDevotionals((items) => items.map((item) => ({
    ...item, archivedAt: null, archivedStateAt: resumeAt,
  })));
  const state = useUnfoldStore.getState();
  expect(state.currentDevotionalId).toBe(CURRENT_ID);
  expect(state.devotionals[0]).toMatchObject({
    archivedAt: null,
    archivedStateAt: resumeAt,
  });
  expect(state.devotionals[0].days).toEqual(current.days);
  expect(peekSyncOutbox()).toEqual([]);
});

test('metadata pull keeps a different live selection when a sibling resumes', () => {
  const archived = series(CURRENT_ID, { archivedAt: CLOCK, archivedStateAt: CLOCK });
  const other = series(OTHER_ID);
  useUnfoldStore.setState({
    devotionals: [archived, other],
    currentDevotionalId: OTHER_ID,
  });
  replaceSyncOutbox([]);
  updateSyncedDevotionals((items) => items.map((item) => (
    item.id === CURRENT_ID
      ? { ...item, archivedAt: null, archivedStateAt: '2026-09-12T16:00:00.000Z' }
      : item
  )));
  expect(useUnfoldStore.getState().currentDevotionalId).toBe(OTHER_ID);
  expect(peekSyncOutbox()).toEqual([]);
});

describe('store archive and resume lifecycle', () => {
  beforeEach(() => {
    getMockMmkvStore().clear();
    useUnfoldStore.getState().reset();
    replaceSyncOutbox([]);
    (logBugEvent as jest.Mock).mockClear();
    jest.useFakeTimers();
    jest.setSystemTime(new Date(CLOCK));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('archives only the current series, keeps history and read progress, and enqueues lifecycle fields', () => {
    useUnfoldStore.setState({
      devotionals: [series(CURRENT_ID), series(OTHER_ID)],
      currentDevotionalId: CURRENT_ID,
    });

    useUnfoldStore.getState().archiveCurrentDevotional();

    const state = useUnfoldStore.getState();
    const archived = state.devotionals.find((item) => item.id === CURRENT_ID);
    const other = state.devotionals.find((item) => item.id === OTHER_ID);
    expect(state.currentDevotionalId).toBeNull();
    expect(archived).toMatchObject({
      id: CURRENT_ID,
      currentDay: 3,
      archivedAt: CLOCK,
      archivedStateAt: CLOCK,
    });
    expect(archived?.days[0]).toMatchObject({
      isRead: true,
      readAt: '2026-09-11T12:00:00.000Z',
    });
    expect(other?.archivedAt).toBeUndefined();
    expect(other?.archivedStateAt).toBeUndefined();

    const queued = peekSyncOutbox().filter((change) => change.table === 'devotionals');
    expect(queued).toHaveLength(1);
    expect(queued[0]).toMatchObject({
      id: CURRENT_ID,
      deleted: false,
      clientUpdatedAt: CLOCK,
      data: {
        archivedAt: CLOCK,
        archivedStateAt: CLOCK,
        currentDay: 3,
      },
    });
  });

  it('does nothing when there is no current series', () => {
    useUnfoldStore.setState({
      devotionals: [series(CURRENT_ID)],
      currentDevotionalId: null,
    });
    useUnfoldStore.getState().archiveCurrentDevotional();
    expect(useUnfoldStore.getState().devotionals[0]?.archivedAt).toBeUndefined();
    expect(peekSyncOutbox()).toHaveLength(0);
  });

  // An implicit unarchive here outranked the reader's live series on the
  // server, so the cron generated the old series. Resuming an archived series
  // goes only through the confirmed continuation.
  it('refuses to resume an archived series through setCurrentDevotional', () => {
    const archived = series(CURRENT_ID, { archivedAt: CLOCK, archivedStateAt: CLOCK });
    const live = series(OTHER_ID);
    useUnfoldStore.setState({ devotionals: [archived, live], currentDevotionalId: OTHER_ID });

    useUnfoldStore.getState().setCurrentDevotional(CURRENT_ID);

    const state = useUnfoldStore.getState();
    expect(state.currentDevotionalId).toBe(OTHER_ID);
    expect(state.devotionals).toEqual([archived, live]);
    expect(peekSyncOutbox()).toEqual([]);
    expect(logBugEvent).toHaveBeenCalledWith(
      'store-set-current-devotional-refused',
      expect.any(String),
      { reason: 'archived' },
      'warn',
    );
  });

  it('refuses a series that is not on this device', () => {
    useUnfoldStore.setState({ devotionals: [series(OTHER_ID)], currentDevotionalId: OTHER_ID });

    useUnfoldStore.getState().setCurrentDevotional('series-deleted-elsewhere');

    expect(useUnfoldStore.getState().currentDevotionalId).toBe(OTHER_ID);
    expect(peekSyncOutbox()).toEqual([]);
    expect(logBugEvent).toHaveBeenCalledWith(
      'store-set-current-devotional-refused',
      expect.any(String),
      { reason: 'missing' },
      'warn',
    );
  });

  it('does not unarchive an existing archived series through addDevotional', () => {
    const archived = series(CURRENT_ID, { archivedAt: CLOCK, archivedStateAt: CLOCK });
    const live = series(OTHER_ID);
    useUnfoldStore.setState({ devotionals: [archived, live], currentDevotionalId: OTHER_ID });

    useUnfoldStore.getState().addDevotional(series(CURRENT_ID));

    const state = useUnfoldStore.getState();
    expect(state.currentDevotionalId).toBe(OTHER_ID);
    expect(state.devotionals).toEqual([archived, live]);
    expect(peekSyncOutbox()).toEqual([]);
    expect(logBugEvent).toHaveBeenCalledWith(
      'store-set-current-devotional-refused',
      expect.any(String),
      { reason: 'archived' },
      'warn',
    );
  });

  // The confirmed continuation tells the reader the current series "will be
  // paused". Leaving it unarchived kept it a live server candidate, so ending
  // the resumed series handed generation back to it.
  it('archives the previously current series with the resume clock when a verified resume activates', () => {
    const resumeClock = '2026-09-12T15:00:05.000Z';
    const paused = series(CURRENT_ID, { archivedAt: CLOCK, archivedStateAt: CLOCK });
    const active = series(OTHER_ID, { createdAt: '2026-09-05T00:00:00.000Z' });
    useUnfoldStore.setState({ devotionals: [paused, active], currentDevotionalId: OTHER_ID });

    // A refused activation changes neither series.
    expect(useUnfoldStore.getState().activateAcknowledgedDevotionalResume(
      CURRENT_ID, OTHER_ID, '2026-09-01T00:00:00.000Z', resumeClock,
    )).toBe(false);
    expect(useUnfoldStore.getState().devotionals).toEqual([paused, active]);
    expect(peekSyncOutbox()).toEqual([]);

    expect(useUnfoldStore.getState().activateAcknowledgedDevotionalResume(
      CURRENT_ID, OTHER_ID, CLOCK, resumeClock,
    )).toBe(true);

    const state = useUnfoldStore.getState();
    expect(state.currentDevotionalId).toBe(CURRENT_ID);
    expect(state.devotionals.find((item) => item.id === CURRENT_ID)).toMatchObject({
      archivedAt: null,
      archivedStateAt: resumeClock,
    });
    const previous = state.devotionals.find((item) => item.id === OTHER_ID);
    expect(previous).toMatchObject({
      archivedAt: resumeClock,
      archivedStateAt: resumeClock,
      currentDay: 3,
    });
    expect(previous?.days).toEqual(active.days);
    // The pause moves the lifecycle clock only. Promoting the content clock
    // would let this device's older progress overwrite newer progress from
    // another device.
    expect(previous?.updatedAt).toBe(active.updatedAt);
    // Only the previous series is queued: the resumed one was already
    // acknowledged and must not mint another intent.
    const queued = peekSyncOutbox().filter((change) => change.table === 'devotionals');
    expect(queued).toEqual([{
      table: 'devotionals',
      id: OTHER_ID,
      clientUpdatedAt: active.updatedAt,
      data: { archivedAt: resumeClock, archivedStateAt: resumeClock },
      deleted: false,
    }]);
  });

  // The outbox keeps one change per row and drops an older one. The pause
  // must neither replace unsynced progress nor be dropped behind it.
  it('carries the pause on progress still waiting to sync for the previous series', () => {
    const resumeClock = '2026-09-12T15:00:05.000Z';
    const paused = series(CURRENT_ID, { archivedAt: CLOCK, archivedStateAt: CLOCK });
    const active = series(OTHER_ID, { createdAt: '2026-09-05T00:00:00.000Z' });
    const pendingRead = {
      table: 'devotionals' as const,
      id: OTHER_ID,
      clientUpdatedAt: '2026-09-12T14:30:00.000Z',
      data: { title: OTHER_ID, currentDay: 4 },
      deleted: false,
    };
    useUnfoldStore.setState({ devotionals: [paused, active], currentDevotionalId: OTHER_ID });
    replaceSyncOutbox([pendingRead]);

    expect(useUnfoldStore.getState().activateAcknowledgedDevotionalResume(
      CURRENT_ID, OTHER_ID, CLOCK, resumeClock,
    )).toBe(true);

    expect(peekSyncOutbox()).toEqual([{
      ...pendingRead,
      data: { title: OTHER_ID, currentDay: 4, archivedAt: resumeClock, archivedStateAt: resumeClock },
    }]);
  });

  it('does not enqueue when activating an already live series', () => {
    useUnfoldStore.setState({
      devotionals: [series(CURRENT_ID), series(OTHER_ID)],
      currentDevotionalId: CURRENT_ID,
    });
    useUnfoldStore.getState().setCurrentDevotional(OTHER_ID);
    expect(useUnfoldStore.getState().currentDevotionalId).toBe(OTHER_ID);
    expect(useUnfoldStore.getState().devotionals.every((item) => !item.archivedAt)).toBe(true);
    expect(peekSyncOutbox()).toHaveLength(0);
  });
});
