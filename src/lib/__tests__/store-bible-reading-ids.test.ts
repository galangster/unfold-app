jest.mock('../bug-logger', () => ({
  logBugError: jest.fn(),
}));

jest.mock('../mmkv-storage', () => {
  const mockMmkv = new Map<string, string>();
  const mockDevice = { id: '11111111-1111-4111-8111-111111111111' };
  (globalThis as typeof globalThis & {
    __brel3MockMmkv: Map<string, string>;
    __brel3MockDevice: { id: string };
  }).__brel3MockMmkv = mockMmkv;
  (globalThis as typeof globalThis & {
    __brel3MockDevice: { id: string };
  }).__brel3MockDevice = mockDevice;
  return {
    mmkvStorage: {
      getItem: jest.fn((key: string) => mockMmkv.get(key) ?? null),
      setItem: jest.fn((key: string, value: string) => {
        mockMmkv.set(key, value);
      }),
      removeItem: jest.fn((key: string) => {
        mockMmkv.delete(key);
      }),
    },
    getDeviceId: jest.fn(() => mockDevice.id),
    getSharedEncryptionKey: jest.fn(() => 'test-key'),
    isRecoverySession: jest.fn(() => false),
  };
});

import { useUnfoldStore } from '../store';
import { peekSyncOutbox, replaceSyncOutbox } from '../sync-outbox';

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function mocks() {
  return globalThis as typeof globalThis & {
    __brel3MockMmkv: Map<string, string>;
    __brel3MockDevice: { id: string };
  };
}

function read(bookId: number, chapter: number, translation = 'KJV') {
  useUnfoldStore.getState().recordBibleReading({
    bookId,
    bookName: 'Genesis',
    chapter,
    translation,
  });
}

describe('recordBibleReading unique ids', () => {
  beforeEach(() => {
    mocks().__brel3MockMmkv.clear();
    replaceSyncOutbox([]);
    mocks().__brel3MockDevice.id = '11111111-1111-4111-8111-111111111111';
    useUnfoldStore.getState().reset();
  });

  it('gives two identities different ids for the same book and chapter', () => {
    read(1, 1);
    const first = useUnfoldStore.getState().bibleReadingHistory[0];

    useUnfoldStore.getState().reset();
    replaceSyncOutbox([]);
    read(1, 1);
    const second = useUnfoldStore.getState().bibleReadingHistory[0];

    expect(first.id).toMatch(UUID_V4);
    expect(second.id).toMatch(UUID_V4);
    expect(first.id).not.toBe(second.id);
    expect(first.id).not.toBe('brp_1_1_KJV');
  });

  it('reuses one stable id and one pending row for a repeated chapter', () => {
    read(1, 1);
    const first = useUnfoldStore.getState().bibleReadingHistory[0];
    read(1, 1);
    const history = useUnfoldStore.getState().bibleReadingHistory;
    const queued = peekSyncOutbox().filter((change) => change.table === 'bible_reading_positions');

    expect(history).toHaveLength(1);
    expect(history[0].id).toBe(first.id);
    expect(history[0].id).toMatch(UUID_V4);
    expect(queued).toHaveLength(1);
    expect(queued[0].id).toBe(first.id);

    read(1, 2);
    const next = useUnfoldStore.getState().bibleReadingHistory;
    expect(next).toHaveLength(2);
    expect(next[0].chapter).toBe(2);
    expect(next[0].id).not.toBe(first.id);
    expect(next[0].id).toMatch(UUID_V4);
    expect(next[1].id).toBe(first.id);
    expect(peekSyncOutbox().filter((change) => change.table === 'bible_reading_positions')).toHaveLength(2);
  });

  it('keeps chapter history and newest-first order', () => {
    read(1, 1);
    read(1, 2);
    read(43, 3, 'BSB');
    const history = useUnfoldStore.getState().bibleReadingHistory;
    expect(history.map((row) => `${row.bookId}:${row.chapter}`)).toEqual(['43:3', '1:2', '1:1']);
    expect(new Set(history.map((row) => row.id)).size).toBe(3);
  });

  it('retains an already unique id and still enqueues that id', () => {
    const kept = 'aaaaaaaa-1111-4111-8111-111111111111';
    useUnfoldStore.getState().recordBibleReading({
      id: kept,
      bookId: 1,
      bookName: 'Genesis',
      chapter: 1,
      translation: 'KJV',
    });
    expect(useUnfoldStore.getState().bibleReadingHistory[0].id).toBe(kept);
    expect(peekSyncOutbox()).toEqual([
      expect.objectContaining({ table: 'bible_reading_positions', id: kept }),
    ]);
  });

  it('does not enqueue under an ephemeral recovery identity', () => {
    mocks().__brel3MockDevice.id = 'ephemeral-recovery-uuid';
    read(1, 1);
    const row = useUnfoldStore.getState().bibleReadingHistory[0];
    expect(row?.id).toMatch(UUID_V4);
    expect(row?.id?.startsWith('ephemeral-')).toBe(false);
    expect(peekSyncOutbox()).toEqual([]);
  });
});
