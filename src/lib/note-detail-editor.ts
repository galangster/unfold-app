import type { NoteCategory, ScriptureRef } from './store';

export type NativeListType = 'bullet' | 'ordered' | 'checklist' | null;
export type RequestedNativeListType = Exclude<NativeListType, null>;

export type NotePersistenceInput = {
  title: string;
  html: string;
  category: NoteCategory;
  scriptureRefs: ScriptureRef[];
  devotionalId?: string;
  dayNumber?: string;
  bookId?: string;
  chapter?: string;
  folderId?: string;
};

export function hasMeaningfulNoteContent({
  title,
  html,
}: {
  title: string;
  html: string;
}): boolean {
  return Boolean(title.trim()) || Boolean(html && html !== '<p></p>');
}

export function buildNotePersistencePayload({
  title,
  html,
  category,
  scriptureRefs,
  devotionalId,
  dayNumber,
  bookId,
  chapter,
  folderId,
}: NotePersistenceInput) {
  return {
    title,
    content: html,
    category,
    tags: [],
    isFavorite: false,
    scriptureRefs,
    devotionalId,
    dayNumber: dayNumber ? Number(dayNumber) : undefined,
    bibleBookId: bookId ? Number(bookId) : undefined,
    bibleChapter: chapter ? Number(chapter) : undefined,
    folderId,
  };
}

export function getNativeListCommand(
  activeListType: NativeListType,
  requestedType: RequestedNativeListType,
): { kind: 'clear-list' } | { kind: 'set-list'; value: RequestedNativeListType } {
  if (activeListType === requestedType) {
    return { kind: 'clear-list' };
  }

  return { kind: 'set-list', value: requestedType };
}

export function getNativeBlockTypeCommand(
  activeBlockType: string,
  requestedType: 'h1' | 'h2' | 'h3',
): 'p' | 'h1' | 'h2' | 'h3' {
  return activeBlockType === requestedType ? 'p' : requestedType;
}
