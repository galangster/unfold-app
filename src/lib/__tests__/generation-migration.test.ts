const mockFetch = jest.fn();
global.fetch = mockFetch as unknown as typeof fetch;

const mockGetItem = jest.fn(() => null);
const mockSetItem = jest.fn();
const mockGetState = jest.fn();
const mockGetAuthHeaders = jest.fn().mockResolvedValue({ Authorization: 'Bearer test' });
const mockLogger = {
  log: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
};

function loadSubject() {
  jest.resetModules();

  jest.doMock('../mmkv-storage', () => ({
    mmkvStorage: {
      getItem: mockGetItem,
      setItem: mockSetItem,
    },
  }));

  jest.doMock('../store', () => ({
    useUnfoldStore: {
      getState: mockGetState,
    },
  }));

  jest.doMock('../api-config', () => ({
    PRIMARY_BACKEND_URL: 'http://test',
    getAuthHeaders: mockGetAuthHeaders,
  }));

  jest.doMock('../logger', () => ({
    logger: mockLogger,
  }));

  return require('../generation-migration') as typeof import('../generation-migration');
}

describe('generation migration', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    mockGetItem.mockReset();
    mockSetItem.mockReset();
    mockGetState.mockReset();
    mockGetAuthHeaders.mockClear();
    mockLogger.log.mockClear();
    mockLogger.warn.mockClear();
    mockLogger.error.mockClear();

    mockGetItem.mockReturnValue(null);
    mockGetState.mockReturnValue({
      devotionals: [
        {
          id: 'devo-1',
          generationMode: 'progressive',
          seriesArc: { title: 'Arc' },
          progressiveMemory: { summaries: [], fullDays: [], narrative: null },
        },
      ],
      usedScriptures: [
        {
          reference: 'Psalm 1:1',
          book: 'Psalm',
          usedAt: '2026-04-18T00:00:00.000Z',
          devotionalId: 'devo-1',
        },
      ],
      seriesPersonaHistory: [
        {
          devotionalId: 'devo-1',
          personaPrompt: 'prompt',
          createdAt: '2026-04-18T00:00:00.000Z',
        },
      ],
    });
    mockFetch.mockResolvedValue({ ok: true, status: 200 });
  });

  it('marks migration complete when every required step succeeds', async () => {
    const { migrateGenerationDataToServer } = loadSubject();

    await migrateGenerationDataToServer();

    expect(mockFetch).toHaveBeenCalledTimes(4);
    expect(mockSetItem).toHaveBeenCalledWith('generation-migration-v1-complete', 'true');
    expect(mockLogger.log).toHaveBeenCalledWith('[gen-migration] Migration complete');
  });

  it('does not mark migration complete when any required step fails', async () => {
    const { migrateGenerationDataToServer } = loadSubject();

    mockFetch
      .mockResolvedValueOnce({ ok: true, status: 200 })
      .mockResolvedValueOnce({ ok: false, status: 500 })
      .mockResolvedValueOnce({ ok: true, status: 200 })
      .mockResolvedValueOnce({ ok: true, status: 200 });

    await migrateGenerationDataToServer();

    expect(mockFetch).toHaveBeenCalledTimes(4);
    expect(mockSetItem).not.toHaveBeenCalled();
    expect(mockLogger.warn).toHaveBeenCalledWith('[gen-migration] /api/jobs/migrate-memory failed with status 500');
    expect(mockLogger.warn).toHaveBeenCalledWith('[gen-migration] Migration incomplete — will retry next launch');
  });

  it('does not mark migration complete when a request throws', async () => {
    const { migrateGenerationDataToServer } = loadSubject();

    mockFetch
      .mockResolvedValueOnce({ ok: true, status: 200 })
      .mockRejectedValueOnce(new Error('network down'))
      .mockResolvedValueOnce({ ok: true, status: 200 })
      .mockResolvedValueOnce({ ok: true, status: 200 });

    await migrateGenerationDataToServer();

    expect(mockSetItem).not.toHaveBeenCalled();
    expect(mockLogger.warn).toHaveBeenCalledWith('[gen-migration] /api/jobs/migrate-memory request failed:', expect.any(Error));
    expect(mockLogger.warn).toHaveBeenCalledWith('[gen-migration] Migration incomplete — will retry next launch');
  });
});
