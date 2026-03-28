/**
 * Tests for audio-cache LRU eviction logic.
 *
 * Pure functions (getFilesToEvict, getCacheStats) are tested without mocks.
 * I/O functions (recordCachedFile, touchCachedFile, etc.) use mocked expo-file-system.
 */

// ─── Shared mock state ──────────────────────────────────────
// Variables prefixed with "mock" can be referenced in jest.mock factories.

const mockFileInstances: Record<
  string,
  { exists: boolean; size: number; text: string; deleted: boolean; written: string | null }
> = {};

function mockResetFiles() {
  for (const key of Object.keys(mockFileInstances)) {
    delete mockFileInstances[key];
  }
}

// ─── Mocks ───────────────────────────────────────────────────

jest.mock('expo-file-system', () => {
  const MockFileClass = function (this: any, _base: any, name: string) {
    if (!mockFileInstances[name]) {
      mockFileInstances[name] = { exists: false, size: 0, text: '', deleted: false, written: null };
    }
    const instance = mockFileInstances[name];
    this.exists = instance.exists;
    this.size = instance.size;
    this.uri = `file:///cache/${name}`;
    this.text = () => instance.text;
    this.write = (content: string) => {
      instance.written = content;
      instance.text = content;
      instance.exists = true;
    };
    this.delete = () => {
      instance.deleted = true;
      instance.exists = false;
    };
  } as any;

  const MockDirectoryClass = function (this: any) {
    this.exists = true;
    this.list = () => {
      return Object.entries(mockFileInstances)
        .filter(([, v]) => v.exists)
        .map(([name, v]) => {
          const f = new MockFileClass(null, name);
          return f;
        });
    };
  } as any;

  return {
    File: MockFileClass,
    Paths: { cache: '/cache' },
    Directory: MockDirectoryClass,
  };
});

