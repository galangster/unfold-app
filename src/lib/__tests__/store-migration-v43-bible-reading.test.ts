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

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const KEPT = 'bbbbbbbb-2222-4222-8222-222222222222';

function position(
  overrides: Record<string, unknown>,
) {
  return {
    bookId: 1,
    bookName: 'Genesis',
    chapter: 1,
    translation: 'KJV',
    lastReadAt: '2026-09-01T08:00:00.000Z',
    updatedAt: '2026-09-01T08:00:00.000Z',
    ...overrides,
  };
}

function queuedWrite(id: string, data: Record<string, unknown>, clientUpdatedAt = '2026-09-01T09:00:00.000Z') {
  return {
    table: 'bible_reading_positions' as const,
    id,
    data,
    clientUpdatedAt,
    deleted: false,
  };
}

beforeEach(() => {
  mmkvStorage.removeItem(OUTBOX_KEY);
});

describe('v42→43 bible reading ids', () => {
  it('converts colliding local ids, keeps unique ids, and preserves chapter order', () => {
    const v5 = compositeId(1, 'KJV');
    const state = {
      bibleReadingHistory: [
        position({ id: 'brp_43_3_BSB', bookId: 43, chapter: 3, translation: 'BSB', lastReadAt: '2026-09-01T10:00:00.000Z' }),
        position({ id: v5, chapter: 2, lastReadAt: '2026-09-01T09:00:00.000Z' }),
        position({ id: KEPT, chapter: 1 }),
        position({ bookId: 2, chapter: 1, translation: 'KJV' }),
      ],
    };

    const migrated = migrateUnfoldStore(state, 42) as { bibleReadingHistory: Array<{ id?: string; bookId: number; chapter: number }> };
    const history = migrated.bibleReadingHistory;

    expect(history.map((row) => `${row.bookId}:${row.chapter}`)).toEqual(['43:3', '1:2', '1:1', '2:1']);
    expect(history[2].id).toBe(KEPT);
    expect(history[0].id).toMatch(UUID_V4);
    expect(history[1].id).toMatch(UUID_V4);
    expect(history[3].id).toMatch(UUID_V4);
    expect(history[0].id).not.toBe('brp_43_3_BSB');
    expect(history[1].id).not.toBe(v5);
    expect(new Set(history.map((row) => row.id)).size).toBe(4);

    const ids = history.map((row) => row.id);
    const clone = () => JSON.parse(JSON.stringify(migrated)) as { bibleReadingHistory: Array<{ id?: string }> };
    const idsOf = (state: { bibleReadingHistory: Array<{ id?: string }> }) =>
      state.bibleReadingHistory.map((row) => row.id);
    expect(idsOf(migrateUnfoldStore(clone(), 43) as { bibleReadingHistory: Array<{ id?: string }> })).toEqual(ids);
    expect(idsOf(migrateUnfoldStore(clone(), 42) as { bibleReadingHistory: Array<{ id?: string }> })).toEqual(ids);
  });

  it('gives two v28 chapters that shared one compositeId distinct ids and maps the queued chapter', () => {
    const v5 = compositeId(1, 'KJV');
    replaceSyncOutbox([
      queuedWrite(v5, { bookId: 1, chapter: 2, translation: 'KJV' }),
      {
        table: 'bible_reading_positions',
        id: v5,
        data: {},
        clientUpdatedAt: '2026-09-01T08:00:00.000Z',
        deleted: true,
      },
    ]);

    const migrated = migrateUnfoldStore({
      bibleReadingHistory: [
        position({ id: v5, chapter: 2, lastReadAt: '2026-09-01T09:00:00.000Z' }),
        position({ id: v5, chapter: 1 }),
      ],
    }, 42) as { bibleReadingHistory: Array<{ id: string; chapter: number }> };

    const chapter2 = migrated.bibleReadingHistory.find((row) => row.chapter === 2);
    const chapter1 = migrated.bibleReadingHistory.find((row) => row.chapter === 1);
    expect(chapter2?.id).toMatch(UUID_V4);
    expect(chapter1?.id).toMatch(UUID_V4);
    expect(chapter2?.id).not.toBe(chapter1?.id);
    expect(chapter2?.id).not.toBe(v5);

    const queued = peekSyncOutbox();
    const write = queued.find((change) => !change.deleted);
    const tombstone = queued.find((change) => change.deleted);
    expect(write?.id).toBe(chapter2?.id);
    expect(tombstone?.id).toBe(v5);
  });

  it('re-keys a matching queued write to the same new id and leaves tombstones', () => {
    const legacy = 'brp_1_1_KJV';
    replaceSyncOutbox([
      queuedWrite(legacy, { bookId: 1, chapter: 1, translation: 'KJV', lastReadAt: '2026-09-01T09:00:00.000Z' }),
      {
        table: 'bible_reading_positions',
        id: legacy,
        data: {},
        clientUpdatedAt: '2026-09-01T08:00:00.000Z',
        deleted: true,
      },
    ]);

    const migrated = migrateUnfoldStore({
      bibleReadingHistory: [position({ id: legacy })],
    }, 42) as { bibleReadingHistory: Array<{ id: string }> };

    const queued = peekSyncOutbox();
    const write = queued.find((change) => !change.deleted);
    const tombstone = queued.find((change) => change.deleted);
    expect(migrated.bibleReadingHistory[0].id).toMatch(UUID_V4);
    expect(write?.id).toBe(migrated.bibleReadingHistory[0].id);
    expect(tombstone?.id).toBe(legacy);
  });

  it('converts a v28 missing-translation fallback and matches an explicit-BSB queued write', () => {
    const fallback = compositeId(1, 'BSB');
    replaceSyncOutbox([
      queuedWrite(fallback, { bookId: 1, chapter: 1, translation: 'BSB' }),
    ]);

    const migrated = migrateUnfoldStore({
      bibleReadingHistory: [{
        bookId: 1,
        bookName: 'Genesis',
        chapter: 1,
        lastReadAt: '2026-09-01T08:00:00.000Z',
      }],
    }, 28) as { bibleReadingHistory: Array<{ id: string; chapter: number }> };

    expect(migrated.bibleReadingHistory[0].id).toMatch(UUID_V4);
    expect(migrated.bibleReadingHistory[0].id).not.toBe(fallback);
    expect(peekSyncOutbox()).toEqual([
      expect.objectContaining({ id: migrated.bibleReadingHistory[0].id, deleted: false }),
    ]);
  });

  it('converts a v42 stored BSB fallback without translation and matches an explicit-BSB queued write', () => {
    const fallback = compositeId(1, 'BSB');
    replaceSyncOutbox([
      queuedWrite(fallback, { bookId: 1, chapter: 1, translation: 'BSB' }),
    ]);

    const migrated = migrateUnfoldStore({
      bibleReadingHistory: [{
        id: fallback,
        bookId: 1,
        chapter: 1,
        lastReadAt: '2026-09-01T08:00:00.000Z',
      }],
    }, 42) as { bibleReadingHistory: Array<{ id: string; chapter: number }> };

    expect(migrated.bibleReadingHistory[0].id).toMatch(UUID_V4);
    expect(migrated.bibleReadingHistory[0].id).not.toBe(fallback);
    expect(peekSyncOutbox()).toEqual([
      expect.objectContaining({ id: migrated.bibleReadingHistory[0].id, deleted: false }),
    ]);
  });

  it('assigns a queued-only colliding write so it can still drain', () => {
    replaceSyncOutbox([
      queuedWrite('brp_19_23_KJV', { bookId: 19, chapter: 23, translation: 'KJV' }),
    ]);

    migrateUnfoldStore({ bibleReadingHistory: [] }, 42);

    const queued = peekSyncOutbox();
    expect(queued).toHaveLength(1);
    expect(queued[0].id).toMatch(UUID_V4);
    expect(queued[0].id).not.toBe('brp_19_23_KJV');
    expect(queued[0].data).toMatchObject({ bookId: 19, chapter: 23 });
  });
});
