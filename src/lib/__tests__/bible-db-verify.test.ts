/**
 * Tests for FIX-5:
 * 1. Auto-detect branch calls verifyDownloadedDb before marking ready (DAT-5)
 * 2. Corrupt partial file is deleted and status reset (DAT-5)
 * 3. computeDownloadProgress clamps missing Content-Length (NET-14)
 */

const mockGetInfoAsync = jest.fn();
const mockMakeDirectoryAsync = jest.fn();
const mockDeleteAsync = jest.fn();
const mockDownloadAsync = jest.fn();
const mockCreateDownloadResumable = jest.fn();
const mockGetAuthHeaders = jest.fn();
const mockGetFirstAsync = jest.fn();
const mockCloseAsync = jest.fn();
const mockOpenDatabaseAsync = jest.fn();
const mockLogger = {
  warn: jest.fn(),
  log: jest.fn(),
  error: jest.fn(),
};

// MMKV store — shared across all instances (module-scope Map via closure)
// We need to inject state before the module reads it.
const bibleMetaStore = new Map<string, string>();

// eslint-disable-next-line jest/no-mocks-without-expect
jest.mock('expo-file-system/legacy', () => ({
  documentDirectory: 'file:///documents/',
  get getInfoAsync() { return mockGetInfoAsync; },
  get makeDirectoryAsync() { return mockMakeDirectoryAsync; },
  get deleteAsync() { return mockDeleteAsync; },
  get createDownloadResumable() { return mockCreateDownloadResumable; },
}));

jest.mock('expo-sqlite', () => ({
  get openDatabaseAsync() { return mockOpenDatabaseAsync; },
}));

jest.mock('react-native-mmkv', () => {
  // Single shared map so bible-db.ts's bibleMetaStore can be seeded externally
  // via the module-level bibleMetaStore variable. We close over it.
  const maps: Map<string, Map<string, string>> = new Map();
  let instanceIdx = 0;
  return {
    MMKV: jest.fn().mockImplementation((opts?: { id?: string }) => {
      const id = opts?.id ?? `anon-${instanceIdx++}`;
      if (!maps.has(id)) maps.set(id, new Map());
      const store = maps.get(id)!;
      return {
        getString: (key: string) => store.get(key),
        set: (key: string, value: string) => store.set(key, value),
        delete: (key: string) => store.delete(key),
        clearAll: () => store.clear(),
      };
    }),
    // Expose for test seeding
    __setKey: (id: string, key: string, value: string) => {
      if (!maps.has(id)) maps.set(id, new Map());
      maps.get(id)!.set(key, value);
    },
    __getKey: (id: string, key: string) => maps.get(id)?.get(key),
    __clearAll: () => maps.forEach((m) => m.clear()),
  };
});

jest.mock('@/lib/logger', () => ({ logger: mockLogger }));

jest.mock('@/lib/api-config', () => ({
  PRIMARY_BACKEND_URL: 'https://api.unfoldapp.co',
  get getAuthHeaders() { return mockGetAuthHeaders; },
}));

function setDbStatus(status: string) {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { __setKey } = require('react-native-mmkv');
  __setKey('unfold-bible-meta', 'bible_db_status', status);
}

function getDbStatus(): string | undefined {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { __getKey } = require('react-native-mmkv');
  return __getKey('unfold-bible-meta', 'bible_db_status');
}

describe('verifyBibleDb auto-detect (DAT-5)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    require('react-native-mmkv').__clearAll();
    mockDeleteAsync.mockResolvedValue(undefined);
    mockMakeDirectoryAsync.mockResolvedValue(undefined);
    mockGetAuthHeaders.mockResolvedValue({ 'X-Device-ID': 'test' });
    mockCreateDownloadResumable.mockReturnValue({ downloadAsync: mockDownloadAsync });
    mockDownloadAsync.mockResolvedValue({ status: 200 });
  });

  it('auto-detect verifies schema before marking ready', async () => {
    // Status is 'downloading' — triggers auto-detect branch
    setDbStatus('downloading');

    // File exists and is big enough
    mockGetInfoAsync.mockImplementation(async (path: string) => {
      if (typeof path === 'string' && path.includes('SQLite/') && !path.endsWith('.db')) {
        return { exists: true, isDirectory: true };
      }
      return { exists: true, size: 6 * 1024 * 1024, isDirectory: false };
    });

    // DB opens and passes verification
    mockGetFirstAsync
      .mockResolvedValueOnce({ count: 66 })
      .mockResolvedValueOnce({ count: 50001 });
    mockCloseAsync.mockResolvedValue(undefined);
    mockOpenDatabaseAsync.mockResolvedValue({
      getFirstAsync: mockGetFirstAsync,
      closeAsync: mockCloseAsync,
    });

    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { verifyBibleDb } = require('@/lib/bible-db');
    const result = await verifyBibleDb();

    expect(result).toBe('ready');
    // openDatabaseAsync MUST have been called — verifyDownloadedDb ran
    expect(mockOpenDatabaseAsync).toHaveBeenCalled();
  });

  it('corrupt partial file is deleted and status reset to not_downloaded', async () => {
    setDbStatus('downloading');

    // File exists and is big enough
    mockGetInfoAsync.mockImplementation(async (path: string) => {
      if (typeof path === 'string' && path.includes('SQLite/') && !path.endsWith('.db')) {
        return { exists: true, isDirectory: true };
      }
      return { exists: true, size: 6 * 1024 * 1024, isDirectory: false };
    });

    // DB open fails — truncated/corrupt file
    mockOpenDatabaseAsync.mockRejectedValue(new Error('corrupt database file'));

    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { verifyBibleDb } = require('@/lib/bible-db');
    const result = await verifyBibleDb();

    expect(result).toBe('not_downloaded');
    expect(mockDeleteAsync).toHaveBeenCalledWith(
      expect.stringContaining('unfold-bible-v1.db'),
      expect.objectContaining({ idempotent: true }),
    );
    expect(getDbStatus()).toBe('not_downloaded');
  });
});

describe('computeDownloadProgress (NET-14)', () => {
  it('returns -1 when totalBytesExpectedToWrite is -1 (no Content-Length)', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { computeDownloadProgress } = require('@/lib/bible-db');
    expect(computeDownloadProgress(500, -1)).toBe(-1);
  });

  it('returns -1 when totalBytesExpectedToWrite is 0', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { computeDownloadProgress } = require('@/lib/bible-db');
    expect(computeDownloadProgress(500, 0)).toBe(-1);
  });

  it('returns fractional progress', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { computeDownloadProgress } = require('@/lib/bible-db');
    expect(computeDownloadProgress(5, 10)).toBe(0.5);
  });

  it('clamps progress to 1', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { computeDownloadProgress } = require('@/lib/bible-db');
    expect(computeDownloadProgress(15, 10)).toBe(1);
  });
});