jest.mock('@/lib/logger', () => ({
  logger: { log: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

// ─── Imports ─────────────────────────────────────────────────

import {
  getFilesToEvict,
  getCacheStats,
  loadMetadata,
  saveMetadata,
  recordCachedFile,
  touchCachedFile,
  removeCachedFile,
  runEviction,
  MAX_CACHE_SIZE_BYTES,
  MAX_CACHE_FILES,
  type CacheFileEntry,
} from '../audio-cache';

// ─── Helpers ─────────────────────────────────────────────────

function makeEntry(
  filename: string,
  sizeBytes: number,
  lastAccessedAt: number,
  createdAt?: number,
): CacheFileEntry {
  return {
    filename,
    sizeBytes,
    lastAccessedAt,
    createdAt: createdAt ?? lastAccessedAt,
  };
}

function makeEntries(
  items: Array<{ name: string; size: number; accessed: number }>,
): Record<string, CacheFileEntry> {
  const entries: Record<string, CacheFileEntry> = {};
  for (const item of items) {
    entries[item.name] = makeEntry(item.name, item.size, item.accessed);
  }
  return entries;
}

// ─── Tests: getFilesToEvict (pure logic) ─────────────────────

describe('getFilesToEvict', () => {
  it('returns empty array when cache is within both limits', () => {
    const entries = makeEntries([
      { name: 'tts_a.mp3', size: 1024, accessed: 100 },
      { name: 'tts_b.mp3', size: 2048, accessed: 200 },
    ]);
    expect(getFilesToEvict(entries)).toEqual([]);
  });

  it('returns empty array for empty cache', () => {
    expect(getFilesToEvict({})).toEqual([]);
  });

  it('evicts oldest files when file count exceeds limit', () => {
    const entries: Record<string, CacheFileEntry> = {};
    for (let i = 0; i < 5; i++) {
      const name = `tts_${i}.mp3`;
      entries[name] = makeEntry(name, 1024, i * 1000);
    }
    const result = getFilesToEvict(entries, MAX_CACHE_SIZE_BYTES, 3);
    expect(result).toHaveLength(2);
    expect(result).toEqual(['tts_0.mp3', 'tts_1.mp3']);
  });

  it('evicts oldest files when total size exceeds limit', () => {
    const MB = 1024 * 1024;
    const entries = makeEntries([
      { name: 'tts_old.mp3', size: 200 * MB, accessed: 100 },
      { name: 'tts_mid.mp3', size: 200 * MB, accessed: 200 },
      { name: 'tts_new.mp3', size: 200 * MB, accessed: 300 },
    ]);
    const result = getFilesToEvict(entries, 500 * MB, MAX_CACHE_FILES);
    expect(result).toEqual(['tts_old.mp3']);
  });

  it('evicts multiple files to get under size limit', () => {
    const MB = 1024 * 1024;
    const entries = makeEntries([
      { name: 'tts_1.mp3', size: 200 * MB, accessed: 100 },
      { name: 'tts_2.mp3', size: 200 * MB, accessed: 200 },
      { name: 'tts_3.mp3', size: 200 * MB, accessed: 300 },
      { name: 'tts_4.mp3', size: 200 * MB, accessed: 400 },
    ]);
    const result = getFilesToEvict(entries, 350 * MB, MAX_CACHE_FILES);
    expect(result).toEqual(['tts_1.mp3', 'tts_2.mp3', 'tts_3.mp3']);
  });

  it('respects whichever limit is hit first (files before size)', () => {
    const entries: Record<string, CacheFileEntry> = {};
    for (let i = 0; i < 10; i++) {
      const name = `tts_${i}.mp3`;
      entries[name] = makeEntry(name, 100, i * 1000);
    }
    const result = getFilesToEvict(entries, MAX_CACHE_SIZE_BYTES, 5);
    expect(result).toHaveLength(5);
    expect(result).toEqual([
      'tts_0.mp3', 'tts_1.mp3', 'tts_2.mp3', 'tts_3.mp3', 'tts_4.mp3',
    ]);
  });

  it('respects whichever limit is hit first (size before files)', () => {
    const MB = 1024 * 1024;
    const entries = makeEntries([
      { name: 'tts_a.mp3', size: 300 * MB, accessed: 100 },
      { name: 'tts_b.mp3', size: 300 * MB, accessed: 200 },
    ]);
    const result = getFilesToEvict(entries, 500 * MB, MAX_CACHE_FILES);
    expect(result).toEqual(['tts_a.mp3']);
  });

  it('evicts in LRU order (least recently accessed first)', () => {
    const entries = makeEntries([
      { name: 'tts_recent.mp3', size: 1024, accessed: 5000 },
      { name: 'tts_oldest.mp3', size: 1024, accessed: 1000 },
      { name: 'tts_middle.mp3', size: 1024, accessed: 3000 },
    ]);
    const result = getFilesToEvict(entries, MAX_CACHE_SIZE_BYTES, 1);
    expect(result).toEqual(['tts_oldest.mp3', 'tts_middle.mp3']);
  });

  it('handles entries with identical access times', () => {
    const entries = makeEntries([
      { name: 'tts_a.mp3', size: 1024, accessed: 1000 },
      { name: 'tts_b.mp3', size: 1024, accessed: 1000 },
      { name: 'tts_c.mp3', size: 1024, accessed: 2000 },
    ]);
    const result = getFilesToEvict(entries, MAX_CACHE_SIZE_BYTES, 1);
    expect(result).toHaveLength(2);
    expect(result).toContain('tts_a.mp3');
    expect(result).toContain('tts_b.mp3');
  });

  it('uses default limits (500MB / 100 files)', () => {
    const entries: Record<string, CacheFileEntry> = {};
    for (let i = 0; i < 101; i++) {
      const name = `tts_${String(i).padStart(3, '0')}.mp3`;
      entries[name] = makeEntry(name, 1024, i * 1000);
    }
    const result = getFilesToEvict(entries);
    expect(result).toHaveLength(1);
    expect(result[0]).toBe('tts_000.mp3');
  });
});

// ─── Tests: getCacheStats (pure logic) ───────────────────────

describe('getCacheStats', () => {
  it('returns zeros for empty entries', () => {
    const stats = getCacheStats({});
    expect(stats).toEqual({
      totalFiles: 0,
      totalSizeBytes: 0,
      oldestAccessedAt: null,
      newestAccessedAt: null,
    });
  });

  it('computes correct stats for multiple entries', () => {
    const entries = makeEntries([
      { name: 'tts_a.mp3', size: 1000, accessed: 100 },
      { name: 'tts_b.mp3', size: 2000, accessed: 300 },
      { name: 'tts_c.mp3', size: 3000, accessed: 200 },
    ]);
    const stats = getCacheStats(entries);
    expect(stats.totalFiles).toBe(3);
    expect(stats.totalSizeBytes).toBe(6000);
    expect(stats.oldestAccessedAt).toBe(100);
    expect(stats.newestAccessedAt).toBe(300);
  });

  it('handles single entry', () => {
    const entries = makeEntries([
      { name: 'tts_solo.mp3', size: 5000, accessed: 999 },
    ]);
    const stats = getCacheStats(entries);
    expect(stats.totalFiles).toBe(1);
    expect(stats.totalSizeBytes).toBe(5000);
    expect(stats.oldestAccessedAt).toBe(999);
    expect(stats.newestAccessedAt).toBe(999);
  });
});

// ─── Tests: I/O functions (with mocked filesystem) ───────────

describe('loadMetadata', () => {
  beforeEach(() => {
    mockResetFiles();
  });

  it('returns empty metadata when file does not exist', () => {
    // getMetaFile() will auto-create mockFileInstances entry with exists: false
    const meta = loadMetadata();
    expect(meta).toEqual({ version: 1, entries: {} });
  });

  it('returns empty metadata when file contains invalid JSON', () => {
    mockFileInstances['tts_cache_meta.json'] = {
      exists: true, size: 10, text: 'not json', deleted: false, written: null,
    };
    const meta = loadMetadata();
    expect(meta).toEqual({ version: 1, entries: {} });
  });

  it('returns empty metadata when version is wrong', () => {
    mockFileInstances['tts_cache_meta.json'] = {
      exists: true,
      size: 50,
      text: JSON.stringify({ version: 99, entries: {} }),
      deleted: false,
      written: null,
    };
    const meta = loadMetadata();
    expect(meta).toEqual({ version: 1, entries: {} });
  });

  it('loads valid metadata', () => {
    const validMeta = {
      version: 1,
      entries: {
        'tts_test.mp3': makeEntry('tts_test.mp3', 5000, 12345),
      },
    };
    mockFileInstances['tts_cache_meta.json'] = {
      exists: true,
      size: 100,
      text: JSON.stringify(validMeta),
      deleted: false,
      written: null,
    };
    const meta = loadMetadata();
    expect(meta.entries['tts_test.mp3'].sizeBytes).toBe(5000);
  });
});

describe('saveMetadata', () => {
  beforeEach(() => {
    mockResetFiles();
  });

  it('writes metadata JSON to disk', () => {
    const meta = { version: 1 as const, entries: { 'tts_x.mp3': makeEntry('tts_x.mp3', 999, 111) } };
    saveMetadata(meta);

    const written = mockFileInstances['tts_cache_meta.json']?.written;
    expect(written).not.toBeNull();
    const parsed = JSON.parse(written!);
    expect(parsed.version).toBe(1);
    expect(parsed.entries['tts_x.mp3'].sizeBytes).toBe(999);
  });
});

describe('recordCachedFile', () => {
  beforeEach(() => {
    mockResetFiles();
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-03-28T12:00:00Z'));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('creates metadata entry and persists to disk', () => {
    recordCachedFile('tts_newfile.mp3', 50000);

    const metaFile = mockFileInstances['tts_cache_meta.json'];
    expect(metaFile).toBeDefined();
    expect(metaFile.written).not.toBeNull();

    const parsed = JSON.parse(metaFile.written!);
    expect(parsed.version).toBe(1);
    expect(parsed.entries['tts_newfile.mp3']).toBeDefined();
    expect(parsed.entries['tts_newfile.mp3'].sizeBytes).toBe(50000);
    expect(parsed.entries['tts_newfile.mp3'].lastAccessedAt).toBe(Date.now());
  });
});

describe('touchCachedFile', () => {
  beforeEach(() => {
    mockResetFiles();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('updates lastAccessedAt for existing entry', () => {
    const initialTime = new Date('2026-03-28T10:00:00Z').getTime();
    const laterTime = new Date('2026-03-28T14:00:00Z').getTime();

    const existingMeta = {
      version: 1,
      entries: {
        'tts_existing.mp3': {
          filename: 'tts_existing.mp3',
          sizeBytes: 10000,
          lastAccessedAt: initialTime,
          createdAt: initialTime,
        },
      },
    };

    mockFileInstances['tts_cache_meta.json'] = {
      exists: true,
      size: 100,
      text: JSON.stringify(existingMeta),
      deleted: false,
      written: null,
    };

    jest.setSystemTime(new Date(laterTime));
    touchCachedFile('tts_existing.mp3');

    const metaFile = mockFileInstances['tts_cache_meta.json'];
    expect(metaFile.written).not.toBeNull();
    const parsed = JSON.parse(metaFile.written!);
    expect(parsed.entries['tts_existing.mp3'].lastAccessedAt).toBe(laterTime);
    expect(parsed.entries['tts_existing.mp3'].createdAt).toBe(initialTime);
  });

  it('does nothing for non-existent entry', () => {
    const existingMeta = { version: 1, entries: {} };
    mockFileInstances['tts_cache_meta.json'] = {
      exists: true,
      size: 100,
      text: JSON.stringify(existingMeta),
      deleted: false,
      written: null,
    };

    touchCachedFile('tts_nonexistent.mp3');
    expect(mockFileInstances['tts_cache_meta.json'].written).toBeNull();
  });
});

describe('removeCachedFile', () => {
  beforeEach(() => {
    mockResetFiles();
  });

  it('removes entry from metadata', () => {
    const existingMeta = {
      version: 1,
      entries: {
        'tts_a.mp3': makeEntry('tts_a.mp3', 1000, 100),
        'tts_b.mp3': makeEntry('tts_b.mp3', 2000, 200),
      },
    };

    mockFileInstances['tts_cache_meta.json'] = {
      exists: true,
      size: 100,
      text: JSON.stringify(existingMeta),
      deleted: false,
      written: null,
    };

    removeCachedFile('tts_a.mp3');

    const parsed = JSON.parse(mockFileInstances['tts_cache_meta.json'].written!);
    expect(parsed.entries['tts_a.mp3']).toBeUndefined();
    expect(parsed.entries['tts_b.mp3']).toBeDefined();
  });
});

describe('runEviction', () => {
  beforeEach(() => {
    mockResetFiles();
  });

  it('deletes files on disk and removes from metadata when over file limit', () => {
    const entries: Record<string, CacheFileEntry> = {};
    for (let i = 0; i < 5; i++) {
      const name = `tts_${i}.mp3`;
      entries[name] = makeEntry(name, 1024, i * 1000);
      mockFileInstances[name] = { exists: true, size: 1024, text: '', deleted: false, written: null };
    }

    mockFileInstances['tts_cache_meta.json'] = {
      exists: true,
      size: 100,
      text: JSON.stringify({ version: 1, entries }),
      deleted: false,
      written: null,
    };

    // Default limits: 100 files / 500MB — these 5 files are well within limits.
    // We need to pass metadata that triggers eviction. Since runEviction uses
    // getFilesToEvict with default limits, we need 101+ files or 500MB+ size.
    // Instead, let's test via recordCachedFile which calls runEviction internally.
    // For a direct runEviction test, we'll create entries that exceed limits.

    const bigEntries: Record<string, CacheFileEntry> = {};
    const MB = 1024 * 1024;
    for (let i = 0; i < 5; i++) {
      const name = `tts_${i}.mp3`;
      bigEntries[name] = makeEntry(name, 150 * MB, i * 1000);
      mockFileInstances[name] = { exists: true, size: 150 * MB, text: '', deleted: false, written: null };
    }

    // Total: 750MB, limit 500MB — should evict 2 oldest (300MB) to get to 450MB
    const meta = { version: 1 as const, entries: bigEntries };
    runEviction(meta);

    expect(mockFileInstances['tts_0.mp3'].deleted).toBe(true);
    expect(mockFileInstances['tts_1.mp3'].deleted).toBe(true);
    expect(mockFileInstances['tts_2.mp3'].deleted).toBe(false);
    expect(mockFileInstances['tts_3.mp3'].deleted).toBe(false);
    expect(mockFileInstances['tts_4.mp3'].deleted).toBe(false);

    // Metadata should be updated
    const saved = JSON.parse(mockFileInstances['tts_cache_meta.json'].written!);
    expect(Object.keys(saved.entries)).toHaveLength(3);
    expect(saved.entries['tts_0.mp3']).toBeUndefined();
    expect(saved.entries['tts_1.mp3']).toBeUndefined();
  });

  it('does nothing when cache is within limits', () => {
    const entries = makeEntries([
      { name: 'tts_a.mp3', size: 1024, accessed: 100 },
    ]);

    mockFileInstances['tts_cache_meta.json'] = {
      exists: true,
      size: 100,
      text: JSON.stringify({ version: 1, entries }),
      deleted: false,
      written: null,
    };

    runEviction({ version: 1, entries });

    // No files should be deleted, no metadata rewritten (since no eviction needed)
    // Actually, runEviction returns early if toEvict is empty, so no saveMetadata call
    expect(mockFileInstances['tts_a.mp3']).toBeUndefined(); // never created in mockFileInstances
  });
});
