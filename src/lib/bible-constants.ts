/**
 * Bible Constants
 *
 * Static metadata for all 66 books of the Bible. No database dependency.
 * Used by the UI for book lists, navigation, and reference parsing.
 *
 * Data verified against:
 * - KJV chapter counts (standard Protestant canon)
 * - OSIS abbreviation standards
 */

// ─── Types ───────────────────────────────────────────────────────────────────

export interface BibleBookInfo {
  id: number;
  name: string;
  abbreviation: string;
  testament: 'OT' | 'NT';
  chapterCount: number;
}

export interface ParsedReference {
  bookId: number;
  chapter: number;
  verse?: number;
  verseEnd?: number;
}

// ─── All 66 Books ────────────────────────────────────────────────────────────

export const BIBLE_BOOKS: BibleBookInfo[] = [
  // Old Testament (39 books)
  { id: 1,  name: 'Genesis',         abbreviation: 'Gen',    testament: 'OT', chapterCount: 50  },
  { id: 2,  name: 'Exodus',          abbreviation: 'Exod',   testament: 'OT', chapterCount: 40  },
  { id: 3,  name: 'Leviticus',       abbreviation: 'Lev',    testament: 'OT', chapterCount: 27  },
  { id: 4,  name: 'Numbers',         abbreviation: 'Num',    testament: 'OT', chapterCount: 36  },
  { id: 5,  name: 'Deuteronomy',     abbreviation: 'Deut',   testament: 'OT', chapterCount: 34  },
  { id: 6,  name: 'Joshua',          abbreviation: 'Josh',   testament: 'OT', chapterCount: 24  },
  { id: 7,  name: 'Judges',          abbreviation: 'Judg',   testament: 'OT', chapterCount: 21  },
  { id: 8,  name: 'Ruth',            abbreviation: 'Ruth',   testament: 'OT', chapterCount: 4   },
  { id: 9,  name: '1 Samuel',        abbreviation: '1Sam',   testament: 'OT', chapterCount: 31  },
  { id: 10, name: '2 Samuel',        abbreviation: '2Sam',   testament: 'OT', chapterCount: 24  },
  { id: 11, name: '1 Kings',         abbreviation: '1Kgs',   testament: 'OT', chapterCount: 22  },
  { id: 12, name: '2 Kings',         abbreviation: '2Kgs',   testament: 'OT', chapterCount: 25  },
  { id: 13, name: '1 Chronicles',    abbreviation: '1Chr',   testament: 'OT', chapterCount: 29  },
  { id: 14, name: '2 Chronicles',    abbreviation: '2Chr',   testament: 'OT', chapterCount: 36  },
  { id: 15, name: 'Ezra',            abbreviation: 'Ezra',   testament: 'OT', chapterCount: 10  },
  { id: 16, name: 'Nehemiah',        abbreviation: 'Neh',    testament: 'OT', chapterCount: 13  },
  { id: 17, name: 'Esther',          abbreviation: 'Esth',   testament: 'OT', chapterCount: 10  },
  { id: 18, name: 'Job',             abbreviation: 'Job',    testament: 'OT', chapterCount: 42  },
  { id: 19, name: 'Psalms',          abbreviation: 'Ps',     testament: 'OT', chapterCount: 150 },
  { id: 20, name: 'Proverbs',        abbreviation: 'Prov',   testament: 'OT', chapterCount: 31  },
  { id: 21, name: 'Ecclesiastes',    abbreviation: 'Eccl',   testament: 'OT', chapterCount: 12  },
  { id: 22, name: 'Song of Solomon', abbreviation: 'Song',   testament: 'OT', chapterCount: 8   },
  { id: 23, name: 'Isaiah',          abbreviation: 'Isa',    testament: 'OT', chapterCount: 66  },
  { id: 24, name: 'Jeremiah',        abbreviation: 'Jer',    testament: 'OT', chapterCount: 52  },
  { id: 25, name: 'Lamentations',    abbreviation: 'Lam',    testament: 'OT', chapterCount: 5   },
  { id: 26, name: 'Ezekiel',         abbreviation: 'Ezek',   testament: 'OT', chapterCount: 48  },
  { id: 27, name: 'Daniel',          abbreviation: 'Dan',    testament: 'OT', chapterCount: 12  },
  { id: 28, name: 'Hosea',           abbreviation: 'Hos',    testament: 'OT', chapterCount: 14  },
  { id: 29, name: 'Joel',            abbreviation: 'Joel',   testament: 'OT', chapterCount: 3   },
  { id: 30, name: 'Amos',            abbreviation: 'Amos',   testament: 'OT', chapterCount: 9   },
  { id: 31, name: 'Obadiah',         abbreviation: 'Obad',   testament: 'OT', chapterCount: 1   },
  { id: 32, name: 'Jonah',           abbreviation: 'Jonah',  testament: 'OT', chapterCount: 4   },
  { id: 33, name: 'Micah',           abbreviation: 'Mic',    testament: 'OT', chapterCount: 7   },
  { id: 34, name: 'Nahum',           abbreviation: 'Nah',    testament: 'OT', chapterCount: 3   },
  { id: 35, name: 'Habakkuk',        abbreviation: 'Hab',    testament: 'OT', chapterCount: 3   },
  { id: 36, name: 'Zephaniah',       abbreviation: 'Zeph',   testament: 'OT', chapterCount: 3   },
  { id: 37, name: 'Haggai',          abbreviation: 'Hag',    testament: 'OT', chapterCount: 2   },
  { id: 38, name: 'Zechariah',       abbreviation: 'Zech',   testament: 'OT', chapterCount: 14  },
  { id: 39, name: 'Malachi',         abbreviation: 'Mal',    testament: 'OT', chapterCount: 4   },

  // New Testament (27 books)
  { id: 40, name: 'Matthew',         abbreviation: 'Matt',   testament: 'NT', chapterCount: 28  },
  { id: 41, name: 'Mark',            abbreviation: 'Mark',   testament: 'NT', chapterCount: 16  },
  { id: 42, name: 'Luke',            abbreviation: 'Luke',   testament: 'NT', chapterCount: 24  },
  { id: 43, name: 'John',            abbreviation: 'John',   testament: 'NT', chapterCount: 21  },
  { id: 44, name: 'Acts',            abbreviation: 'Acts',   testament: 'NT', chapterCount: 28  },
  { id: 45, name: 'Romans',          abbreviation: 'Rom',    testament: 'NT', chapterCount: 16  },
  { id: 46, name: '1 Corinthians',   abbreviation: '1Cor',   testament: 'NT', chapterCount: 16  },
  { id: 47, name: '2 Corinthians',   abbreviation: '2Cor',   testament: 'NT', chapterCount: 13  },
  { id: 48, name: 'Galatians',       abbreviation: 'Gal',    testament: 'NT', chapterCount: 6   },
  { id: 49, name: 'Ephesians',       abbreviation: 'Eph',    testament: 'NT', chapterCount: 6   },
  { id: 50, name: 'Philippians',     abbreviation: 'Phil',   testament: 'NT', chapterCount: 4   },
  { id: 51, name: 'Colossians',      abbreviation: 'Col',    testament: 'NT', chapterCount: 4   },
  { id: 52, name: '1 Thessalonians', abbreviation: '1Thess', testament: 'NT', chapterCount: 5   },
  { id: 53, name: '2 Thessalonians', abbreviation: '2Thess', testament: 'NT', chapterCount: 3   },
  { id: 54, name: '1 Timothy',       abbreviation: '1Tim',   testament: 'NT', chapterCount: 6   },
  { id: 55, name: '2 Timothy',       abbreviation: '2Tim',   testament: 'NT', chapterCount: 4   },
  { id: 56, name: 'Titus',           abbreviation: 'Titus',  testament: 'NT', chapterCount: 3   },
  { id: 57, name: 'Philemon',        abbreviation: 'Phlm',   testament: 'NT', chapterCount: 1   },
  { id: 58, name: 'Hebrews',         abbreviation: 'Heb',    testament: 'NT', chapterCount: 13  },
  { id: 59, name: 'James',           abbreviation: 'Jas',    testament: 'NT', chapterCount: 5   },
  { id: 60, name: '1 Peter',         abbreviation: '1Pet',   testament: 'NT', chapterCount: 5   },
  { id: 61, name: '2 Peter',         abbreviation: '2Pet',   testament: 'NT', chapterCount: 3   },
  { id: 62, name: '1 John',          abbreviation: '1John',  testament: 'NT', chapterCount: 5   },
  { id: 63, name: '2 John',          abbreviation: '2John',  testament: 'NT', chapterCount: 1   },
  { id: 64, name: '3 John',          abbreviation: '3John',  testament: 'NT', chapterCount: 1   },
  { id: 65, name: 'Jude',            abbreviation: 'Jude',   testament: 'NT', chapterCount: 1   },
  { id: 66, name: 'Revelation',      abbreviation: 'Rev',    testament: 'NT', chapterCount: 22  },
];

