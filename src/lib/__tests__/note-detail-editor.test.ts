import {
  buildNotePersistencePayload,
  legacyMarkdownToHtml,
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

const visuallyEmptyEditorHtml = [
  '<p><br></p>',
  '<p> </p>',
  '<p>&nbsp;</p>',
  `<p>${'\u00a0'}</p>`,
  `<p>${'\u200b'}</p>`,
  `<p>${'\u2060'}</p>`,
  '<p>&#8288;</p>',
  '<p>&#x2060;</p>',
  '<h1><br></h1>',
  '<blockquote><p>&nbsp;</p></blockquote>',
  '<ul><li><p></p></li></ul>',
];

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

  it.each(visuallyEmptyEditorHtml)(
    'treats visually empty editor html as not meaningful: %s',
    (html) => {
      expect(hasMeaningfulNoteContent({ title: '   ', html })).toBe(false);
    },
  );

  it.each(visuallyEmptyEditorHtml)(
    'normalizes visually empty native html to empty initial content: %s',
    (html) => {
      expect(normalizeNativeInitialHtml(html)).toBe('');
    },
  );

  it('treats image-only editor html as meaningful content', () => {
    const html = '<p><img src="file:///note-image.jpg" width="320" height="180" /></p>';

    expect(hasMeaningfulNoteContent({ title: '   ', html })).toBe(true);
    expect(normalizeNativeInitialHtml(html)).toBe(html);
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

  it('keeps the note title divider gold and visible while the keyboard is up', () => {
    expect(getTitleDividerPresentation({ isKeyboardUp: true, accentColor: '#C8A55C', borderColor: '#222' })).toEqual({
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
    }, {
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


describe('legacyMarkdownToHtml', () => {
  it('escapes markup characters so a plain-text note is never parsed as HTML', () => {
    // Before escaping, this note lost everything from "<" onward — the editor
    // parsed it as a tag — and a pasted <script> went in as one.
    expect(legacyMarkdownToHtml('a < b & c > d')).toBe('<p>a &lt; b &amp; c &gt; d</p>');
    expect(legacyMarkdownToHtml('<script>alert(1)</script>')).toBe(
      '<p>&lt;script&gt;alert(1)&lt;/script&gt;</p>',
    );
    expect(legacyMarkdownToHtml('Tom & Jerry')).toBe('<p>Tom &amp; Jerry</p>');
    // Escaping runs before the markdown pass, and does not double-escape.
    expect(legacyMarkdownToHtml('**bold & <b>**')).toBe('<p><strong>bold &amp; &lt;b&gt;</strong></p>');
  });

  it('groups consecutive bullet lines into one list', () => {
    expect(legacyMarkdownToHtml('- milk\n- bread\n- eggs')).toBe(
      '<ul><li>milk</li><li>bread</li><li>eggs</li></ul>',
    );
  });

  it('groups consecutive task lines into one task list, preserving checked state', () => {
    expect(legacyMarkdownToHtml('[x] done\n[ ] todo')).toBe(
      '<ul data-type="taskList">' +
        '<li data-type="taskItem" data-checked="true"><label><input type="checkbox" checked /></label><div>done</div></li>' +
        '<li data-type="taskItem" data-checked="false"><label><input type="checkbox" /></label><div>todo</div></li>' +
        '</ul>',
    );
  });

  it('starts a new list when the run is broken, and closes lists at the end', () => {
    expect(legacyMarkdownToHtml('- a\ntext\n- b')).toBe(
      '<ul><li>a</li></ul><p>text</p><ul><li>b</li></ul>',
    );
    expect(legacyMarkdownToHtml('- a\n[ ] b')).toBe(
      '<ul><li>a</li></ul>' +
        '<ul data-type="taskList"><li data-type="taskItem" data-checked="false"><label><input type="checkbox" /></label><div>b</div></li></ul>',
    );
  });

  it('keeps bold and italic, blank lines and the empty fallback', () => {
    expect(legacyMarkdownToHtml('**bold** and *soft*')).toBe(
      '<p><strong>bold</strong> and <em>soft</em></p>',
    );
    expect(legacyMarkdownToHtml('one\n\ntwo')).toBe('<p>one</p><p></p><p>two</p>');
    expect(legacyMarkdownToHtml('')).toBe('<p></p>');
  });
});
