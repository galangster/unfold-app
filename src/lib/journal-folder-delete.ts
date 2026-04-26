import type { Note, NoteFolder } from '@/lib/store';

export type JournalFolderUndoAction = {
  type: 'folder';
  folder: NoteFolder;
  affectedNoteIds: string[];
};

export type JournalFolderDeleteNavigation = {
  activeFolderId: string | null;
  currentParentId: string | null;
};

export type JournalFolderDeletePlan = {
  deletedFolderIds: Set<string>;
  undoAction: JournalFolderUndoAction;
  navigation: JournalFolderDeleteNavigation;
};

export function prepareJournalFolderDelete({
  folder,
  notes,
  descendantFolderIds,
  activeFolderId,
  currentParentId,
}: {
  folder: NoteFolder;
  notes: readonly Note[];
  descendantFolderIds: readonly string[];
  activeFolderId: string | null;
  currentParentId: string | null;
}): JournalFolderDeletePlan {
  const affectedNoteIds = notes
    .filter((note) => note.folderId === folder.id)
    .map((note) => note.id);

  const deletedFolderIds = new Set(descendantFolderIds);
  deletedFolderIds.add(folder.id);

  const parentId = folder.parentId ?? null;
  const navigation = getNavigationAfterFolderDelete({
    deletedFolderIds,
    parentId,
    activeFolderId,
    currentParentId,
  });

  return {
    deletedFolderIds,
    undoAction: { type: 'folder', folder, affectedNoteIds },
    navigation,
  };
}

function getNavigationAfterFolderDelete({
  deletedFolderIds,
  parentId,
  activeFolderId,
  currentParentId,
}: {
  deletedFolderIds: Set<string>;
  parentId: string | null;
  activeFolderId: string | null;
  currentParentId: string | null;
}): JournalFolderDeleteNavigation {
  if (activeFolderId !== null && deletedFolderIds.has(activeFolderId)) {
    return { activeFolderId: parentId, currentParentId: parentId };
  }

  if (currentParentId !== null && deletedFolderIds.has(currentParentId)) {
    return { activeFolderId, currentParentId: parentId };
  }

  return { activeFolderId, currentParentId };
}
