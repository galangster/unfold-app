/**
 * Bible Database — SQLite Wrapper
 *
 * Manages the offline Bible database lifecycle:
 *   1. Download the pre-built .db file from the backend
 *   2. Open a singleton SQLite connection via expo-sqlite
 *   3. Provide typed query functions for chapters, verses, and search
 *
 * The database contains KJV and BSB translations with FTS5 full-text search.
 * Once downloaded (~25 MB), all Bible reading is fully offline.
 *
 * Expo SDK 55 notes:
 *   - Uses expo-file-system/legacy for download with progress tracking
 *     (the new File API doesn't support progress callbacks)
 *   - expo-sqlite openDatabaseAsync uses the document directory by default
 */

import {
  documentDirectory,
  getInfoAsync,
  makeDirectoryAsync,
  deleteAsync,
  createDownloadResumable,
} from 'expo-file-system/legacy';
import { openDatabaseAsync, type SQLiteDatabase } from 'expo-sqlite';
import { MMKV } from 'react-native-mmkv';
import { logger } from '@/lib/logger';

// ─── Types ───────────────────────────────────────────────────────────────────

export type BibleTranslation = 'BSB' | 'KJV';

export type BibleDbStatus = 'not_downloaded' | 'downloading' | 'ready' | 'error';

export interface BibleVerse {
  id: number;
  bookId: number;
  chapter: number;
  verse: number;
  text: string;
  translation: BibleTranslation;
}

export interface BibleSearchResult {
  id: number;
  bookId: number;
  chapter: number;
  verse: number;
  text: string;
  translation: BibleTranslation;
  /** Highlighted snippet from FTS5 with <b> tags around matches */
  snippet: string;
}