// ─── Literary Categories ────────────────────────────────────────────────────

export type BibleCategory =
  | 'pentateuch'
  | 'historical'
  | 'wisdom'
  | 'majorProphets'
  | 'minorProphets'
  | 'gospels'
  | 'acts'
  | 'paulineEpistles'
  | 'generalEpistles'
  | 'prophecy';

/** Map a book ID (1-66) to its literary category */
export function getBookCategory(bookId: number): BibleCategory {
  if (bookId <= 5) return 'pentateuch';
  if (bookId <= 17) return 'historical';
  if (bookId <= 22) return 'wisdom';
  if (bookId <= 27) return 'majorProphets';
  if (bookId <= 39) return 'minorProphets';
  if (bookId <= 43) return 'gospels';
  if (bookId === 44) return 'acts';
  if (bookId <= 57) return 'paulineEpistles';
  if (bookId <= 65) return 'generalEpistles';
  return 'prophecy';
}

/** Category display labels */
export const CATEGORY_LABELS: Record<BibleCategory, string> = {
  pentateuch: 'Law',
  historical: 'History',
  wisdom: 'Wisdom',
  majorProphets: 'Major Prophets',
  minorProphets: 'Minor Prophets',
  gospels: 'Gospels',
  acts: 'History',
  paulineEpistles: 'Paul\u2019s Letters',
  generalEpistles: 'General Letters',
  prophecy: 'Prophecy',
};

