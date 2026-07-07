jest.mock('../api-config', () => ({
  PRIMARY_BACKEND_URL: 'https://example.test',
  getAuthHeaders: jest.fn(async () => ({ 'Content-Type': 'application/json' })),
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
  };
});

jest.mock('../bug-logger', () => ({
  logBugError: jest.fn(),
}));

jest.mock('../sync-ids', () => ({
  newId: jest.fn(() => `test-id-${Math.random().toString(36).slice(2, 8)}`),
}));

import { prepareJournalFolderDelete } from '../journal-folder-delete';
import { applyUndoActionsWithSync } from '../journal-undo';
import { useUnfoldStore, type Note, type NoteFolder } from '../store';
import { OUTBOX_KEY, peekSyncOutbox, resetDrainStateForTesting } from '../sync-outbox';
import { mmkvStorage } from '../mmkv-storage';

const UNDO_TIMESTAMP = '2026-07-06T22:00:00.000Z';

function note(overrides: Partial<Note> = {}): Note {
  return {
    id: 'note-1',
    title: 'Note 1',
    content: 'Body',
    createdAt: '2026-07-06T21:00:00.000Z',
    updatedAt: '2026-07-06T21:00:00.000Z',
    category: 'general',
    tags: [],
    isFavorite: false,
    scriptureRefs: [],
    ...overrides,
  };
}

function folder(overrides: Partial<NoteFolder> = {}): NoteFolder {
  return {
    id: 'folder-1',
    name: 'Folder 1',
    color: '#C9A45A',
    parentId: undefined,
    sortOrder: 0,
    createdAt: '2026-07-06T21:00:00.000Z',
    updatedAt: '2026-07-06T21:00:00.000Z',
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mmkvStorage.removeItem(OUTBOX_KEY);
  resetDrainStateForTesting();
  useUnfoldStore.getState().reset();
});

describe('journal undo sync repair', () => {
  it('replaces a deleted-note tombstone with a non-deleted restore change', () => {
    const deletedNote = note({ id: 'note-delete-undo', title: 'Recovered note' });
    useUnfoldStore.setState({ notes: [deletedNote], folders: [] });

    useUnfoldStore.getState().deleteNote(deletedNote.id);
    expect(peekSyncOutbox()).toContainEqual(expect.objectContaining({
      table: 'notes',
      id: deletedNote.id,
      deleted: true,
    }));

    const restored = applyUndoActionsWithSync(
      { notes: useUnfoldStore.getState().notes, folders: useUnfoldStore.getState().folders },
      [{ type: 'note', note: deletedNote }],
      UNDO_TIMESTAMP,
    );
    useUnfoldStore.setState(restored);

    const outbox = peekSyncOutbox();
    expect(outbox).toContainEqual(expect.objectContaining({
      table: 'notes',
      id: deletedNote.id,
      deleted: false,
      clientUpdatedAt: UNDO_TIMESTAMP,
      data: expect.objectContaining({
        title: 'Recovered note',
        content: 'Body',
      }),
    }));
    expect(outbox.some((change) =>
      change.table === 'notes' && change.id === deletedNote.id && change.deleted
    )).toBe(false);
  });

  it('re-enqueues a restored folder tree and its contained notes as non-deleted changes', () => {
    const root = folder({ id: 'root-folder', name: 'Root' });
    const child = folder({ id: 'child-folder', name: 'Child', parentId: root.id });
    const rootNote = note({ id: 'root-note', folderId: root.id });
    const childNote = note({ id: 'child-note', folderId: child.id });
    useUnfoldStore.setState({ notes: [rootNote, childNote], folders: [root, child] });

    const plan = prepareJournalFolderDelete({
      folder: root,
      folders: [root, child],
      notes: [rootNote, childNote],
      descendantFolderIds: [child.id],
      activeFolderId: root.id,
      currentParentId: null,
    });
    useUnfoldStore.getState().deleteFolder(root.id, false);
    expect(peekSyncOutbox()).toContainEqual(expect.objectContaining({
      table: 'note_folders',
      id: root.id,
      deleted: true,
    }));

    const restored = applyUndoActionsWithSync(
      { notes: useUnfoldStore.getState().notes, folders: useUnfoldStore.getState().folders },
      [plan.undoAction],
      UNDO_TIMESTAMP,
    );
    useUnfoldStore.setState(restored);

    const outbox = peekSyncOutbox();
    for (const id of [root.id, child.id]) {
      expect(outbox).toContainEqual(expect.objectContaining({
        table: 'note_folders',
        id,
        deleted: false,
        clientUpdatedAt: UNDO_TIMESTAMP,
      }));
      expect(outbox.some((change) =>
        change.table === 'note_folders' && change.id === id && change.deleted
      )).toBe(false);
    }

    expect(outbox).toContainEqual(expect.objectContaining({
      table: 'notes',
      id: rootNote.id,
      deleted: false,
      clientUpdatedAt: UNDO_TIMESTAMP,
      data: expect.objectContaining({ folderId: root.id }),
    }));
    expect(outbox).toContainEqual(expect.objectContaining({
      table: 'notes',
      id: childNote.id,
      deleted: false,
      clientUpdatedAt: UNDO_TIMESTAMP,
      data: expect.objectContaining({ folderId: child.id }),
    }));
    for (const id of [rootNote.id, childNote.id]) {
      expect(outbox.some((change) =>
        change.table === 'notes' && change.id === id && change.deleted
      )).toBe(false);
    }
  });
});
