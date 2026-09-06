import type { BibleReadingPosition } from '../store';

jest.mock('../api-config', () => ({
  PRIMARY_BACKEND_URL: 'https://example.test',
  getAuthHeaders: jest.fn(async () => ({ 'Content-Type': 'application/json' })),
}));

jest.mock('@react-native-community/netinfo', () => ({
  addEventListener: jest.fn(() => jest.fn()),
}));

jest.mock('../bug-logger', () => ({
  logBugError: jest.fn(),
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

const { useUnfoldStore } = jest.requireActual('../store') as typeof import('../store');
const { applyPulledUserData, applyServerConflictRecords } = jest.requireActual('../full-sync-pull') as typeof import('../full-sync-pull');
const { peekSyncOutbox, replaceSyncOutbox } = jest.requireActual('../sync-outbox') as typeof import('../sync-outbox');

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const T0 = '2026-09-05T00:00:00.000Z';
const T1 = '2026-09-05T01:00:00.000Z';
const T2 = '2026-09-05T02:00:00.000Z';

function position(
  id: string,
  chapter: number,
  at: string,
  extras: Partial<BibleReadingPosition> = {},
): BibleReadingPosition {
  return {
    id,
    bookId: 1,
    bookName: 'Genesis',
    chapter,
    translation: 'KJV',
    lastReadAt: at,
    updatedAt: at,
    ...extras,
  };
}

function pulled(
  id: string,
  chapter: number,
  at: string,
  extras: Record<string, unknown> = {},
) {
  return {
    id,
    updatedAt: at,
    deleted: false,
    data: {
      id,
      bookId: 1,
      bookName: 'Genesis',
      chapter,
      translation: 'KJV',
      lastReadAt: at,
      clientUpdatedAt: at,
      ...extras,
    },
  };
}

function applyPull(id: string, chapter: number, at = T1, extras: Record<string, unknown> = {}) {
  applyPulledUserData({
    timestamp: at,
    changes: { bible_reading_positions: [pulled(id, chapter, at, extras)] },
  });
}

function history() {
  return useUnfoldStore.getState().bibleReadingHistory.map((row) => ({
    id: row.id,
    chapter: row.chapter,
    translation: row.translation,
  }));
}

beforeEach(() => {
  replaceSyncOutbox([]);
  useUnfoldStore.getState().reset();
});

describe('bible reading pull history', () => {
  it('coalesces the same chapter when local and server ids differ', () => {
    useUnfoldStore.setState({ bibleReadingHistory: [position('local-uuid', 2, T0)] });
    applyServerConflictRecords([{
      table: 'bible_reading_positions',
      id: 'server-canonical',
      status: 'conflict',
      serverUpdatedAt: T1,
      serverData: { ...position('server-canonical', 2, T1), clientUpdatedAt: T1 },
    }]);
    expect(history()).toEqual([{ id: 'server-canonical', chapter: 2, translation: 'KJV' }]);
  });

  it('keeps the prior chapter when the same server id advances', () => {
    useUnfoldStore.setState({ bibleReadingHistory: [position('server-canonical', 1, T0)] });
    applyServerConflictRecords([{
      table: 'bible_reading_positions',
      id: 'server-canonical',
      status: 'conflict',
      serverUpdatedAt: T1,
      serverData: { ...position('server-canonical', 2, T1), clientUpdatedAt: T1 },
    }]);
    expect(history()).toEqual([
      { id: 'server-canonical', chapter: 2, translation: 'KJV' },
      expect.objectContaining({ chapter: 1, translation: 'KJV' }),
    ]);
    expect(history()[1].id).toMatch(UUID_V4);
    expect(history()[1].id).not.toBe('server-canonical');
  });

  it('protects newer pending chapter work under a different id', () => {
    useUnfoldStore.setState({ bibleReadingHistory: [position('local-uuid', 2, T2)] });
    replaceSyncOutbox([{
      table: 'bible_reading_positions',
      id: 'local-uuid',
      clientUpdatedAt: T2,
      deleted: false,
      data: { bookId: 1, chapter: 2, translation: 'KJV' },
    }]);
    applyPull('server-canonical', 2, T1);
    expect(history()).toEqual([{ id: 'local-uuid', chapter: 2, translation: 'KJV' }]);
    expect(peekSyncOutbox()).toEqual([
      expect.objectContaining({ id: 'local-uuid', clientUpdatedAt: T2 }),
    ]);
  });

  it('keeps different-chapter translations and coalesces the same chapter', () => {
    useUnfoldStore.setState({
      bibleReadingHistory: [position('local-bsb-3', 3, T0, { translation: 'BSB', bookName: 'Genesis' })],
    });
    applyPull('server-kjv-2', 2, T1);
    expect(history()).toEqual([
      { id: 'server-kjv-2', chapter: 2, translation: 'KJV' },
      { id: 'local-bsb-3', chapter: 3, translation: 'BSB' },
    ]);

    applyPulledUserData({
      timestamp: T2,
      changes: {
        bible_reading_positions: [pulled('server-bsb-2', 2, T2, { translation: 'BSB' })],
      },
    });
    expect(history()).toEqual([
      { id: 'server-bsb-2', chapter: 2, translation: 'BSB' },
      { id: 'local-bsb-3', chapter: 3, translation: 'BSB' },
    ]);
  });

  it('removes only the tombstoned id', () => {
    useUnfoldStore.setState({
      bibleReadingHistory: [
        position('server-canonical', 2, T1),
        position('kept-chapter-1', 1, T0),
      ],
    });
    applyPulledUserData({
      timestamp: T2,
      changes: {
        bible_reading_positions: [{
          id: 'server-canonical',
          updatedAt: T2,
          deleted: true,
          data: { clientUpdatedAt: T2 },
        }],
      },
    });
    expect(history()).toEqual([{ id: 'kept-chapter-1', chapter: 1, translation: 'KJV' }]);
  });

  it('accepts a fresh current pointer and stays stable on repeat pulls', () => {
    applyPull('server-canonical', 2, T1);
    expect(history()).toEqual([{ id: 'server-canonical', chapter: 2, translation: 'KJV' }]);
    applyPull('server-canonical', 2, T1);
    expect(history()).toEqual([{ id: 'server-canonical', chapter: 2, translation: 'KJV' }]);

    useUnfoldStore.setState({ bibleReadingHistory: [position('server-canonical', 1, T0)] });
    applyPull('server-canonical', 2, T1);
    const firstAdvance = history();
    applyPull('server-canonical', 2, T1);
    expect(history()).toEqual(firstAdvance);
    expect(firstAdvance).toHaveLength(2);
    expect(firstAdvance[0]).toEqual({ id: 'server-canonical', chapter: 2, translation: 'KJV' });
    expect(firstAdvance[1].id).not.toBe('server-canonical');
  });

  it('keeps newer destination chapter content when a canonical-id row is older', () => {
    useUnfoldStore.setState({
      bibleReadingHistory: [
        position('local', 2, T2, { translation: 'BSB' }),
        position('canonical', 1, T0),
      ],
    });
    applyPull('canonical', 2, T1);
    const rows = useUnfoldStore.getState().bibleReadingHistory;
    expect(rows.find((row) => row.chapter === 2)).toEqual(
      expect.objectContaining({ id: 'local', translation: 'BSB', updatedAt: T2 }),
    );
    expect(rows.some((row) => row.chapter === 1)).toBe(true);
    expect(peekSyncOutbox()).toEqual([]);
  });

  it('preserves every distinct chapter that shared the incoming canonical id', () => {
    useUnfoldStore.setState({
      bibleReadingHistory: [
        position('canonical', 3, T0),
        position('canonical', 1, T0),
      ],
    });
    applyPull('canonical', 2, T1);
    const rows = useUnfoldStore.getState().bibleReadingHistory;
    expect([1, 2, 3].every((chapter) => rows.some((row) => row.chapter === chapter))).toBe(true);
    expect(new Set(rows.map((row) => row.id)).size).toBe(3);
    expect(rows.find((row) => row.chapter === 2)?.id).toBe('canonical');
  });

  it('coalesces a displaced chapter into its newer existing row', () => {
    useUnfoldStore.setState({
      bibleReadingHistory: [
        position('local', 1, T2, { translation: 'BSB' }),
        position('canonical', 1, T0),
      ],
    });
    applyPull('canonical', 2, T1);
    const rows = useUnfoldStore.getState().bibleReadingHistory;
    const chapter1 = rows.filter((row) => row.chapter === 1);
    expect(chapter1).toHaveLength(1);
    expect(chapter1[0]).toEqual(expect.objectContaining({
      id: 'local',
      translation: 'BSB',
      updatedAt: T2,
    }));
    expect(rows.some((row) => row.chapter === 2 && row.id === 'canonical')).toBe(true);
  });

  it('keeps a more recently read unrelated chapter ahead of an older server pointer', () => {
    useUnfoldStore.setState({
      bibleReadingHistory: [
        position('local', 3, T2),
        position('canonical', 1, T0),
      ],
    });
    applyPull('canonical', 2, T1);
    expect(useUnfoldStore.getState().bibleReadingHistory[0]).toEqual(
      expect.objectContaining({ id: 'local', chapter: 3 }),
    );
  });

  it('adopts the server id on an agreeing equal-clock remap without changing content', () => {
    useUnfoldStore.setState({ bibleReadingHistory: [position('local', 2, T1)] });
    applyPull('canonical', 2, T1);
    expect(useUnfoldStore.getState().bibleReadingHistory).toEqual([
      expect.objectContaining({
        id: 'canonical',
        chapter: 2,
        translation: 'KJV',
        lastReadAt: T1,
        updatedAt: T1,
      }),
    ]);
  });

  it('keeps the local equal-clock payload when translations differ', () => {
    useUnfoldStore.setState({
      bibleReadingHistory: [
        position('local', 2, T1, { translation: 'BSB' }),
        position('canonical', 1, T0),
      ],
    });
    applyPull('canonical', 2, T1);
    const rows = useUnfoldStore.getState().bibleReadingHistory;
    expect(rows.filter((row) => row.chapter === 2)).toEqual([
      expect.objectContaining({ id: 'local', translation: 'BSB', updatedAt: T1 }),
    ]);
    expect(rows.some((row) => row.chapter === 1)).toBe(true);
  });

  it('does not rewrite the outbox when a differing-id pending chapter wins', () => {
    const queued = [{
      table: 'bible_reading_positions' as const,
      id: 'local',
      clientUpdatedAt: T2,
      deleted: false,
      data: { bookId: 1, chapter: 2, translation: 'KJV' },
    }];
    useUnfoldStore.setState({
      bibleReadingHistory: [
        position('local', 2, T2),
        position('canonical', 1, T0),
      ],
    });
    replaceSyncOutbox(queued);
    applyPull('canonical', 2, T1);
    expect(history().find((row) => row.chapter === 2)).toEqual({
      id: 'local',
      chapter: 2,
      translation: 'KJV',
    });
    expect(peekSyncOutbox()).toEqual(queued);
  });

  it('does not remint or reorder a repeated identical pull', () => {
    useUnfoldStore.setState({ bibleReadingHistory: [position('canonical', 1, T0)] });
    applyPull('canonical', 2, T1);
    const first = useUnfoldStore.getState().bibleReadingHistory.map((row) => ({ ...row }));
    applyPull('canonical', 2, T1);
    expect(useUnfoldStore.getState().bibleReadingHistory).toEqual(first);
    expect(new Set(first.map((row) => row.id)).size).toBe(first.length);
  });

  it('does not let an older incoming canonical record steal the ID from a newer canonical chapter', () => {
    useUnfoldStore.setState({
      bibleReadingHistory: [
        position('canonical', 2, T2),
        position('local', 1, T1),
      ],
    });
    applyPull('canonical', 1, T1);
    const rows = useUnfoldStore.getState().bibleReadingHistory;
    expect(rows.find((row) => row.chapter === 2)).toEqual(
      expect.objectContaining({ id: 'canonical', updatedAt: T2 }),
    );
    expect(rows.some((row) => row.chapter === 1)).toBe(true);
    expect(peekSyncOutbox()).toEqual([]);
  });

  it('rejects a stale pointer when a later duplicate-ID row is newer', () => {
    useUnfoldStore.setState({
      bibleReadingHistory: [
        position('canonical', 1, T0),
        position('canonical', 3, T2),
      ],
    });
    applyPull('canonical', 2, T1);
    const rows = useUnfoldStore.getState().bibleReadingHistory;
    expect(rows.some((row) => row.id === 'canonical' && row.chapter === 3 && row.updatedAt === T2)).toBe(true);
    expect(rows.some((row) => row.chapter === 2)).toBe(false);
    expect(peekSyncOutbox()).toEqual([]);
  });

  it('rejects a stale tombstone when a later same-ID row is newer', () => {
    useUnfoldStore.setState({
      bibleReadingHistory: [
        position('canonical', 1, T0),
        position('canonical', 3, T2),
      ],
    });
    applyPulledUserData({
      timestamp: T1,
      changes: {
        bible_reading_positions: [{
          id: 'canonical',
          updatedAt: T1,
          deleted: true,
          data: { clientUpdatedAt: T1 },
        }],
      },
    });
    const rows = useUnfoldStore.getState().bibleReadingHistory;
    expect(rows.some((row) => row.chapter === 3 && row.updatedAt === T2)).toBe(true);
    expect(rows.some((row) => row.chapter === 1)).toBe(true);
    expect(peekSyncOutbox()).toEqual([]);
  });

  it('keeps newest-first order and the 100-entry limit when preserving a chapter', () => {
    const older = Array.from({ length: 100 }, (_, index) => (
      position(`old-${index + 3}`, index + 3, T0)
    ));
    useUnfoldStore.setState({
      bibleReadingHistory: [position('server-canonical', 1, T0), ...older],
    });
    applyPull('server-canonical', 2, T1);
    const rows = useUnfoldStore.getState().bibleReadingHistory;
    expect(rows).toHaveLength(100);
    expect(rows[0]).toEqual(expect.objectContaining({ id: 'server-canonical', chapter: 2 }));
    expect(rows[1]).toEqual(expect.objectContaining({ chapter: 1 }));
    expect(rows[1].id).not.toBe('server-canonical');
    expect(rows.some((row) => row.chapter === 102)).toBe(false);
  });
});
