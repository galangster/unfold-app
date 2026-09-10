/**
 * A push `conflict` means the server kept its (newer) version and dropped
 * ours; the result carries that version as `serverData`. The outbox used to
 * clear the entry and ignore serverData, and because the conflicted row's
 * updated_at never moved, the incremental pull never brought it down either:
 * device A kept A's text, the server and device B kept B's, permanently.
 * Conflicts now go through the pull mappers with the same LWW guard.
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
}));

jest.mock('../sync-ids', () => ({
  newId: jest.fn(() => `test-id-${Math.random().toString(36).slice(2, 8)}`),
  compositeId: jest.fn((...parts: unknown[]) => parts.join(':')),
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

import { mmkvStorage } from '../mmkv-storage';
import { useUnfoldStore } from '../store';
const fullSyncPull = jest.requireActual('../full-sync-pull') as typeof import('../full-sync-pull');
const { drainSyncOutbox, enqueueSyncChanges, OUTBOX_KEY, peekSyncOutbox, resetDrainStateForTesting } = jest.requireActual('../sync-outbox') as typeof import('../sync-outbox');

const T0 = new Date('2026-09-01T12:00:00.000Z');
const at = (offsetMs: number) => new Date(T0.getTime() + offsetMs).toISOString();

function addNote(content: string): string {
  return useUnfoldStore.getState().addNote({
    title: 'Shared note',
    content,
    category: 'general',
    tags: [],
    isFavorite: false,
    scriptureRefs: [],
  });
}

/** The raw sync_notes row /api/sync/push returns as serverData on a conflict. */
function serverNoteRow(id: string, content: string, clientUpdatedAt: string, deletedAt: string | null = null) {
  return {
    id,
    clerkUserId: 'user-1',
    title: 'Shared note',
    content,
    category: 'general',
    tags: [],
    isFavorite: false,
    scriptureRefs: [],
    folderId: null,
    createdAt: at(0),
    updatedAt: clientUpdatedAt,
    clientUpdatedAt,
    deletedAt,
  };
}

function serverBiblePositionRow(id: string, clientUpdatedAt: string) {
  return {
    id,
    clerkUserId: 'user-1',
    bookId: 43,
    bookName: 'John',
    chapter: 3,
    translation: 'BSB',
    lastReadAt: clientUpdatedAt,
    createdAt: at(0),
    updatedAt: clientUpdatedAt,
    clientUpdatedAt,
    deletedAt: null,
  };
}

function mockPushResponse(build: () => unknown[]) {
  (globalThis as any).fetch = jest.fn(async () => ({
    ok: true,
    json: async () => ({ results: build() }),
  }));
}

beforeEach(() => {
  useUnfoldStore.getState().reset();
  // The outbox lives in the (module-scoped) mmkv mock, not in the store.
  mmkvStorage.removeItem(OUTBOX_KEY);
  resetDrainStateForTesting();
  jest.useFakeTimers();
  jest.setSystemTime(T0);
});

afterEach(() => {
  jest.useRealTimers();
});

