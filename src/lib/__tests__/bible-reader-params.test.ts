/**
 * P3-4 item 2c — Bible reader params are clamped to the canon and to the
 * book's real chapter/verse range instead of `parseInt(...) || 1`.
 */
import {
  MAX_BOOK_ID,
  MAX_VERSE_NUMBER,
  clampBookId,
  clampChapter,
  buildBibleReaderLayoutKey,
  isCurrentBibleLayoutReport,
  findVisibleVerseAnchor,
  getChapterCount,
  resolveActiveVerseScrollTarget,
  resolveBibleReaderLocation,
  resolveBibleResizeVerseAnchor,
  resolveInitialVerseAnchor,
  resolveRecordedVerseAnchor,
  resolveTargetVerse,
  resolveTranslationRefreshVerse,
  resolveVerseScrollTarget,
  shouldFlashVerseForScroll,
} from '../bible-reader-params';

describe('clampBookId', () => {
  it.each([
    ['43', 43],
    ['1', 1],
    ['66', 66],
    ['0', 1],
    ['-4', 1],
    ['67', 66],
    ['999', 66],
    ['abc', 1],
    ['', 1],
    [undefined, 1],
    [['19', '1'], 19],
    ['3abc', 3],
  ])('%j → %s', (input, expected) => {
    expect(clampBookId(input as string | string[] | undefined)).toBe(expected);
  });

  it('caps at the 66-book canon', () => {
    expect(MAX_BOOK_ID).toBe(66);
  });
});

describe('clampChapter', () => {
  it('clamps to the real chapter count of the book', () => {
    expect(getChapterCount(19)).toBe(150);
    expect(getChapterCount(65)).toBe(1);
    expect(clampChapter('150', 19)).toBe(150);
    expect(clampChapter('151', 19)).toBe(150);
    expect(clampChapter('9999', 43)).toBe(21);
    expect(clampChapter('2', 65)).toBe(1);
    expect(clampChapter('0', 1)).toBe(1);
    expect(clampChapter('-3', 1)).toBe(1);
    expect(clampChapter('x', 1)).toBe(1);
    expect(clampChapter(undefined, 1)).toBe(1);
    expect(clampChapter('12', 1)).toBe(12);
  });

  it('falls back to a single chapter for an unknown book id', () => {
    expect(getChapterCount(999)).toBe(1);
    expect(clampChapter('40', 999)).toBe(1);
  });
});

describe('resolveBibleReaderLocation', () => {
  it('keeps every legitimate in-app producer shape unchanged', () => {
    expect(resolveBibleReaderLocation({ bookId: '43', chapter: '3' })).toEqual({ bookId: 43, chapter: 3 });
    expect(resolveBibleReaderLocation({ bookId: '1', chapter: '50' })).toEqual({ bookId: 1, chapter: 50 });
    expect(resolveBibleReaderLocation({})).toEqual({ bookId: 1, chapter: 1 });
  });

  it('clamps an out-of-range deep link onto a real chapter of a real book', () => {
    expect(resolveBibleReaderLocation({ bookId: '999', chapter: '9999' })).toEqual({ bookId: 66, chapter: 22 });
    expect(resolveBibleReaderLocation({ bookId: '0', chapter: '0' })).toEqual({ bookId: 1, chapter: 1 });
    expect(resolveBibleReaderLocation({ bookId: '8', chapter: '99' })).toEqual({ bookId: 8, chapter: 4 });
  });
});

describe('resolveTargetVerse', () => {
  const chapter = [{ verse: 1 }, { verse: 2 }, { verse: 3 }];

  it('returns null when absent or invalid', () => {
    expect(resolveTargetVerse(undefined, chapter)).toBeNull();
    expect(resolveTargetVerse('', chapter)).toBeNull();
    expect(resolveTargetVerse('0', chapter)).toBeNull();
    expect(resolveTargetVerse('-2', chapter)).toBeNull();
    expect(resolveTargetVerse('abc', chapter)).toBeNull();
  });

  it('clamps to the loaded chapter\'s last verse', () => {
    expect(resolveTargetVerse('2', chapter)).toBe(2);
    expect(resolveTargetVerse('3', chapter)).toBe(3);
    expect(resolveTargetVerse('16', chapter)).toBe(3);
    expect(resolveTargetVerse('99999', chapter)).toBe(3);
    expect(resolveTargetVerse(['2', '9'], chapter)).toBe(2);
  });

  it('caps at the canon-wide ceiling before the chapter loads', () => {
    expect(resolveTargetVerse('16', undefined)).toBe(16);
    expect(resolveTargetVerse('16', [])).toBe(16);
    expect(resolveTargetVerse('99999', null)).toBe(MAX_VERSE_NUMBER);
  });
});