/** Category text colors — muted tones that work on dark chip backgrounds */
export const CATEGORY_COLORS_DARK: Record<BibleCategory, string> = {
  pentateuch: '#E8836B',
  historical: '#A09A90',
  wisdom: '#8DAA7B',
  majorProphets: '#7B9EC0',
  minorProphets: '#6DB5A8',
  gospels: '#E8836B',
  acts: '#6DB5A8',
  paulineEpistles: '#B088C4',
  generalEpistles: '#8A9DD0',
  prophecy: '#6BC08B',
};

/** Category text colors — deeper tones for light backgrounds */
export const CATEGORY_COLORS_LIGHT: Record<BibleCategory, string> = {
  pentateuch: '#B84A32',
  historical: '#6E685E',
  wisdom: '#4A7038',
  majorProphets: '#3D6488',
  minorProphets: '#2E7A6A',
  gospels: '#B84A32',
  acts: '#2E7A6A',
  paulineEpistles: '#7A4A90',
  generalEpistles: '#4A5E94',
  prophecy: '#2E7A4A',
};

/** Get category color for a book, respecting dark/light mode */
export function getBookColor(bookId: number, isDark: boolean): string {
  const category = getBookCategory(bookId);
  return isDark ? CATEGORY_COLORS_DARK[category] : CATEGORY_COLORS_LIGHT[category];
}

// ─── Derived collections ─────────────────────────────────────────────────────

export const OT_BOOKS: BibleBookInfo[] = BIBLE_BOOKS.filter(b => b.testament === 'OT');
export const NT_BOOKS: BibleBookInfo[] = BIBLE_BOOKS.filter(b => b.testament === 'NT');

/** Quick lookup by book ID */
export const BOOK_BY_ID: Record<number, BibleBookInfo> = {};
for (const book of BIBLE_BOOKS) {
  BOOK_BY_ID[book.id] = book;
}

// ─── Name-to-ID mapping ─────────────────────────────────────────────────────

/**
 * Maps book names, abbreviations, and common variants to book IDs.
 * All keys are lowercase for case-insensitive lookup.
 */
export const BOOK_NAME_TO_ID: Record<string, number> = {};

for (const book of BIBLE_BOOKS) {
  const lowerName = book.name.toLowerCase();
  const lowerAbbr = book.abbreviation.toLowerCase();

  // Full name: "genesis", "1 samuel", "song of solomon"
  BOOK_NAME_TO_ID[lowerName] = book.id;

  // Abbreviation: "gen", "1sam", "song"
  BOOK_NAME_TO_ID[lowerAbbr] = book.id;

  // Without spaces for numbered books: "1samuel"
  const noSpace = lowerName.replace(/\s+/g, '');
  if (noSpace !== lowerName) {
    BOOK_NAME_TO_ID[noSpace] = book.id;
  }
}

