# SQLite Optimization & Offline Bible App Architecture

Research compiled 2026-03-14 for Unfold Bible Reader (M1 foundation).

---

## 1. expo-sqlite Performance Optimization

### PRAGMAs to Set on Every Database Open

```typescript
async function initDatabase(db: SQLiteDatabase) {
  // === MUST SET ON EVERY CONNECTION ===
  await db.execAsync(`
    PRAGMA journal_mode = WAL;
    PRAGMA synchronous = NORMAL;
    PRAGMA busy_timeout = 5000;
    PRAGMA cache_size = -20000;
    PRAGMA foreign_keys = ON;
    PRAGMA temp_store = MEMORY;
    PRAGMA mmap_size = 268435456;
  `);
}
```

| PRAGMA | Value | Why |
|--------|-------|-----|
| `journal_mode = WAL` | Write-Ahead Logging | Concurrent readers + writer. Single biggest perf win. Reduces per-transaction overhead from 30ms+ to <1ms |
| `synchronous = NORMAL` | Skip fsync on every write | Safe with WAL (only risk is device power loss, not app crash). 10-50x faster inserts |
| `busy_timeout = 5000` | 5 seconds | Prevents "database is locked" errors. Connection-specific — must set each open. Production apps use 5-20s |
| `cache_size = -20000` | ~20MB in-memory page cache | Negative = KB. Default is ~2MB. Bible DB is read-heavy so cache pays off |
| `foreign_keys = ON` | Enforce referential integrity | Off by default in SQLite. Must set per-connection |
| `temp_store = MEMORY` | Temp tables/indices in RAM | Avoids disk I/O for temp sort operations |
| `mmap_size = 268435456` | Memory-map up to 256MB | OS manages page cache. Reduces syscall overhead. Virtual memory, not physical RAM |

### One-Time PRAGMAs (run once after DB creation)

```sql
PRAGMA page_size = 4096;        -- Match filesystem block size (default, good for mobile)
PRAGMA auto_vacuum = INCREMENTAL; -- Reclaim space without full VACUUM
PRAGMA journal_size_limit = 6144000; -- Cap WAL file at ~6MB
```

### Periodic Maintenance

```sql
PRAGMA optimize;                -- Run before closing connection or every few hours
PRAGMA wal_checkpoint(PASSIVE); -- Checkpoint WAL without blocking readers
PRAGMA incremental_vacuum(100); -- Reclaim up to 100 pages
```

### Prepared Statements in expo-sqlite

```typescript
// Batch insert with prepared statement reuse
async function insertVerses(db: SQLiteDatabase, verses: Verse[]) {
  await db.withExclusiveTransactionAsync(async () => {
    const stmt = await db.prepareAsync(
      'INSERT INTO verses (book_id, chapter, verse, text) VALUES ($bookId, $chapter, $verse, $text)'
    );
    try {
      for (const v of verses) {
        await stmt.executeAsync({
          $bookId: v.bookId,
          $chapter: v.chapter,
          $verse: v.verse,
          $text: v.text,
        });
      }
    } finally {
      await stmt.finalizeAsync(); // ALWAYS finalize in finally block
    }
  });
}
```

### Query Planning with EXPLAIN

```typescript
// Debug slow queries
async function explainQuery(db: SQLiteDatabase, sql: string) {
  const plan = await db.getAllAsync(`EXPLAIN QUERY PLAN ${sql}`);
  console.log('Query plan:', plan);
  // Look for: SCAN = full table scan (bad), SEARCH USING INDEX = good
}
```

**Key insight**: After bulk inserts, run `ANALYZE` so SQLite's query planner picks optimal indices:

```sql
ANALYZE;  -- Gathers statistics about index selectivity
```

---

## 2. FTS5 Best Practices

### Tokenizer Selection for Bible Search

```sql
-- RECOMMENDED: Porter stemmer wrapping unicode61
-- "searching" matches "search", "searched", "searches"
-- unicode61 handles accents and international characters
CREATE VIRTUAL TABLE verses_fts USING fts5(
  text,
  content='verses',
  content_rowid='id',
  tokenize='porter unicode61 remove_diacritics 2',
  prefix='2 3 4'
);
```

**Tokenizer comparison for Bible text:**

| Tokenizer | Use Case | Pros | Cons |
|-----------|----------|------|------|
| `porter unicode61` | Primary search | Stemming ("grace"="graces"), diacritics handled | English-only stemming |
| `unicode61` | Exact word match | No false stem matches | "grace" won't match "gracious" |
| `trigram` | Substring search ("hes" in "Ephesians") | Partial matching | 3-5x larger index, slower |
| `ascii` | Simple English only | Fastest tokenization | No Unicode support |

**Recommendation**: Use `porter unicode61` for verse content search, and a separate `trigram` table for book name autocomplete.

### Ranking with bm25

```sql
-- Weighted search: title matches worth 10x, text worth 1x
SELECT
  v.book_id, v.chapter, v.verse,
  snippet(verses_fts, 0, '<b>', '</b>', '...', 32) as snippet,
  bm25(verses_fts) as score
FROM verses_fts
JOIN verses v ON v.id = verses_fts.rowid
WHERE verses_fts MATCH ?
ORDER BY rank  -- 'rank' column is faster than ORDER BY bm25()
LIMIT 50;
```

**Setting persistent rank weights:**
```sql
-- Make 'rank' column use custom bm25 weights permanently
INSERT INTO verses_fts(verses_fts, rank) VALUES('rank', 'bm25(10.0, 1.0)');
```

### Snippet Optimization

```sql
-- snippet(table, column_idx, open_tag, close_tag, ellipsis, max_tokens)
SELECT snippet(verses_fts, 0, '<mark>', '</mark>', '...', 24) as snippet
FROM verses_fts WHERE verses_fts MATCH ?;

-- highlight() for full text with markup (no truncation)
SELECT highlight(verses_fts, 0, '<b>', '</b>') as highlighted_text
FROM verses_fts WHERE verses_fts MATCH ?;
```

### Query Patterns

