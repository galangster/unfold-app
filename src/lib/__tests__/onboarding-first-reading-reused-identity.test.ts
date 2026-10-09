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

jest.mock('../check-in-flush', () => ({
  flushCheckInToServer: jest.fn(async () => 'sent'),
}));

jest.mock('../auto-trial-telemetry', () => ({
  trackAutoTrialLanded: jest.fn(),
  trackAutoTrialAbandoned: jest.fn(),
}));

jest.mock('../mmkv-storage', () => {
  const store = new Map<string, string>();
  return {
    mmkvStorage: {
      getItem: jest.fn((key: string) => store.get(key) ?? null),
      setItem: jest.fn((key: string, value: string) => {
        store.set(key, value);
      }),
      removeItem: jest.fn((key: string) => {
        store.delete(key);
      }),
      __store: store,
    },
    getDeviceId: jest.fn(() => 'test-device-id'),
    getSharedEncryptionKey: jest.fn(() => 'test-key'),
    isRecoverySession: jest.fn(() => false),
  };
});

/**
 * D02 (release 1.1.19 smoke). Synthetic ids and text only.
 *
 * A reader who reinstalls keeps the Keychain identity, so the onboarding
 * sample id is the same as in the first onboarding. The app-start full pull
 * brings the old sample back before the new onboarding job lands. The new
 * first reading must win over that old server copy, and a later pull of the
 * old rows must not bring them back.
 */
import { applyPulledUserData } from '../full-sync-pull';
import { mmkvStorage } from '../mmkv-storage';
import { persistOnboardingFirstReading } from '../onboarding-first-reading';
import { useUnfoldStore, type DevotionalDay } from '../store';
import { peekSyncOutbox, replaceSyncOutbox } from '../sync-outbox';

const SAMPLE_ID = 'onboarding-sample-anon_00000000-0000-4000-8000-0000000000d2';
const FIRST_RUN_AT = '2026-10-08T18:00:00.000Z';
// The server stamps a finished job's day with the job's completion time.
const SECOND_JOB_COMPLETED_AT = '2026-10-09T20:38:30.000Z';
const SECOND_RUN_AT = '2026-10-09T20:39:00.000Z';

const OLD_DAY = {
  devotionalId: SAMPLE_ID,
  dayNumber: 1,
  title: 'Old sample title',
  scriptureReference: 'Psalm 1:1',
  scriptureText: 'Old sample scripture.',
  bodyText: 'Old sample body.',
  quotableLine: 'Old sample line.',
};

const NEW_DAY: DevotionalDay = {
  devotionalId: SAMPLE_ID,
  dayNumber: 1,
  title: 'New sample title',
  scriptureReference: 'Luke 1:1',
  scriptureText: 'New sample scripture.',
  bodyText: 'New sample body.',
  quotableLine: 'New sample line.',
  isRead: false,
  generatedAt: SECOND_JOB_COMPLETED_AT,
  updatedAt: SECOND_JOB_COMPLETED_AT,
};

// The first life's trial landed and retired the sample it stood in for.
const RETIRED_AT = '2026-10-08T18:30:00.000Z';
const TRIAL_ID = 'trial-00000000-0000-4000-8000-0000000000d2';
const TRIAL_DAYS = 3;

type Lifecycle = { archivedAt?: string | null; archivedStateAt?: string };

function serverHoldsOldSample(lifecycle: Lifecycle = {}) {
  return {
    timestamp: FIRST_RUN_AT,
    changes: {
      devotionals: [{
        id: SAMPLE_ID,
        updatedAt: lifecycle.archivedStateAt ?? FIRST_RUN_AT,
        deleted: false,
        data: {
          ...lifecycle,
          schemaVersion: 1,
          title: OLD_DAY.title,
          totalDays: 1,
          currentDay: 1,
          createdAt: FIRST_RUN_AT,
          clientUpdatedAt: FIRST_RUN_AT,
          seriesStartDate: FIRST_RUN_AT,
          generationMode: 'progressive',
          seriesArc: {
            totalDaysPlanned: 1,
            overarchingTheme: '',
            narrativeShape: '',
            dayHints: [],
            isOpenEnded: false,
            createdAt: FIRST_RUN_AT,
            origin: 'onboarding_first',
          },
        },
      }],
      devotional_days: [{
        id: `day-${SAMPLE_ID}-1`,
        updatedAt: FIRST_RUN_AT,
        deleted: false,
        data: { ...OLD_DAY, isRead: true, readAt: FIRST_RUN_AT },
      }],
    },
  };
}

