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

const verse = (number: number) => ({ id: number, bookId: 19, chapter: 23, verse: number, text: `Database verse ${number}`, translation: 'KJV' });

beforeEach(() => {
  jest.clearAllMocks();
  (getBibleDbStatus as jest.Mock).mockReturnValue({ status: 'ready' });
});

it('loads every verse for a chapter reference in the requested translation', async () => {
  (getChapter as jest.Mock).mockResolvedValue([verse(1), verse(2), verse(3)]);
  const result = await fetchVerseLocal('Psalm 23', 'KJV');
  expect(getChapter).toHaveBeenCalledWith(19, 23, 'KJV');
  expect(getVerseByReference).not.toHaveBeenCalled();
  expect(result?.passage?.verses.map((v) => v.verse)).toEqual([1, 2, 3]);
  expect(result?.translation).toBe('KJV');
  expect(result?.text).toContain('Database verse 3');
});

it('keeps a verse range restricted to its requested verses', async () => {
  (getVerseByReference as jest.Mock).mockResolvedValue([verse(2), verse(3)]);
  const result = await fetchVerseLocal('Psalm 23:2-3', 'KJV');
  expect(getVerseByReference).toHaveBeenCalledWith(19, 23, 2, 3, 'KJV');
  expect(getChapter).not.toHaveBeenCalled();
  expect(result?.passage?.verses).toHaveLength(2);
});

it('does not label a partial database result as the complete requested range', async () => {
  (getVerseByReference as jest.Mock).mockResolvedValue([verse(2)]);
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
  (getVerseByReference as jest.Mock).mockResolvedValue([verse(2), verse(4)]);
  expect(await fetchVerseLocal('Psalm 23:2-4')).toBeNull();
});
it('rejects a chapter with an interior gap', async () => {
  (getChapter as jest.Mock).mockResolvedValue([verse(1), verse(3)]);
  expect(await fetchVerseLocal('Psalm 23')).toBeNull();
});
