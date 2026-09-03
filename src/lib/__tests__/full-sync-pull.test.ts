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
    __clearMockStorage: () => store.clear(),
  };
});

import { useUnfoldStore } from '../store';
import { applyPulledUserData, LAST_PULLED_AT_KEY, pullAllUserData } from '../full-sync-pull';
import { persistNoteSnapshot } from '../note-detail-editor';
import { drainSyncOutbox, peekSyncOutbox, resetDrainStateForTesting } from '../sync-outbox';
import { mmkvStorage } from '../mmkv-storage';
import type { SyncPushChange, SyncTable } from '../sync-types';

const mockFetch = jest.fn();

function recordsFromChanges(changes: SyncPushChange[]) {
  return changes.reduce((acc, change) => {
    acc[change.table] ??= [];
    acc[change.table]!.push({
      id: change.id,
      data: {
        id: change.id,
        ...change.data,
        createdAt: change.clientUpdatedAt,
        updatedAt: change.clientUpdatedAt,
        deletedAt: change.deleted ? change.clientUpdatedAt : null,
      },
      updatedAt: change.clientUpdatedAt,
      deleted: change.deleted,
    });
    return acc;
  }, {} as Partial<Record<SyncTable, Array<{ id: string; data: Record<string, unknown>; updatedAt: string; deleted: boolean }>>>);
}

beforeEach(() => {
  jest.clearAllMocks();
  global.fetch = mockFetch as unknown as typeof fetch;
  (mmkvStorage as any).__clearMockStorage?.();
  resetDrainStateForTesting();
  useUnfoldStore.getState().reset();
});

afterEach(() => {
  jest.useRealTimers();
});

