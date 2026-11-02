import { fetchChapter } from '@/hooks/useBibleChapter';
import { getBibleDbStatus, getChapter, type BibleDbStatus } from '@/lib/bible-db';

jest.mock('@/lib/bible-db', () => ({
  getBibleDbStatus: jest.fn(),
  getChapter: jest.fn(),
  openBibleDb: jest.fn(),
}));
jest.mock('@/hooks/useBibleDb', () => ({ useBibleDb: () => ({ isReady: true }) }));

function storedStatus(status: BibleDbStatus) {
  jest.mocked(getBibleDbStatus).mockReturnValue({
    status,
    downloadedAt: null,
    version: null,
    sizeBytes: null,
    errorMessage: null,
  });
}

describe('fetchChapter', () => {
  it('fails an empty read when the database is missing, so nothing blank is cached', async () => {
    jest.mocked(getChapter).mockResolvedValue([]);
    storedStatus('not_downloaded');

    await expect(fetchChapter(1, 1, 'BSB')).rejects.toThrow('Bible database is not ready');
  });

  it('returns an empty read from a ready database', async () => {
    jest.mocked(getChapter).mockResolvedValue([]);
    storedStatus('ready');

    await expect(fetchChapter(1, 1, 'BSB')).resolves.toEqual([]);
  });
});