```sql
-- Prefix query (autocomplete): "gra*" matches grace, gracious, grant
SELECT * FROM verses_fts WHERE verses_fts MATCH 'gra*';

-- Phrase match (exact sequence)
SELECT * FROM verses_fts WHERE verses_fts MATCH '"the lord is my shepherd"';

-- Boolean operators
SELECT * FROM verses_fts WHERE verses_fts MATCH 'love AND grace';
SELECT * FROM verses_fts WHERE verses_fts MATCH 'faith OR hope OR love';
SELECT * FROM verses_fts WHERE verses_fts MATCH 'love NOT hate';

-- NEAR (words within N tokens of each other)
SELECT * FROM verses_fts WHERE verses_fts MATCH 'NEAR(grace mercy, 5)';

-- Initial token (first word of verse)
SELECT * FROM verses_fts WHERE verses_fts MATCH '^blessed';

-- Column filter (if multi-column FTS)
SELECT * FROM verses_fts WHERE verses_fts MATCH 'title : jesus';
```

### External Content Table (saves ~50% space)

```sql
-- FTS indexes verses but doesn't duplicate content
CREATE VIRTUAL TABLE verses_fts USING fts5(
  text,
  content='verses',
  content_rowid='id',
  tokenize='porter unicode61 remove_diacritics 2',
  prefix='2 3'
);

-- Keep FTS in sync with triggers
CREATE TRIGGER verses_ai AFTER INSERT ON verses BEGIN
  INSERT INTO verses_fts(rowid, text) VALUES (new.id, new.text);
END;
CREATE TRIGGER verses_ad AFTER DELETE ON verses BEGIN
  INSERT INTO verses_fts(verses_fts, rowid, text) VALUES('delete', old.id, old.text);
END;
CREATE TRIGGER verses_au AFTER UPDATE ON verses BEGIN
  INSERT INTO verses_fts(verses_fts, rowid, text) VALUES('delete', old.id, old.text);
  INSERT INTO verses_fts(rowid, text) VALUES (new.id, new.text);
END;

-- Rebuild FTS index from scratch (after bulk import or corruption)
INSERT INTO verses_fts(verses_fts) VALUES('rebuild');

-- Optimize FTS index (merge b-trees, run periodically)
INSERT INTO verses_fts(verses_fts) VALUES('optimize');
```

### FTS Index Size Reduction

```sql
-- detail=column: No NEAR/phrase queries, but 50% smaller index
CREATE VIRTUAL TABLE verses_fts USING fts5(text, detail=column, ...);

-- detail=none: Only rowid stored, 80% smaller, no column/offset info
CREATE VIRTUAL TABLE verses_fts USING fts5(text, detail=none, ...);

-- columnsize=0: Skip storing per-doc token counts (disables accurate bm25)
CREATE VIRTUAL TABLE verses_fts USING fts5(text, columnsize=0, ...);
```

**Bible app recommendation**: Use `detail=full` (default) since phrase search ("the Lord is my shepherd") is essential for Bible search.

---

## 3. SQLite Connection Management in React Native

### Singleton Pattern with SQLiteProvider

```typescript
// app/_layout.tsx — Single database instance for entire app
import { SQLiteProvider } from 'expo-sqlite';

export default function RootLayout() {
  return (
    <SQLiteProvider
      databaseName="unfold-bible.db"
      onInit={initializeDatabase}
      useSuspense={true}
    >
      <Stack />
    </SQLiteProvider>
  );
}

async function initializeDatabase(db: SQLiteDatabase) {
  // PRAGMAs
  await db.execAsync(`
    PRAGMA journal_mode = WAL;
    PRAGMA synchronous = NORMAL;
    PRAGMA busy_timeout = 5000;
    PRAGMA cache_size = -20000;
    PRAGMA foreign_keys = ON;
    PRAGMA temp_store = MEMORY;
    PRAGMA mmap_size = 268435456;
  `);

  // Run migrations
  const { user_version: currentVersion } = await db.getFirstAsync<{ user_version: number }>(
    'PRAGMA user_version'
  );
  if (currentVersion < DATABASE_VERSION) {
    await runMigrations(db, currentVersion);
    await db.execAsync(`PRAGMA user_version = ${DATABASE_VERSION}`);
  }
}
```

### Access from Components

```typescript
import { useSQLiteContext } from 'expo-sqlite';

function VerseList() {
  const db = useSQLiteContext(); // singleton from provider
  // Use db for queries...
}
```

### AppState Lifecycle Management

```typescript
import { AppState, AppStateStatus } from 'react-native';
import { useEffect, useRef } from 'react';

function useDatabaseLifecycle(db: SQLiteDatabase) {
  const appState = useRef(AppState.currentState);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState: AppStateStatus) => {
      if (appState.current === 'active' && nextState.match(/inactive|background/)) {
        // App going to background — run WAL checkpoint
        db.execAsync('PRAGMA wal_checkpoint(PASSIVE)').catch(() => {});
      }
      appState.current = nextState;
    });
    return () => subscription.remove();
  }, [db]);
}
```

**Key principle**: With expo-sqlite's `SQLiteProvider`, you do NOT need to manually close/reopen the database. The provider manages the connection lifecycle. Just checkpoint WAL on background.

### Handling "database is locked"

```typescript
// busy_timeout handles most cases. For remaining edge cases:
async function withRetry<T>(fn: () => Promise<T>, maxRetries = 3): Promise<T> {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (error: any) {
      if (error.message?.includes('database is locked') && i < maxRetries - 1) {
        await new Promise(r => setTimeout(r, 100 * (i + 1))); // exponential backoff
        continue;
      }
      throw error;
    }
  }
  throw new Error('Max retries exceeded');
}
```

### Transaction Best Practices

```typescript
// Use withExclusiveTransactionAsync for writes that need isolation
await db.withExclusiveTransactionAsync(async () => {
  // Only queries inside this scope are part of the transaction
  await db.runAsync('INSERT INTO highlights ...');
  await db.runAsync('INSERT INTO highlight_verses ...');
});

// Use withTransactionAsync for read-only batches
await db.withTransactionAsync(async () => {
  const verses = await db.getAllAsync('SELECT ...');
  const notes = await db.getAllAsync('SELECT ...');
});
```