// The server after the first life: the retired sample and the trial, every
// trial day read. Finishing never archives a series.
function serverHoldsFirstLife() {
  const sample = serverHoldsOldSample({ archivedAt: RETIRED_AT, archivedStateAt: RETIRED_AT });
  const trialData = {
    schemaVersion: 1,
    title: 'Trial title',
    totalDays: TRIAL_DAYS,
    currentDay: TRIAL_DAYS,
    createdAt: RETIRED_AT,
    clientUpdatedAt: RETIRED_AT,
    seriesStartDate: RETIRED_AT,
    generationMode: 'progressive',
    seriesArc: {
      totalDaysPlanned: TRIAL_DAYS,
      overarchingTheme: '',
      narrativeShape: '',
      dayHints: [],
      isOpenEnded: false,
      createdAt: RETIRED_AT,
      seriesKind: 'auto_trial',
    },
  };
  const trialDays = Array.from({ length: TRIAL_DAYS }, (_, index) => ({
    id: `day-${TRIAL_ID}-${index + 1}`,
    updatedAt: RETIRED_AT,
    deleted: false,
    data: {
      devotionalId: TRIAL_ID,
      dayNumber: index + 1,
      title: `Trial day ${index + 1}`,
      scriptureReference: 'John 1:1',
      scriptureText: 'Trial scripture.',
      bodyText: 'Trial body.',
      quotableLine: 'Trial line.',
      isRead: true,
      readAt: RETIRED_AT,
    },
  }));
  return {
    timestamp: RETIRED_AT,
    changes: {
      devotionals: [...sample.changes.devotionals, { id: TRIAL_ID, updatedAt: RETIRED_AT, deleted: false, data: trialData }],
      devotional_days: [...sample.changes.devotional_days, ...trialDays],
    },
  };
}

const today = () => useUnfoldStore.getState().currentDevotionalId;

function clearAppData() {
  getMockMmkvStore()?.clear();
  (mmkvStorage as unknown as { __store: Map<string, string> }).__store.clear();
  replaceSyncOutbox([]);
  useUnfoldStore.getState().reset();
}

function sampleInStore() {
  return useUnfoldStore.getState().devotionals.find((row) => row.id === SAMPLE_ID);
}

function queuedSample() {
  const queued = peekSyncOutbox().filter((change) => change.table === 'devotionals' && change.id === SAMPLE_ID);
  return queued[queued.length - 1]?.data as { title?: string; archivedAt?: string | null } | undefined;
}

function queuedSampleTitle() {
  return queuedSample()?.title;
}

