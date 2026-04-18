/**
 * Bible Database Preparation Script
 *
 * Downloads KJV and BSB Bible text data from public sources, then creates a
 * combined SQLite database with full-text search (FTS5) for the Unfold app.
 *
 * Data sources:
 *   KJV — https://github.com/aruljohn/Bible-kjv (JSON per book)
 *   BSB — https://bereanbible.com/bsb_tables.txt (tab-delimited)
 *
 * Output: unfold-bible-v1.db (~25-30 MB)
 *
 * Usage:
 *   node scripts/prepare-bible-db.mjs
 *
 * Prerequisites:
 *   bun add -d better-sqlite3
 */

import Database from 'better-sqlite3';
import { mkdirSync, existsSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_ROOT = join(__dirname, '..');
const OUTPUT_DB = join(PROJECT_ROOT, 'unfold-bible-v1.db');
const CACHE_DIR = join(PROJECT_ROOT, '.bible-cache');

// ─── Book metadata (all 66 books) ───────────────────────────────────────────

const BOOKS = [
  { id: 1,  name: 'Genesis',         abbr: 'Gen',   testament: 'OT', chapters: 50 },
  { id: 2,  name: 'Exodus',          abbr: 'Exod',  testament: 'OT', chapters: 40 },
  { id: 3,  name: 'Leviticus',       abbr: 'Lev',   testament: 'OT', chapters: 27 },
  { id: 4,  name: 'Numbers',         abbr: 'Num',   testament: 'OT', chapters: 36 },
  { id: 5,  name: 'Deuteronomy',     abbr: 'Deut',  testament: 'OT', chapters: 34 },
  { id: 6,  name: 'Joshua',          abbr: 'Josh',  testament: 'OT', chapters: 24 },
  { id: 7,  name: 'Judges',          abbr: 'Judg',  testament: 'OT', chapters: 21 },
  { id: 8,  name: 'Ruth',            abbr: 'Ruth',  testament: 'OT', chapters: 4  },
  { id: 9,  name: '1 Samuel',        abbr: '1Sam',  testament: 'OT', chapters: 31 },
  { id: 10, name: '2 Samuel',        abbr: '2Sam',  testament: 'OT', chapters: 24 },
  { id: 11, name: '1 Kings',         abbr: '1Kgs',  testament: 'OT', chapters: 22 },
  { id: 12, name: '2 Kings',         abbr: '2Kgs',  testament: 'OT', chapters: 25 },
  { id: 13, name: '1 Chronicles',    abbr: '1Chr',  testament: 'OT', chapters: 29 },
  { id: 14, name: '2 Chronicles',    abbr: '2Chr',  testament: 'OT', chapters: 36 },
  { id: 15, name: 'Ezra',            abbr: 'Ezra',  testament: 'OT', chapters: 10 },
  { id: 16, name: 'Nehemiah',        abbr: 'Neh',   testament: 'OT', chapters: 13 },
  { id: 17, name: 'Esther',          abbr: 'Esth',  testament: 'OT', chapters: 10 },
  { id: 18, name: 'Job',             abbr: 'Job',   testament: 'OT', chapters: 42 },
  { id: 19, name: 'Psalms',          abbr: 'Ps',    testament: 'OT', chapters: 150 },
  { id: 20, name: 'Proverbs',        abbr: 'Prov',  testament: 'OT', chapters: 31 },
  { id: 21, name: 'Ecclesiastes',    abbr: 'Eccl',  testament: 'OT', chapters: 12 },
  { id: 22, name: 'Song of Solomon', abbr: 'Song',  testament: 'OT', chapters: 8  },
  { id: 23, name: 'Isaiah',          abbr: 'Isa',   testament: 'OT', chapters: 66 },
  { id: 24, name: 'Jeremiah',        abbr: 'Jer',   testament: 'OT', chapters: 52 },
  { id: 25, name: 'Lamentations',    abbr: 'Lam',   testament: 'OT', chapters: 5  },
  { id: 26, name: 'Ezekiel',         abbr: 'Ezek',  testament: 'OT', chapters: 48 },
  { id: 27, name: 'Daniel',          abbr: 'Dan',   testament: 'OT', chapters: 12 },
  { id: 28, name: 'Hosea',           abbr: 'Hos',   testament: 'OT', chapters: 14 },
  { id: 29, name: 'Joel',            abbr: 'Joel',  testament: 'OT', chapters: 3  },
  { id: 30, name: 'Amos',            abbr: 'Amos',  testament: 'OT', chapters: 9  },
  { id: 31, name: 'Obadiah',         abbr: 'Obad',  testament: 'OT', chapters: 1  },
  { id: 32, name: 'Jonah',           abbr: 'Jonah', testament: 'OT', chapters: 4  },
  { id: 33, name: 'Micah',           abbr: 'Mic',   testament: 'OT', chapters: 7  },
  { id: 34, name: 'Nahum',           abbr: 'Nah',   testament: 'OT', chapters: 3  },
  { id: 35, name: 'Habakkuk',        abbr: 'Hab',   testament: 'OT', chapters: 3  },
  { id: 36, name: 'Zephaniah',       abbr: 'Zeph',  testament: 'OT', chapters: 3  },
  { id: 37, name: 'Haggai',          abbr: 'Hag',   testament: 'OT', chapters: 2  },
  { id: 38, name: 'Zechariah',       abbr: 'Zech',  testament: 'OT', chapters: 14 },
  { id: 39, name: 'Malachi',         abbr: 'Mal',   testament: 'OT', chapters: 4  },
  { id: 40, name: 'Matthew',         abbr: 'Matt',  testament: 'NT', chapters: 28 },
  { id: 41, name: 'Mark',            abbr: 'Mark',  testament: 'NT', chapters: 16 },
  { id: 42, name: 'Luke',            abbr: 'Luke',  testament: 'NT', chapters: 24 },
  { id: 43, name: 'John',            abbr: 'John',  testament: 'NT', chapters: 21 },
  { id: 44, name: 'Acts',            abbr: 'Acts',  testament: 'NT', chapters: 28 },
  { id: 45, name: 'Romans',          abbr: 'Rom',   testament: 'NT', chapters: 16 },
  { id: 46, name: '1 Corinthians',   abbr: '1Cor',  testament: 'NT', chapters: 16 },
  { id: 47, name: '2 Corinthians',   abbr: '2Cor',  testament: 'NT', chapters: 13 },
  { id: 48, name: 'Galatians',       abbr: 'Gal',   testament: 'NT', chapters: 6  },
  { id: 49, name: 'Ephesians',       abbr: 'Eph',   testament: 'NT', chapters: 6  },
  { id: 50, name: 'Philippians',     abbr: 'Phil',  testament: 'NT', chapters: 4  },
  { id: 51, name: 'Colossians',      abbr: 'Col',   testament: 'NT', chapters: 4  },
  { id: 52, name: '1 Thessalonians', abbr: '1Thess', testament: 'NT', chapters: 5 },
  { id: 53, name: '2 Thessalonians', abbr: '2Thess', testament: 'NT', chapters: 3 },
  { id: 54, name: '1 Timothy',       abbr: '1Tim',  testament: 'NT', chapters: 6  },
  { id: 55, name: '2 Timothy',       abbr: '2Tim',  testament: 'NT', chapters: 4  },
  { id: 56, name: 'Titus',           abbr: 'Titus', testament: 'NT', chapters: 3  },
  { id: 57, name: 'Philemon',        abbr: 'Phlm',  testament: 'NT', chapters: 1  },
  { id: 58, name: 'Hebrews',         abbr: 'Heb',   testament: 'NT', chapters: 13 },
  { id: 59, name: 'James',           abbr: 'Jas',   testament: 'NT', chapters: 5  },
  { id: 60, name: '1 Peter',         abbr: '1Pet',  testament: 'NT', chapters: 5  },
  { id: 61, name: '2 Peter',         abbr: '2Pet',  testament: 'NT', chapters: 3  },
  { id: 62, name: '1 John',          abbr: '1John', testament: 'NT', chapters: 5  },
  { id: 63, name: '2 John',          abbr: '2John', testament: 'NT', chapters: 1  },
  { id: 64, name: '3 John',          abbr: '3John', testament: 'NT', chapters: 1  },
  { id: 65, name: 'Jude',            abbr: 'Jude',  testament: 'NT', chapters: 1  },
  { id: 66, name: 'Revelation',      abbr: 'Rev',   testament: 'NT', chapters: 22 },
];

// KJV file names in the aruljohn/Bible-kjv repo (no spaces in filenames)
const KJV_BOOK_FILES = [
  'Genesis', 'Exodus', 'Leviticus', 'Numbers', 'Deuteronomy',
  'Joshua', 'Judges', 'Ruth', '1Samuel', '2Samuel',
  '1Kings', '2Kings', '1Chronicles', '2Chronicles',
  'Ezra', 'Nehemiah', 'Esther', 'Job', 'Psalms', 'Proverbs',
  'Ecclesiastes', 'SongofSolomon', 'Isaiah', 'Jeremiah',
  'Lamentations', 'Ezekiel', 'Daniel', 'Hosea', 'Joel', 'Amos',
  'Obadiah', 'Jonah', 'Micah', 'Nahum', 'Habakkuk', 'Zephaniah',
  'Haggai', 'Zechariah', 'Malachi',
  'Matthew', 'Mark', 'Luke', 'John', 'Acts', 'Romans',
  '1Corinthians', '2Corinthians', 'Galatians', 'Ephesians',
  'Philippians', 'Colossians', '1Thessalonians', '2Thessalonians',
  '1Timothy', '2Timothy', 'Titus', 'Philemon', 'Hebrews',
  'James', '1Peter', '2Peter', '1John', '2John', '3John',
  'Jude', 'Revelation',
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function log(msg) {
  const ts = new Date().toISOString().slice(11, 19);
  console.log(`[${ts}] ${msg}`);
}

function ensureDir(dir) {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

/**
 * Fetch with retries and caching to .bible-cache/
 */
async function cachedFetch(url, cacheKey) {
  ensureDir(CACHE_DIR);
  const cachePath = join(CACHE_DIR, cacheKey);

  if (existsSync(cachePath)) {
    return readFileSync(cachePath, 'utf-8');
  }

  let lastError;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      log(`  Fetching (attempt ${attempt}): ${url}`);
      const res = await fetch(url, {
        headers: { 'User-Agent': 'UnfoldBibleBuilder/1.0' },
      });
      if (!res.ok) {
        throw new Error(`HTTP ${res.status} ${res.statusText} for ${url}`);
      }
      const text = await res.text();
      writeFileSync(cachePath, text, 'utf-8');
      return text;
    } catch (err) {
      lastError = err;
      if (attempt < 3) {
        const delay = attempt * 2000;
        log(`  Retrying in ${delay}ms...`);
        await new Promise(r => setTimeout(r, delay));
      }
    }
  }
  throw lastError;
}

// ─── KJV Download ────────────────────────────────────────────────────────────

/**
 * Download all 66 KJV books from aruljohn/Bible-kjv.
 * Each file is a JSON object mapping chapter numbers (as strings)
 * to objects mapping verse numbers (as strings) to text.
 *
 * Returns: Map<bookId, Array<{ chapter, verse, text }>>
 */
async function downloadKJV() {
  log('Downloading KJV from aruljohn/Bible-kjv...');
  const BASE = 'https://raw.githubusercontent.com/aruljohn/Bible-kjv/master';
  const result = new Map();

  for (let i = 0; i < BOOKS.length; i++) {
    const book = BOOKS[i];
    const fileName = KJV_BOOK_FILES[i];
    const cacheKey = `kjv_${fileName.replace(/\s/g, '_')}.json`;
    const url = `${BASE}/${encodeURIComponent(fileName)}.json`;

    const raw = await cachedFetch(url, cacheKey);
    const data = JSON.parse(raw);

    const verses = [];

    // The JSON format is: { book, chapters: [{ chapter, verses: [{ verse, text }] }] }
    if (Array.isArray(data.chapters)) {
      for (const ch of data.chapters) {
        const chapterNum = Number(ch.chapter);
        if (!chapterNum || !Array.isArray(ch.verses)) continue;
        for (const v of ch.verses) {
          const verseNum = Number(v.verse);
          const text = v.text;
          if (verseNum && typeof text === 'string' && text.trim()) {
            verses.push({
              chapter: chapterNum,
              verse: verseNum,
              text: text.trim(),
            });
          }
        }
      }
    } else {
      // Fallback: some forks use { "1": { "1": "text", ... }, ... } format
      const chapters = data;
      const chapterKeys = Object.keys(chapters)
        .filter(k => /^\d+$/.test(k))
        .sort((a, b) => Number(a) - Number(b));

      for (const chapterKey of chapterKeys) {
        const chapterNum = Number(chapterKey);
        const chapterData = chapters[chapterKey];
        if (typeof chapterData !== 'object' || chapterData === null) continue;

        const verseKeys = Object.keys(chapterData)
          .filter(k => /^\d+$/.test(k))
          .sort((a, b) => Number(a) - Number(b));

        for (const verseKey of verseKeys) {
          const text = chapterData[verseKey];
          if (typeof text === 'string' && text.trim()) {
            verses.push({
              chapter: chapterNum,
              verse: Number(verseKey),
              text: text.trim(),
            });
          }
        }
      }
    }

    if (verses.length === 0) {
      log(`  WARNING: No verses found for KJV ${book.name}. Check JSON structure.`);
    }

    result.set(book.id, verses);
    if ((i + 1) % 10 === 0 || i === BOOKS.length - 1) {
      log(`  KJV progress: ${i + 1}/${BOOKS.length} books`);
    }
  }

  return result;
}

// ─── BSB Download ────────────────────────────────────────────────────────────

/**
 * Map BSB book names (as they appear in the source) to our canonical book IDs.
 * The BSB source uses slightly different book names in some cases.
 */
function buildBsbNameMap() {
  const map = new Map();

  for (const book of BOOKS) {
    // Add exact name
    map.set(book.name.toLowerCase(), book.id);
    // Add without spaces for numbered books
    map.set(book.name.replace(/\s/g, '').toLowerCase(), book.id);
  }

  // Common BSB variants
  map.set('song of songs', 22);
  map.set('songofsolomon', 22);
  map.set('songofsongs', 22);
  map.set('psalm', 19);
  map.set('revelation of john', 66);
  map.set('revelationofjohn', 66);
  // Arabic numeral variants (no space)
  map.set('1samuel', 9);
  map.set('2samuel', 10);
  map.set('1kings', 11);
  map.set('2kings', 12);
  map.set('1chronicles', 13);
  map.set('2chronicles', 14);
  map.set('1corinthians', 46);
  map.set('2corinthians', 47);
  map.set('1thessalonians', 52);
  map.set('2thessalonians', 53);
  map.set('1timothy', 54);
  map.set('2timothy', 55);
  map.set('1peter', 60);
  map.set('2peter', 61);
  map.set('1john', 62);
  map.set('2john', 63);
  map.set('3john', 64);

  // Roman numeral variants (used by BSB CSV from scrollmapper)
  map.set('i samuel', 9);
  map.set('ii samuel', 10);
  map.set('i kings', 11);
  map.set('ii kings', 12);
  map.set('i chronicles', 13);
  map.set('ii chronicles', 14);
  map.set('i corinthians', 46);
  map.set('ii corinthians', 47);
  map.set('i thessalonians', 52);
  map.set('ii thessalonians', 53);
  map.set('i timothy', 54);
  map.set('ii timothy', 55);
  map.set('i peter', 60);
  map.set('ii peter', 61);
  map.set('i john', 62);
  map.set('ii john', 63);
  map.set('iii john', 64);

  return map;
}

/**
 * Download BSB from the scrollmapper/bible_databases repo.
 * Uses the CSV export which has columns: id, book, chapter, verse, text.
 *
 * Falls back to bereanbible.com/bsb_tables.txt if scrollmapper is unavailable.
 */
async function downloadBSB() {
  log('Downloading BSB...');

  const nameMap = buildBsbNameMap();
  const result = new Map();
  for (const book of BOOKS) {
    result.set(book.id, []);
  }

  // Primary source: scrollmapper bible_databases (CSV)
  // CSV header: Book,Chapter,Verse,Text
  const SCROLLMAPPER_URL =
    'https://raw.githubusercontent.com/scrollmapper/bible_databases/master/formats/csv/BSB.csv';

  let parsed = false;

  try {
    const raw = await cachedFetch(SCROLLMAPPER_URL, 'bsb_scrollmapper.csv');
    const lines = raw.split('\n');

    log(`  BSB CSV: ${lines.length} lines`);

    // CSV header: Book,Chapter,Verse,Text
    // Note: Text field has unescaped inner quotes, so we can't use standard CSV parsing.
    // Instead, split on the first 3 commas (Book, Chapter, Verse never contain commas).
    // Skip header line
    let verseCount = 0;
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      // Split on first 3 commas only
      const first = line.indexOf(',');
      if (first === -1) continue;
      const second = line.indexOf(',', first + 1);
      if (second === -1) continue;
      const third = line.indexOf(',', second + 1);
      if (third === -1) continue;

      const bookName = line.slice(0, first).trim().toLowerCase();
      const chapter = Number(line.slice(first + 1, second).trim());
      const verse = Number(line.slice(second + 1, third).trim());
      // Text is everything after the third comma, strip outer quotes and whitespace
      let text = line.slice(third + 1).trim();
      if (text.startsWith('"') && text.endsWith('"')) {
        text = text.slice(1, -1).trim();
      }
      // Also strip leading/trailing quotes that aren't balanced
      if (text.startsWith('"')) text = text.slice(1).trim();
      if (text.endsWith('"')) text = text.slice(0, -1).trim();

      if (!chapter || !verse || !text) continue;

      const bookId = nameMap.get(bookName) || nameMap.get(bookName.replace(/\s/g, ''));
      if (!bookId) continue;

      const bookVerses = result.get(bookId);
      if (bookVerses) {
        bookVerses.push({ chapter, verse, text });
        verseCount++;
      }
    }

    log(`  BSB: Parsed ${verseCount} verses from scrollmapper CSV`);
    parsed = verseCount > 30000; // Sanity check — Bible has ~31,102 verses
  } catch (err) {
    log(`  BSB scrollmapper download failed: ${err.message}`);
  }

  // Fallback: bereanbible.com/bsb_tables.txt (tab-delimited)
  if (!parsed) {
    log('  Trying fallback: bereanbible.com/bsb_tables.txt');
    try {
      const raw = await cachedFetch(
        'https://bereanbible.com/bsb_tables.txt',
        'bsb_tables.txt'
      );
      const lines = raw.split('\n');
      let verseCount = 0;

      for (const line of lines) {
        if (!line.trim()) continue;
        // Tab-delimited: BookName\tChapter\tVerse\tText
        const parts = line.split('\t');
        if (parts.length < 4) continue;

        const bookName = parts[0].trim().toLowerCase();
        const chapter = Number(parts[1]);
        const verse = Number(parts[2]);
        const text = parts.slice(3).join(' ').trim();

        const bookId = nameMap.get(bookName) || nameMap.get(bookName.replace(/\s/g, ''));
        if (!bookId || !chapter || !verse || !text) continue;

        result.get(bookId)?.push({ chapter, verse, text });
        verseCount++;
      }

      log(`  BSB fallback: Parsed ${verseCount} verses`);
      parsed = verseCount > 30000;
    } catch (err) {
      log(`  BSB fallback also failed: ${err.message}`);
    }
  }

  if (!parsed) {
    throw new Error('Failed to download BSB Bible text from any source.');
  }

  return result;
}

