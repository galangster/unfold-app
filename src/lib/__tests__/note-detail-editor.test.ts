import {
  buildNotePersistencePayload,
  getNativeBlockTypeCommand,
  getNativeListCommand,
  getTitleDividerPresentation,
  hasMeaningfulNoteContent,
  normalizeNativeInitialHtml,
  persistNoteSnapshot,
  type NotePersistenceInput,
} from '@/lib/note-detail-editor';
import type { Note, NoteCategory, ScriptureRef } from '@/lib/store';

const category: NoteCategory = 'study';
const scriptureRefs: ScriptureRef[] = [
  { reference: '1 Samuel 17:45-47', bookId: 9, chapter: 17, verse: 45, verseEnd: 47 },
];

const linkedInput: NotePersistenceInput = {
  title: 'Fight for the Future',
  html: '<p>David ran toward the battle.</p>',
  category,
  scriptureRefs,
  devotionalId: 'devotional-1',
  dayNumber: '2',
  bookId: '9',
  chapter: '17',
  folderId: 'folder-1',
};

describe('note-detail editor helpers', () => {
  it('treats blank title plus empty html paragraph as not meaningful', () => {
    expect(hasMeaningfulNoteContent({ title: '   ', html: '<p></p>' })).toBe(false);
  });

  it('treats title text as meaningful even if html is empty', () => {
    expect(hasMeaningfulNoteContent({ title: 'Hi', html: '<p></p>' })).toBe(true);
  });

  it('treats non-empty html as meaningful even if title is blank', () => {
    expect(hasMeaningfulNoteContent({ title: '   ', html: '<p>Hello</p>' })).toBe(true);
  });

  it('builds a normalized persistence payload from note-detail inputs', () => {
    expect(
      buildNotePersistencePayload({
        title: 'Title',
        html: '<p>Hello</p>',
        category: 'general',
        scriptureRefs: [{ reference: 'John 3:16', bookId: 43, chapter: 3, verse: 16 }],
        devotionalId: 'dev-1',
        dayNumber: '2',
        bookId: '43',
        chapter: '3',
        folderId: 'folder-1',
      }),
    ).toEqual({
      title: 'Title',
      content: '<p>Hello</p>',
      category: 'general',
      tags: [],
      isFavorite: false,
      scriptureRefs: [{ reference: 'John 3:16', bookId: 43, chapter: 3, verse: 16 }],
      devotionalId: 'dev-1',
      dayNumber: 2,
      bibleBookId: 43,
      bibleChapter: 3,
      folderId: 'folder-1',
    });
  });

  it('clears the current native list when tapping the active list type again', () => {
    expect(getNativeListCommand('bullet', 'bullet')).toEqual({ kind: 'clear-list' });
  });

  it('sets the requested native list type when switching list kinds', () => {
    expect(getNativeListCommand('checklist', 'ordered')).toEqual({
      kind: 'set-list',
      value: 'ordered',
    });
  });

  it('toggles an active heading back to body', () => {
    expect(getNativeBlockTypeCommand('h2', 'h2')).toBe('p');
  });

  it('switches to the requested heading when a different block is active', () => {
    expect(getNativeBlockTypeCommand('p', 'h3')).toBe('h3');
  });

  it('normalizes empty native html to truly empty content so placeholder starts on first body line', () => {
    expect(normalizeNativeInitialHtml('<p></p>')).toBe('');
    expect(normalizeNativeInitialHtml('<p><br></p>')).toBe('');
    expect(normalizeNativeInitialHtml('  <p>Real text</p>  ')).toBe('  <p>Real text</p>  ');
  });

  it('keeps the note title divider gold and visible while editing', () => {
    expect(getTitleDividerPresentation({ isEditing: true, accentColor: '#C8A55C', borderColor: '#222' })).toEqual({
      backgroundColor: '#C8A55C',
      height: 2,
      marginHorizontal: 24,
    });
  });
});

describe('note detail editor persistence', () => {
  it('skips empty new snapshots unless empty persistence is allowed', () => {
    const addNote = jest.fn();
    const updateNote = jest.fn();

    const id = persistNoteSnapshot({
      input: {
        title: '   ',
        html: '<p></p>',
        category,
        scriptureRefs: [],
      },
      addNote,
      updateNote,
    });

    expect(id).toBeUndefined();
    expect(addNote).not.toHaveBeenCalled();
    expect(updateNote).not.toHaveBeenCalled();
  });

  it('updates an existing note with the editable snapshot fields', () => {
    const addNote = jest.fn();
    const updateNote = jest.fn();

    const id = persistNoteSnapshot({
      noteId: 'note-1',
      input: linkedInput,
      addNote,
      updateNote,
    });

    expect(id).toBe('note-1');
    expect(addNote).not.toHaveBeenCalled();
    expect(updateNote).toHaveBeenCalledWith('note-1', {
      title: 'Fight for the Future',
      content: '<p>David ran toward the battle.</p>',
      category,
      scriptureRefs,
    });
  });

  it('creates a linked note payload and returns the generated id', () => {
    const addNote = jest.fn((note: Omit<Note, 'id' | 'createdAt' | 'updatedAt'>) => {
      expect(note).toEqual({
        title: 'Fight for the Future',
        content: '<p>David ran toward the battle.</p>',
        category,
        tags: [],
        isFavorite: false,
        scriptureRefs,
        devotionalId: 'devotional-1',
        dayNumber: 2,
        bibleBookId: 9,
        bibleChapter: 17,
        folderId: 'folder-1',
      });
      return 'new-note-1';
    });
    const updateNote = jest.fn();

    const id = persistNoteSnapshot({
      input: linkedInput,
      addNote,
      updateNote,
    });

    expect(id).toBe('new-note-1');
    expect(addNote).toHaveBeenCalledTimes(1);
    expect(updateNote).not.toHaveBeenCalled();
  });

  it('can create an intentionally empty note using the existing blank HTML fallback', () => {
    const addNote = jest.fn((note: Omit<Note, 'id' | 'createdAt' | 'updatedAt'>) => {
      expect(note.content).toBe('<p></p>');
      return 'empty-note-1';
    });
    const updateNote = jest.fn();

    const id = persistNoteSnapshot({
      input: {
        title: '',
        html: '',
        category: 'general',
        scriptureRefs: [],
      },
      allowEmpty: true,
      addNote,
      updateNote,
    });

    expect(id).toBe('empty-note-1');
    expect(updateNote).not.toHaveBeenCalled();
  });
});
