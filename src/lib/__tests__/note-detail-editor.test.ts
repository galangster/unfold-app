import {
  buildNotePersistencePayload,
  getNativeBlockTypeCommand,
  getNativeListCommand,
  hasMeaningfulNoteContent,
} from '../note-detail-editor';

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
});
