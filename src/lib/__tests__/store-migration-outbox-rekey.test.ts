/**
 * The v41→42 migration re-keys journal entries by day inside the persisted
 * store blob. Pending writes for those entries live somewhere else — the sync
 * outbox, under its own MMKV key — so without a matching re-key the next drain
 * pushes them under their old random ids and the next pull brings those rows
 * back as duplicates of the day the migration just merged.
 */
jest.mock('../mmkv-storage', () => {
  const store = new Map<string, string>();
  return {
    mmkvStorage: {
      getItem: jest.fn((key: string) => store.get(key) ?? null),
      setItem: jest.fn((key: string, value: string) => store.set(key, value)),
      removeItem: jest.fn((key: string) => store.delete(key)),
    },
    getDeviceId: jest.fn(() => 'device-1'),
    getSharedEncryptionKey: jest.fn(() => 'test-key'),
    isRecoverySession: jest.fn(() => false),
    isEphemeralDeviceId: jest.fn(() => false),
  };
});

import { migrateUnfoldStore } from '../store-migrations';
import { compositeId } from '../sync-ids';
import { OUTBOX_KEY, peekSyncOutbox, replaceSyncOutbox } from '../sync-outbox';
import { mmkvStorage } from '../mmkv-storage';

const DEVOTIONAL = 'dev-1';
const CANONICAL = compositeId(DEVOTIONAL, 2);

function queuedJournalWrite(id: string, content: string, clientUpdatedAt: string) {
  return {
    table: 'journal_entries' as const,
    id,
    data: { devotionalId: DEVOTIONAL, dayNumber: 2, content },
    clientUpdatedAt,
    deleted: false,
  };
}

function persistedState(entryIds: string[]) {
  return {
    journalEntries: entryIds.map((id, index) => ({
      id,
      devotionalId: DEVOTIONAL,
      dayNumber: 2,
      content: `Entry ${index}`,
      journalMode: 'freewrite',
      createdAt: '2026-09-01T08:00:00.000Z',
      updatedAt: `2026-09-01T0${8 + index}:00:00.000Z`,
    })),
  };
}

beforeEach(() => {
  mmkvStorage.removeItem(OUTBOX_KEY);
});

describe('v41→42 re-keys queued journal writes', () => {
  it('rewrites a queued write from its legacy id to the day id the migration used', () => {
    replaceSyncOutbox([queuedJournalWrite('journal_legacy', 'Unsynced text.', '2026-09-01T09:00:00.000Z')]);

    migrateUnfoldStore(persistedState(['journal_legacy']), 41);

    const queued = peekSyncOutbox();
    expect(queued).toHaveLength(1);
    expect(queued[0].id).toBe(CANONICAL);
    expect(queued[0].data).toMatchObject({ content: 'Unsynced text.' });
  });

  it('collapses two queued writes for one day to the newest', () => {
    replaceSyncOutbox([
      queuedJournalWrite('journal_a', 'Older.', '2026-09-01T09:00:00.000Z'),
      queuedJournalWrite('journal_b', 'Newer.', '2026-09-01T09:30:00.000Z'),
    ]);

    migrateUnfoldStore(persistedState(['journal_a', 'journal_b']), 41);

    const queued = peekSyncOutbox().filter((change) => change.table === 'journal_entries');
    expect(queued).toHaveLength(1);
    expect(queued[0].id).toBe(CANONICAL);
    expect(queued[0].data).toMatchObject({ content: 'Newer.' });
  });

  it('leaves other tables and already-canonical writes alone', () => {
    const note = {
      table: 'notes' as const,
      id: 'note_1',
      data: { title: 'Kept' },
      clientUpdatedAt: '2026-09-01T09:00:00.000Z',
      deleted: false,
    };
    replaceSyncOutbox([note, queuedJournalWrite(CANONICAL, 'Already keyed.', '2026-09-01T09:00:00.000Z')]);

    migrateUnfoldStore(persistedState([CANONICAL]), 41);

    const queued = peekSyncOutbox();
    expect(queued).toHaveLength(2);
    expect(queued.find((change) => change.table === 'notes')).toMatchObject({ id: 'note_1' });
    expect(queued.find((change) => change.table === 'journal_entries')).toMatchObject({ id: CANONICAL });
  });
});
