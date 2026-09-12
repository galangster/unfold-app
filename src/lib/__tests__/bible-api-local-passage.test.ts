jest.mock('@/lib/bible-db', () => ({
  getBibleDbStatus: jest.fn(() => ({ status: 'ready' })),
  getChapter: jest.fn(),
  getVerseByReference: jest.fn(),
}));
jest.mock('@/lib/api-config', () => ({ PRIMARY_BACKEND_URL: 'http://localhost', sanitizeForPrompt: (s: string) => s }));
jest.mock('@/lib/device-credential', () => ({ authenticatedFetch: jest.fn() }));
jest.mock('@/lib/external-fetch', () => ({ externalFetch: jest.fn() }));
jest.mock('@/lib/rate-limit', () => ({ checkRateLimit: jest.fn(), incrementRateLimit: jest.fn() }));
jest.mock('@/lib/mmkv-storage', () => ({ getSharedEncryptionKey: () => 'test-key' }));

import { fetchVerseLocal } from '../bible-api';
import { getBibleDbStatus, getChapter, getVerseByReference } from '../bible-db';
import { externalFetch } from '../external-fetch';

function verse(
  number: number,
  extras: { bookId?: number; chapter?: number; translation?: string } = {},
) {
  return {
    id: number,
    bookId: extras.bookId ?? 19,
    chapter: extras.chapter ?? 23,
    verse: number,
    text: `Database verse ${number}`,
    translation: extras.translation ?? 'KJV',
  };
}

const psalm23 = (...numbers: number[]) => numbers.map((n) => verse(n));
const matthew17 = (translation: 'BSB' | 'KJV', ...numbers: number[]) =>
  numbers.map((n) => verse(n, { bookId: 40, chapter: 17, translation }));

beforeEach(() => {
  jest.clearAllMocks();
  (getBibleDbStatus as jest.Mock).mockReturnValue({ status: 'ready' });
});

it('loads every verse for a chapter reference in the requested translation', async () => {
  (getChapter as jest.Mock).mockResolvedValue(psalm23(1, 2, 3, 4, 5, 6));
  const result = await fetchVerseLocal('Psalm 23', 'KJV');
  expect(getChapter).toHaveBeenCalledWith(19, 23, 'KJV');
  expect(getChapter).toHaveBeenCalledTimes(1);
  expect(getVerseByReference).not.toHaveBeenCalled();
  expect(result?.passage?.verses.map((v) => v.verse)).toEqual([1, 2, 3, 4, 5, 6]);
  expect(result?.translation).toBe('KJV');
  expect(result?.text).toContain('Database verse 6');
});

it('keeps a verse range restricted to its requested verses', async () => {
  (getVerseByReference as jest.Mock).mockResolvedValue(psalm23(2, 3));
  const result = await fetchVerseLocal('Psalm 23:2-3', 'KJV');
  expect(getVerseByReference).toHaveBeenCalledWith(19, 23, 2, 3, 'KJV');
  expect(getChapter).not.toHaveBeenCalled();
  expect(result?.passage?.verses).toHaveLength(2);
});

it('does not label a partial database result as the complete requested range', async () => {
  (getVerseByReference as jest.Mock).mockResolvedValue(psalm23(2));
  expect(await fetchVerseLocal('Psalm 23:2-3')).toBeNull();
});

it('returns unavailable without a network or model fallback', async () => {
  (getBibleDbStatus as jest.Mock).mockReturnValue({ status: 'missing' });
  expect(await fetchVerseLocal('Psalm 23')).toBeNull();
  expect(getChapter).not.toHaveBeenCalled();
  expect(externalFetch).not.toHaveBeenCalled();
});

it('rejects a nonexistent chapter before querying the database', async () => {
  expect(await fetchVerseLocal('Psalm 151')).toBeNull();
  expect(getChapter).not.toHaveBeenCalled();
  expect(getVerseByReference).not.toHaveBeenCalled();
});

it('rejects a range with a missing interior verse', async () => {
  (getVerseByReference as jest.Mock).mockResolvedValue(psalm23(2, 4));
  expect(await fetchVerseLocal('Psalm 23:2-4')).toBeNull();
});

it('rejects a chapter with an interior gap', async () => {
  (getChapter as jest.Mock).mockResolvedValue(psalm23(1, 3));
  expect(await fetchVerseLocal('Psalm 23')).toBeNull();
});

it('rejects a chapter that is missing its final verse', async () => {
  (getChapter as jest.Mock).mockResolvedValue(psalm23(1, 2, 3, 4, 5));
  expect(await fetchVerseLocal('Psalm 23', 'KJV')).toBeNull();
  expect(getChapter).toHaveBeenCalledTimes(1);
});

it('accepts a BSB range that skips a translation omission', async () => {
  (getVerseByReference as jest.Mock).mockResolvedValue(matthew17('BSB', 20, 22));
  const result = await fetchVerseLocal('Matthew 17:20-22', 'BSB');
  expect(getVerseByReference).toHaveBeenCalledWith(40, 17, 20, 22, 'BSB');
  expect(getVerseByReference).toHaveBeenCalledTimes(1);
  expect(getChapter).not.toHaveBeenCalled();
  expect(result?.passage?.verses.map((v) => v.verse)).toEqual([20, 22]);
});

it('returns unavailable for an omitted BSB verse alone', async () => {
  expect(await fetchVerseLocal('Matthew 17:21', 'BSB')).toBeNull();
  expect(getVerseByReference).not.toHaveBeenCalled();
  expect(getChapter).not.toHaveBeenCalled();
  expect(externalFetch).not.toHaveBeenCalled();
});

it('keeps KJV verse 21 available in the same chapter', async () => {
  (getVerseByReference as jest.Mock).mockResolvedValue(matthew17('KJV', 21));
  const result = await fetchVerseLocal('Matthew 17:21', 'KJV');
  expect(getVerseByReference).toHaveBeenCalledWith(40, 17, 21, undefined, 'KJV');
  expect(result?.passage?.verses.map((v) => v.verse)).toEqual([21]);
});

it('rejects a KJV range that is missing verse 21', async () => {
  (getVerseByReference as jest.Mock).mockResolvedValue(matthew17('KJV', 20, 22));
  expect(await fetchVerseLocal('Matthew 17:20-22', 'KJV')).toBeNull();
});

it('rejects an out-of-range verse before querying the database', async () => {
  expect(await fetchVerseLocal('Psalm 23:7', 'KJV')).toBeNull();
  expect(getChapter).not.toHaveBeenCalled();
  expect(getVerseByReference).not.toHaveBeenCalled();
});

it('rejects an out-of-range span before querying the database', async () => {
  expect(await fetchVerseLocal('Matthew 17:20-28', 'BSB')).toBeNull();
  expect(getVerseByReference).not.toHaveBeenCalled();
});

it('loads a BSB chapter that omits a numbered verse', async () => {
  const numbers = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 22, 23, 24, 25, 26, 27];
  (getChapter as jest.Mock).mockResolvedValue(matthew17('BSB', ...numbers));
  const result = await fetchVerseLocal('Matthew 17', 'BSB');
  expect(getChapter).toHaveBeenCalledTimes(1);
  expect(result?.passage?.verses.map((v) => v.verse)).toEqual(numbers);
});