// ─── Database Creation ───────────────────────────────────────────────────────

function createDatabase(kjvData, bsbData) {
  log('Creating SQLite database...');

  // Remove existing DB if present
  if (existsSync(OUTPUT_DB)) {
    rmSync(OUTPUT_DB);
    log('  Removed existing database');
  }

  const db = new Database(OUTPUT_DB);

  // Enable WAL mode during build for faster writes, then switch to DELETE
  // mode at the end so the output is a single .db file with no -wal/-shm.
  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = OFF');
  db.pragma('cache_size = -64000'); // 64 MB cache

  // Create schema
  db.exec(`
    CREATE TABLE books (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      abbreviation TEXT NOT NULL,
      testament TEXT NOT NULL CHECK(testament IN ('OT', 'NT')),
      chapter_count INTEGER NOT NULL
    );

    CREATE TABLE verses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      book_id INTEGER NOT NULL REFERENCES books(id),
      chapter INTEGER NOT NULL,
      verse INTEGER NOT NULL,
      text TEXT NOT NULL,
      translation TEXT NOT NULL CHECK(translation IN ('BSB', 'KJV')),
      UNIQUE(book_id, chapter, verse, translation)
    );

    CREATE INDEX idx_verses_book_chapter ON verses(book_id, chapter, translation);

    CREATE VIRTUAL TABLE verses_fts USING fts5(
      text,
      content='verses',
      content_rowid='id',
      tokenize='porter unicode61'
    );
  `);

  log('  Schema created');

  // Insert books
  const insertBook = db.prepare(
    'INSERT INTO books (id, name, abbreviation, testament, chapter_count) VALUES (?, ?, ?, ?, ?)'
  );

  const insertBooks = db.transaction(() => {
    for (const book of BOOKS) {
      insertBook.run(book.id, book.name, book.abbr, book.testament, book.chapters);
    }
  });
  insertBooks();
  log(`  Inserted ${BOOKS.length} books`);

  // Insert verses in batches
  const insertVerse = db.prepare(
    'INSERT OR IGNORE INTO verses (book_id, chapter, verse, text, translation) VALUES (?, ?, ?, ?, ?)'
  );

  let kjvCount = 0;
  let bsbCount = 0;

  const insertAllVerses = db.transaction(() => {
    // KJV
    for (const [bookId, verses] of kjvData) {
      for (const v of verses) {
        insertVerse.run(bookId, v.chapter, v.verse, v.text, 'KJV');
        kjvCount++;
      }
    }

    // BSB
    for (const [bookId, verses] of bsbData) {
      for (const v of verses) {
        insertVerse.run(bookId, v.chapter, v.verse, v.text, 'BSB');
        bsbCount++;
      }
    }
  });

  insertAllVerses();
  log(`  Inserted ${kjvCount} KJV verses`);
  log(`  Inserted ${bsbCount} BSB verses`);

  // Build FTS5 index
  log('  Building FTS5 index...');
  db.exec(`
    INSERT INTO verses_fts(rowid, text)
    SELECT id, text FROM verses;
  `);
  log('  FTS5 index built');

  // Optimize FTS index
  db.exec(`INSERT INTO verses_fts(verses_fts) VALUES('optimize')`);

  // Switch back to DELETE journal mode so the output is a single file
  db.pragma('journal_mode = DELETE');

  // Vacuum to compact
  log('  Vacuuming...');
  db.exec('VACUUM');

  // Verify
  const totalVerses = db.prepare('SELECT COUNT(*) as count FROM verses').get();
  const totalBooks = db.prepare('SELECT COUNT(*) as count FROM books').get();
  const kjvVerseCount = db.prepare("SELECT COUNT(*) as count FROM verses WHERE translation = 'KJV'").get();
  const bsbVerseCount = db.prepare("SELECT COUNT(*) as count FROM verses WHERE translation = 'BSB'").get();

  log('');
  log('=== Database Summary ===');
  log(`  Books: ${totalBooks.count}`);
  log(`  Total verses: ${totalVerses.count}`);
  log(`  KJV verses: ${kjvVerseCount.count}`);
  log(`  BSB verses: ${bsbVerseCount.count}`);

  // Spot check: Genesis 1:1 and John 3:16
  const gen1 = db.prepare(
    "SELECT text FROM verses WHERE book_id = 1 AND chapter = 1 AND verse = 1 AND translation = 'KJV'"
  ).get();
  const john316 = db.prepare(
    "SELECT text FROM verses WHERE book_id = 43 AND chapter = 3 AND verse = 16 AND translation = 'KJV'"
  ).get();

  if (gen1) log(`  Genesis 1:1 (KJV): ${gen1.text.slice(0, 60)}...`);
  if (john316) log(`  John 3:16 (KJV): ${john316.text.slice(0, 60)}...`);

  // Test FTS
  const ftsResult = db.prepare(
    "SELECT COUNT(*) as count FROM verses_fts WHERE verses_fts MATCH 'love'"
  ).get();
  log(`  FTS test — verses matching 'love': ${ftsResult.count}`);

  db.close();
  log(`\nDatabase written to: ${OUTPUT_DB}`);
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  log('Bible database preparation starting...');
  log('');

  try {
    const [kjvData, bsbData] = await Promise.all([
      downloadKJV(),
      downloadBSB(),
    ]);

    createDatabase(kjvData, bsbData);

    log('');
    log('Done. Upload the database to your backend:');
    log('  scp unfold-bible-v1.db server:/public/');
    log('  Or place it at: https://unfold-backend-production.up.railway.app/public/unfold-bible-v1.db');
  } catch (err) {
    console.error('FATAL:', err);
    process.exit(1);
  }
}

main();
