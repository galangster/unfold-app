jest.mock('@/lib/api-config', () => ({
  PRIMARY_BACKEND_URL: 'https://example.test',
  getAuthHeaders: jest.fn(async () => ({ 'Content-Type': 'application/json' })),
}));

import { extractPulledDevotionalContent, pullDevotionalContent } from '@/lib/devotional-sync-pull';
import type { SyncPullResponse } from '@/lib/sync-types';

const mockFetch = jest.fn();

describe('devotional sync pull recovery', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    global.fetch = mockFetch as unknown as typeof fetch;
  });

  it('maps persisted devotional day rows by merging full content with flat sync columns', () => {
    const payload: SyncPullResponse = {
      timestamp: '2026-04-25T12:00:00.000Z',
      changes: {
        devotionals: [
          {
            id: 'devotional-1',
            updatedAt: '2026-04-25T11:59:00.000Z',
            deleted: false,
            data: {
              title: 'The Names That Hold You',
              totalDays: 14,
              currentDay: 2,
            },
          },
        ],
        devotional_days: [
          {
            id: 'day-devotional-1-2',
            updatedAt: '2026-04-25T11:58:00.000Z',
            deleted: false,
            data: {
              devotionalId: 'devotional-1',
              dayNumber: 2,
              title: 'The Fire That Speaks Your Name',
              scriptureReference: 'Exodus 3:13–15',
              scriptureText: 'God said to Moses, I AM WHO I AM.',
              bodyText: 'A devotional body from the server.',
              quotableLine: 'God meets you by name in the fire.',
              isRead: false,
              clientUpdatedAt: '2026-04-25T11:57:00.000Z',
              content: {
                dayNumber: 2,
                title: 'Older content title',
                devotionalId: 'devotional-1',
                reflectionQuestions: ['Where is God naming you today?'],
                closingPrayer: 'Lord, meet me here.',
              },
            },
          },
          {
            id: 'day-other-2',
            updatedAt: '2026-04-25T11:58:00.000Z',
            deleted: false,
            data: {
              devotionalId: 'other-devotional',
              dayNumber: 2,
              title: 'Other',
              scriptureReference: 'John 1:1',
              scriptureText: 'In the beginning',
              bodyText: 'Other body',
              quotableLine: 'Other line',
            },
          },
        ],
      },
    };

    const result = extractPulledDevotionalContent(payload, 'devotional-1');

    expect(result.devotional).toMatchObject({
      id: 'devotional-1',
      title: 'The Names That Hold You',
      totalDays: 14,
      currentDay: 2,
    });
    expect(result.days).toHaveLength(1);
    expect(result.days[0]).toMatchObject({
      id: 'day-devotional-1-2',
      devotionalId: 'devotional-1',
      dayNumber: 2,
      title: 'The Fire That Speaks Your Name',
      scriptureReference: 'Exodus 3:13–15',
      reflectionQuestions: ['Where is God naming you today?'],
      closingPrayer: 'Lord, meet me here.',
      isRead: false,
      updatedAt: '2026-04-25T11:58:00.000Z', // WR-25: mapped rows store clientUpdatedAt as local updatedAt (same-clock LWW basis),
    });
  });

  it('posts an authenticated full pull and extracts the requested devotional', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        timestamp: '2026-04-25T12:00:00.000Z',
        changes: { devotional_days: [] },
      }),
    });

    await expect(pullDevotionalContent('devotional-1')).resolves.toMatchObject({
      days: [],
      timestamp: '2026-04-25T12:00:00.000Z',
    });

    expect(mockFetch).toHaveBeenCalledWith('https://example.test/api/sync/pull', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lastPulledAt: null }),
    });
  });
});