describe('resolveInitialVerseAnchor', () => {
  const history = [
    { bookId: 24, chapter: 16, verse: 12 },
    { bookId: 43, chapter: 3, verse: 8 },
  ];

  it('resumes the saved verse for the current chapter', () => {
    expect(resolveInitialVerseAnchor({ bookId: 24, chapter: 16, history })).toBe(12);
  });

  it('keeps old history rows at the chapter start', () => {
    expect(resolveInitialVerseAnchor({
      bookId: 24,
      chapter: 16,
      history: [{ bookId: 24, chapter: 16 }],
    })).toBeNull();
  });
});

describe('resolveRecordedVerseAnchor', () => {
  it('preserves and clamps the current anchor when translation changes', () => {
    const verses = Array.from({ length: 10 }, (_, index) => ({ verse: index + 1 }));
    expect(resolveRecordedVerseAnchor({ entryVerse: 1, currentVerse: 8, verses })).toBe(8);
    expect(resolveRecordedVerseAnchor({ entryVerse: 1, currentVerse: 12, verses })).toBe(10);
  });

  it('uses the chapter-entry verse before any settled scroll exists', () => {
    expect(resolveRecordedVerseAnchor({ entryVerse: 4, verses: undefined })).toBe(4);
  });
});

describe('resolveTranslationRefreshVerse', () => {
  const persistedPosition = { chapterKey: '43:3', verse: 16 };

  it('restores the persisted verse when a translation replaces the same chapter', () => {
    expect(resolveTranslationRefreshVerse({
      hadPreviousContent: true,
      previousChapterKey: '43:3',
      chapterKey: '43:3',
      persistedPosition,
    })).toBe(16);
  });

  it('does not carry an anchor across chapters or treat first mount as refresh', () => {
    expect(resolveTranslationRefreshVerse({
      hadPreviousContent: true,
      previousChapterKey: '43:3',
      chapterKey: '43:4',
      persistedPosition,
    })).toBeNull();
    expect(resolveTranslationRefreshVerse({
      hadPreviousContent: false,
      previousChapterKey: '',
      chapterKey: '43:3',
      persistedPosition,
    })).toBeNull();
  });
});

describe('resolveVerseScrollTarget', () => {
  const verses = [{ verse: 1 }, { verse: 2 }, { verse: 3 }, { verse: 4 }];

  it('uses a saved anchor once on chapter entry', () => {
    expect(resolveVerseScrollTarget({
      savedVerse: 3,
      savedVerseConsumed: false,
      verses,
    })).toEqual({ verse: 3, source: 'saved' });
  });

  it('gives an explicit target priority before the saved fallback is consumed', () => {
    expect(resolveVerseScrollTarget({
      routeVerse: '2',
      savedVerse: 3,
      savedVerseConsumed: false,
      verses,
    })).toEqual({ verse: 2, source: 'explicit' });
  });

  it('does not replay a consumed saved anchor after verses reload', () => {
    expect(resolveVerseScrollTarget({
      savedVerse: 3,
      savedVerseConsumed: true,
      verses: [...verses],
    })).toBeNull();
  });

  it('accepts a later explicit same-chapter target after fallback consumption', () => {
    expect(resolveVerseScrollTarget({
      routeVerse: '2',
      savedVerse: 3,
      savedVerseConsumed: true,
      verses,
    })).toEqual({ verse: 2, source: 'explicit' });
  });

  it('does not replay an explicit target after that route value is consumed', () => {
    expect(resolveVerseScrollTarget({
      routeVerse: '2',
      explicitVerseConsumed: true,
      savedVerse: 3,
      savedVerseConsumed: true,
      verses,
    })).toBeNull();
  });
});

describe('buildBibleReaderLayoutKey', () => {
  it('changes when the bounded width or text size changes', () => {
    const base = buildBibleReaderLayoutKey({
      readableWidth: 672,
      fontSize: 18,
      lineHeightMultiplier: 1.8,
      fontScale: 1,
      fontFamily: 'SourceSerif',
    });
    expect(buildBibleReaderLayoutKey({
      readableWidth: 520,
      fontSize: 18,
      lineHeightMultiplier: 1.8,
      fontScale: 1,
      fontFamily: 'SourceSerif',
    })).not.toBe(base);
    expect(buildBibleReaderLayoutKey({
      readableWidth: 672,
      fontSize: 22,
      lineHeightMultiplier: 1.8,
      fontScale: 1,
      fontFamily: 'SourceSerif',
    })).not.toBe(base);
    expect(buildBibleReaderLayoutKey({
      readableWidth: 672,
      fontSize: 18,
      lineHeightMultiplier: 1.8,
      fontScale: 1,
      fontFamily: 'SourceSerif',
    })).toBe(base);
  });
});

