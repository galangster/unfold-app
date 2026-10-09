/**
 * A journal change reaches the outbox at once and the store's disk a moment
 * later. A crash in between leaves the outbox ahead of the stored entry: a
 * clock-ahead merge repair, a delete, or a write the v42 migration re-keyed.
 * The next edit builds on the stored entry. Stamped from that older row and
 * this phone's clock, it lost to the queued copy in the outbox, and a later
 * pull put the queued copy's writing back over it.
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
import { mmkvStorage } from '../mmkv-storage';
import { useUnfoldStore } from '../store';
import { enqueueSyncChanges, OUTBOX_KEY, peekSyncOutbox } from '../sync-outbox';

const DEVOTIONAL = 'dev-crash';
const DAY = 2;
const ENTRY_ID = canonicalJournalEntryId(DEVOTIONAL, DAY);
const STORED_AT = '2026-09-01T10:00:00.000Z';
// A merge repair is stamped past the rows it folds, which can be ahead of
// this phone's clock.
const REPAIR_AT = '2099-01-01T00:00:00.000Z';

const MERGED_SOAP = {
  scripture: 'Merged scripture line.',
  observation: 'Merged observation.',
  application: 'Merged application.',
  prayer: 'Merged prayer.',
};
const MERGED_QUESTIONS = [{ question: 'Synthetic question one?', response: 'Merged answer.' }];

function seedStoredEntry() {
  useUnfoldStore.setState({
    devotionals: [
      {
        id: DEVOTIONAL,
        title: 'Synthetic series',
        totalDays: 7,
        currentDay: DAY,
        days: [],
        createdAt: '2026-09-01T08:00:00.000Z',
        updatedAt: '2026-09-01T08:00:00.000Z',
      },
    ],
    journalEntries: [
      {
        id: ENTRY_ID,
        devotionalId: DEVOTIONAL,
        dayNumber: DAY,
        content: 'Older words on disk.',
        journalMode: 'freewrite',
        createdAt: '2026-09-01T08:00:00.000Z',
        updatedAt: STORED_AT,
      },
    ],
  } as never);
}

function queueRepair() {
  enqueueSyncChanges([
    {
      table: 'journal_entries',
      id: ENTRY_ID,
      data: {
        devotionalId: DEVOTIONAL,
        dayNumber: DAY,
        content: 'Merged words from two copies.',
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
const storedEntry = () => useUnfoldStore.getState().journalEntries.find((entry) => entry.id === ENTRY_ID);

beforeEach(() => {
  useUnfoldStore.getState().reset();
  mmkvStorage.removeItem(OUTBOX_KEY);
  seedStoredEntry();
});

describe('a journal edit after a crash left the outbox ahead of the store', () => {
  it('wins over a newer queued repair and keeps the merged fields', () => {
    queueRepair();

    useUnfoldStore.getState().updateJournalEntry(ENTRY_ID, 'Edited after the crash.');

    const queued = queuedEntry();
    expect(queued).toMatchObject({ deleted: false });
    expect(queued?.data.content).toBe('Edited after the crash.');
    expect(queued?.data.soapResponses).toEqual(MERGED_SOAP);
    expect(queued?.data.questionResponses).toEqual(MERGED_QUESTIONS);
    expect(queued?.data.journalMode).toBe('soap');
    expect(queued!.clientUpdatedAt > REPAIR_AT).toBe(true);
    expect(storedEntry()).toMatchObject({
      content: 'Edited after the crash.',
      soapResponses: MERGED_SOAP,
      questionResponses: MERGED_QUESTIONS,
      updatedAt: queued?.clientUpdatedAt,
    });
  });

  it('builds a field edit on the queued copy of the writing', () => {
    queueRepair();

    useUnfoldStore.getState().updateSoapResponse(ENTRY_ID, 'prayer', 'A prayer typed after the crash.');

    const queued = queuedEntry();
    expect(queued?.data.soapResponses).toEqual({ ...MERGED_SOAP, prayer: 'A prayer typed after the crash.' });
    expect(queued?.data.content).toBe('Merged words from two copies.');
    expect(queued!.clientUpdatedAt > REPAIR_AT).toBe(true);
  });

  it('keeps the edit when a later pull brings the server copy of the repair', () => {
    queueRepair();
    useUnfoldStore.getState().updateJournalEntry(ENTRY_ID, 'Edited after the crash.');

    applyPulledUserData({
      changes: {
        journal_entries: [
          {
            id: ENTRY_ID,
            data: {
              id: ENTRY_ID,
              devotionalId: DEVOTIONAL,
              dayNumber: DAY,
              content: 'Merged words from two copies.',
              journalMode: 'soap',
              soapResponses: MERGED_SOAP,
              questionResponses: MERGED_QUESTIONS,
              prayerRequests: null,
              deeperQuestions: null,
              createdAt: '2026-09-01T08:00:00.000Z',
              updatedAt: REPAIR_AT,
              clientUpdatedAt: REPAIR_AT,
              deletedAt: null,
            },
            updatedAt: REPAIR_AT,
            deleted: false,
          },
        ],
      },
      timestamp: REPAIR_AT,
    } as never);

    expect(storedEntry()?.content).toBe('Edited after the crash.');
    expect(queuedEntry()?.data.content).toBe('Edited after the crash.');
  });

  it('goes out live past a newer queued delete', () => {
    enqueueSyncChanges([
      { table: 'journal_entries', id: ENTRY_ID, data: {}, clientUpdatedAt: REPAIR_AT, deleted: true },
    ]);

    useUnfoldStore.getState().updateJournalEntry(ENTRY_ID, 'Edited after the crash.');

    const queued = queuedEntry();
    expect(queued).toMatchObject({ deleted: false });
    expect(queued?.data.content).toBe('Edited after the crash.');
    expect(queued!.clientUpdatedAt > REPAIR_AT).toBe(true);
  });
});
