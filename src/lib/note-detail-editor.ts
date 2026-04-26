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

export type PersistNoteSnapshotOptions = {
  noteId?: string;
  input: NotePersistenceInput;
  allowEmpty?: boolean;
  addNote: (note: ReturnType<typeof buildNotePersistencePayload>) => string;
  updateNote: (
    noteId: string,
    updates: Pick<ReturnType<typeof buildNotePersistencePayload>, 'title' | 'content' | 'category' | 'scriptureRefs'>,
  ) => void;
};

export function persistNoteSnapshot({
  noteId,
  input,
  allowEmpty = false,
  addNote,
  updateNote,
}: PersistNoteSnapshotOptions): string | undefined {
  const html = allowEmpty ? (input.html || '<p></p>') : input.html;

  if (!allowEmpty && !hasMeaningfulNoteContent({ title: input.title, html })) {
    return undefined;
  }

  if (noteId) {
    updateNote(noteId, {
      title: input.title,
      content: html,
      category: input.category,
      scriptureRefs: input.scriptureRefs,
    });
    return noteId;
  }

  return addNote(buildNotePersistencePayload({
    ...input,
    html,
  }));
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

export function normalizeNativeInitialHtml(html: string): string {
  const normalized = html.trim().toLowerCase();
  if (normalized === '<p></p>' || normalized === '<p><br></p>') {
    return '';
  }

  return html;
}

export function getTitleDividerPresentation({
  isEditing,
  accentColor,
  borderColor,
}: {
  isEditing: boolean;
  accentColor: string;
  borderColor: string;
}): { backgroundColor: string; height?: number; marginHorizontal?: number } {
  if (!isEditing) {
    return { backgroundColor: accentColor };
  }

  const visibleAccent = accentColor || borderColor;
  return {
    backgroundColor: visibleAccent,
    height: 2,
    marginHorizontal: 24,
  };
}
