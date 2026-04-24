import { buildSavedHighlights, toBibleSavedItem } from '@/lib/saved-highlights';
import type { BibleHighlight, Highlight } from '@/lib/store';

const devotionalHighlight = (overrides: Partial<Highlight> = {}): Highlight => ({
  id: 'dev-1',
  devotionalId: 'devotional-1',
  devotionalTitle: 'Quiet Courage',
  dayNumber: 3,
  dayTitle: 'Stand Firm',
  highlightedText: 'Be strong and courageous.',
  color: 'yellow',
  createdAt: '2026-04-21T10:00:00.000Z',
  ...overrides,
});

const bibleHighlight = (overrides: Partial<BibleHighlight> = {}): BibleHighlight => ({
  id: 'bible-1',
  bookId: 43,
  bookName: 'John',
  chapter: 3,
  verseStart: 16,
  verseEnd: 16,
  text: 'For God so loved the world.',
  color: 'blue',
  translation: 'BSB',
  createdAt: '2026-04-22T10:00:00.000Z',
  ...overrides,
});

describe('useSavedHighlights adapters', () => {
  it('maps note-only scripture saves as note items without forcing highlight color', () => {
    const item = toBibleSavedItem(
      bibleHighlight({ id: 'note-only', color: null, note: 'This verse helped me pray today.' }),
    );

    expect(item).toMatchObject({
      id: 'note-only',
      source: 'bible',
      kind: 'note',
      note: 'This verse helped me pray today.',
      hasNote: true,
      color: null,
      contextLabel: 'John 3:16 (BSB)',
    });
  });

  it('drops invisible bible records that have neither highlight color nor note', () => {
    expect(toBibleSavedItem(bibleHighlight({ color: null, note: '   ' }))).toBeNull();
  });

  it('keeps highlighted scripture notes in both notes and highlights filters without duplicating all items', () => {
    const saved = buildSavedHighlights(
      [devotionalHighlight()],
      [
        bibleHighlight({ id: 'note-only', color: null, note: 'A prayer note.' }),
        bibleHighlight({ id: 'highlight-only', color: 'green', note: undefined }),
        bibleHighlight({ id: 'highlight-with-note', color: 'purple', note: 'Also my note.' }),
      ],
    );

    expect(saved.all.map((item) => item.id).sort()).toEqual([
      'dev-1',
      'highlight-only',
      'highlight-with-note',
      'note-only',
    ].sort());
    expect(saved.notes.map((item) => item.id).sort()).toEqual(['highlight-with-note', 'note-only'].sort());
    expect(saved.highlights.map((item) => item.id).sort()).toEqual([
      'dev-1',
      'highlight-only',
      'highlight-with-note',
    ].sort());
    expect(saved.count).toMatchObject({
      all: 4,
      notes: 2,
      highlights: 3,
      devotional: 1,
      bible: 3,
    });
  });
});