describe('full user-data sync', () => {
  it('round-trips personal data through push, wipe, and pull restore', async () => {
    const store = useUnfoldStore.getState();
    const folderId = store.addFolder('Sermons', '#C8A55C');
    const noteId = store.addNote({
      title: 'Grace note',
      content: 'A restored note',
      category: 'study',
      tags: ['grace'],
      isFavorite: true,
      scriptureRefs: [],
      folderId,
    });
    store.addJournalEntry({ devotionalId: 'devotional-1', dayNumber: 1, content: 'Journal body', journalMode: 'freewrite' });
    store.addHighlight({
      devotionalId: 'devotional-1',
      devotionalTitle: 'Devotional',
      dayNumber: 1,
      dayTitle: 'Day 1',
      highlightedText: 'Line to keep',
      color: 'yellow',
    });
    store.addBibleHighlight({
      bookId: 43,
      bookName: 'John',
      chapter: 3,
      verseStart: 16,
      verseEnd: 16,
      text: 'For God so loved the world',
      color: 'yellow',
      translation: 'BSB',
    });
    store.addCheckIn({
      devotionalId: 'devotional-1',
      dayNumber: 1,
      mood: 5,
      moodLabel: 'Grateful',
      timeOfDay: 'midday',
      chipAnswer: 'Steady',
    });
    store.addBookmark({
      devotionalId: 'devotional-1',
      devotionalTitle: 'Devotional',
      dayNumber: 1,
      dayTitle: 'Day 1',
      scriptureReference: 'John 3:16',
      scriptureText: 'For God so loved the world',
    });

    const pushedChanges = peekSyncOutbox();
    expect(pushedChanges.map((change) => change.table)).toEqual(expect.arrayContaining([
      'journal_entries',
      'notes',
      'note_folders',
      'highlights',
      'bible_highlights',
      'check_ins',
      'bookmarks',
    ]));

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ results: pushedChanges.map(() => ({ status: 'accepted' })) }),
    });
    await drainSyncOutbox();
    expect(peekSyncOutbox()).toHaveLength(0);

    useUnfoldStore.getState().reset();
    expect(useUnfoldStore.getState().notes).toHaveLength(0);

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        timestamp: '2026-07-01T12:00:00.000Z',
        changes: recordsFromChanges(pushedChanges),
      }),
    });

    await pullAllUserData({ full: true });

    const restored = useUnfoldStore.getState();
    expect(restored.notes.find((note) => note.id === noteId)).toMatchObject({
      title: 'Grace note',
      content: 'A restored note',
      folderId,
    });
    expect(restored.folders.find((folder) => folder.id === folderId)).toMatchObject({ name: 'Sermons' });
    expect(restored.journalEntries[0]).toMatchObject({ content: 'Journal body' });
    expect(restored.highlights[0]).toMatchObject({ highlightedText: 'Line to keep' });
    expect(restored.bibleHighlights[0]).toMatchObject({ text: 'For God so loved the world' });
    expect(restored.checkIns[0]).toMatchObject({ moodLabel: 'Grateful' });
    expect(restored.bookmarks[0]).toMatchObject({ scriptureReference: 'John 3:16' });
    expect(mmkvStorage.getItem(LAST_PULLED_AT_KEY)).toBe('2026-07-01T12:00:00.000Z');

    useUnfoldStore.getState().deleteNote(noteId);
    const deleteChanges = peekSyncOutbox();
    expect(deleteChanges).toContainEqual(expect.objectContaining({ table: 'notes', id: noteId, deleted: true }));

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ results: deleteChanges.map(() => ({ status: 'accepted' })) }),
    });
    await drainSyncOutbox();

    useUnfoldStore.getState().reset();
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        timestamp: '2026-07-01T12:05:00.000Z',
        changes: recordsFromChanges(deleteChanges),
      }),
    });
    await pullAllUserData({ full: true });

    expect(useUnfoldStore.getState().notes.find((note) => note.id === noteId)).toBeUndefined();
  });

  it('sends the persisted lastPulledAt cursor and advances it after apply', async () => {
    mmkvStorage.setItem(LAST_PULLED_AT_KEY, '2026-07-01T11:00:00.000Z');
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ timestamp: '2026-07-01T12:00:00.000Z', changes: {} }),
    });

    await pullAllUserData();

    expect(mockFetch).toHaveBeenCalledWith('https://example.test/api/sync/pull', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lastPulledAt: '2026-07-01T11:00:00.000Z' }),
    });
    expect(mmkvStorage.getItem(LAST_PULLED_AT_KEY)).toBe('2026-07-01T12:00:00.000Z');
  });


  it('rejects a pulled tombstone while a fresh local change is still un-pushed (WR-25 guard)', async () => {
    const store = useUnfoldStore.getState();
    const noteId = store.addNote({
      title: 'Mid-edit note',
      content: '<p>Fresh writing</p>',
      category: 'study',
      tags: [],
      isFavorite: false,
      scriptureRefs: [],
    });
    // Outbox NOT drained — the local change is pending push.
    expect(peekSyncOutbox().length).toBeGreaterThan(0);

    applyPulledUserData({
      timestamp: new Date(Date.now() + 60_000).toISOString(),
      changes: {
        notes: [{
          id: noteId,
          data: {},
          updatedAt: new Date(Date.now() + 60_000).toISOString(),
          deleted: true,
        }],
      },
    });

    const note = useUnfoldStore.getState().notes.find((n) => n.id === noteId);
    expect(note).toBeDefined();
    expect(note?.content).toBe('<p>Fresh writing</p>');
    expect(peekSyncOutbox().length).toBeGreaterThan(0);
  });

  it('resurrects an open note when a pulled tombstone lands before the next save', async () => {
    const store = useUnfoldStore.getState();
    const noteId = store.addNote({
      title: 'Original note',
      content: '<p>Original writing</p>',
      category: 'study',
      tags: [],
      isFavorite: false,
      scriptureRefs: [],
    });

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ results: peekSyncOutbox().map(() => ({ status: 'accepted' })) }),
    });
    await drainSyncOutbox();
    expect(peekSyncOutbox()).toHaveLength(0);

    // WR-25: deletes are LWW-gated now — the tombstone must be genuinely
    // newer than the local row to apply (a stale delete may not kill newer writing).
    const futureTombstoneAt = new Date(Date.now() + 60_000).toISOString();
    applyPulledUserData({
      timestamp: futureTombstoneAt,
      changes: {
        notes: [{
          id: noteId,
          data: { clientUpdatedAt: futureTombstoneAt },
          updatedAt: futureTombstoneAt,
          deleted: true,
        }],
      },
    });
    expect(useUnfoldStore.getState().notes.find((note) => note.id === noteId)).toBeUndefined();

    const savedId = persistNoteSnapshot({
      noteId,
      input: {
        title: 'Resurrected note',
        html: '<p>New writing after tombstone</p>',
        category: 'prayer',
        scriptureRefs: [],
      },
      addNote: useUnfoldStore.getState().addNote,
      updateNote: useUnfoldStore.getState().updateNote,
    });

    const resurrected = useUnfoldStore.getState().notes.find((note) => note.id === noteId);
    expect(savedId).toBe(noteId);
    expect(resurrected).toMatchObject({
      id: noteId,
      title: 'Resurrected note',
      content: '<p>New writing after tombstone</p>',
      category: 'prayer',
      tags: [],
      isFavorite: false,
      scriptureRefs: [],
    });

    expect(peekSyncOutbox()).toContainEqual(expect.objectContaining({
      table: 'notes',
      id: noteId,
      deleted: false,
      clientUpdatedAt: resurrected?.updatedAt,
      data: expect.objectContaining({
        title: 'Resurrected note',
        content: '<p>New writing after tombstone</p>',
        category: 'prayer',
      }),
    }));
  });

  it('keeps a pending local note when the pulled server row is stale by clientUpdatedAt', () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-07-01T12:05:00.000Z'));

    const noteId = useUnfoldStore.getState().addNote({
      title: 'Fresh local note',
      content: '<p>Fresh local writing</p>',
      category: 'study',
      tags: [],
      isFavorite: false,
      scriptureRefs: [],
    });
    const localNote = useUnfoldStore.getState().notes.find((note) => note.id === noteId);
    expect(localNote?.updatedAt).toBe('2026-07-01T12:05:00.000Z');
    expect(peekSyncOutbox()).toContainEqual(expect.objectContaining({
      table: 'notes',
      id: noteId,
      clientUpdatedAt: '2026-07-01T12:05:00.000Z',
    }));

    applyPulledUserData({
      timestamp: '2026-07-01T12:10:00.000Z',
      changes: {
        notes: [{
          id: noteId,
          data: {
            title: 'Stale server note',
            content: '<p>Older server writing</p>',
            category: 'study',
            tags: [],
            isFavorite: false,
            scriptureRefs: [],
            createdAt: '2026-07-01T12:00:00.000Z',
            clientUpdatedAt: '2026-07-01T12:04:00.000Z',
          },
          updatedAt: '2026-07-01T12:10:00.000Z',
          deleted: false,
        }],
      },
    });

    expect(useUnfoldStore.getState().notes.find((note) => note.id === noteId)).toMatchObject({
      title: 'Fresh local note',
      content: '<p>Fresh local writing</p>',
      updatedAt: '2026-07-01T12:05:00.000Z',
    });
  });

  it('applies a pulled note when the remote clientUpdatedAt is genuinely newer', () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-07-01T12:05:00.000Z'));

    const noteId = useUnfoldStore.getState().addNote({
      title: 'Older local note',
      content: '<p>Older local writing</p>',
      category: 'study',
      tags: [],
      isFavorite: false,
      scriptureRefs: [],
    });

    applyPulledUserData({
      timestamp: '2026-07-01T12:10:00.000Z',
      changes: {
        notes: [{
          id: noteId,
          data: {
            title: 'Newer remote note',
            content: '<p>Newer remote writing</p>',
            category: 'study',
            tags: ['remote'],
            isFavorite: true,
            scriptureRefs: [],
            createdAt: '2026-07-01T12:00:00.000Z',
            clientUpdatedAt: '2026-07-01T12:06:00.000Z',
          },
          updatedAt: '2026-07-01T12:10:00.000Z',
          deleted: false,
        }],
      },
    });

    expect(useUnfoldStore.getState().notes.find((note) => note.id === noteId)).toMatchObject({
      title: 'Newer remote note',
      content: '<p>Newer remote writing</p>',
      tags: ['remote'],
      isFavorite: true,
      updatedAt: '2026-07-01T12:06:00.000Z',
    });
  });

  it('does not let a legacy pulled note clobber a pending local note without clientUpdatedAt', () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-07-01T12:05:00.000Z'));

    const noteId = useUnfoldStore.getState().addNote({
      title: 'Pending legacy-safe note',
      content: '<p>Pending local writing</p>',
      category: 'study',
      tags: [],
      isFavorite: false,
      scriptureRefs: [],
    });

    applyPulledUserData({
      timestamp: '2026-07-01T12:10:00.000Z',
      changes: {
        notes: [{
          id: noteId,
          data: {
            title: 'Legacy server note',
            content: '<p>Legacy server writing</p>',
            category: 'study',
            tags: [],
            isFavorite: false,
            scriptureRefs: [],
            createdAt: '2026-07-01T12:00:00.000Z',
          },
          updatedAt: '2026-07-01T12:10:00.000Z',
          deleted: false,
        }],
      },
    });

    expect(useUnfoldStore.getState().notes.find((note) => note.id === noteId)).toMatchObject({
      title: 'Pending legacy-safe note',
      content: '<p>Pending local writing</p>',
      updatedAt: '2026-07-01T12:05:00.000Z',
    });
  });
});
