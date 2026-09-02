import {
  buildPersonalDataSyncChange,
  noteFolderSyncData,
  noteSyncData,
} from '@/lib/personal-data-sync-records';
import { enqueueSyncChanges, removeSyncChangesForRecords } from '@/lib/sync-outbox';
import type { Note, NoteFolder } from '@/lib/store';
import type { JournalFolderUndoAction } from '@/lib/journal-folder-delete';
import type { SyncTable } from '@/lib/sync-types';

export type JournalUndoAction = { type: 'note'; note: Note } | JournalFolderUndoAction;

type UndoRestoredRecord = {
  table: SyncTable;
  id: string;
  data: Record<string, unknown>;
};

/**
 * Pure reducer: applies a queue of undo actions to a journal state snapshot.
 *
 * Actions are applied newest-first (reverse queue order) so that later
 * deletions are rebuilt before earlier ones — preserving correct parent/child
 * folder relationships when a folder tree was deleted in pieces.
 *
 * This encodes the same restore logic previously inlined at
 * (journal)/index.tsx:954-973, centralised here for queue support.
 */
export function applyUndoActions(
  state: { notes: Note[]; folders: NoteFolder[] },
  actions: JournalUndoAction[],
): { notes: Note[]; folders: NoteFolder[] } {
  let notes = [...state.notes];
  let folders = [...state.folders];

  // Newest-first: later deletions rebuild first
  const reversed = [...actions].reverse();

  for (const action of reversed) {
    if (action.type === 'note') {
      // Never insert an id that is already live (Undo, then "Restore" from
      // Recently Deleted for the same note): the live copy is the newer one.
      if (!notes.some((note) => note.id === action.note.id)) {
        notes = [action.note, ...notes];
      }
    } else if (action.type === 'folder') {
      // Restore deleted folder tree, deduplicating by id
      folders = [
        ...folders.filter(
          (folder) => !action.folders.some((restoredFolder) => restoredFolder.id === folder.id),
        ),
        ...action.folders,
      ];
      // Restore each affected note's original folderId
      notes = notes.map((n) =>
        action.affectedNoteIds.includes(n.id)
          ? { ...n, folderId: action.noteFolderIds[n.id] }
          : n,
      );
    }
  }

  return { notes, folders };
}

function restoredUndoIds(actions: JournalUndoAction[]): {
  noteIds: Set<string>;
  folderIds: Set<string>;
} {
  const noteIds = new Set<string>();
  const folderIds = new Set<string>();

  for (const action of actions) {
    if (action.type === 'note') {
      noteIds.add(action.note.id);
    } else if (action.type === 'folder') {
      for (const folder of action.folders) folderIds.add(folder.id);
      for (const noteId of action.affectedNoteIds) noteIds.add(noteId);
    }
  }

  return { noteIds, folderIds };
}

function stampRestoredUndoEntities(
  state: { notes: Note[]; folders: NoteFolder[] },
  actions: JournalUndoAction[],
  updatedAt: string,
): { notes: Note[]; folders: NoteFolder[] } {
  const { noteIds, folderIds } = restoredUndoIds(actions);

  return {
    notes: state.notes.map((note) =>
      noteIds.has(note.id) ? { ...note, updatedAt } : note,
    ),
    folders: state.folders.map((folder) =>
      folderIds.has(folder.id) ? { ...folder, updatedAt } : folder,
    ),
  };
}

function restoredUndoSyncRecords(
  state: { notes: Note[]; folders: NoteFolder[] },
  actions: JournalUndoAction[],
): UndoRestoredRecord[] {
  const { noteIds, folderIds } = restoredUndoIds(actions);
  const records = new Map<string, UndoRestoredRecord>();

  for (const note of state.notes) {
    if (!noteIds.has(note.id)) continue;
    records.set(`notes:${note.id}`, {
      table: 'notes',
      id: note.id,
      data: noteSyncData(note),
    });
  }

  for (const folder of state.folders) {
    if (!folderIds.has(folder.id)) continue;
    records.set(`note_folders:${folder.id}`, {
      table: 'note_folders',
      id: folder.id,
      data: noteFolderSyncData(folder),
    });
  }

  return Array.from(records.values());
}

export function applyUndoActionsWithSync(
  state: { notes: Note[]; folders: NoteFolder[] },
  actions: JournalUndoAction[],
  clientUpdatedAt = new Date().toISOString(),
): { notes: Note[]; folders: NoteFolder[] } {
  const restored = stampRestoredUndoEntities(
    applyUndoActions(state, actions),
    actions,
    clientUpdatedAt,
  );
  const records = restoredUndoSyncRecords(restored, actions);
  if (records.length > 0) {
    removeSyncChangesForRecords(records.map(({ table, id }) => ({ table, id })));
    enqueueSyncChanges(
      records.map((record) =>
        buildPersonalDataSyncChange(record.table, record.id, record.data, clientUpdatedAt, false),
      ),
    );
  }
  return restored;
}

type RecentlyDeletedNote = { note: Note; deletedAt: string };

/**
 * The hub's Undo: restores the deleted notes/folders and clears the restored
 * notes from Recently Deleted — deleteNote parks a copy there (WR-15), and a
 * copy left behind let "Restore" insert the same id a second time.
 */
export function undoJournalDeletions(
  state: { notes: Note[]; folders: NoteFolder[]; deletedNotes: RecentlyDeletedNote[] },
  actions: JournalUndoAction[],
  clientUpdatedAt = new Date().toISOString(),
): { notes: Note[]; folders: NoteFolder[]; deletedNotes: RecentlyDeletedNote[] } {
  const restored = applyUndoActionsWithSync(
    { notes: state.notes, folders: state.folders },
    actions,
    clientUpdatedAt,
  );
  const { noteIds } = restoredUndoIds(actions);
  return {
    ...restored,
    deletedNotes: state.deletedNotes.filter((entry) => !noteIds.has(entry.note.id)),
  };
}
