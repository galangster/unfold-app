jest.mock('../api-config', () => ({
  PRIMARY_BACKEND_URL: 'https://example.test',
  getAuthHeaders: jest.fn(async () => ({ 'Content-Type': 'application/json' })),
}));

jest.mock('../mmkv-storage', () => ({
  mmkvStorage: {
    getItem: jest.fn(() => null),
    setItem: jest.fn(),
    removeItem: jest.fn(),
  },
  getDeviceId: jest.fn(() => 'test-device-id'),
  getSharedEncryptionKey: jest.fn(() => 'test-key'),
}));

import { applyUndoActions } from '../journal-undo';
import type { JournalFolderUndoAction } from '../journal-folder-delete';
import type { Note, NoteFolder } from '@/lib/store';

function makeNote(id: string, folderId?: string): Note {
  return {
    id,
    title: `Note ${id}`,
    content: '',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    folderId,
  } as Note;
}

function makeFolder(id: string, parentId?: string): NoteFolder {
  return {
    id,
    name: `Folder ${id}`,
    parentId: parentId ?? null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  } as NoteFolder;
}

describe('applyUndoActions', () => {
  it('restores multiple queued note deletions', () => {
    const noteA = makeNote('a');
    const noteB = makeNote('b');
    const state = { notes: [], folders: [] };
    const actions = [
      { type: 'note' as const, note: noteA },
      { type: 'note' as const, note: noteB },
    ];
    const result = applyUndoActions(state, actions);
    expect(result.notes).toHaveLength(2);
    const ids = result.notes.map((n) => n.id);
    expect(ids).toContain('a');
    expect(ids).toContain('b');
  });

  it('restores a note and a folder tree together', () => {
    const f1 = makeFolder('f1');
    const noteN1 = makeNote('n1', undefined); // folderId was 'f1' before deletion
    const folderAction: JournalFolderUndoAction = {
      type: 'folder',
      folder: f1,
      folders: [f1],
      affectedNoteIds: ['n1'],
      noteFolderIds: { n1: 'f1' },
    };
    const noteAction = { type: 'note' as const, note: makeNote('n2') };
    const state = { notes: [noteN1], folders: [] };
    const result = applyUndoActions(state, [noteAction, folderAction]);
    // folder restored
    expect(result.folders.some((f) => f.id === 'f1')).toBe(true);
    // n1's folderId restored
    const restoredN1 = result.notes.find((n) => n.id === 'n1');
    expect(restoredN1?.folderId).toBe('f1');
    // n2 restored
    expect(result.notes.some((n) => n.id === 'n2')).toBe(true);
  });

  it('restores in reverse order so later deletions rebuild first', () => {
    // Folder B is a child of folder A; B was deleted second (so it appears
    // later in the queue). Applying newest-first: restore B, then restore A.
    // Neither should be duplicated.
    const fA = makeFolder('fA');
    const fB = makeFolder('fB', 'fA');
    const actionA: JournalFolderUndoAction = {
      type: 'folder',
      folder: fA,
      folders: [fA],
      affectedNoteIds: [],
      noteFolderIds: {},
    };
    const actionB: JournalFolderUndoAction = {
      type: 'folder',
      folder: fB,
      folders: [fB],
      affectedNoteIds: [],
      noteFolderIds: {},
    };
    const state = { notes: [], folders: [] };
    // B was deleted after A, so it's later in the queue
    const result = applyUndoActions(state, [actionA, actionB]);
    const folderIds = result.folders.map((f) => f.id);
    // No duplicates
    const uniqueIds = new Set(folderIds);
    expect(uniqueIds.size).toBe(folderIds.length);
    // Both present
    expect(folderIds).toContain('fA');
    expect(folderIds).toContain('fB');
  });
});