// Common variants that aren't covered by the loop above
const EXTRA_ALIASES: Record<string, number> = {
  // Psalm vs Psalms
  'psalm': 19,
  'psa': 19,
  'pss': 19,

  // Song of Solomon variants
  'song of songs': 22,
  'songofsongs': 22,
  'sos': 22,
  'canticles': 22,

  // Roman numeral variants: I/II/III
  'i samuel': 9,
  'ii samuel': 10,
  'i kings': 11,
  'ii kings': 12,
  'i chronicles': 13,
  'ii chronicles': 14,
  'i corinthians': 46,
  'ii corinthians': 47,
  'i thessalonians': 52,
  'ii thessalonians': 53,
  'i timothy': 54,
  'ii timothy': 55,
  'i peter': 60,
  'ii peter': 61,
  'i john': 62,
  'ii john': 63,
  'iii john': 64,

  // Short common abbreviations
  'ge': 1,
  'gn': 1,
  'ex': 2,
  'le': 3,
  'lv': 3,
  'nu': 4,
  'nb': 4,
  'dt': 5,
  'jos': 6,
  'jdg': 7,
  'jg': 7,
  'ru': 8,
  'rt': 8,
  '1sa': 9,
  '2sa': 10,
  '1ki': 11,
  '2ki': 12,
  '1ch': 13,
  '2ch': 14,
  'ezr': 15,
  'ne': 16,
  'est': 17,
  'jb': 18,
  'ps': 19,
  'pr': 20,
  'ec': 21,
  'ss': 22,
  'is': 23,
  'isa': 23,
  'je': 24,
  'la': 25,
  'eze': 26,
  'da': 27,
  'ho': 28,
  'jl': 29,
  'am': 30,
  'ob': 31,
  'jon': 32,
  'mi': 33,
  'na': 34,
  'hab': 35,
  'zep': 36,
  'hag': 37,
  'zec': 38,
  'mal': 39,
  'mt': 40,
  'mk': 41,
  'lk': 42,
  'jn': 43,
  'ac': 44,
  'ro': 45,
  '1co': 46,
  '2co': 47,
  'ga': 48,
  'eph': 49,
  'php': 50,
  'col': 51,
  '1th': 52,
  '2th': 53,
  '1ti': 54,
  '2ti': 55,
  'tt': 56,
  'phm': 57,
  'heb': 58,
  'jas': 59,
  'jm': 59,
  '1pe': 60,
  '2pe': 61,
  '1jn': 62,
  '2jn': 63,
  '3jn': 64,
  'jud': 65,
  're': 66,
  'rv': 66,
};

for (const [alias, id] of Object.entries(EXTRA_ALIASES)) {
  BOOK_NAME_TO_ID[alias] = id;
}

// ─── Reference Parser ────────────────────────────────────────────────────────

/**
 * Resolve a book name string to a book ID.
 * Handles full names, abbreviations, numbered variants, and Roman numerals.
 *
 * @returns The book ID (1-66) or null if not recognized
 */
function resolveBookName(bookStr: string): number | null {
  const normalized = bookStr.trim().toLowerCase();

  // Direct lookup
  if (BOOK_NAME_TO_ID[normalized] !== undefined) {
    return BOOK_NAME_TO_ID[normalized];
  }

  // Try without trailing periods (e.g. "Gen." -> "gen")
  const noPeriod = normalized.replace(/\./g, '');
  if (BOOK_NAME_TO_ID[noPeriod] !== undefined) {
    return BOOK_NAME_TO_ID[noPeriod];
  }

  // Try without spaces
  const noSpaces = normalized.replace(/\s+/g, '');
  if (BOOK_NAME_TO_ID[noSpaces] !== undefined) {
    return BOOK_NAME_TO_ID[noSpaces];
  }

  return null;
}

/**
 * Parse a scripture reference string into structured components.
 *
 * Supported formats:
 *   "John 3:16"           -> { bookId: 43, chapter: 3, verse: 16 }
 *   "1 Corinthians 13:4"  -> { bookId: 46, chapter: 13, verse: 4 }
 *   "Genesis 1"           -> { bookId: 1, chapter: 1 }
 *   "Ps 23:1-6"           -> { bookId: 19, chapter: 23, verse: 1, verseEnd: 6 }
 *   "Rev 21"              -> { bookId: 66, chapter: 21 }
 *
 * @returns Parsed reference or null if the string is not a valid reference
 */