describe('isCurrentBibleLayoutReport', () => {
  const active = { activeContentKey: '1:1:web', activeLayoutKey: '672:18:180:100:serif' };

  it('accepts only measurements from the active content and layout generation', () => {
    expect(isCurrentBibleLayoutReport({
      ...active,
      reportContentKey: '1:1:web',
      reportLayoutKey: '672:18:180:100:serif',
    })).toBe(true);
    expect(isCurrentBibleLayoutReport({
      ...active,
      reportContentKey: '1:1:web',
      reportLayoutKey: '672:18:180:160:serif',
    })).toBe(false);
    expect(isCurrentBibleLayoutReport({
      ...active,
      reportContentKey: '1:2:web',
      reportLayoutKey: '672:18:180:100:serif',
    })).toBe(false);
  });
});

describe('resolveActiveVerseScrollTarget', () => {
  const verses = [{ verse: 1 }, { verse: 2 }, { verse: 8 }, { verse: 16 }];

  it('keeps explicit incoming navigation ahead of a layout refresh', () => {
    expect(resolveActiveVerseScrollTarget({
      routeTarget: { verse: 2, source: 'explicit' },
      refreshVerse: 16,
      refreshContentKey: '43:3:web',
      activeContentKey: '43:3:web',
      verses,
    })).toEqual({ verse: 2, source: 'explicit' });
  });

  it('keeps a saved chapter-entry target ahead of a layout refresh', () => {
    expect(resolveActiveVerseScrollTarget({
      routeTarget: { verse: 8, source: 'saved' },
      refreshVerse: 16,
      refreshContentKey: '43:3:web',
      activeContentKey: '43:3:web',
      verses,
    })).toEqual({ verse: 8, source: 'saved' });
  });

  it('restores the captured verse after reflow when no explicit target remains', () => {
    expect(resolveActiveVerseScrollTarget({
      routeTarget: null,
      refreshVerse: 16,
      refreshContentKey: '43:3:web',
      activeContentKey: '43:3:web',
      verses,
    })).toEqual({ verse: 16, source: 'refresh' });
  });

  it('ignores a refresh belonging to a previous content key', () => {
    expect(resolveActiveVerseScrollTarget({
      routeTarget: null,
      refreshVerse: 16,
      refreshContentKey: '43:3:kjv',
      activeContentKey: '43:3:web',
      verses,
    })).toBeNull();
  });
});

describe('shouldFlashVerseForScroll', () => {
  it('flashes only explicit verse navigation, not a passive resize restore', () => {
    expect(shouldFlashVerseForScroll('explicit')).toBe(true);
    expect(shouldFlashVerseForScroll('saved')).toBe(false);
    expect(shouldFlashVerseForScroll('refresh')).toBe(false);
    expect(shouldFlashVerseForScroll(null)).toBe(false);
  });
});

describe('findVisibleVerseAnchor', () => {
  const layouts = { 1: 0, 2: 72, 3: 156, 4: 238 };

  it('uses the same header offset as scroll-to-verse positioning', () => {
    expect(findVisibleVerseAnchor(layouts, 144, 12)).toBe(3);
  });

  it('keeps the preceding verse while its text remains at the visible top', () => {
    expect(findVisibleVerseAnchor(layouts, 180, 12)).toBe(3);
    expect(findVisibleVerseAnchor(layouts, 226, 12)).toBe(4);
  });

  it('returns null until verse layouts exist', () => {
    expect(findVisibleVerseAnchor({}, 200, 12)).toBeNull();
  });
});

describe('resolveBibleResizeVerseAnchor', () => {
  const layouts = { 1: 0, 8: 240, 16: 520 };
  const persistedPosition = { chapterKey: '43:3', verse: 8 };

  it('captures the live verse when resize starts during drag or momentum', () => {
    expect(resolveBibleResizeVerseAnchor({
      userScrollActive: true,
      layouts,
      contentOffsetY: 510,
      headerOffset: 12,
      persistedPosition,
      chapterKey: '43:3',
      entryVerse: 1,
    })).toBe(16);
  });

  it('keeps the persisted semantic verse on native reflow without an active scroll', () => {
    expect(resolveBibleResizeVerseAnchor({
      userScrollActive: false,
      layouts: { 1: 0, 8: 80, 16: 160 },
      contentOffsetY: 0,
      headerOffset: 12,
      persistedPosition,
      chapterKey: '43:3',
      entryVerse: 1,
    })).toBe(8);
  });

  it('falls back to the persisted verse when a drag has no layouts yet', () => {
    expect(resolveBibleResizeVerseAnchor({
      userScrollActive: true,
      layouts: {},
      contentOffsetY: 510,
      headerOffset: 12,
      persistedPosition,
      chapterKey: '43:3',
      entryVerse: 1,
    })).toBe(8);
  });
});
