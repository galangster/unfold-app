import {
  prepareJournalFolderDelete,
} from '../journal-folder-delete';
import type { Note, NoteFolder } from '../store';

function folder(overrides: Partial<NoteFolder> = {}): NoteFolder {
  return {
    id: 'folder-1',
    name: 'Folder 1',
    color: '#C9A45A',
    sortOrder: 0,
    createdAt: '2026-04-25T00:00:00.000Z',
    updatedAt: '2026-04-25T00:00:00.000Z',
    ...overrides,
  };
}

function note(overrides: Partial<Note> = {}): Note {
  return {
    id: 'note-1',
    title: 'Note 1',
    content: 'Body',
    createdAt: '2026-04-25T00:00:00.000Z',
    updatedAt: '2026-04-25T00:00:00.000Z',
    category: 'general',
    tags: [],
    isFavorite: false,
    scriptureRefs: [],
    ...overrides,
  };
}

describe('journal folder delete helper', () => {
  it('builds undo state from every note and folder that would be removed', () => {
    const root = folder({ id: 'folder-1' });
    const child = folder({ id: 'child-1', name: 'Child', parentId: 'folder-1', sortOrder: 0 });
    const grandchild = folder({ id: 'grandchild-1', name: 'Grandchild', parentId: 'child-1', sortOrder: 0 });
    const plan = prepareJournalFolderDelete({
      folder: root,
      folders: [root, child, grandchild],
      notes: [
        note({ id: 'a', folderId: 'folder-1' }),
        note({ id: 'b', folderId: 'child-1' }),
        note({ id: 'c', folderId: 'grandchild-1' }),
        note({ id: 'd', folderId: 'other' }),
      ],
      descendantFolderIds: ['child-1', 'grandchild-1'],
      activeFolderId: 'other',
      currentParentId: null,
    } as Parameters<typeof prepareJournalFolderDelete>[0] & { folders: NoteFolder[] });

    expect(plan.undoAction).toEqual({
      type: 'folder',
      folder: root,
      folders: [root, child, grandchild],
      affectedNoteIds: ['a', 'b', 'c'],
      noteFolderIds: {
        a: 'folder-1',
        b: 'child-1',
        c: 'grandchild-1',
      },
    });
    expect(plan.deletedFolderIds).toEqual(new Set(['folder-1', 'child-1', 'grandchild-1']));
  });

  it('resets navigation when the active folder or current parent is deleted', () => {
    expect(
      prepareJournalFolderDelete({
        folder: folder({ id: 'folder-1', parentId: 'parent-1' }),
        notes: [],
        descendantFolderIds: ['child-1'],
        activeFolderId: 'child-1',
        currentParentId: 'child-1',
      }).navigation,
    ).toEqual({ activeFolderId: 'parent-1', currentParentId: 'parent-1' });

    expect(
      prepareJournalFolderDelete({
        folder: folder({ id: 'folder-1' }),
        notes: [],
        descendantFolderIds: ['child-1'],
        activeFolderId: 'outside',
        currentParentId: 'child-1',
      }).navigation,
    ).toEqual({ activeFolderId: 'outside', currentParentId: null });
  });
});
