/**
 * A journal change reaches the outbox at once and the store's disk a moment
 * later. A crash in between leaves the outbox ahead of the stored entry: a
 * plain write, a clock-ahead merge repair, a delete, or a write the v42
 * migration re-keyed. On the next launch every screen loaded its draft from
 * the older row, and each save was built on it and stamped from it. The save
 * replaced the queued writing, or lost to a clock-ahead copy in the outbox,
 * and a later pull put the queued copy back over it.
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

import { applyPulledUserData } from '../full-sync-pull';
import { canonicalJournalEntryId } from '../journal-entry-merge';
import { diffSoapWrites, normalizeSoapResponses } from '../journal-entry-state';
import { mmkvStorage } from '../mmkv-storage';
import { flushUnfoldStorePersist, useUnfoldStore, type JournalEntry, type SoapResponses } from '../store';
import { enqueueSyncChanges, OUTBOX_KEY, peekSyncOutbox } from '../sync-outbox';

const STORE_KEY = 'unfold-storage';
const DEVOTIONAL = 'dev-crash';
const DAY = 2;
const ENTRY_ID = canonicalJournalEntryId(DEVOTIONAL, DAY);
const CREATED_AT = '2026-09-01T08:00:00.000Z';
const STORED_AT = '2026-09-01T10:00:00.000Z';
// A merge repair is stamped past the rows it folds, which can be ahead of
// this phone's clock.
const REPAIR_AT = '2099-01-01T00:00:00.000Z';

const STORED_SOAP: SoapResponses = {
  scripture: 'Stored scripture line.',
  observation: 'Stored observation.',
  application: 'Stored application.',
  prayer: 'Stored prayer.',
};
const MERGED_SOAP: SoapResponses = {
  scripture: 'Merged scripture line.',
  observation: 'Merged observation.',
  application: 'Merged application.',
  prayer: 'Merged prayer.',
};
const MERGED_QUESTIONS = [{ question: 'Synthetic question one?', response: 'Merged answer.' }];
const MERGED_TEXT = 'Older words on disk.\n\nLegacy copy words.';

function seed(entries: Partial<JournalEntry>[]) {
  useUnfoldStore.setState({
    devotionals: [
      {
        id: DEVOTIONAL,
        title: 'Synthetic series',
        totalDays: 7,
        currentDay: DAY,
        days: [],
        createdAt: CREATED_AT,
        updatedAt: CREATED_AT,
      },
    ],
    journalEntries: entries.map((entry) => ({
      id: ENTRY_ID,
      devotionalId: DEVOTIONAL,
      dayNumber: DAY,
      content: '',
      createdAt: CREATED_AT,
      updatedAt: STORED_AT,
      ...entry,
    })),
  } as never);
  flushUnfoldStorePersist();
}

/** The change reaches the outbox, and the app dies before the store reaches disk. */
function crashBeforeTheStoreReachesDisk(change: () => void) {
  flushUnfoldStorePersist();
  const onDisk = mmkvStorage.getItem(STORE_KEY) as string;
  change();
  flushUnfoldStorePersist();
  mmkvStorage.setItem(STORE_KEY, onDisk);
}

const relaunch = () => useUnfoldStore.persist.rehydrate();

function queueRepair() {
  enqueueSyncChanges([
    {
      table: 'journal_entries',
      id: ENTRY_ID,
      data: {
        devotionalId: DEVOTIONAL,
        dayNumber: DAY,
        content: MERGED_TEXT,
        journalMode: 'soap',
        soapResponses: MERGED_SOAP,
        questionResponses: MERGED_QUESTIONS,
      },
      clientUpdatedAt: REPAIR_AT,
      deleted: false,
    },
  ]);
}

const queuedEntry = () => peekSyncOutbox().find(
  (change) => change.table === 'journal_entries' && change.id === ENTRY_ID,
);
const storedEntry = () => useUnfoldStore.getState().getJournalEntry(DEVOTIONAL, DAY);

