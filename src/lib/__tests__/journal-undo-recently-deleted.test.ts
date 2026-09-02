/**
 * WR-04 undo after a hub swipe-delete put the note back into `notes` but
 * left its WR-15 Recently Deleted entry behind; "Restore" from that list
 * then inserted the same id a second time (duplicate FlatList keys, and
 * deleting one removed both). Undo now clears the restored ids from
 * Recently Deleted, and the undo reducer never inserts an id that is
 * already present.
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

import { applyUndoActions, undoJournalDeletions } from '../journal-undo';
import { useUnfoldStore, type Note } from '../store';
import { peekSyncOutbox } from '../sync-outbox';

function addNote(title: string): string {
  return useUnfoldStore.getState().addNote({
    title,
    content: '<p>body</p>',
    category: 'sermon',
    tags: [],
    isFavorite: false,
    scriptureRefs: [],
  });
}

beforeEach(() => {
  useUnfoldStore.getState().reset();
});

describe('hub swipe-delete → Undo → Recently Deleted', () => {
  it('undo removes the note from Recently Deleted, so Restore cannot duplicate it', () => {
    const id = addNote('Sermon notes');
    const note = useUnfoldStore.getState().notes[0];

    // (journal)/index.tsx handleNoteDelete
    useUnfoldStore.getState().deleteNote(id);
    expect(useUnfoldStore.getState().notes).toHaveLength(0);
    expect(useUnfoldStore.getState().deletedNotes).toHaveLength(1);

    // (journal)/index.tsx handleUndoAction
    const undoAt = '2026-09-01T12:00:00.000Z';
    useUnfoldStore.setState((state) => undoJournalDeletions(state, [{ type: 'note', note }], undoAt));
    expect(useUnfoldStore.getState().notes.map((n) => n.id)).toEqual([id]);
    expect(useUnfoldStore.getState().deletedNotes).toHaveLength(0);
    expect(peekSyncOutbox()).toContainEqual(
      expect.objectContaining({ table: 'notes', id, deleted: false, clientUpdatedAt: undoAt }),
    );

    // recently-deleted.tsx handleRestore on a now-absent entry is a no-op.
    useUnfoldStore.getState().restoreNote(id);
    expect(useUnfoldStore.getState().notes.filter((n) => n.id === id)).toHaveLength(1);
  });

  it('leaves other Recently Deleted entries in place', () => {
    const keptId = addNote('Keep in trash');
    const restoredId = addNote('Bring back');
    const restored = useUnfoldStore.getState().notes.find((n) => n.id === restoredId)!;
    useUnfoldStore.getState().deleteNote(keptId);
    useUnfoldStore.getState().deleteNote(restoredId);

    useUnfoldStore.setState((state) =>
      undoJournalDeletions(state, [{ type: 'note', note: restored }], '2026-09-01T12:00:00.000Z'),
    );
    expect(useUnfoldStore.getState().deletedNotes.map((d) => d.note.id)).toEqual([keptId]);
    expect(useUnfoldStore.getState().notes.map((n) => n.id)).toEqual([restoredId]);
  });

  it('a stale Recently Deleted entry for a live note restores without duplicating it', () => {
    // State an upgraded install can already have on disk: undone AND still listed.
    const id = addNote('Already live');
    const note = useUnfoldStore.getState().notes[0];
    useUnfoldStore.setState((state) => ({
      deletedNotes: [{ note, deletedAt: '2026-09-01T11:00:00.000Z' }, ...state.deletedNotes],
    }));

    useUnfoldStore.getState().restoreNote(id);
    expect(useUnfoldStore.getState().notes.filter((n) => n.id === id)).toHaveLength(1);
    expect(useUnfoldStore.getState().deletedNotes).toHaveLength(0);
  });
});

describe('applyUndoActions', () => {
  const note = (id: string): Note => ({
    id,
    title: `Note ${id}`,
    content: '<p>x</p>',
    createdAt: '2026-09-01T10:00:00.000Z',
    updatedAt: '2026-09-01T10:00:00.000Z',
    category: 'general',
    tags: [],
    isFavorite: false,
    scriptureRefs: [],
  });

  it('skips a note whose id is already present, keeping the live copy', () => {
    const live = { ...note('n1'), title: 'Live copy' };
    const result = applyUndoActions({ notes: [live, note('n2')], folders: [] }, [{ type: 'note', note: note('n1') }]);
    expect(result.notes.map((n) => n.id)).toEqual(['n1', 'n2']);
    expect(result.notes[0].title).toBe('Live copy');
  });

  it('still restores a note that is absent', () => {
    const result = applyUndoActions({ notes: [note('n2')], folders: [] }, [{ type: 'note', note: note('n1') }]);
    expect(result.notes.map((n) => n.id)).toEqual(['n1', 'n2']);
  });
});
