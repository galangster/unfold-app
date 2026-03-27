// Mock fetch globally for this test
const mockFetch = jest.fn();
global.fetch = mockFetch as any;

// Mock auth headers
jest.mock('@/lib/api-config', () => ({
  PRIMARY_BACKEND_URL: 'http://test',
  getAuthHeaders: jest.fn().mockResolvedValue({ Authorization: 'Bearer test' }),
}));

jest.mock('@/lib/logger', () => ({
  logger: { warn: jest.fn(), log: jest.fn() },
}));

import { fetchStoriesForGeneration } from '../story-service';

describe('fetchStoriesForGeneration exclude param', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ stories: [], total: 0, limit: 5, offset: 0 }),
    });
  });

  it('passes exclude IDs as query parameter', async () => {
    await fetchStoriesForGeneration(['faith'], {
      exclude: ['story-1', 'story-2'],
    });

    const calledUrl = mockFetch.mock.calls[0][0] as string;
    expect(calledUrl).toContain('exclude=story-1%2Cstory-2');
  });

  it('omits exclude param when no IDs provided', async () => {
    await fetchStoriesForGeneration(['faith'], {});

    const calledUrl = mockFetch.mock.calls[0][0] as string;
    expect(calledUrl).not.toContain('exclude');
  });
});