export interface BibleDbMeta {
  status: BibleDbStatus;
  downloadedAt: string | null;
  version: string | null;
  sizeBytes: number | null;
  errorMessage: string | null;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const DB_FILENAME = 'unfold-bible-v1.db';
const DB_VERSION = 'v1';
const DB_DOWNLOAD_URL = `https://unfold-backend-production.up.railway.app/public/${DB_FILENAME}`;

/** Directory where expo-sqlite expects databases to live */
const SQLITE_DIR = `${documentDirectory}SQLite/`;
const DB_FILE_PATH = `${SQLITE_DIR}${DB_FILENAME}`;

const META_KEY_STATUS = 'bible_db_status';
const META_KEY_DOWNLOADED_AT = 'bible_db_downloaded_at';
const META_KEY_VERSION = 'bible_db_version';
const META_KEY_SIZE = 'bible_db_size';
const META_KEY_ERROR = 'bible_db_error';

// ─── MMKV meta store ─────────────────────────────────────────────────────────

/**
 * Separate MMKV instance for Bible DB metadata.
 * Tracks download status, version, and error state.
 */
const bibleMeta = new MMKV({ id: 'unfold-bible-meta' });

// ─── Singleton DB connection ─────────────────────────────────────────────────

let dbInstance: SQLiteDatabase | null = null;

// ─── Status management ───────────────────────────────────────────────────────

function setMeta(key: string, value: string | null): void {
  if (value === null) {
    bibleMeta.delete(key);
  } else {
    bibleMeta.set(key, value);
  }
}

function getMeta(key: string): string | null {
  return bibleMeta.getString(key) ?? null;
}

/**
 * Get the current Bible database status and metadata.
 */
export function getBibleDbStatus(): BibleDbMeta {
  const status = (getMeta(META_KEY_STATUS) as BibleDbStatus) ?? 'not_downloaded';
  return {
    status,
    downloadedAt: getMeta(META_KEY_DOWNLOADED_AT),
    version: getMeta(META_KEY_VERSION),
    sizeBytes: getMeta(META_KEY_SIZE) ? Number(getMeta(META_KEY_SIZE)) : null,
    errorMessage: getMeta(META_KEY_ERROR),
  };
}

/**
 * Check if the database file actually exists on disk.
 * If metadata says "ready" but the file is missing, resets status.
 */
export async function verifyBibleDb(): Promise<BibleDbStatus> {
  const meta = getBibleDbStatus();

  if (meta.status === 'ready') {
    const fileInfo = await getInfoAsync(DB_FILE_PATH);
    if (!fileInfo.exists) {
      logger.warn('[BibleDB] Database file missing despite ready status, resetting');
      setMeta(META_KEY_STATUS, 'not_downloaded');
      setMeta(META_KEY_ERROR, null);
      return 'not_downloaded';
    }
  }

  // Auto-detect DB file if status isn't 'ready' (e.g., stuck download, manual copy)
  if (meta.status !== 'ready') {
    const fileInfo = await getInfoAsync(DB_FILE_PATH);
    if (fileInfo.exists) {
      const sizeBytes = 'size' in fileInfo ? (fileInfo.size ?? 0) : 0;
      if (sizeBytes >= 5 * 1024 * 1024) {
        logger.log('[BibleDB] Found existing DB file, marking as ready');
        setMeta(META_KEY_STATUS, 'ready');
        setMeta(META_KEY_VERSION, DB_VERSION);
        setMeta(META_KEY_SIZE, String(sizeBytes));
        setMeta(META_KEY_DOWNLOADED_AT, new Date().toISOString());
        setMeta(META_KEY_ERROR, null);
        return 'ready';
      }
    }
  }

  return meta.status;
}

// ─── Download ────────────────────────────────────────────────────────────────

/**
 * Download the Bible database file from the backend.
 * Writes to the expo-sqlite directory so it can be opened directly.
 *
 * @param onProgress - Optional callback receiving download progress (0-1)
 * @returns true on success, false on failure
 */
export async function downloadBibleDb(
  onProgress?: (progress: number) => void,
): Promise<boolean> {
  const currentStatus = getBibleDbStatus().status;
  if (currentStatus === 'downloading') {
    logger.warn('[BibleDB] Download already in progress');
    return false;
  }

  logger.log('[BibleDB] Starting download from', DB_DOWNLOAD_URL);
  setMeta(META_KEY_STATUS, 'downloading');
  setMeta(META_KEY_ERROR, null);

  try {
    // Ensure the SQLite directory exists
    const dirInfo = await getInfoAsync(SQLITE_DIR);
    if (!dirInfo.exists) {
      await makeDirectoryAsync(SQLITE_DIR, { intermediates: true });
      logger.log('[BibleDB] Created SQLite directory');
    }

    // Remove any partial previous download
    const existingFile = await getInfoAsync(DB_FILE_PATH);
    if (existingFile.exists) {
      await deleteAsync(DB_FILE_PATH, { idempotent: true });
    }

    // Download with progress tracking via legacy API
    const downloadResumable = createDownloadResumable(
      DB_DOWNLOAD_URL,
      DB_FILE_PATH,
      {},
      (downloadProgress) => {
        const progress =
          downloadProgress.totalBytesWritten / downloadProgress.totalBytesExpectedToWrite;
        onProgress?.(progress);
      },
    );

    const result = await downloadResumable.downloadAsync();

    if (!result || result.status !== 200) {
      const statusCode = result?.status ?? 'unknown';
      throw new Error(`Download failed with status ${statusCode}`);
    }

    // Verify the file was written
    const fileInfo = await getInfoAsync(DB_FILE_PATH);
    if (!fileInfo.exists) {
      throw new Error('File not found after download');
    }

    const sizeBytes = 'size' in fileInfo ? (fileInfo.size ?? 0) : 0;

    // Sanity check: the Bible DB should be at least 5 MB
    if (sizeBytes < 5 * 1024 * 1024) {
      throw new Error(`Downloaded file too small (${sizeBytes} bytes), likely corrupt`);
    }

    // Verify the DB can be opened and has the expected tables
    const verified = await verifyDownloadedDb();
    if (!verified) {
      throw new Error('Database verification failed — tables or data missing');
    }

    setMeta(META_KEY_STATUS, 'ready');
    setMeta(META_KEY_DOWNLOADED_AT, new Date().toISOString());
    setMeta(META_KEY_VERSION, DB_VERSION);
    setMeta(META_KEY_SIZE, String(sizeBytes));
    setMeta(META_KEY_ERROR, null);

    logger.log('[BibleDB] Download complete', { sizeBytes });
    onProgress?.(1);
    return true;
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown download error';
    logger.error('[BibleDB] Download failed:', message);

    setMeta(META_KEY_STATUS, 'error');
    setMeta(META_KEY_ERROR, message);

    // Clean up partial download
    try {
      await deleteAsync(DB_FILE_PATH, { idempotent: true });
    } catch {
      // Ignore cleanup errors
    }

    return false;
  }
}

/**
 * Verify that a freshly downloaded database has the expected schema and data.
 */
async function verifyDownloadedDb(): Promise<boolean> {
  try {
    const db = await openDatabaseAsync(DB_FILENAME);

    // Check books table
    const bookCount = await db.getFirstAsync<{ count: number }>(
      'SELECT COUNT(*) as count FROM books',
    );
    if (!bookCount || bookCount.count !== 66) {
      logger.error('[BibleDB] Verification failed: expected 66 books, got', bookCount?.count);
      await db.closeAsync();
      return false;
    }

    // Check verses table has substantial data (both translations)
    const verseCount = await db.getFirstAsync<{ count: number }>(
      'SELECT COUNT(*) as count FROM verses',
    );
    if (!verseCount || verseCount.count < 50000) {
      logger.error('[BibleDB] Verification failed: too few verses', verseCount?.count);
      await db.closeAsync();
      return false;
    }

    await db.closeAsync();
    return true;
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error('[BibleDB] Verification error:', message);
    return false;
  }
}

/**
 * Delete the downloaded Bible database and reset status.
 * Useful for re-downloading or debugging.
 */
export async function deleteBibleDb(): Promise<void> {
  // Close any open connection first
  if (dbInstance) {
    try {
      await dbInstance.closeAsync();
    } catch {
      // Ignore close errors
    }
    dbInstance = null;
  }

  try {
    await deleteAsync(DB_FILE_PATH, { idempotent: true });
  } catch {
    // Ignore if file doesn't exist
  }

  setMeta(META_KEY_STATUS, 'not_downloaded');
  setMeta(META_KEY_DOWNLOADED_AT, null);
  setMeta(META_KEY_VERSION, null);
  setMeta(META_KEY_SIZE, null);
  setMeta(META_KEY_ERROR, null);

  logger.log('[BibleDB] Database deleted and status reset');
}

// ─── Open connection ─────────────────────────────────────────────────────────

/**
 * Open or return the singleton SQLite database connection.
 * Returns null if the database hasn't been downloaded yet.
 */
export async function openBibleDb(): Promise<SQLiteDatabase | null> {
  if (dbInstance) return dbInstance;

  const status = await verifyBibleDb();
  if (status !== 'ready') {
    logger.warn('[BibleDB] Cannot open — status is', status);
    return null;
  }

  try {
    dbInstance = await openDatabaseAsync(DB_FILENAME);

    // Performance PRAGMAs — optimized for read-heavy Bible queries
    try {
      await dbInstance.execAsync(`
        PRAGMA journal_mode = WAL;
        PRAGMA synchronous = NORMAL;
        PRAGMA cache_size = -8000;
        PRAGMA mmap_size = 30000000;
        PRAGMA temp_store = MEMORY;
      `);
      logger.log('[BibleDB] Performance PRAGMAs applied');
    } catch (pragmaError: unknown) {
      // Non-fatal — PRAGMAs enhance performance but DB works without them
      const msg = pragmaError instanceof Error ? pragmaError.message : 'Unknown error';
      logger.warn('[BibleDB] PRAGMA setup failed (non-fatal):', msg);
    }

    logger.log('[BibleDB] Database opened');
    return dbInstance;
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error('[BibleDB] Failed to open database:', message);
    dbInstance = null;
    return null;
  }
}

// ─── Query: Chapter ──────────────────────────────────────────────────────────

/**
 * Get all verses for a specific book/chapter/translation.
 *
 * @param bookId     - Book ID (1-66)
 * @param chapter    - Chapter number (1-based)
 * @param translation - 'BSB' or 'KJV' (defaults to 'BSB')
 * @returns Array of verses sorted by verse number, or empty array on error
 */
export async function getChapter(
  bookId: number,
  chapter: number,
  translation: BibleTranslation = 'BSB',
): Promise<BibleVerse[]> {
  try {
    const db = await openBibleDb();
    if (!db) return [];

    const rows = await db.getAllAsync<{
      id: number;
      book_id: number;
      chapter: number;
      verse: number;
      text: string;
      translation: string;
    }>(
      `SELECT id, book_id, chapter, verse, text, translation
       FROM verses
       WHERE book_id = ? AND chapter = ? AND translation = ?
       ORDER BY verse ASC`,
      [bookId, chapter, translation],
    );

    return rows.map(row => ({
      id: row.id,
      bookId: row.book_id,
      chapter: row.chapter,
      verse: row.verse,
      text: row.text,
      translation: row.translation as BibleTranslation,
    }));
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error('[BibleDB] getChapter failed:', message);
    return [];
  }
}

// ─── Query: Verse by Reference ───────────────────────────────────────────────

/**
 * Get a single verse or a range of verses.
 *
 * @param bookId      - Book ID (1-66)
 * @param chapter     - Chapter number
 * @param verseStart  - Starting verse number
 * @param verseEnd    - Ending verse number (inclusive). If omitted, returns only verseStart.
 * @param translation - 'BSB' or 'KJV' (defaults to 'BSB')
 */
export async function getVerseByReference(
  bookId: number,
  chapter: number,
  verseStart: number,
  verseEnd?: number,
  translation: BibleTranslation = 'BSB',
): Promise<BibleVerse[]> {
  try {
    const db = await openBibleDb();
    if (!db) return [];

    const endVerse = verseEnd ?? verseStart;

    const rows = await db.getAllAsync<{
      id: number;
      book_id: number;
      chapter: number;
      verse: number;
      text: string;
      translation: string;
    }>(
      `SELECT id, book_id, chapter, verse, text, translation
       FROM verses
       WHERE book_id = ? AND chapter = ? AND verse >= ? AND verse <= ? AND translation = ?
       ORDER BY verse ASC`,
      [bookId, chapter, verseStart, endVerse, translation],
    );

    return rows.map(row => ({
      id: row.id,
      bookId: row.book_id,
      chapter: row.chapter,
      verse: row.verse,
      text: row.text,
      translation: row.translation as BibleTranslation,
    }));
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error('[BibleDB] getVerseByReference failed:', message);
    return [];
  }
}

// ─── Query: FTS5 Search ──────────────────────────────────────────────────────

/**
 * Full-text search across all Bible verses using FTS5.
 * Uses the Porter stemmer for English-aware matching (e.g., "love" matches "loved", "loving").
 *
 * @param query       - Search query string (supports FTS5 syntax: AND, OR, NOT, "phrase")
 * @param translation - Filter to a specific translation, or undefined for both
 * @param limit       - Maximum results (defaults to 50)
 * @returns Array of search results with highlighted snippets
 */
export async function searchBible(
  query: string,
  translation?: BibleTranslation,
  limit: number = 50,
): Promise<BibleSearchResult[]> {
  if (!query || !query.trim()) return [];

  try {
    const db = await openBibleDb();
    if (!db) return [];

    // Sanitize query for FTS5 — remove characters that break FTS5 syntax
    // Keep alphanumeric, spaces, quotes, and basic operators
    const sanitized = query
      .replace(/[^\w\s"*-]/g, '')
      .trim();

    if (!sanitized) return [];

    // Build the query — join FTS table with verses table for metadata
    // Use snippet() to get highlighted matches
    let sql: string;
    let params: (string | number)[];

    if (translation) {
      sql = `
        SELECT
          v.id, v.book_id, v.chapter, v.verse, v.text, v.translation,
          snippet(verses_fts, 0, '<b>', '</b>', '...', 32) as snippet
        FROM verses_fts fts
        JOIN verses v ON v.id = fts.rowid
        WHERE verses_fts MATCH ?
          AND v.translation = ?
        ORDER BY rank
        LIMIT ?
      `;
      params = [sanitized, translation, limit];
    } else {
      sql = `
        SELECT
          v.id, v.book_id, v.chapter, v.verse, v.text, v.translation,
          snippet(verses_fts, 0, '<b>', '</b>', '...', 32) as snippet
        FROM verses_fts fts
        JOIN verses v ON v.id = fts.rowid
        WHERE verses_fts MATCH ?
        ORDER BY rank
        LIMIT ?
      `;
      params = [sanitized, limit];
    }

    const rows = await db.getAllAsync<{
      id: number;
      book_id: number;
      chapter: number;
      verse: number;
      text: string;
      translation: string;
      snippet: string;
    }>(sql, params);

    return rows.map(row => ({
      id: row.id,
      bookId: row.book_id,
      chapter: row.chapter,
      verse: row.verse,
      text: row.text,
      translation: row.translation as BibleTranslation,
      snippet: row.snippet,
    }));
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error('[BibleDB] searchBible failed:', message, { query });
    return [];
  }
}

// ─── Query: Chapter verse count ──────────────────────────────────────────────

/**
 * Get the number of verses in a specific chapter.
 * Useful for building chapter navigation UI.
 */
export async function getChapterVerseCount(
  bookId: number,
  chapter: number,
  translation: BibleTranslation = 'BSB',
): Promise<number> {
  try {
    const db = await openBibleDb();
    if (!db) return 0;

    const result = await db.getFirstAsync<{ count: number }>(
      `SELECT COUNT(*) as count FROM verses
       WHERE book_id = ? AND chapter = ? AND translation = ?`,
      [bookId, chapter, translation],
    );

    return result?.count ?? 0;
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error('[BibleDB] getChapterVerseCount failed:', message);
    return 0;
  }
}
