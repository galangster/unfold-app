/**
 * Audio Cache — LRU eviction for TTS audio files.
 *
 * Caps the audio cache at 500MB or 100 files (whichever is hit first).
 * Tracks file access times via a metadata JSON file alongside the audio files.
 * Evicts oldest-accessed files when limits are exceeded.
 *
 * Pure eviction logic is separated from I/O for testability.
 */

import { File, Paths, Directory } from 'expo-file-system';
import { logger } from '@/lib/logger';

// ─── Constants ───────────────────────────────────────────────

/** Maximum total cache size in bytes (500 MB). */
export const MAX_CACHE_SIZE_BYTES = 500 * 1024 * 1024;

/** Maximum number of cached audio files. */
export const MAX_CACHE_FILES = 100;

/** Filename for the metadata index stored alongside audio files. */
const META_FILENAME = 'tts_cache_meta.json';

// ─── Types ───────────────────────────────────────────────────

export interface CacheFileEntry {
  /** Filename (e.g. "tts_abc123.mp3") */
  filename: string;
  /** File size in bytes */
  sizeBytes: number;
  /** Last access timestamp (ms since epoch) — updated on download and play */
  lastAccessedAt: number;
  /** Creation timestamp (ms since epoch) */
  createdAt: number;
}

export interface CacheMetadata {
  /** Schema version for future migrations */
  version: 1;
  /** Map of filename -> entry */
  entries: Record<string, CacheFileEntry>;
}

// ─── Pure logic (testable without filesystem) ────────────────

/**
 * Given current metadata and limits, determine which files to evict.
 * Returns filenames to delete, sorted oldest-accessed first.
 */
export function getFilesToEvict(
  entries: Record<string, CacheFileEntry>,
  maxSizeBytes: number = MAX_CACHE_SIZE_BYTES,
  maxFiles: number = MAX_CACHE_FILES,
): string[] {
  const sorted = Object.values(entries).sort(
    (a, b) => a.lastAccessedAt - b.lastAccessedAt,
  );

  let totalSize = sorted.reduce((sum, e) => sum + e.sizeBytes, 0);
  let totalFiles = sorted.length;

  const toEvict: string[] = [];

  for (const entry of sorted) {
    const overSize = totalSize > maxSizeBytes;
    const overFiles = totalFiles > maxFiles;

    if (!overSize && !overFiles) break;

    toEvict.push(entry.filename);
    totalSize -= entry.sizeBytes;
    totalFiles -= 1;
  }

  return toEvict;
}

/**
 * Compute summary stats from cache metadata.
 */
export function getCacheStats(entries: Record<string, CacheFileEntry>): {
  totalFiles: number;
  totalSizeBytes: number;
  oldestAccessedAt: number | null;
  newestAccessedAt: number | null;
} {
  const values = Object.values(entries);
  if (values.length === 0) {
    return { totalFiles: 0, totalSizeBytes: 0, oldestAccessedAt: null, newestAccessedAt: null };
  }

  let totalSize = 0;
  let oldest = Infinity;
  let newest = 0;

  for (const entry of values) {
    totalSize += entry.sizeBytes;
    if (entry.lastAccessedAt < oldest) oldest = entry.lastAccessedAt;
    if (entry.lastAccessedAt > newest) newest = entry.lastAccessedAt;
  }

  return {
    totalFiles: values.length,
    totalSizeBytes: totalSize,
    oldestAccessedAt: oldest,
    newestAccessedAt: newest,
  };
}

// ─── Metadata I/O ────────────────────────────────────────────

function getMetaFile(): File {
  return new File(Paths.cache, META_FILENAME);
}

/** Load cache metadata from disk. Returns empty metadata if missing or corrupt. */
export function loadMetadata(): CacheMetadata {
  try {
    const metaFile = getMetaFile();
    if (!metaFile.exists) {
      return { version: 1, entries: {} };
    }
    const raw = typeof (metaFile as { textSync?: () => string }).textSync === 'function'
      ? (metaFile as { textSync: () => string }).textSync()
      : ((metaFile as unknown) as { text: () => string }).text();
    const parsed = JSON.parse(raw) as CacheMetadata;
    if (parsed.version !== 1 || typeof parsed.entries !== 'object') {
      logger.warn('[AudioCache] Invalid metadata format — resetting');
      return { version: 1, entries: {} };
    }
    return parsed;
  } catch (e) {
    logger.warn('[AudioCache] Failed to load metadata:', e);
    return { version: 1, entries: {} };
  }
}