**Critical difference**: `withTransactionAsync` can be interrupted by other async queries (they get included in the transaction). `withExclusiveTransactionAsync` guarantees only scoped queries participate.

---

## 4. Offline-First Database Sync Patterns

### Database Versioning with PRAGMA user_version

```typescript
const DATABASE_VERSION = 3;

async function runMigrations(db: SQLiteDatabase, fromVersion: number) {
  await db.withExclusiveTransactionAsync(async () => {
    if (fromVersion < 1) {
      // Initial schema
      await db.execAsync(`
        CREATE TABLE IF NOT EXISTS verses (
          id INTEGER PRIMARY KEY,
          book_id INTEGER NOT NULL,
          chapter INTEGER NOT NULL,
          verse INTEGER NOT NULL,
          text TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_verses_ref ON verses(book_id, chapter, verse);
      `);
    }
    if (fromVersion < 2) {
      // Add FTS
      await db.execAsync(`
        CREATE VIRTUAL TABLE IF NOT EXISTS verses_fts USING fts5(
          text, content='verses', content_rowid='id',
          tokenize='porter unicode61', prefix='2 3'
        );
        INSERT INTO verses_fts(verses_fts) VALUES('rebuild');
      `);
    }
    if (fromVersion < 3) {
      // Add highlights
      await db.execAsync(`
        CREATE TABLE IF NOT EXISTS highlights (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          color TEXT NOT NULL DEFAULT '#FFEB3B',
          note TEXT,
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
      `);
    }
  });
}
```

### Corruption Detection and Recovery

```typescript
async function checkDatabaseIntegrity(db: SQLiteDatabase): Promise<boolean> {
  try {
    // Quick check (~10x faster than full integrity_check)
    const result = await db.getFirstAsync<{ integrity_check: string }>(
      'PRAGMA quick_check'
    );
    return result?.integrity_check === 'ok';
  } catch {
    return false;
  }
}

async function recoverDatabase(dbName: string) {
  const dbPath = `${FileSystem.documentDirectory}SQLite/${dbName}`;

  // 1. Check if database exists and is corrupt
  const db = await SQLite.openDatabaseAsync(dbName);
  const isHealthy = await checkDatabaseIntegrity(db);

  if (!isHealthy) {
    await db.closeAsync();
    // 2. Delete corrupt database
    await FileSystem.deleteAsync(dbPath, { idempotent: true });
    await FileSystem.deleteAsync(`${dbPath}-wal`, { idempotent: true });
    await FileSystem.deleteAsync(`${dbPath}-shm`, { idempotent: true });
    // 3. Re-download or re-create
    await downloadBibleDatabase(dbName);
  }
}
```

### Re-download Strategy

```typescript
interface DatabaseManifest {
  version: number;
  sha256: string;
  sizeBytes: number;
  url: string;
  compressedSizeBytes: number;
}

async function shouldRedownload(manifest: DatabaseManifest): Promise<boolean> {
  const localVersion = await AsyncStorage.getItem('bible_db_version');
  return !localVersion || parseInt(localVersion) < manifest.version;
}
```

---

## 5. Bible Database Schema Optimization

### Production Schema (Optimized for Mobile)

```sql
-- ============================================
-- CORE TABLES
-- ============================================

CREATE TABLE translations (
  id TEXT PRIMARY KEY,          -- 'ESV', 'NIV', 'KJV'
  name TEXT NOT NULL,           -- 'English Standard Version'
  language TEXT NOT NULL,       -- 'en'
  license TEXT,
  copyright TEXT,
  version INTEGER DEFAULT 1    -- For delta updates
);

CREATE TABLE books (
  id INTEGER PRIMARY KEY,       -- 1-66 (Protestant canon)
  name TEXT NOT NULL,           -- 'Genesis'
  abbreviation TEXT NOT NULL,   -- 'Gen'
  testament TEXT NOT NULL,      -- 'OT' or 'NT'
  chapters INTEGER NOT NULL,    -- Total chapters in book
  sort_order INTEGER NOT NULL   -- Display order
);

CREATE TABLE verses (
  id INTEGER PRIMARY KEY,       -- Composite: BBCCCVVV (43003016 = John 3:16)
  book_id INTEGER NOT NULL,
  chapter INTEGER NOT NULL,
  verse INTEGER NOT NULL,
  text TEXT NOT NULL,
  FOREIGN KEY (book_id) REFERENCES books(id)
);

-- Clustered on primary key (id = BBCCCVVV), so range scans are fast
CREATE INDEX idx_verses_book_chapter ON verses(book_id, chapter);

-- ============================================
-- CROSS-REFERENCES
-- ============================================

CREATE TABLE cross_references (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  from_verse_id INTEGER NOT NULL, -- BBCCCVVV format
  to_verse_start INTEGER NOT NULL,
  to_verse_end INTEGER NOT NULL,
  votes INTEGER DEFAULT 0,        -- Relevance ranking
  FOREIGN KEY (from_verse_id) REFERENCES verses(id)
);

CREATE INDEX idx_xref_from ON cross_references(from_verse_id);
CREATE INDEX idx_xref_to ON cross_references(to_verse_start, to_verse_end);

-- ============================================
-- STRONG'S CONCORDANCE
-- ============================================

CREATE TABLE strongs (
  number TEXT PRIMARY KEY,       -- 'H1', 'G2316' (Hebrew/Greek)
  lemma TEXT NOT NULL,           -- Original word
  transliteration TEXT,
  pronunciation TEXT,
  definition TEXT NOT NULL,
  usage_notes TEXT
);

CREATE TABLE verse_strongs (
  verse_id INTEGER NOT NULL,     -- BBCCCVVV
  word_position INTEGER NOT NULL, -- Word index in verse
  strongs_number TEXT NOT NULL,
  FOREIGN KEY (verse_id) REFERENCES verses(id),
  FOREIGN KEY (strongs_number) REFERENCES strongs(number),
  PRIMARY KEY (verse_id, word_position)
);

-- ============================================
-- FULL-TEXT SEARCH
-- ============================================

CREATE VIRTUAL TABLE verses_fts USING fts5(
  text,
  content='verses',
  content_rowid='id',
  tokenize='porter unicode61 remove_diacritics 2',
  prefix='2 3 4'
);
```

### Verse ID Encoding (BBCCCVVV)

```typescript
// Encode: John 3:16 → 43003016
function encodeVerseId(book: number, chapter: number, verse: number): number {
  return book * 1000000 + chapter * 1000 + verse;
}

// Decode: 43003016 → { book: 43, chapter: 3, verse: 16 }
function decodeVerseId(id: number): { book: number; chapter: number; verse: number } {
  return {
    book: Math.floor(id / 1000000),
    chapter: Math.floor((id % 1000000) / 1000),
    verse: id % 1000,
  };
}

// Range query: Get all verses in John 3
// WHERE id >= 43003001 AND id <= 43003999
function chapterRange(book: number, chapter: number): [number, number] {
  return [
    encodeVerseId(book, chapter, 1),
    encodeVerseId(book, chapter, 999),
  ];
}
```

This encoding is critical — it makes range queries on verse spans a simple integer comparison instead of multi-column WHERE clauses.

### Multi-Translation Alignment

```sql
-- Option A: Separate table per translation (simpler, faster per-translation queries)
CREATE TABLE verses_esv (id INTEGER PRIMARY KEY, book_id INTEGER, chapter INTEGER, verse INTEGER, text TEXT);
CREATE TABLE verses_niv (id INTEGER PRIMARY KEY, book_id INTEGER, chapter INTEGER, verse INTEGER, text TEXT);

-- Option B: Single table with translation column (easier multi-translation display)
CREATE TABLE verses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  translation_id TEXT NOT NULL,
  verse_id INTEGER NOT NULL,  -- BBCCCVVV
  book_id INTEGER NOT NULL,
  chapter INTEGER NOT NULL,
  verse INTEGER NOT NULL,
  text TEXT NOT NULL,
  UNIQUE(translation_id, verse_id)
);
CREATE INDEX idx_verses_lookup ON verses(translation_id, book_id, chapter);
```

**Recommendation**: Option A (separate tables) for mobile. Faster queries, simpler FTS indexing, and you can download translations independently. Use dynamic table names:

```typescript
const tableName = `verses_${translationId.toLowerCase()}`;
const verses = await db.getAllAsync(
  `SELECT * FROM ${tableName} WHERE book_id = ? AND chapter = ? ORDER BY verse`,
  [bookId, chapter]
);
```

---

## 6. Bible Verse Reference Parsing

### Recommended Library: bible-passage-reference-parser

```bash
bun add bible-passage-reference-parser
```

```typescript
import { bcv_parser } from 'bible-passage-reference-parser/esm/bcv_parser.js';
import * as lang from 'bible-passage-reference-parser/esm/lang/en.js';

const bcv = new bcv_parser(lang);

// Basic parsing
bcv.parse('John 3:16').osis();
// → "John.3.16"

bcv.parse('1 Cor 13:4-7').osis();
// → "1Cor.13.4-1Cor.13.7"

bcv.parse('Gen 1:1-2:3').osis();
// → "Gen.1.1-Gen.2.3"

bcv.parse('Matt 5:3-12, 6:9-13').osis();
// → "Matt.5.3-Matt.5.12,Matt.6.9-Matt.6.13"

// Get structured data with positions (for tagging text)
bcv.parse('Read John 3:16 and Romans 8:28 today').osis_and_indices();
// → [
//   { osis: "John.3.16", translations: [""], indices: [5, 14] },
//   { osis: "Rom.8.28", translations: [""], indices: [19, 31] }
// ]

// Parse with translation
bcv.parse('John 3:16 NIV').osis_and_translations();
// → [["John.3.16", "NIV"]]
```

**Performance**: <1ms for short strings, ~175KB/sec for reference-heavy text.

### Converting OSIS to Verse IDs

```typescript
const BOOK_MAP: Record<string, number> = {
  'Gen': 1, 'Exod': 2, 'Lev': 3, /* ... */ 'John': 43, 'Rom': 45,
  '1Cor': 46, '2Cor': 47, /* ... */ 'Rev': 66,
};

function osisToVerseIds(osis: string): number[] {
  const ids: number[] = [];
  const segments = osis.split(',');

  for (const segment of segments) {
    const [start, end] = segment.split('-');
    const startId = osisRefToId(start);
    const endId = end ? osisRefToId(end) : startId;

    // For ranges, query DB for actual verses between start and end
    for (let id = startId; id <= endId; id++) {
      ids.push(id);
    }
  }
  return ids;
}

function osisRefToId(ref: string): number {
  const parts = ref.split('.');
  const book = BOOK_MAP[parts[0]];
  const chapter = parseInt(parts[1]);
  const verse = parseInt(parts[2]);
  return encodeVerseId(book, chapter, verse);
}
```

### Fallback Regex (if library is too heavy)

```typescript
// Matches: "John 3:16", "1 Cor 13:4-7", "Gen 1:1-2:3", "Ps 23"
const VERSE_REF_REGEX = /\b(\d?\s?[A-Za-z]+)\.?\s+(\d{1,3})(?::(\d{1,3}))?(?:\s*[-–]\s*(?:(\d{1,3}):)?(\d{1,3}))?\b/g;

function parseReference(input: string): ParsedRef | null {
  const match = VERSE_REF_REGEX.exec(input);
  if (!match) return null;

  return {
    book: match[1].trim(),
    startChapter: parseInt(match[2]),
    startVerse: match[3] ? parseInt(match[3]) : 1,
    endChapter: match[4] ? parseInt(match[4]) : parseInt(match[2]),
    endVerse: match[5] ? parseInt(match[5]) : (match[3] ? parseInt(match[3]) : undefined),
  };
}
```

---

## 7. Bible Reading Position Tracking

### Schema

```sql
CREATE TABLE reading_positions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  translation_id TEXT NOT NULL,
  book_id INTEGER NOT NULL,
  chapter INTEGER NOT NULL,
  scroll_offset REAL DEFAULT 0,     -- ScrollView Y offset for exact position
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(translation_id)            -- One position per translation
);

CREATE TABLE reading_plans (
  id TEXT PRIMARY KEY,               -- 'one-year', 'chronological', etc.
  name TEXT NOT NULL,
  total_days INTEGER NOT NULL,
  description TEXT
);

CREATE TABLE reading_plan_progress (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  plan_id TEXT NOT NULL,
  day_number INTEGER NOT NULL,
  verse_start INTEGER NOT NULL,      -- BBCCCVVV
  verse_end INTEGER NOT NULL,        -- BBCCCVVV
  completed INTEGER DEFAULT 0,       -- boolean
  completed_at TEXT,
  FOREIGN KEY (plan_id) REFERENCES reading_plans(id),
  UNIQUE(plan_id, day_number)
);

CREATE TABLE reading_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  verse_id INTEGER NOT NULL,         -- BBCCCVVV (first verse of chapter read)
  translation_id TEXT NOT NULL,
  duration_seconds INTEGER,          -- Time spent reading
  read_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_history_date ON reading_history(read_at);
```

### Last-Read Tracking in React

```typescript
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useEffect } from 'react';
import { useAppStore } from '@/store';
import debounce from 'lodash/debounce';

function useReadingPosition(translationId: string) {
  const db = useSQLiteContext();

  const savePosition = useCallback(
    debounce(async (bookId: number, chapter: number, scrollOffset: number) => {
      await db.runAsync(
        `INSERT INTO reading_positions (translation_id, book_id, chapter, scroll_offset, updated_at)
         VALUES (?, ?, ?, ?, datetime('now'))
         ON CONFLICT(translation_id) DO UPDATE SET
           book_id = excluded.book_id,
           chapter = excluded.chapter,
           scroll_offset = excluded.scroll_offset,
           updated_at = excluded.updated_at`,
        [translationId, bookId, chapter, scrollOffset]
      );
    }, 500), // Debounce 500ms to avoid write spam during scrolling
    [translationId]
  );

  const getLastPosition = useCallback(async () => {
    return db.getFirstAsync<{
      book_id: number;
      chapter: number;
      scroll_offset: number;
    }>(
      'SELECT book_id, chapter, scroll_offset FROM reading_positions WHERE translation_id = ?',
      [translationId]
    );
  }, [translationId]);

  return { savePosition, getLastPosition };
}
```

### Reading Plan Progress

```typescript
async function markDayComplete(db: SQLiteDatabase, planId: string, dayNumber: number) {
  await db.runAsync(
    `UPDATE reading_plan_progress
     SET completed = 1, completed_at = datetime('now')
     WHERE plan_id = ? AND day_number = ?`,
    [planId, dayNumber]
  );
}

async function getPlanProgress(db: SQLiteDatabase, planId: string) {
  const total = await db.getFirstAsync<{ count: number }>(
    'SELECT COUNT(*) as count FROM reading_plan_progress WHERE plan_id = ?',
    [planId]
  );
  const completed = await db.getFirstAsync<{ count: number }>(
    'SELECT COUNT(*) as count FROM reading_plan_progress WHERE plan_id = ? AND completed = 1',
    [planId]
  );
  return {
    total: total?.count ?? 0,
    completed: completed?.count ?? 0,
    percentage: total?.count ? ((completed?.count ?? 0) / total.count) * 100 : 0,
  };
}
```

---

## 8. Highlight and Annotation Storage

### Schema Design

```sql
-- ============================================
-- HIGHLIGHTS (color + optional note)
-- ============================================

CREATE TABLE highlights (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  color TEXT NOT NULL DEFAULT '#FFEB3B',  -- Hex color
  note TEXT,                               -- Optional annotation text
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Verse range for each highlight (supports multi-verse, cross-chapter)
CREATE TABLE highlight_verses (
  highlight_id INTEGER NOT NULL,
  start_verse_id INTEGER NOT NULL,  -- BBCCCVVV
  end_verse_id INTEGER NOT NULL,    -- BBCCCVVV (same as start for single verse)
  FOREIGN KEY (highlight_id) REFERENCES highlights(id) ON DELETE CASCADE,
  PRIMARY KEY (highlight_id, start_verse_id)
);

CREATE INDEX idx_hv_range ON highlight_verses(start_verse_id, end_verse_id);

-- ============================================
-- TAGS (categorize highlights/notes)
-- ============================================

CREATE TABLE tags (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  color TEXT,                        -- Optional tag color
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE highlight_tags (
  highlight_id INTEGER NOT NULL,
  tag_id INTEGER NOT NULL,
  FOREIGN KEY (highlight_id) REFERENCES highlights(id) ON DELETE CASCADE,
  FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE,
  PRIMARY KEY (highlight_id, tag_id)
);

-- ============================================
-- BOOKMARKS (quick-access verses)
-- ============================================

CREATE TABLE bookmarks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  verse_id INTEGER NOT NULL,         -- BBCCCVVV
  label TEXT,                        -- Optional custom label
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(verse_id)
);
```

### Querying Highlights for a Chapter

```sql
-- Find all highlights that overlap with John 3 (verses 43003001 to 43003999)
SELECT h.id, h.color, h.note, hv.start_verse_id, hv.end_verse_id
FROM highlights h
JOIN highlight_verses hv ON h.id = hv.highlight_id
WHERE hv.start_verse_id <= 43003999   -- Range end
  AND hv.end_verse_id >= 43003001     -- Range start
ORDER BY hv.start_verse_id;
```

This overlap query catches all cases:
- Highlight fully inside the chapter
- Highlight starting before the chapter but ending inside it
- Highlight spanning across the chapter
- Highlight starting inside but ending after the chapter

### Handling Cross-Chapter Verse Ranges

```typescript
// Highlight Genesis 1:26-2:3 (spans two chapters)
async function createHighlight(
  db: SQLiteDatabase,
  color: string,
  startVerseId: number,  // encodeVerseId(1, 1, 26) = 1001026
  endVerseId: number,    // encodeVerseId(1, 2, 3) = 1002003
  note?: string,
  tagIds?: number[]
) {
  await db.withExclusiveTransactionAsync(async () => {
    const result = await db.runAsync(
      'INSERT INTO highlights (color, note) VALUES (?, ?)',
      [color, note ?? null]
    );
    const highlightId = result.lastInsertRowId;

    await db.runAsync(
      'INSERT INTO highlight_verses (highlight_id, start_verse_id, end_verse_id) VALUES (?, ?, ?)',
      [highlightId, startVerseId, endVerseId]
    );

    if (tagIds?.length) {
      const stmt = await db.prepareAsync(
        'INSERT INTO highlight_tags (highlight_id, tag_id) VALUES (?, ?)'
      );
      try {
        for (const tagId of tagIds) {
          await stmt.executeAsync([highlightId, tagId]);
        }
      } finally {
        await stmt.finalizeAsync();
      }
    }
  });
}
```

### Highlight Color Presets

```typescript
const HIGHLIGHT_COLORS = {
  yellow: '#FFEB3B',
  green: '#A5D6A7',
  blue: '#90CAF9',
  pink: '#F48FB1',
  orange: '#FFCC80',
  purple: '#CE93D8',
} as const;
```

---

## 9. Bible Search UX Patterns

### Dual-Mode Search (Reference vs Content)

```typescript
function detectSearchMode(query: string): 'reference' | 'keyword' {
  // Reference patterns: "John 3:16", "1 Cor 13", "Gen 1:1-3"
  const refPattern = /^\d?\s?[A-Za-z]+\.?\s+\d/;
  return refPattern.test(query.trim()) ? 'reference' : 'keyword';
}

async function search(db: SQLiteDatabase, query: string) {
  const mode = detectSearchMode(query);

  if (mode === 'reference') {
    const bcv = new bcv_parser(lang);
    const osis = bcv.parse(query).osis();
    if (osis) {
      const verseIds = osisToVerseIds(osis);
      return db.getAllAsync(
        `SELECT * FROM verses WHERE id IN (${verseIds.map(() => '?').join(',')})`,
        verseIds
      );
    }
  }

  // Keyword/content search via FTS5
  const sanitized = query.replace(/[^\w\s*"]/g, ''); // Remove special chars except * and "
  return db.getAllAsync(
    `SELECT v.book_id, v.chapter, v.verse, v.text,
            snippet(verses_fts, 0, '<b>', '</b>', '...', 32) as snippet,
            bm25(verses_fts) as relevance
     FROM verses_fts
     JOIN verses v ON v.id = verses_fts.rowid
     WHERE verses_fts MATCH ?
     ORDER BY rank
     LIMIT 100`,
    [sanitized + '*'] // Append * for prefix matching
  );
}
```

### Search UX Components

**How YouVersion handles it:**
- Single search bar with placeholder "Search the Bible"
- Auto-detects reference vs keyword
- Results ordered by relevance
- Filter chips appear after first search: Translation, OT/NT, Book
- "Trending searches" shown before typing (community-driven)
- Results limited to one verse at a time, expandable

**How Logos handles it:**
- Separate modes: Bible text, Library, All resources
- Word study tools triggered by tapping Greek/Hebrew words
- Concordance-style search with frequency counts

**How Blue Letter Bible handles it:**
- Bible search + Lexicon search + Dictionary search as separate tabs
- Advanced search with boolean operators exposed in UI
- Strong's number search alongside text search

### Recommended Search UX for Unfold

```typescript
// Recent searches with AsyncStorage
const RECENT_SEARCHES_KEY = 'bible_recent_searches';
const MAX_RECENT = 10;

async function addRecentSearch(query: string) {
  const recent = JSON.parse(await AsyncStorage.getItem(RECENT_SEARCHES_KEY) ?? '[]');
  const filtered = recent.filter((r: string) => r !== query);
  filtered.unshift(query);
  await AsyncStorage.setItem(
    RECENT_SEARCHES_KEY,
    JSON.stringify(filtered.slice(0, MAX_RECENT))
  );
}

// Search suggestions (book name autocomplete via trigram FTS)
async function getBookSuggestions(db: SQLiteDatabase, prefix: string) {
  return db.getAllAsync(
    `SELECT DISTINCT name, abbreviation FROM books
     WHERE name LIKE ? OR abbreviation LIKE ?
     ORDER BY sort_order
     LIMIT 5`,
    [`${prefix}%`, `${prefix}%`]
  );
}
```

### Debounced Search Input

```typescript
function useSearchDebounce(delay = 300) {
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query), delay);
    return () => clearTimeout(timer);
  }, [query, delay]);

  return { query, setQuery, debouncedQuery };
}
```

---

## 10. Database Download Strategies

### Approach: Compressed Download with Integrity Verification

```typescript
import * as FileSystem from 'expo-file-system';
import * as SQLite from 'expo-sqlite';

interface BibleManifest {
  id: string;           // 'esv'
  name: string;         // 'English Standard Version'
  version: number;      // Schema/data version
  sha256: string;       // Hash of uncompressed .db file
  sizeBytes: number;    // Uncompressed size
  compressedUrl: string; // CDN URL to .db.gz file
  compressedSizeBytes: number;
}

const DB_DIR = `${FileSystem.documentDirectory}SQLite/`;

async function downloadBibleTranslation(manifest: BibleManifest): Promise<void> {
  const dbPath = `${DB_DIR}bible-${manifest.id}.db`;
  const tempPath = `${FileSystem.cacheDirectory}bible-${manifest.id}.db.gz`;

  // 1. Download compressed file with progress
  const downloadResumable = FileSystem.createDownloadResumable(
    manifest.compressedUrl,
    tempPath,
    {},
    (progress) => {
      const pct = progress.totalBytesWritten / progress.totalBytesExpectedToWrite;
      // Update UI progress bar
      onProgress?.(pct);
    }
  );

  const result = await downloadResumable.downloadAsync();
  if (!result) throw new Error('Download failed');

  // 2. Verify compressed file size as quick check
  const fileInfo = await FileSystem.getInfoAsync(tempPath);
  if (fileInfo.exists && fileInfo.size !== manifest.compressedSizeBytes) {
    await FileSystem.deleteAsync(tempPath, { idempotent: true });
    throw new Error('Download size mismatch — file may be corrupt');
  }

  // 3. Decompress (server should serve .db directly if gzip not feasible)
  //    For React Native, prefer serving uncompressed .db since
  //    CDN handles gzip transfer encoding automatically
  await FileSystem.moveAsync({ from: tempPath, to: dbPath });

  // 4. Verify database integrity
  const db = await SQLite.openDatabaseAsync(`bible-${manifest.id}.db`);
  try {
    const check = await db.getFirstAsync<{ integrity_check: string }>(
      'PRAGMA quick_check'
    );
    if (check?.integrity_check !== 'ok') {
      throw new Error('Database integrity check failed');
    }
    // 5. Set optimal PRAGMAs
    await db.execAsync(`
      PRAGMA journal_mode = WAL;
      PRAGMA synchronous = NORMAL;
    `);
  } finally {
    await db.closeAsync();
  }

  // 6. Record successful download
  await AsyncStorage.setItem(`bible_${manifest.id}_version`, String(manifest.version));
}
```

### Compression Comparison for Bible SQLite Files

| Format | Typical Bible DB (~30MB) | Compression Ratio | Decompression Speed | Native CDN Support |
|--------|-------------------------|-------------------|--------------------|--------------------|
| **gzip** | ~8-10MB | 3:1 | Fast | Yes (Content-Encoding) |
| **brotli** | ~6-8MB | 4:1 | Medium | Yes (Content-Encoding) |
| **Uncompressed** | ~30MB | 1:1 | N/A | N/A |

**Recommendation**: Serve uncompressed `.db` files and let CDN handle gzip/brotli via `Content-Encoding` header. This way React Native receives the decompressed file automatically — no client-side decompression code needed.

### Bundled vs Downloaded

```typescript
// Option A: Bundle with app (increases app size by ~30MB per translation)
// In SQLiteProvider:
<SQLiteProvider
  databaseName="bible-esv.db"
  assetSource={{ assetId: require('../assets/bible-esv.db') }}
>

// Option B: Download on first launch (recommended — keeps app size small)
// Bundle only the primary translation, download others on demand

// Option C: Hybrid — bundle one, download extras
const BUNDLED_TRANSLATION = 'esv';
const isDownloaded = await FileSystem.getInfoAsync(`${DB_DIR}bible-${translationId}.db`);

if (!isDownloaded.exists && translationId === BUNDLED_TRANSLATION) {
  // Use bundled asset
} else if (!isDownloaded.exists) {
  // Download from CDN
  await downloadBibleTranslation(manifest);
}
```

### Delta Updates (for translation corrections/additions)

```sql
-- Track what version of data each row represents
ALTER TABLE verses ADD COLUMN data_version INTEGER DEFAULT 1;

-- Server provides delta: only changed verses since client's version
-- Client applies:
INSERT OR REPLACE INTO verses (id, book_id, chapter, verse, text, data_version)
VALUES (?, ?, ?, ?, ?, ?);

-- After applying deltas, rebuild FTS
INSERT INTO verses_fts(verses_fts) VALUES('rebuild');
```

### Integrity Verification Strategy

```typescript
// Layered verification (fast → slow)
async function verifyDatabase(dbPath: string, expectedSha256?: string): Promise<boolean> {
  // Layer 1: File exists and has non-zero size (instant)
  const info = await FileSystem.getInfoAsync(dbPath);
  if (!info.exists || info.size === 0) return false;

  // Layer 2: SQLite can open it (fast)
  try {
    const db = await SQLite.openDatabaseAsync(dbPath);

    // Layer 3: Quick integrity check (~100ms for 30MB)
    const check = await db.getFirstAsync<{ integrity_check: string }>('PRAGMA quick_check');
    if (check?.integrity_check !== 'ok') {
      await db.closeAsync();
      return false;
    }

    // Layer 4: Verify expected row count (fast)
    const count = await db.getFirstAsync<{ count: number }>('SELECT COUNT(*) as count FROM verses');
    if (!count || count.count < 31000) { // Protestant Bible has ~31,102 verses
      await db.closeAsync();
      return false;
    }

    await db.closeAsync();
    return true;
  } catch {
    return false;
  }

  // Layer 5: SHA-256 hash (slow, ~2-5s for 30MB — only for paranoid mode)
  // Not recommended on every launch. Use on download only.
}
```

---

## Quick Reference: Complete Database Init

```typescript
// src/lib/bible-db.ts
import * as SQLite from 'expo-sqlite';

const DATABASE_VERSION = 1;

export async function initBibleDatabase(db: SQLite.SQLiteDatabase) {
  // Performance PRAGMAs
  await db.execAsync(`
    PRAGMA journal_mode = WAL;
    PRAGMA synchronous = NORMAL;
    PRAGMA busy_timeout = 5000;
    PRAGMA cache_size = -20000;
    PRAGMA foreign_keys = ON;
    PRAGMA temp_store = MEMORY;
    PRAGMA mmap_size = 268435456;
  `);

  // Check version and migrate
  const { user_version } = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version') ?? { user_version: 0 };

  if (user_version < DATABASE_VERSION) {
    await db.withExclusiveTransactionAsync(async () => {
      if (user_version < 1) {
        await db.execAsync(`
          CREATE TABLE IF NOT EXISTS books (
            id INTEGER PRIMARY KEY, name TEXT NOT NULL, abbreviation TEXT NOT NULL,
            testament TEXT NOT NULL, chapters INTEGER NOT NULL, sort_order INTEGER NOT NULL
          );
          CREATE TABLE IF NOT EXISTS verses (
            id INTEGER PRIMARY KEY, book_id INTEGER NOT NULL, chapter INTEGER NOT NULL,
            verse INTEGER NOT NULL, text TEXT NOT NULL,
            FOREIGN KEY (book_id) REFERENCES books(id)
          );
          CREATE INDEX IF NOT EXISTS idx_verses_ref ON verses(book_id, chapter);

          CREATE VIRTUAL TABLE IF NOT EXISTS verses_fts USING fts5(
            text, content='verses', content_rowid='id',
            tokenize='porter unicode61 remove_diacritics 2', prefix='2 3 4'
          );

          CREATE TABLE IF NOT EXISTS highlights (
            id INTEGER PRIMARY KEY AUTOINCREMENT, color TEXT NOT NULL DEFAULT '#FFEB3B',
            note TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at TEXT NOT NULL DEFAULT (datetime('now'))
          );
          CREATE TABLE IF NOT EXISTS highlight_verses (
            highlight_id INTEGER NOT NULL, start_verse_id INTEGER NOT NULL,
            end_verse_id INTEGER NOT NULL,
            FOREIGN KEY (highlight_id) REFERENCES highlights(id) ON DELETE CASCADE,
            PRIMARY KEY (highlight_id, start_verse_id)
          );
          CREATE INDEX IF NOT EXISTS idx_hv_range ON highlight_verses(start_verse_id, end_verse_id);

          CREATE TABLE IF NOT EXISTS tags (
            id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL UNIQUE,
            color TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now'))
          );
          CREATE TABLE IF NOT EXISTS highlight_tags (
            highlight_id INTEGER NOT NULL, tag_id INTEGER NOT NULL,
            FOREIGN KEY (highlight_id) REFERENCES highlights(id) ON DELETE CASCADE,
            FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE,
            PRIMARY KEY (highlight_id, tag_id)
          );

          CREATE TABLE IF NOT EXISTS bookmarks (
            id INTEGER PRIMARY KEY AUTOINCREMENT, verse_id INTEGER NOT NULL,
            label TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now')),
            UNIQUE(verse_id)
          );

          CREATE TABLE IF NOT EXISTS reading_positions (
            id INTEGER PRIMARY KEY AUTOINCREMENT, translation_id TEXT NOT NULL,
            book_id INTEGER NOT NULL, chapter INTEGER NOT NULL,
            scroll_offset REAL DEFAULT 0,
            updated_at TEXT NOT NULL DEFAULT (datetime('now')),
            UNIQUE(translation_id)
          );

          CREATE TABLE IF NOT EXISTS reading_history (
            id INTEGER PRIMARY KEY AUTOINCREMENT, verse_id INTEGER NOT NULL,
            translation_id TEXT NOT NULL, duration_seconds INTEGER,
            read_at TEXT NOT NULL DEFAULT (datetime('now'))
          );
          CREATE INDEX IF NOT EXISTS idx_history_date ON reading_history(read_at);

          CREATE TABLE IF NOT EXISTS recent_searches (
            id INTEGER PRIMARY KEY AUTOINCREMENT, query TEXT NOT NULL UNIQUE,
            search_count INTEGER DEFAULT 1,
            last_searched TEXT NOT NULL DEFAULT (datetime('now'))
          );
        `);
      }
    });

    await db.execAsync(`PRAGMA user_version = ${DATABASE_VERSION}`);
  }

  // Run periodic optimization
  await db.execAsync('PRAGMA optimize');
}
```

---

## Key Open-Source Resources

| Resource | URL | What It Provides |
|----------|-----|------------------|
| scrollmapper/bible_databases | github.com/scrollmapper/bible_databases | 140 translations as SQLite, cross-references, Strong's numbers |
| godlytalias/Bible-Database | github.com/godlytalias/Bible-Database | Multi-language Bible in XML, JSON, SQL, SQLite |
| openbibleinfo/Bible-Passage-Reference-Parser | github.com/openbibleinfo/Bible-Passage-Reference-Parser | TypeScript parser for verse references (40+ languages) |
| openbibleinfo/Bible-Reference-Formatter | github.com/openbibleinfo/Bible-Reference-Formatter | Convert OSIS to human-readable format |
| TehShrike/verse-reference-regex | github.com/TehShrike/verse-reference-regex | Regex for matching Bible references |
| OpenBible cross-references | openbible.info/labs/cross-references | 340,000+ cross-references with community votes |

---

## Sources

- [Expo SQLite Documentation](https://docs.expo.dev/versions/latest/sdk/sqlite/)
- [SQLite FTS5 Extension](https://www.sqlite.org/fts5.html)
- [SQLite Performance Tuning (phiresky)](https://gist.github.com/phiresky/978d8e204f77feaa0ab5cca08d2d5b27)
- [SQLite Optimizations for Ultra High Performance (PowerSync)](https://www.powersync.com/blog/sqlite-optimizations-for-ultra-high-performance)
- [Android SQLite Performance Best Practices](https://developer.android.com/topic/performance/sqlite-performance-best-practices)
- [Bible-Passage-Reference-Parser](https://github.com/openbibleinfo/Bible-Passage-Reference-Parser)
- [scrollmapper/bible_databases](https://github.com/scrollmapper/bible_databases)
- [Bible Annotation Modeling (OpenBible)](https://www.openbible.info/blog/2011/09/bible-annotation-modeling-and-querying-in-mysql-and-couchdb/)
- [Modern SQLite for React Native Apps (Expo Blog)](https://expo.dev/blog/modern-sqlite-for-react-native-apps)
- [SQLite Concurrent Writes (Ten Thousand Meters)](https://tenthousandmeters.com/blog/sqlite-concurrent-writes-and-database-is-locked-errors/)
- [Offline-First React Native with SQLite](https://implementationdetails.dev/blog/2020/05/03/react-native-offline-first-db-with-sqlite-hooks/)
- [YouVersion iOS Bible Search](https://help.youversion.com/l/en/article/wakrw3pir7-bible-search-ios)
- [SQLite PRAGMA Reference](https://sqlite.org/pragma.html)
- [EXPLAIN QUERY PLAN](https://www.sqlite.org/eqp.html)
- [SQLite Query Optimizer Overview](https://sqlite.org/optoverview.html)
