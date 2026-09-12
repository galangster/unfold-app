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
}));

// eslint-disable-next-line import/first -- store import must run after Jest module mocks are registered.
import { updateSyncedDevotionals, useUnfoldStore, type Devotional } from '../store';
// eslint-disable-next-line import/first
import { peekSyncOutbox, replaceSyncOutbox } from '../sync-outbox';

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

  it('resumes an archived series through setCurrentDevotional and preserves newer unarchive intent', () => {
    useUnfoldStore.setState({
      devotionals: [series(CURRENT_ID, { archivedAt: CLOCK, archivedStateAt: CLOCK })],
      currentDevotionalId: null,
    });

    useUnfoldStore.getState().setCurrentDevotional(CURRENT_ID);

    const state = useUnfoldStore.getState();
    expect(state.currentDevotionalId).toBe(CURRENT_ID);
    expect(state.devotionals[0]).toMatchObject({
      archivedAt: null,
      archivedStateAt: '2026-09-12T15:00:00.001Z',
      currentDay: 3,
    });
    expect(peekSyncOutbox()[0]).toMatchObject({
      table: 'devotionals',
      id: CURRENT_ID,
      data: {
        archivedAt: null,
        archivedStateAt: '2026-09-12T15:00:00.001Z',
      },
    });
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