describe('a second onboarding under a reused identity', () => {
  beforeEach(() => {
    jest.useFakeTimers({ now: new Date(SECOND_RUN_AT) });
    clearAppData();
  });
  afterEach(() => { jest.useRealTimers(); });

  it('lets the new first reading replace the old sample an app-start pull restored', () => {
    // 1. App start after the data clear: full pull restores the old sample.
    applyPulledUserData(serverHoldsOldSample());
    expect(sampleInStore()?.title).toBe(OLD_DAY.title);

    // 2. The new onboarding job completes with the same id. ReadDevotionalStep persists it.
    expect(persistOnboardingFirstReading({
      id: SAMPLE_ID,
      day: NEW_DAY,
      userContext: { name: 'QA', aboutMe: '', currentSituation: '', emotionalState: '' },
    })).toBe(true);

    // 3. The store and the push must carry the new reading.
    const sample = sampleInStore();
    expect({
      title: sample?.title,
      dayTitle: sample?.days[0]?.title,
      scripture: sample?.days[0]?.scriptureReference,
      body: sample?.days[0]?.bodyText,
      queuedTitle: queuedSampleTitle(),
    }).toEqual({
      title: NEW_DAY.title,
      dayTitle: NEW_DAY.title,
      scripture: NEW_DAY.scriptureReference,
      body: NEW_DAY.bodyText,
      queuedTitle: NEW_DAY.title,
    });
    expect(sample?.days[0]?.isRead).toBe(false);

    // 4. A later pull of the old rows does not bring them back.
    applyPulledUserData(serverHoldsOldSample());
    expect(sampleInStore()?.days[0]?.bodyText).toBe(NEW_DAY.bodyText);
  });

  it('keeps the stored sample when the result is no newer than it', () => {
    applyPulledUserData(serverHoldsOldSample());
    const olderResult = { ...NEW_DAY, generatedAt: '2026-10-08T17:00:00.000Z', updatedAt: '2026-10-08T17:00:00.000Z' };

    expect(persistOnboardingFirstReading({ id: SAMPLE_ID, day: olderResult })).toBe(true);

    expect(sampleInStore()?.days[0]?.bodyText).toBe(OLD_DAY.bodyText);
    expect(sampleInStore()?.days[0]?.isRead).toBe(true);
  });

  it('keeps the new first reading when the old server rows arrive after it', () => {
    // A day saved without the server's stamp still carries one of its own.
    const { generatedAt: _generatedAt, updatedAt: _updatedAt, ...unstamped } = NEW_DAY;
    persistOnboardingFirstReading({ id: SAMPLE_ID, day: unstamped });
    applyPulledUserData(serverHoldsOldSample());
    const sample = sampleInStore();
    expect(sample?.title).toBe(NEW_DAY.title);
    expect(sample?.days[0]?.scriptureReference).toBe(NEW_DAY.scriptureReference);
  });

  // The trial retired the sample in the first life, and the app-start pull
  // restores it retired. The new first reading is a new series: live, dated
  // by this onboarding, and kept on Today by the next pull.
  it('brings the new first reading back live when the old sample was retired', () => {
    const retired = { archivedAt: RETIRED_AT, archivedStateAt: RETIRED_AT };
    applyPulledUserData(serverHoldsOldSample(retired));
    expect(sampleInStore()?.archivedAt).toBe(RETIRED_AT);

    persistOnboardingFirstReading({ id: SAMPLE_ID, day: NEW_DAY });

    const sample = sampleInStore();
    expect({
      archivedAt: sample?.archivedAt ?? null,
      resumedAfterRetirement: Date.parse(sample?.archivedStateAt ?? '') > Date.parse(RETIRED_AT),
      createdAt: sample?.createdAt,
      seriesStartDate: sample?.seriesStartDate,
      queuedArchivedAt: queuedSample()?.archivedAt,
      today: today(),
    }).toEqual({
      archivedAt: null,
      resumedAfterRetirement: true,
      createdAt: SECOND_RUN_AT,
      seriesStartDate: SECOND_RUN_AT,
      queuedArchivedAt: null,
      today: SAMPLE_ID,
    });

    applyPulledUserData({ timestamp: SECOND_RUN_AT, changes: {} });
    expect(today()).toBe(SAMPLE_ID);
    applyPulledUserData(serverHoldsOldSample(retired));
    expect(today()).toBe(SAMPLE_ID);
    expect(sampleInStore()?.archivedAt ?? null).toBeNull();
  });

  // The server stamps the job's day with its own clock, and every write here
  // uses this phone's. The reader finishes the reading before the clocks
  // meet, and the celebration saves the same result again.
  it('keeps the read state when the same result is saved again on a phone whose clock runs slow', () => {
    jest.setSystemTime(new Date('2026-10-09T20:30:30.000Z'));

    persistOnboardingFirstReading({ id: SAMPLE_ID, day: NEW_DAY });
    persistOnboardingFirstReading({ id: SAMPLE_ID, day: NEW_DAY });
    useUnfoldStore.getState().markDayAsRead(SAMPLE_ID, 1);
    persistOnboardingFirstReading({
      id: SAMPLE_ID,
      day: NEW_DAY,
      userContext: { name: 'QA', aboutMe: '', currentSituation: '', emotionalState: '' },
    });

    expect(sampleInStore()?.days[0]).toMatchObject({ bodyText: NEW_DAY.bodyText, isRead: true });
  });

  // The server never writes another day of the finished trial, so the
  // app-start pull leaves Today empty and the new first reading takes it.
  it('keeps Today off the trial finished in the first life, so the new first reading takes it', () => {
    applyPulledUserData(serverHoldsFirstLife());
    expect(useUnfoldStore.getState().devotionals.some((row) => row.id === TRIAL_ID)).toBe(true);
    expect(today()).toBeNull();

    persistOnboardingFirstReading({ id: SAMPLE_ID, day: NEW_DAY });

    expect(today()).toBe(SAMPLE_ID);
  });

  it('saves the first reading as before for a new identity the server holds no sample for', () => {
    applyPulledUserData({ timestamp: SECOND_RUN_AT, changes: {} });
    persistOnboardingFirstReading({ id: SAMPLE_ID, day: NEW_DAY });
    const sample = sampleInStore();
    expect(sample?.title).toBe(NEW_DAY.title);
    expect(sample?.days[0]?.scriptureReference).toBe(NEW_DAY.scriptureReference);
    expect(queuedSampleTitle()).toBe(NEW_DAY.title);
  });
});
