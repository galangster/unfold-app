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
import { drainSyncOutbox, peekSyncOutbox, replaceSyncOutbox, resetDrainStateForTesting } from '../sync-outbox';
import { useCompanionChatStore } from '../companion-chat-store';
import { mmkvStorage } from '../mmkv-storage';
import type { SyncPushChange, SyncTable } from '../sync-types';

const mockFetch = jest.fn();
const FIXED_CLOCK = new Date('2026-07-01T12:00:00.000Z');

function clearMockMmkv() {
  const mocked = jest.requireMock('../mmkv-storage') as { __clearMockStorage: () => void };
  mocked.__clearMockStorage();
}

function serveSync(handlers: {
  push?: (changes: SyncPushChange[]) => unknown;
  pull?: (body: { lastPulledAt?: string | null }) => unknown;
}) {
  mockFetch.mockImplementation(async (input: RequestInfo, init?: RequestInit) => {
    const url = String(input);
    const body = init?.body ? JSON.parse(String(init.body)) as {
      changes?: SyncPushChange[];
      lastPulledAt?: string | null;
    } : {};
    if (url.endsWith('/api/sync/push')) {
      const push = handlers.push;
      if (!push) throw new Error(`unexpected push ${url}`);
      if (!Array.isArray(body.changes)) throw new Error(`push missing changes ${url}`);
      const changes = body.changes;
      return { ok: true, json: async () => push(changes) };
    }
    if (url.endsWith('/api/sync/pull')) {
      const pull = handlers.pull;
      if (!pull) throw new Error(`unexpected pull ${url}`);
      return { ok: true, json: async () => pull(body) };
    }
    throw new Error(`unexpected request ${url}`);
  });
}

