import type { Note, NoteFolder } from '@/lib/store';

export type JournalFolderUndoAction = {
  type: 'folder';
  folder: NoteFolder;
  folders: NoteFolder[];
  affectedNoteIds: string[];
  noteFolderIds: Record<string, string | undefined>;
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
  folders = [folder],
  notes,
  descendantFolderIds,
  activeFolderId,
  currentParentId,
}: {
  folder: NoteFolder;
  folders?: readonly NoteFolder[];
  notes: readonly Note[];
  descendantFolderIds: readonly string[];
  activeFolderId: string | null;
  currentParentId: string | null;
}): JournalFolderDeletePlan {
  const deletedFolderIds = new Set(descendantFolderIds);
  deletedFolderIds.add(folder.id);

  const deletedFolders = folders.filter((candidate) => deletedFolderIds.has(candidate.id));
  if (!deletedFolders.some((candidate) => candidate.id === folder.id)) {
    deletedFolders.unshift(folder);
  }

  const affectedNotes = notes.filter((note) =>
    note.folderId ? deletedFolderIds.has(note.folderId) : false,
  );
  const affectedNoteIds = affectedNotes.map((note) => note.id);
  const noteFolderIds = Object.fromEntries(
    affectedNotes.map((note) => [note.id, note.folderId]),
  );

  const parentId = folder.parentId ?? null;
  const navigation = getNavigationAfterFolderDelete({
    deletedFolderIds,
    parentId,
    activeFolderId,
    currentParentId,
  });

  return {
    deletedFolderIds,
    undoAction: { type: 'folder', folder, folders: deletedFolders, affectedNoteIds, noteFolderIds },
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
