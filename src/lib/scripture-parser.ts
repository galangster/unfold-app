/**
 * Scripture Reference Parser
 *
 * Parses Bible scripture references from free-form text using regex.
 * Covers all 66 books of the Bible, including numbered books (1/2/3 John,
 * 1/2 Samuel, etc.) and multi-word book names (Song of Solomon).
 *
 * Used by the Contextual Scripture Tap feature to detect tappable
 * scripture references in devotional content.
 */

export interface ScriptureRef {
  /** The full matched reference string, e.g. "John 3:16-17" */
  reference: string;
  /** Start index of the reference in the source text */
  startIndex: number;
  /** End index (exclusive) of the reference in the source text */
  endIndex: number;
}

/**
 * All 66 Bible book names, ordered longest-first within each group
 * so that longer names match before shorter prefixes.
 *
 * Grouped by:
 * - Numbered multi-word books (e.g. "1 Song of Solomon" is not real but
 *   "Song of Solomon" is — listed separately)
 * - Numbered single-word books (e.g. "1 John", "2 Samuel")
 * - Multi-word books without numbers (e.g. "Song of Solomon")
 * - Single-word books (e.g. "Genesis", "Psalms")
 */
const NUMBERED_BOOKS = [
  '1 Chronicles',
  '2 Chronicles',
  '1 Corinthians',
  '2 Corinthians',
  '1 Thessalonians',
  '2 Thessalonians',
  '1 Samuel',
  '2 Samuel',
  '1 Kings',
  '2 Kings',
  '1 Timothy',
  '2 Timothy',
  '1 Peter',
  '2 Peter',
  '1 John',
  '2 John',
  '3 John',
];

const MULTI_WORD_BOOKS = [
  'Song of Solomon',
  'Song of Songs',
];

const SINGLE_WORD_BOOKS = [
  'Ecclesiastes',
  'Lamentations',
  'Deuteronomy',
  'Philippians',
  'Revelation',
  'Colossians',
  'Habakkuk',
  'Leviticus',
  'Nehemiah',
  'Proverbs',
  'Zephaniah',
  'Ephesians',
  'Galatians',
  'Zechariah',
  'Hebrews',
  'Numbers',
  'Obadiah',
  'Genesis',
  'Malachi',
  'Matthew',
  'Ezekiel',
  'Exodus',
  'Isaiah',
  'Joshua',
  'Judges',
  'Psalms',
  'Psalm',
  'Daniel',
  'Haggai',
  'Romans',
  'Esther',
  'Hosea',
  'James',
  'Jonah',
  'Micah',
  'Nahum',
  'Titus',
  'Amos',
  'Acts',
  'Ezra',
  'Joel',
  'John',
  'Jude',
  'Luke',
  'Mark',
  'Ruth',
];

/**
 * Build the book name alternation for the regex.
 * Order matters: numbered books first, then multi-word, then single-word.
 * This prevents partial matches (e.g. "John" matching inside "1 John").
 */
function buildBookPattern(): string {
  const allBooks = [
    ...NUMBERED_BOOKS,
    ...MULTI_WORD_BOOKS,
    ...SINGLE_WORD_BOOKS,
  ];
  return allBooks.map(escapeRegex).join('|');
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Full regex pattern breakdown:
 *
 * (bookName)          — One of the 66+ Bible book name variants
 * \s+                 — Whitespace between book name and chapter
 * (\d{1,3})           — Chapter number (1-3 digits)
 * :                   — Chapter:verse separator
 * (\d{1,3})           — Verse number (1-3 digits)
 * (?:\s*[-–—]\s*\d{1,3})? — Optional verse range (e.g. "-17" or "–17")
 * (?:,\s*\d{1,3}(?:\s*[-–—]\s*\d{1,3})?)* — Optional additional verses/ranges (e.g. ", 19, 21-23")
 *
 * The 'g' and 'i' flags enable global matching and case-insensitivity.
 */
function buildScriptureRegex(): RegExp {
  const bookPattern = buildBookPattern();
  // Match: BookName chapter:verse[-verse][, verse[-verse]]*
  // Also matches references without a verse (just chapter), e.g. "Psalm 23"
  const pattern =
    `(?:${bookPattern})` +               // Book name
    `\\s+` +                              // Required space
    `\\d{1,3}` +                          // Chapter number
    `(?:` +                               // Optional verse portion
      `:\\d{1,3}` +                       // :verse
      `(?:\\s*[-–—]\\s*\\d{1,3})?` +      // Optional range end
      `(?:,\\s*\\d{1,3}` +               // Optional additional verse
        `(?:\\s*[-–—]\\s*\\d{1,3})?` +    // Optional range on additional verse
      `)*` +                              // Zero or more additional verses
    `)?`;                                 // Verse portion is optional (chapter-only refs)

  return new RegExp(pattern, 'gi');
}

// Pre-compile the regex once at module load time
const SCRIPTURE_REGEX = buildScriptureRegex();

/**
 * Parse all scripture references found in the given text.
 *
 * @param text - Free-form text that may contain scripture references
 * @returns Array of ScriptureRef objects with the matched reference and its position
 *
 * @example
 * ```ts
 * const refs = parseScriptureReferences(
 *   "As it says in John 3:16 and Romans 8:28-30, we are called."
 * );
 * // [
 * //   { reference: "John 3:16", startIndex: 17, endIndex: 26 },
 * //   { reference: "Romans 8:28-30", startIndex: 31, endIndex: 45 },
 * // ]
 * ```
 */
export function parseScriptureReferences(text: string): ScriptureRef[] {
  // Reset lastIndex since we reuse the compiled regex
  SCRIPTURE_REGEX.lastIndex = 0;

  const results: ScriptureRef[] = [];
  let match: RegExpExecArray | null;

  while ((match = SCRIPTURE_REGEX.exec(text)) !== null) {
    results.push({
      reference: match[0],
      startIndex: match.index,
      endIndex: match.index + match[0].length,
    });
  }

  return results;
}