/** Persist cache metadata to disk. */
export function saveMetadata(metadata: CacheMetadata): void {
  try {
    const metaFile = getMetaFile();
    metaFile.write(JSON.stringify(metadata));
  } catch (e) {
    logger.warn('[AudioCache] Failed to save metadata:', e);
  }
}

// ─── Public API ──────────────────────────────────────────────

/**
 * Record a file in the cache index after a successful download.
 * Triggers eviction if limits are exceeded.
 */
export function recordCachedFile(filename: string, sizeBytes: number): void {
  const now = Date.now();
  const metadata = loadMetadata();

  metadata.entries[filename] = {
    filename,
    sizeBytes,
    lastAccessedAt: now,
    createdAt: now,
  };

  saveMetadata(metadata);

  // Run eviction asynchronously — don't block the download caller
  runEviction(metadata);
}

/**
 * Update the access time for a cached file (call on play/read).
 */
export function touchCachedFile(filename: string): void {
  const metadata = loadMetadata();
  const entry = metadata.entries[filename];
  if (entry) {
    entry.lastAccessedAt = Date.now();
    saveMetadata(metadata);
  }
}

/**
 * Remove a file from the cache index (call when file is deleted externally).
 */
export function removeCachedFile(filename: string): void {
  const metadata = loadMetadata();
  delete metadata.entries[filename];
  saveMetadata(metadata);
}

/**
 * Evict oldest-accessed files until the cache is within limits.
 */
export function runEviction(metadata?: CacheMetadata): void {
  try {
    const meta = metadata ?? loadMetadata();
    const toEvict = getFilesToEvict(meta.entries);

    if (toEvict.length === 0) return;

    const stats = getCacheStats(meta.entries);
    logger.log(
      `[AudioCache] Evicting ${toEvict.length} files — ` +
      `cache: ${stats.totalFiles} files, ${(stats.totalSizeBytes / (1024 * 1024)).toFixed(1)}MB`,
    );

    for (const filename of toEvict) {
      try {
        const file = new File(Paths.cache, filename);
        if (file.exists) {
          file.delete();
        }
      } catch (e) {
        logger.warn(`[AudioCache] Failed to delete ${filename}:`, e);
      }
      delete meta.entries[filename];
    }

    saveMetadata(meta);

    const afterStats = getCacheStats(meta.entries);
    logger.log(
      `[AudioCache] After eviction: ${afterStats.totalFiles} files, ` +
      `${(afterStats.totalSizeBytes / (1024 * 1024)).toFixed(1)}MB`,
    );
  } catch (e) {
    logger.warn('[AudioCache] Eviction error:', e);
  }
}

/**
 * Rebuild metadata from actual files on disk.
 * Useful for recovery if metadata gets out of sync.
 */
export function rebuildMetadata(): CacheMetadata {
  try {
    const cacheDir = new Directory(Paths.cache);
    if (!cacheDir.exists) {
      return { version: 1, entries: {} };
    }

    const existingMeta = loadMetadata();
    const now = Date.now();
    const entries: Record<string, CacheFileEntry> = {};

    const files = cacheDir.list();
    for (const entry of files) {
      if (
        entry instanceof File &&
        entry.uri.includes('tts_') &&
        (entry.uri.endsWith('.mp3') || entry.uri.endsWith('.wav'))
      ) {
        const filename = entry.uri.split('/').pop() ?? '';
        const size = entry.size ?? 0;

        // Preserve existing metadata if available, otherwise use current time
        const existing = existingMeta.entries[filename];
        entries[filename] = {
          filename,
          sizeBytes: size,
          lastAccessedAt: existing?.lastAccessedAt ?? now,
          createdAt: existing?.createdAt ?? now,
        };
      }
    }

    const metadata: CacheMetadata = { version: 1, entries };
    saveMetadata(metadata);
    return metadata;
  } catch (e) {
    logger.warn('[AudioCache] Failed to rebuild metadata:', e);
    return { version: 1, entries: {} };
  }
}
