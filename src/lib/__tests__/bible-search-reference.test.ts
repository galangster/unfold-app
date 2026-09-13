const mockGetAllAsync = jest.fn();
const mockExecAsync = jest.fn();
const mockOpenDatabaseAsync = jest.fn();

jest.mock('expo-file-system/legacy', () => ({
  documentDirectory: 'file:///documents/',
  getInfoAsync: jest.fn(async () => ({ exists: true, size: 25 * 1024 * 1024 })),
  makeDirectoryAsync: jest.fn(),
  deleteAsync: jest.fn(),
  createDownloadResumable: jest.fn(),
}));

jest.mock('expo-sqlite', () => ({
  get openDatabaseAsync() { return mockOpenDatabaseAsync; },
}));

jest.mock('react-native-mmkv', () => ({
  MMKV: jest.fn(() => ({
    getString: (key: string) => key === 'bible_db_status' ? 'ready' : undefined,
    set: jest.fn(),
    delete: jest.fn(),
  })),
}));

jest.mock('@/lib/logger', () => ({ logger: { log: jest.fn(), warn: jest.fn(), error: jest.fn() } }));
jest.mock('@/lib/api-config', () => ({ PRIMARY_BACKEND_URL: 'https://api.unfoldapp.co', getAuthHeaders: jest.fn() }));

import { searchBible } from '../bible-db';
import { referenceToRoute } from '../bible-constants';

const john316 = {
  id: 4300316,
  book_id: 43,
  chapter: 3,
  verse: 16,
  text: 'For God so loved the world.',
  translation: 'BSB',
};

beforeAll(() => {
  mockOpenDatabaseAsync.mockResolvedValue({
    execAsync: mockExecAsync,
    getAllAsync: mockGetAllAsync,
  });
});

beforeEach(() => {
  jest.clearAllMocks();
  mockGetAllAsync.mockImplementation(async (sql: string, params: (string | number)[]) => {
    if (!sql.includes('WHERE book_id = ?')) return [];
    return [{
      ...john316,
      book_id: params[0],
      chapter: params[1],
      verse: typeof params[2] === 'number' ? params[2] : 1,
    }];
  });
});

it('resolves the reported lowercase Micah reference', async () => {
  await expect(searchBible('micah 6:8', 'BSB')).resolves.toEqual([
    expect.objectContaining({ bookId: 33, chapter: 6, verse: 8 }),
  ]);
  expect(mockGetAllAsync).toHaveBeenCalledWith(
    expect.stringContaining('WHERE book_id = ?'),
    [33, 6, 8, 8, 'BSB'],
  );
});

it('resolves an exact reference through searchBible instead of FTS', async () => {
  await expect(searchBible('John 3:16', 'BSB')).resolves.toEqual([
    expect.objectContaining({ bookId: 43, chapter: 3, verse: 16, snippet: john316.text }),
  ]);
  expect(mockGetAllAsync).toHaveBeenCalledWith(
    expect.stringContaining('WHERE book_id = ?'),
    [43, 3, 16, 16, 'BSB'],
  );
});

it.each([
  ['john3:16', { bookId: 43, chapter: 3, verse: 16 }],
  ['Jn 3:16', { bookId: 43, chapter: 3, verse: 16 }],
  ['1Cor 13', { bookId: 46, chapter: 13 }],
  ['1 John 4:7-8', { bookId: 62, chapter: 4, verse: 7, verseEnd: 8 }],
  ['John 3:16–18', { bookId: 43, chapter: 3, verse: 16, verseEnd: 18 }],
  ['Jude 5', { bookId: 65, chapter: 1, verse: 5 }],
  ['Jude 1', { bookId: 65, chapter: 1 }],
  ['Jude 1-3', { bookId: 65, chapter: 1, verse: 1, verseEnd: 3 }],
])('parses reference search %s', (query, expected) => {
  expect(referenceToRoute(query)).toEqual(expected);
});

it('returns a complete long chapter without applying the text-search limit', async () => {
  const rows = Array.from({ length: 176 }, (_, index) => ({
    ...john316,
    id: index + 1,
    book_id: 19,
    chapter: 119,
    verse: index + 1,
  }));
  mockGetAllAsync.mockResolvedValueOnce(rows);
  const result = await searchBible('Psalm 119', 'BSB', 50);
  expect(result).toHaveLength(176);
  expect(result.at(-1)?.verse).toBe(176);
});

it.each(['John', 'Jn'])('shows the complete first chapter for book lookup %s', async (query) => {
  mockGetAllAsync.mockResolvedValueOnce(Array.from({ length: 51 }, (_, index) => ({
    ...john316, id: index + 1, chapter: 1, verse: index + 1,
  })));
  const result = await searchBible(query, 'BSB', 5);
  expect(result).toHaveLength(51);
  expect(result.at(-1)).toMatchObject({ bookId: 43, chapter: 1, verse: 51 });
  expect(mockGetAllAsync).toHaveBeenCalledWith(expect.not.stringContaining('LIMIT'), [43, 1, 'BSB']);
});

it.each(['steadfast-love', 'steadfast–love', 'steadfast—love'])(
  'searches words separated by punctuation: %s', async (query) => {
    mockGetAllAsync.mockResolvedValueOnce([{ ...john316, snippet: john316.text }]);
    expect(await searchBible(query, 'BSB')).toHaveLength(1);
    expect(mockGetAllAsync).toHaveBeenCalledWith(expect.stringContaining('verses_fts MATCH ?'), ['steadfast love', 'BSB', 50]);
  },
);

it('rejects invalid references before querying FTS', async () => {
  await expect(searchBible('John 99:1', 'BSB')).resolves.toEqual([]);
  expect(mockGetAllAsync).not.toHaveBeenCalled();
});

it.each(['micah 6:', 'Micah 6:8-', 'John 0:1', 'John 3:999', 'John 3:18-16'])(
  'does not treat an unfinished or invalid reference as keywords: %s', async (query) => {
    await expect(searchBible(query, 'BSB')).resolves.toEqual([]);
    expect(mockGetAllAsync.mock.calls.every(([sql]) => !sql.includes('verses_fts'))).toBe(true);
  },
);