/** The journal screen's SOAP flush: every field that differs from the live store. */
function flushSoap(local: SoapResponses) {
  for (const { field, value } of diffSoapWrites(local, storedEntry()?.soapResponses)) {
    useUnfoldStore.getState().updateSoapResponse(ENTRY_ID, field, value);
  }
}

function pullServerCopy(data: Record<string, unknown>, at: string) {
  applyPulledUserData({
    changes: {
      journal_entries: [
        {
          id: ENTRY_ID,
          data: {
            id: ENTRY_ID,
            devotionalId: DEVOTIONAL,
            dayNumber: DAY,
            prayerRequests: null,
            deeperQuestions: null,
            createdAt: CREATED_AT,
            updatedAt: at,
            clientUpdatedAt: at,
            deletedAt: null,
            ...data,
          },
          updatedAt: at,
          deleted: false,
        },
      ],
    },
    timestamp: at,
  } as never);
}

beforeEach(() => {
  useUnfoldStore.getState().reset();
  mmkvStorage.removeItem(OUTBOX_KEY);
});

describe('a journal edit after a crash left the outbox ahead of the store', () => {
  it('keeps a SOAP field typed before the crash through two later flushes', async () => {
    seed([{ journalMode: 'soap', soapResponses: STORED_SOAP }]);
    crashBeforeTheStoreReachesDisk(() => {
      useUnfoldStore.getState().updateSoapResponse(ENTRY_ID, 'observation', 'Observation typed before the crash.');
    });
    await relaunch();

    // The screen loads its draft from the store.
    let local = normalizeSoapResponses(storedEntry()?.soapResponses)!;
    expect(local.observation).toBe('Observation typed before the crash.');
    local = { ...local, prayer: 'A prayer typed after the crash.' };
    flushSoap(local);
    local = { ...local, application: 'An application typed after the crash.' };
    flushSoap(local);

    const expected = {
      ...STORED_SOAP,
      observation: 'Observation typed before the crash.',
      application: 'An application typed after the crash.',
      prayer: 'A prayer typed after the crash.',
    };
    expect(storedEntry()?.soapResponses).toEqual(expected);
    expect(queuedEntry()?.data.soapResponses).toEqual(expected);
  });

  it('keeps a clock-ahead repair and the free-write edit made on it, past a later pull', async () => {
    seed([{ content: 'Older words on disk.', journalMode: 'freewrite' }]);
    crashBeforeTheStoreReachesDisk(queueRepair);
    await relaunch();

    const loaded = storedEntry()?.content;
    expect(loaded).toBe(MERGED_TEXT);
    useUnfoldStore.getState().updateJournalEntry(ENTRY_ID, `${loaded} And more.`);

    const queued = queuedEntry();
    expect(queued).toMatchObject({ deleted: false });
    expect(queued?.data).toMatchObject({
      content: `${MERGED_TEXT} And more.`,
      journalMode: 'soap',
      soapResponses: MERGED_SOAP,
      questionResponses: MERGED_QUESTIONS,
    });
    expect(queued!.clientUpdatedAt > REPAIR_AT).toBe(true);
    expect(storedEntry()).toMatchObject({
      content: `${MERGED_TEXT} And more.`,
      createdAt: CREATED_AT,
      updatedAt: queued?.clientUpdatedAt,
    });

    pullServerCopy({
      content: MERGED_TEXT,
      journalMode: 'soap',
      soapResponses: MERGED_SOAP,
      questionResponses: MERGED_QUESTIONS,
    }, REPAIR_AT);

    expect(storedEntry()?.content).toBe(`${MERGED_TEXT} And more.`);
    expect(queuedEntry()?.data.content).toBe(`${MERGED_TEXT} And more.`);
  });

  it('flips a prayer from the state the reader saw before the crash', async () => {
    seed([{
      prayerRequests: [{ id: 'prayer-1', text: 'A synthetic prayer.', isAnswered: false, createdAt: CREATED_AT }],
    }]);
    crashBeforeTheStoreReachesDisk(() => {
      useUnfoldStore.getState().togglePrayerAnswered(ENTRY_ID, 'prayer-1');
    });
    await relaunch();

    expect(storedEntry()?.prayerRequests?.[0]?.isAnswered).toBe(true);
    useUnfoldStore.getState().togglePrayerAnswered(ENTRY_ID, 'prayer-1');

    expect(storedEntry()?.prayerRequests?.[0]?.isAnswered).toBe(false);
    const queuedPrayers = queuedEntry()?.data.prayerRequests as { isAnswered: boolean }[];
    expect(queuedPrayers[0]?.isAnswered).toBe(false);
  });

  it("keeps a new day's words when the day is opened again", async () => {
    seed([]);
    crashBeforeTheStoreReachesDisk(() => {
      useUnfoldStore.getState().addJournalEntry({
        devotionalId: DEVOTIONAL, dayNumber: DAY, content: 'Words written before the crash.', journalMode: 'freewrite',
      });
    });
    await relaunch();

    expect(storedEntry()?.content).toBe('Words written before the crash.');
    // The SOAP screen makes sure the day has an entry, then saves a field.
    const id = useUnfoldStore.getState().addJournalEntry({
      devotionalId: DEVOTIONAL, dayNumber: DAY, content: '', journalMode: 'soap',
    });
    useUnfoldStore.getState().updateSoapResponse(id, 'prayer', 'A prayer typed after the crash.');

    expect(id).toBe(ENTRY_ID);
    expect(queuedEntry()?.data.content).toBe('Words written before the crash.');
    expect(storedEntry()?.content).toBe('Words written before the crash.');
    expect(storedEntry()?.soapResponses?.prayer).toBe('A prayer typed after the crash.');
  });

  it('keeps a stored row that is newer than its queued copy', async () => {
    seed([{ content: 'Newer words on disk.', updatedAt: STORED_AT }]);
    crashBeforeTheStoreReachesDisk(() => {
      enqueueSyncChanges([{
        table: 'journal_entries',
        id: ENTRY_ID,
        data: { devotionalId: DEVOTIONAL, dayNumber: DAY, content: 'Older queued words.' },
        clientUpdatedAt: '2026-09-01T09:00:00.000Z',
        deleted: false,
      }]);
    });
    await relaunch();

    expect(storedEntry()?.content).toBe('Newer words on disk.');
  });

  it('goes out live past a newer queued delete', async () => {
    seed([{ content: 'Older words on disk.' }]);
    crashBeforeTheStoreReachesDisk(() => {
      enqueueSyncChanges([
        { table: 'journal_entries', id: ENTRY_ID, data: {}, clientUpdatedAt: REPAIR_AT, deleted: true },
      ]);
    });
    await relaunch();

    useUnfoldStore.getState().updateJournalEntry(ENTRY_ID, 'Edited after the crash.');

    const queued = queuedEntry();
    expect(queued).toMatchObject({ deleted: false });
    expect(queued?.data.content).toBe('Edited after the crash.');
    expect(queued!.clientUpdatedAt > REPAIR_AT).toBe(true);
  });

  it("sends a new day's first words past a newer queued delete", async () => {
    seed([]);
    crashBeforeTheStoreReachesDisk(() => {
      enqueueSyncChanges([
        { table: 'journal_entries', id: ENTRY_ID, data: {}, clientUpdatedAt: REPAIR_AT, deleted: true },
      ]);
    });
    await relaunch();

    useUnfoldStore.getState().addJournalEntry({
      devotionalId: DEVOTIONAL, dayNumber: DAY, content: 'First words after the crash.', journalMode: 'freewrite',
    });

    const queued = queuedEntry();
    expect(queued).toMatchObject({ deleted: false });
    expect(queued?.data.content).toBe('First words after the crash.');
    expect(queued!.clientUpdatedAt > REPAIR_AT).toBe(true);
    expect(storedEntry()?.updatedAt).toBe(queued?.clientUpdatedAt);
  });
});