function acceptedLegacyResults(changes: readonly SyncPushChange[]) {
  return changes.map((change) => ({
    table: change.table,
    id: change.id,
    status: 'accepted' as const,
    serverUpdatedAt: change.clientUpdatedAt,
  }));
}

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
  mockFetch.mockReset();
  mockFetch.mockImplementation((input: RequestInfo) => {
    throw new Error(`unexpected request ${String(input)}`);
  });
  global.fetch = mockFetch as unknown as typeof fetch;
  clearMockMmkv();
  resetDrainStateForTesting();
  useUnfoldStore.getState().reset();
  jest.useFakeTimers();
  jest.setSystemTime(FIXED_CLOCK);
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

    serveSync({
      push: (changes) => ({ results: acceptedLegacyResults(changes) }),
    });
    // addCheckIn now flushes the outbox at once (spec §6.3, J5). That drain
    // may have consumed the enqueue revision, so clear the min-interval guard
    // before the explicit drain this test controls.
    resetDrainStateForTesting();
    await drainSyncOutbox();
    expect(peekSyncOutbox()).toHaveLength(0);

    useUnfoldStore.getState().reset();
    expect(useUnfoldStore.getState().notes).toHaveLength(0);

    serveSync({
      pull: () => ({
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

    serveSync({
      push: (changes) => ({ results: acceptedLegacyResults(changes) }),
    });
    // addCheckIn now flushes the outbox at once (spec §6.3, J5). That drain
    // may have consumed the enqueue revision, so clear the min-interval guard
    // before the explicit drain this test controls.
    resetDrainStateForTesting();
    await drainSyncOutbox();
    expect(peekSyncOutbox()).toHaveLength(0);

    useUnfoldStore.getState().reset();
    serveSync({
      pull: () => ({
        timestamp: '2026-07-01T12:05:00.000Z',
        changes: recordsFromChanges(deleteChanges),
      }),
    });
    await pullAllUserData({ full: true });

    expect(useUnfoldStore.getState().notes.find((note) => note.id === noteId)).toBeUndefined();
  });

  it('sends the persisted lastPulledAt cursor and advances it after apply', async () => {
    mmkvStorage.setItem(LAST_PULLED_AT_KEY, '2026-07-01T11:00:00.000Z');
    serveSync({
      pull: () => ({ timestamp: '2026-07-01T12:00:00.000Z', changes: {} }),
    });

    await pullAllUserData();

    expect(mockFetch).toHaveBeenCalledWith('https://example.test/api/sync/pull', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lastPulledAt: '2026-07-01T11:00:00.000Z' }),
      signal: expect.any(AbortSignal),
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

  it('rejects a pulled devotional tombstone while a local series write is still un-pushed (Greptile A1)', async () => {
    useUnfoldStore.setState({
      devotionals: [{
        id: 'devotional-1',
        title: 'Series',
        days: [{ id: 'day-1', dayNumber: 1, title: 'Day 1', scriptureReference: 'John 1:1', scriptureText: '', reflection: '', prayer: '', isRead: false }],
        createdAt: '2026-06-01T00:00:00.000Z',
        updatedAt: '2026-06-01T00:00:00.000Z',
      } as never],
    });
    const pendingAt = new Date(Date.now() + 120_000).toISOString();
    replaceSyncOutbox([
      { table: 'devotionals', id: 'devotional-1', data: { currentDay: 2 }, clientUpdatedAt: pendingAt, deleted: false },
      { table: 'devotional_days', id: 'day-1', data: { isRead: true }, clientUpdatedAt: pendingAt, deleted: false },
    ]);

    const tombstoneAt = new Date(Date.now() + 60_000).toISOString();
    applyPulledUserData({
      timestamp: tombstoneAt,
      changes: {
        devotionals: [{ id: 'devotional-1', data: { clientUpdatedAt: tombstoneAt }, updatedAt: tombstoneAt, deleted: true }],
        devotional_days: [{ id: 'day-1', data: { devotionalId: 'devotional-1', clientUpdatedAt: tombstoneAt }, updatedAt: tombstoneAt, deleted: true }],
      },
    });

    const kept = useUnfoldStore.getState().devotionals.find((d) => d.id === 'devotional-1');
    expect(kept).toBeDefined();
    expect(kept?.days.map((d) => d.id)).toEqual(['day-1']);
  });

  it('applies a pulled devotional tombstone that is newer than the local row (Greptile A1)', async () => {
    useUnfoldStore.setState({
      devotionals: [{
        id: 'devotional-1',
        title: 'Series',
        days: [],
        createdAt: '2026-06-01T00:00:00.000Z',
        updatedAt: '2026-06-01T00:00:00.000Z',
      } as never],
    });
    const tombstoneAt = new Date(Date.now() + 60_000).toISOString();
    applyPulledUserData({
      timestamp: tombstoneAt,
      changes: {
        devotionals: [{ id: 'devotional-1', data: { clientUpdatedAt: tombstoneAt }, updatedAt: tombstoneAt, deleted: true }],
      },
    });
    expect(useUnfoldStore.getState().devotionals).toHaveLength(0);
  });

  it('rejects a pulled conversation tombstone while a local message is still un-pushed (Greptile A1)', async () => {
    useCompanionChatStore.setState({
      conversations: [{
        id: 'conv-1',
        messages: [{ id: 'msg-1', role: 'user', content: 'unsent', timestamp: Date.now(), status: 'sent', updatedAt: '2026-06-01T00:00:00.000Z' }],
        createdAt: Date.now(),
        lastMessageAt: Date.now(),
        title: null,
        topicTags: [],
        archived: false,
        updatedAt: '2026-06-01T00:00:00.000Z',
      } as never],
    });
    const pendingAt = new Date(Date.now() + 120_000).toISOString();
    replaceSyncOutbox([
      { table: 'companion_conversations', id: 'conv-1', data: { title: 'Renamed' }, clientUpdatedAt: pendingAt, deleted: false },
      { table: 'companion_messages', id: 'msg-1', data: { content: 'unsent' }, clientUpdatedAt: pendingAt, deleted: false },
    ]);

    const tombstoneAt = new Date(Date.now() + 60_000).toISOString();
    applyPulledUserData({
      timestamp: tombstoneAt,
      changes: {
        companion_conversations: [{ id: 'conv-1', data: { clientUpdatedAt: tombstoneAt }, updatedAt: tombstoneAt, deleted: true }],
        companion_messages: [{ id: 'msg-1', data: { conversationId: 'conv-1', clientUpdatedAt: tombstoneAt }, updatedAt: tombstoneAt, deleted: true }],
      },
    });

    const conversation = useCompanionChatStore.getState().conversations.find((c) => c.id === 'conv-1');
    expect(conversation).toBeDefined();
    expect(conversation?.messages.map((m) => m.id)).toEqual(['msg-1']);
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

    serveSync({
      push: (changes) => ({ results: acceptedLegacyResults(changes) }),
    });
    // addCheckIn now flushes the outbox at once (spec §6.3, J5). That drain
    // may have consumed the enqueue revision, so clear the min-interval guard
    // before the explicit drain this test controls.
    resetDrainStateForTesting();
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

function seedMappedDevotional() {
  useUnfoldStore.setState({
    devotionals: [{
      id: 'devotional-1',
      title: 'Auto',
      totalDays: 3,
      currentDay: 2,
      days: [],
      createdAt: '2026-07-01T00:00:00.000Z',
      userContext: { name: '', aboutMe: '', currentSituation: '', emotionalState: '' },
      generationMode: 'progressive',
      seriesArc: {
        totalDaysPlanned: 3,
        overarchingTheme: 'theme',
        narrativeShape: 'shape',
        dayHints: [],
        isOpenEnded: false,
        createdAt: '2026-07-01T00:00:00.000Z',
        seriesKind: 'auto_trial',
      },
    }],
  });
}

function pulledDay(content: Record<string, unknown>) {
  return {
    id: 'day-devotional-1-2',
    updatedAt: '2026-07-01T12:00:00.000Z',
    deleted: false,
    data: {
      devotionalId: 'devotional-1',
      dayNumber: 2,
      title: 'Day 2',
      scriptureReference: 'John 1:1',
      scriptureText: 'Text',
      bodyText: 'Body',
      quotableLine: 'Line',
      content,
    },
  };
}

describe('J6 full-sync day mapper', () => {
  it('keeps shapedByCheckIn only for boolean true and drops invalid nextPick', () => {
    seedMappedDevotional();
    applyPulledUserData({
      timestamp: '2026-07-01T12:00:00.000Z',
      changes: { devotional_days: [pulledDay({ shapedByCheckIn: true, nextPick: { theme: 't', themeName: 'n', type: 'x', suggestedLength: 7, line: 'Next' } })] },
    });
    expect(useUnfoldStore.getState().devotionals[0]?.days[0]?.shapedByCheckIn).toBe(true);
    expect(useUnfoldStore.getState().devotionals[0]?.days[0]?.nextPick).toEqual({
      theme: 't',
      themeName: 'n',
      type: 'x',
      suggestedLength: 7,
      line: 'Next',
    });

    applyPulledUserData({
      timestamp: '2026-07-01T12:01:00.000Z',
      changes: { devotional_days: [{
        ...pulledDay({ shapedByCheckIn: 'true', nextPick: { theme: 't', themeName: 'n', type: 'x', suggestedLength: 30, line: 'Next' } }),
        updatedAt: '2026-07-01T12:01:00.000Z',
      }] },
    });
    const malformed = useUnfoldStore.getState().devotionals[0]?.days[0];
    expect(malformed?.shapedByCheckIn).toBeUndefined();
    expect(malformed?.nextPick).toBeUndefined();

    applyPulledUserData({
      timestamp: '2026-07-01T12:02:00.000Z',
      changes: { devotional_days: [{
        ...pulledDay({ shapedByCheckIn: false, nextPick: { theme: 't', themeName: 'n', type: 'x', suggestedLength: 7, line: '' } }),
        updatedAt: '2026-07-01T12:02:00.000Z',
      }] },
    });
    const emptyLine = useUnfoldStore.getState().devotionals[0]?.days[0];
    expect(emptyLine?.shapedByCheckIn).toBeUndefined();
    expect(emptyLine?.nextPick).toBeUndefined();
  });
});
