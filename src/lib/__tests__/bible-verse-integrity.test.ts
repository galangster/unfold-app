import { expectedVerseNumbers, versesMatchExpected } from '../bible-verse-integrity';

describe('expectedVerseNumbers', () => {
  it('excludes BSB Matthew 17:21 from a spanning range', () => {
    expect(expectedVerseNumbers({
      translation: 'BSB',
      bookId: 40,
      chapter: 17,
      verseStart: 20,
      verseEnd: 22,
    })).toEqual([20, 22]);
  });

  it('returns unavailable for the omitted BSB verse alone', () => {
    expect(expectedVerseNumbers({
      translation: 'BSB',
      bookId: 40,
      chapter: 17,
      verseStart: 21,
    })).toBeNull();
  });

  it('keeps KJV Matthew 17:21', () => {
    expect(expectedVerseNumbers({
      translation: 'KJV',
      bookId: 40,
      chapter: 17,
      verseStart: 21,
    })).toEqual([21]);
  });

  it('keeps KJV numbering through the same range', () => {
    expect(expectedVerseNumbers({
      translation: 'KJV',
      bookId: 40,
      chapter: 17,
      verseStart: 20,
      verseEnd: 22,
    })).toEqual([20, 21, 22]);
  });

  it('lists a complete Psalm 23 chapter', () => {
    expect(expectedVerseNumbers({
      translation: 'KJV',
      bookId: 19,
      chapter: 23,
    })).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it('lists a BSB Matthew 17 chapter without verse 21', () => {
    expect(expectedVerseNumbers({
      translation: 'BSB',
      bookId: 40,
      chapter: 17,
    })).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20,
      22, 23, 24, 25, 26, 27,
    ]);
  });

  it('excludes multiple BSB omissions in one chapter', () => {
    expect(expectedVerseNumbers({
      translation: 'BSB',
      bookId: 41,
      chapter: 9,
      verseStart: 44,
      verseEnd: 46,
    })).toEqual([45]);
  });

  it('keeps a partial in-range request', () => {
    expect(expectedVerseNumbers({
      translation: 'KJV',
      bookId: 19,
      chapter: 23,
      verseStart: 2,
      verseEnd: 3,
    })).toEqual([2, 3]);
  });

  it('rejects invalid book, chapter, and verse ranges', () => {
    expect(expectedVerseNumbers({ translation: 'KJV', bookId: 0, chapter: 1 })).toBeNull();
    expect(expectedVerseNumbers({ translation: 'KJV', bookId: 67, chapter: 1 })).toBeNull();
    expect(expectedVerseNumbers({ translation: 'KJV', bookId: 19, chapter: 0 })).toBeNull();
    expect(expectedVerseNumbers({ translation: 'KJV', bookId: 19, chapter: 151 })).toBeNull();
    expect(expectedVerseNumbers({ translation: 'KJV', bookId: 19, chapter: 23, verseStart: 7 })).toBeNull();
    expect(expectedVerseNumbers({ translation: 'KJV', bookId: 19, chapter: 23, verseStart: 5, verseEnd: 8 })).toBeNull();
    expect(expectedVerseNumbers({ translation: 'KJV', bookId: 19, chapter: 23, verseStart: 4, verseEnd: 2 })).toBeNull();
    expect(expectedVerseNumbers({ translation: 'BSB', bookId: 40, chapter: 17, verseStart: 28 })).toBeNull();
  });
});

describe('versesMatchExpected', () => {
  it('requires the exact verse sequence', () => {
    expect(versesMatchExpected([{ verse: 20 }, { verse: 22 }], [20, 22])).toBe(true);
    expect(versesMatchExpected([{ verse: 20 }, { verse: 21 }, { verse: 22 }], [20, 22])).toBe(false);
    expect(versesMatchExpected([{ verse: 20 }], [20, 22])).toBe(false);
    expect(versesMatchExpected([{ verse: 1 }, { verse: 3 }], [1, 2, 3])).toBe(false);
    expect(versesMatchExpected([], [1])).toBe(false);
    expect(versesMatchExpected([], [])).toBe(false);
  });
});
