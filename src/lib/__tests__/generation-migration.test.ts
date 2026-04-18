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
          days: [
            { dayNumber: 1, scriptureReference: 'Psalm 1:1' },
          ],
          progressiveMemory: {
            fullDays: [
              {
                dayNumber: 1,
                devotionalTitle: 'Day 1',
                scriptureReference: 'Psalm 1:1',
              },
            ],
            summaries: [
              {
                dayRange: 'Days 1-3',
                startDay: 1,
                endDay: 3,
                summaryText: 'Summary',
              },
            ],
            narrative: {
              narrative: 'Journey',
              totalDaysCovered: 3,
              lastUpdatedAt: '2026-04-18T00:00:00.000Z',
              version: 1,
            },
          },
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
          primaryTrait: 'gentle',
          secondaryTrait: 'scholarly',
          templateSeed: 4,
          createdAt: '2026-04-18T00:00:00.000Z',
        },
      ],
    });
    mockFetch.mockResolvedValue({ ok: true, status: 200 });
  });

  it('marks migration complete when every required step succeeds and sends backend-compatible payloads', async () => {
    const { migrateGenerationDataToServer } = loadSubject();

    await migrateGenerationDataToServer();

    expect(mockFetch).toHaveBeenCalledTimes(4);

    expect(JSON.parse(mockFetch.mock.calls[1][1].body)).toEqual({
      devotionalId: 'devo-1',
      memory: {
        fullDays: [
          {
            dayNumber: 1,
            content: {
              dayNumber: 1,
              devotionalTitle: 'Day 1',
              scriptureReference: 'Psalm 1:1',
            },
          },
        ],
        summaries: [
          {
            dayRangeStart: 1,
            dayRangeEnd: 3,
            content: {
              dayRange: 'Days 1-3',
              startDay: 1,
              endDay: 3,
              summaryText: 'Summary',
            },
          },
        ],
        narrative: {
          content: {
            narrative: 'Journey',
            totalDaysCovered: 3,
            lastUpdatedAt: '2026-04-18T00:00:00.000Z',
            version: 1,
          },
        },
      },
    });

    expect(JSON.parse(mockFetch.mock.calls[2][1].body)).toEqual({
      scriptures: [
        {
          reference: 'Psalm 1:1',
          book: 'Psalm',
          devotionalId: 'devo-1',
          dayNumber: 1,
        },
      ],
    });

    expect(JSON.parse(mockFetch.mock.calls[3][1].body)).toEqual({
      personas: [
        {
          devotionalId: 'devo-1',
          primaryTrait: 'gentle',
          secondaryTrait: 'scholarly',
          templateSeed: 4,
          createdAt: '2026-04-18T00:00:00.000Z',
        },
      ],
    });

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

  it('skips scriptures that still cannot be mapped to a canonical dayNumber', async () => {
    mockGetState.mockReturnValueOnce({
      devotionals: [
        {
          id: 'devo-1',
          generationMode: 'progressive',
          seriesArc: { title: 'Arc' },
          days: [],
          progressiveMemory: { fullDays: [], summaries: [], narrative: null },
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
      seriesPersonaHistory: [],
    });
    const { migrateGenerationDataToServer } = loadSubject();

    await migrateGenerationDataToServer();

    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(mockFetch.mock.calls[0][0]).toBe('http://test/api/jobs/migrate-arc');
    expect(mockFetch.mock.calls[1][0]).toBe('http://test/api/jobs/migrate-memory');
    expect(mockLogger.warn).toHaveBeenCalledWith(
      '[gen-migration] Skipping scripture without resolvable dayNumber: devo-1 Psalm 1:1',
    );
  });
});
