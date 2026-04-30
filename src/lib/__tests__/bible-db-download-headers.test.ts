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

jest.mock('expo-file-system/legacy', () => ({
  documentDirectory: 'file:///documents/',
  getInfoAsync: mockGetInfoAsync,
  makeDirectoryAsync: mockMakeDirectoryAsync,
  deleteAsync: mockDeleteAsync,
  createDownloadResumable: mockCreateDownloadResumable,
}));

jest.mock('expo-sqlite', () => ({
  openDatabaseAsync: mockOpenDatabaseAsync,
}));

jest.mock('react-native-mmkv', () => ({
  MMKV: jest.fn().mockImplementation(() => {
    const store = new Map<string, string>();
    return {
      getString: jest.fn((key: string) => store.get(key)),
      set: jest.fn((key: string, value: string) => store.set(key, value)),
      delete: jest.fn((key: string) => store.delete(key)),
    };
  }),
}));

jest.mock('@/lib/logger', () => ({ logger: mockLogger }));

jest.mock('@/lib/api-config', () => ({
  PRIMARY_BACKEND_URL: 'https://api.unfoldapp.co',
  getAuthHeaders: mockGetAuthHeaders,
}));

describe('downloadBibleDb', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    mockGetAuthHeaders.mockResolvedValue({
      'Content-Type': 'application/json',
      'User-Agent': 'Unfold/1.0.0 (ios; 18.5)',
      'X-Device-ID': 'test-device',
    });

    mockGetInfoAsync.mockImplementation(async (path: string) => {
      if (path === 'file:///documents/SQLite/') {
        return { exists: true, isDirectory: true };
      }

      return { exists: true, size: 25 * 1024 * 1024, isDirectory: false };
    });

    mockCreateDownloadResumable.mockReturnValue({
      downloadAsync: mockDownloadAsync,
    });
    mockDownloadAsync.mockResolvedValue({ status: 200 });

    mockGetFirstAsync
      .mockResolvedValueOnce({ count: 66 })
      .mockResolvedValueOnce({ count: 60000 });
    mockCloseAsync.mockResolvedValue(undefined);
    mockOpenDatabaseAsync.mockResolvedValue({
      getFirstAsync: mockGetFirstAsync,
      closeAsync: mockCloseAsync,
    });
  });

  it('passes app headers to the Bible DB binary download without a JSON content type', async () => {
    const { downloadBibleDb } = require('@/lib/bible-db');
    await expect(downloadBibleDb()).resolves.toBe(true);

    expect(mockCreateDownloadResumable).toHaveBeenCalledWith(
      'https://api.unfoldapp.co/public/unfold-bible-v1.db',
      'file:///documents/SQLite/unfold-bible-v1.db',
      {
        headers: {
          'User-Agent': 'Unfold/1.0.0 (ios; 18.5)',
          'X-Device-ID': 'test-device',
        },
      },
      expect.any(Function),
    );
  });
});
