/* eslint-disable import/first */
/**
 * "Start a new series" ends the reader's current series only once the new
 * one lands. Ending it at the confirm left a reader who backed out, quit
 * mid-questionnaire, or gave up on a failed generation with no series, and
 * the server stopped writing the old one.
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
    __store: store,
  };
});

import { writeInflightGenerationJob } from '../inflight-generation-job';
import { ensureInitialGenerationRequestId } from '../initial-generation-request';
import { applyInitialArcResult } from '../initial-arc-result';
import { captureSyncSession } from '../generation-session';
import { forgetReplacedSeriesUnlessPending } from '../series-replacement';
import { updateSyncedDevotionals, useUnfoldStore, type Devotional, type DevotionalDay, type UserProfile } from '../store';
import { peekSyncOutbox, replaceSyncOutbox } from '../sync-outbox';

const CLOCK = '2026-10-07T15:00:00.000Z';
const READING_ID = 'series-reading';
const NEW_ID = 'devo-new';

const user = {
  name: 'Jordan',
  aboutMe: '',
  currentSituation: '',
  emotionalState: '',
  devotionalLength: 7,
} as unknown as UserProfile;

function readDay(dayNumber: number): DevotionalDay {
  return {
    id: `day-${READING_ID}-${dayNumber}`,
    dayNumber,
    title: `Day ${dayNumber}`,
    scriptureReference: 'John 1:1',
    scriptureText: 'In the beginning',
    bodyText: 'Body',
    quotableLine: 'Line',
    isRead: true,
    readAt: '2026-10-06T12:00:00.000Z',
  };
}

// Day 3 of 7, read today: the hero offers "New Series".
const reading: Devotional = {
  id: READING_ID,
  title: 'Rest for the Weary',
  totalDays: 7,
  currentDay: 3,
  days: [readDay(1), readDay(2), readDay(3)],
  createdAt: '2026-10-05T08:00:00.000Z',
  updatedAt: '2026-10-07T12:00:00.000Z',
  generationMode: 'progressive',
  userContext: { name: 'Jordan', aboutMe: '', currentSituation: '', emotionalState: '' },
};

const newDay1: DevotionalDay = {
  dayNumber: 1,
  title: 'A new beginning',
  scriptureReference: 'Isaiah 43:19',
  scriptureText: 'See, I am doing a new thing.',
  bodyText: 'Body',
  quotableLine: 'Line',
  isRead: false,
};

const landed = { devotionalId: NEW_ID, devotionalDay: newDay1, seriesTitle: 'A New Thing', totalDays: 7 };

function land(result = landed) {
  return applyInitialArcResult(result, { user, devotionalLength: 7, session: captureSyncSession() });
}

function series(id: string): Devotional | undefined {
  return useUnfoldStore.getState().devotionals.find((row) => row.id === id);
}

function queuedChangesFor(id: string) {
  return peekSyncOutbox().filter((change) => change.table === 'devotionals' && change.id === id);
}

/** The reader confirms "Start a new series?" on Today. */
function confirmStartNewSeries() {
  useUnfoldStore.getState().archiveCurrentDevotional();
}

function expectStillReading() {
  const state = useUnfoldStore.getState();
  expect(state.currentDevotionalId).toBe(READING_ID);
  expect(series(READING_ID)?.archivedAt).toBeUndefined();
  expect(queuedChangesFor(READING_ID)).toEqual([]);
}

beforeEach(() => {
  jest.useFakeTimers();
  jest.setSystemTime(new Date(CLOCK));
  (jest.requireMock('../mmkv-storage') as { __store: Map<string, string> }).__store.clear();
  useUnfoldStore.setState({
    devotionals: [reading],
    currentDevotionalId: READING_ID,
    usedScriptures: [],
    user,
    generationSession: { status: 'running', devotionalId: NEW_ID, totalDays: 7, generatedDayNumbers: [] },
  });
  replaceSyncOutbox([]);
});

afterEach(() => {
  jest.useRealTimers();
});