describe('push conflict → server version', () => {
  it('applies the server version returned with the conflict and clears the entry', async () => {
    const id = addNote('<p>DEVICE A VERSION</p>');
    const serverData = serverNoteRow(id, '<p>DEVICE B VERSION (newer)</p>', at(30_000));
    mockPushResponse(() => [
      { table: 'notes', id, status: 'conflict', serverUpdatedAt: serverData.updatedAt, serverData },
    ]);

    await drainSyncOutbox();

    expect(peekSyncOutbox()).toHaveLength(0);
    const note = useUnfoldStore.getState().notes.find((n) => n.id === id)!;
    expect(note.content).toBe('<p>DEVICE B VERSION (newer)</p>');
    expect(note.updatedAt).toBe(at(30_000));
  });

  it('keeps a newer local change that was enqueued while the push was in flight', async () => {
    const id = addNote('<p>A1</p>');
    mockPushResponse(() => {
      // The user keeps typing while the POST is out: a newer change lands in the outbox.
      jest.setSystemTime(new Date(T0.getTime() + 60_000));
      useUnfoldStore.getState().updateNote(id, { content: '<p>A2 typed during the push</p>' });
      const serverData = serverNoteRow(id, '<p>B (older than A2)</p>', at(30_000));
      return [{ table: 'notes', id, status: 'conflict', serverUpdatedAt: serverData.updatedAt, serverData }];
    });

    await drainSyncOutbox();

    const note = useUnfoldStore.getState().notes.find((n) => n.id === id)!;
    expect(note.content).toBe('<p>A2 typed during the push</p>');
    expect(peekSyncOutbox()).toEqual([
      expect.objectContaining({ table: 'notes', id, clientUpdatedAt: at(60_000) }),
    ]);
  });

  it('removes the local record when the server version is a tombstone', async () => {
    const id = addNote('<p>deleted elsewhere</p>');
    const serverData = serverNoteRow(id, '<p>deleted elsewhere</p>', at(30_000), at(30_000));
    mockPushResponse(() => [
      { table: 'notes', id, status: 'conflict', serverUpdatedAt: serverData.updatedAt, serverData },
    ]);

    await drainSyncOutbox();

    expect(useUnfoldStore.getState().notes.find((n) => n.id === id)).toBeUndefined();
    expect(peekSyncOutbox()).toHaveLength(0);
  });

  it('retains a conflict without serverData and does not apply it', async () => {
    const id = addNote('<p>mine</p>');
    mockPushResponse(() => [
      { table: 'notes', id, status: 'conflict', serverUpdatedAt: at(30_000) },
    ]);

    await drainSyncOutbox();

    expect(useUnfoldStore.getState().notes.find((n) => n.id === id)?.content).toBe('<p>mine</p>');
    expect(peekSyncOutbox()).toEqual([expect.objectContaining({ table: 'notes', id })]);
  });

  it('does not apply an explicit non-composite remapped conflict', async () => {
    const id = addNote('<p>mine</p>');
    const serverData = serverNoteRow('server-note-a', '<p>B remapped</p>', at(30_000));
    mockPushResponse(() => [{
      table: 'notes',
      requestedId: id,
      id: 'server-note-a',
      status: 'conflict',
      serverUpdatedAt: serverData.updatedAt,
      serverData,
    }]);

    await drainSyncOutbox();

    expect(useUnfoldStore.getState().notes.find((n) => n.id === id)?.content).toBe('<p>mine</p>');
    expect(useUnfoldStore.getState().notes.some((item) => item.id === 'server-note-a')).toBe(false);
    expect(peekSyncOutbox()).toEqual([expect.objectContaining({ table: 'notes', id })]);
  });

  it('does not apply a remapped conflict while newer work remains under the requested id', async () => {
    const requestedId = 'client-position-b';
    enqueueSyncChanges([{
      table: 'bible_reading_positions',
      id: requestedId,
      clientUpdatedAt: at(0),
      deleted: false,
      data: { schemaVersion: 1, book: 'John' },
    }]);
    mockPushResponse(() => {
      jest.setSystemTime(new Date(T0.getTime() + 60_000));
      enqueueSyncChanges([{
        table: 'bible_reading_positions',
        id: requestedId,
        clientUpdatedAt: at(60_000),
        deleted: false,
        data: { schemaVersion: 1, book: 'John', verse: 3 },
      }]);
      const serverData = serverBiblePositionRow('server-position-a', at(30_000));
      return [{
        table: 'bible_reading_positions',
        requestedId,
        id: serverData.id,
        status: 'conflict',
        serverUpdatedAt: serverData.updatedAt,
        serverData,
      }];
    });

    const applyConflicts = jest.spyOn(fullSyncPull, 'applyServerConflictRecords');
    await drainSyncOutbox();

    expect(applyConflicts).not.toHaveBeenCalled();
    expect(peekSyncOutbox()).toEqual([
      expect.objectContaining({
        table: 'bible_reading_positions',
        id: requestedId,
        clientUpdatedAt: at(60_000),
      }),
    ]);
    expect(useUnfoldStore.getState().bibleReadingHistory.some((item) => item.id === 'server-position-a')).toBe(false);
    applyConflicts.mockRestore();
  });

  it('applies a remapped composite conflict when no newer requested-id work remains', async () => {
    const requestedId = 'client-position-b';
    const serverData = serverBiblePositionRow('server-position-a', at(30_000));
    enqueueSyncChanges([{
      table: 'bible_reading_positions',
      id: requestedId,
      clientUpdatedAt: at(0),
      deleted: false,
      data: { schemaVersion: 1, bookId: 43, chapter: 1 },
    }]);
    mockPushResponse(() => [{
      table: 'bible_reading_positions',
      requestedId,
      id: serverData.id,
      status: 'conflict',
      serverUpdatedAt: serverData.updatedAt,
      serverData,
    }]);

    await drainSyncOutbox();

    expect(peekSyncOutbox()).toHaveLength(0);
    const applied = useUnfoldStore.getState().bibleReadingHistory.find((item) => item.id === 'server-position-a');
    expect(applied).toEqual(expect.objectContaining({
      id: 'server-position-a',
      bookId: 43,
      bookName: 'John',
      chapter: 3,
      translation: 'BSB',
    }));
  });

  it('does not apply a remapped conflict when equal-timestamp requested-id work remains', async () => {
    const requestedId = 'client-position-b';
    const submitted = {
      table: 'bible_reading_positions' as const,
      id: requestedId,
      clientUpdatedAt: at(0),
      deleted: false,
      data: { schemaVersion: 1, bookId: 43, chapter: 1 },
    };
    const replacement = {
      ...submitted,
      data: { schemaVersion: 1, bookId: 43, chapter: 5 },
    };
    enqueueSyncChanges([submitted]);
    mockPushResponse(() => {
      enqueueSyncChanges([replacement]);
      const serverData = serverBiblePositionRow('server-position-a', at(30_000));
      return [{
        table: 'bible_reading_positions',
        requestedId,
        id: serverData.id,
        status: 'conflict',
        serverUpdatedAt: serverData.updatedAt,
        serverData,
      }];
    });

    const applyConflicts = jest.spyOn(fullSyncPull, 'applyServerConflictRecords');
    await drainSyncOutbox();

    expect(applyConflicts).not.toHaveBeenCalled();
    expect(peekSyncOutbox()).toEqual([
      expect.objectContaining({ id: requestedId, data: replacement.data }),
    ]);
    expect(useUnfoldStore.getState().bibleReadingHistory.some((item) => item.id === 'server-position-a')).toBe(false);
    applyConflicts.mockRestore();
  });
});