export function referenceToRoute(reference: string): ParsedReference | null {
  if (!reference || typeof reference !== 'string') return null;

  const trimmed = reference.trim();
  if (!trimmed) return null;

  // Regex: capture book name (including optional number prefix) + chapter + optional verse range
  // Book names can be:
  //   "Genesis", "1 Samuel", "Song of Solomon", "1Cor", "Ps", etc.
  //
  // Pattern breakdown:
  //   ^((?:\d\s*)?[A-Za-z][A-Za-z\s.]*?)  — book name (optional leading digit, then letters/spaces)
  //   \s+                                   — separator
  //   (\d{1,3})                             — chapter number
  //   (?::(\d{1,3}))?                       — optional :verse
  //   (?:\s*[-–—]\s*(\d{1,3}))?             — optional -verseEnd
  const match = trimmed.match(
    /^((?:\d\s*)?[A-Za-z][A-Za-z\s.]*?)\s+(\d{1,3})(?::(\d{1,3}))?(?:\s*[-–—]\s*(\d{1,3}))?$/
  );

  if (!match) return null;

  const bookStr = match[1];
  const chapter = parseInt(match[2], 10);
  const verse = match[3] ? parseInt(match[3], 10) : undefined;
  const verseEnd = match[4] ? parseInt(match[4], 10) : undefined;

  const bookId = resolveBookName(bookStr);
  if (bookId === null) return null;

  // Validate chapter is within range
  const bookInfo = BOOK_BY_ID[bookId];
  if (bookInfo && chapter > bookInfo.chapterCount) return null;
  if (chapter < 1) return null;

  const result: ParsedReference = { bookId, chapter };
  if (verse !== undefined) {
    result.verse = verse;
    if (verseEnd !== undefined && verseEnd > verse) {
      result.verseEnd = verseEnd;
    }
  }

  return result;
}

/**
 * Format a structured reference back into a human-readable string.
 *
 * @example
 * routeToReference({ bookId: 43, chapter: 3, verse: 16 })
 * // => "John 3:16"
 */
export function routeToReference(parsed: ParsedReference): string | null {
  const book = BOOK_BY_ID[parsed.bookId];
  if (!book) return null;

  let ref = `${book.name} ${parsed.chapter}`;

  if (parsed.verse !== undefined) {
    ref += `:${parsed.verse}`;
    if (parsed.verseEnd !== undefined) {
      ref += `-${parsed.verseEnd}`;
    }
  }

  return ref;
}

// ─── Utilities ───────────────────────────────────────────────────────────────

/** Total chapters across all 66 books (1,189) */
export const TOTAL_CHAPTERS: number = BIBLE_BOOKS.reduce(
  (sum, book) => sum + book.chapterCount,
  0,
);

/** Total number of books in the Old Testament (39) */
export const OT_BOOK_COUNT = 39;

/** Total number of books in the New Testament (27) */
export const NT_BOOK_COUNT = 27;

/**
 * Get the next chapter reference. Wraps to the next book when at the end of a book.
 * Returns null if already at Revelation's last chapter.
 */
export function getNextChapter(
  bookId: number,
  chapter: number,
): { bookId: number; chapter: number } | null {
  const book = BOOK_BY_ID[bookId];
  if (!book) return null;

  if (chapter < book.chapterCount) {
    return { bookId, chapter: chapter + 1 };
  }

  // End of book — go to next book
  const nextBook = BOOK_BY_ID[bookId + 1];
  if (!nextBook) return null; // Already at Revelation 22

  return { bookId: nextBook.id, chapter: 1 };
}

/**
 * Get the previous chapter reference. Wraps to the previous book when at chapter 1.
 * Returns null if already at Genesis 1.
 */
export function getPreviousChapter(
  bookId: number,
  chapter: number,
): { bookId: number; chapter: number } | null {
  if (chapter > 1) {
    return { bookId, chapter: chapter - 1 };
  }

  // Beginning of book — go to previous book's last chapter
  const prevBook = BOOK_BY_ID[bookId - 1];
  if (!prevBook) return null; // Already at Genesis 1

  return { bookId: prevBook.id, chapter: prevBook.chapterCount };
}