describe('starting a new series', () => {
  it('keeps the current series current and live while the new one is set up', () => {
    confirmStartNewSeries();

    expectStillReading();
  });

  it('ends the series it replaces when the new series lands', () => {
    confirmStartNewSeries();
    expectStillReading();

    land();

    const state = useUnfoldStore.getState();
    expect(state.currentDevotionalId).toBe(NEW_ID);
    expect(series(READING_ID)).toMatchObject({
      currentDay: 3,
      archivedAt: CLOCK,
      archivedStateAt: CLOCK,
      days: reading.days,
    });
    // Only the archive clock moves. The change keeps the row's content clock
    // and carries no progress, so newer progress from another device stays.
    expect(queuedChangesFor(READING_ID)).toEqual([
      expect.objectContaining({
        deleted: false,
        clientUpdatedAt: '2026-10-07T12:00:00.000Z',
        data: { archivedAt: CLOCK, archivedStateAt: CLOCK },
      }),
    ]);
  });

  it('ends the series it replaces when the sync pull landed the new series first', () => {
    confirmStartNewSeries();
    updateSyncedDevotionals((rows) => [...rows, {
      id: NEW_ID,
      title: 'A New Thing',
      totalDays: 7,
      currentDay: 1,
      days: [],
      createdAt: CLOCK,
      generationMode: 'progressive',
      userContext: { name: '', aboutMe: '', currentSituation: '', emotionalState: '' },
    }]);
    expectStillReading();

    land();

    // Today moves to the new series, not to nothing.
    expect(useUnfoldStore.getState().currentDevotionalId).toBe(NEW_ID);
    expect(series(READING_ID)).toMatchObject({ archivedAt: CLOCK, archivedStateAt: CLOCK });
    expect(queuedChangesFor(READING_ID)).toHaveLength(1);
  });

  it('does not put a synced new series another device already ended on Today', () => {
    const endedElsewhere = '2026-10-07T14:00:00.000Z';
    confirmStartNewSeries();
    updateSyncedDevotionals((rows) => [...rows, {
      id: NEW_ID,
      title: 'A New Thing',
      totalDays: 7,
      currentDay: 1,
      days: [],
      createdAt: CLOCK,
      archivedAt: endedElsewhere,
      archivedStateAt: endedElsewhere,
      generationMode: 'progressive',
      userContext: { name: '', aboutMe: '', currentSituation: '', emotionalState: '' },
    }]);

    land();

    expect(useUnfoldStore.getState().currentDevotionalId).not.toBe(NEW_ID);
    expect(series(NEW_ID)).toMatchObject({ archivedAt: endedElsewhere });
    expect(queuedChangesFor(NEW_ID)).toEqual([]);
  });

  it('leaves a series another device already ended as it was', () => {
    const endedElsewhere = '2026-10-07T14:00:00.000Z';
    confirmStartNewSeries();
    updateSyncedDevotionals((rows) => rows.map((row) => (
      row.id === READING_ID ? { ...row, archivedAt: endedElsewhere, archivedStateAt: endedElsewhere } : row
    )));

    land();

    expect(series(READING_ID)).toMatchObject({ archivedAt: endedElsewhere, archivedStateAt: endedElsewhere });
    expect(queuedChangesFor(READING_ID)).toEqual([]);
  });
});

describe('leaving the new-series flow', () => {
  it('keeps the current series when the reader backs out before asking for a new one', () => {
    confirmStartNewSeries();
    forgetReplacedSeriesUnlessPending();
    expectStillReading();

    // A series started later some other way does not end this one.
    land();

    expect(series(READING_ID)?.archivedAt).toBeUndefined();
    expect(queuedChangesFor(READING_ID)).toEqual([]);
  });

  it.each([
    ['a submitted job', () => writeInflightGenerationJob({ jobId: 'job-new', devotionalId: NEW_ID, submittedAt: Date.now(), leftForHome: true })],
    ['a request Today still offers to continue', () => { ensureInitialGenerationRequestId(); }],
  ])('still ends the series once %s lands', (_label, pending) => {
    confirmStartNewSeries();
    pending();
    forgetReplacedSeriesUnlessPending();
    expectStillReading();

    land();

    expect(series(READING_ID)?.archivedAt).toBe(CLOCK);
    expect(queuedChangesFor(READING_ID)).toHaveLength(1);
  });
});
