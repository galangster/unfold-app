import type { Note, NoteFolder } from '@/lib/store';
import type { JournalFolderUndoAction } from '@/lib/journal-folder-delete';

export type JournalUndoAction = { type: 'note'; note: Note } | JournalFolderUndoAction;

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
      notes = [action.note, ...notes];
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
