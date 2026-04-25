jest.mock('@/lib/api-config', () => ({
  PRIMARY_BACKEND_URL: 'https://example.test',
  getAuthHeaders: jest.fn(async () => ({ 'Content-Type': 'application/json' })),
}));

import { buildDevotionalReadSyncChanges } from '@/lib/devotional-read-sync';
import type { Devotional, DevotionalDay } from '@/lib/store';

const day: DevotionalDay = {
  id: 'day-devotional-1-1',
  devotionalId: 'devotional-1',
  dayNumber: 1,
  title: 'The Name That Made You',
  scriptureReference: 'Isaiah 43:1',
  scriptureText: 'I have called you by name.',
  bodyText: 'Body',
  quotableLine: 'You are named before you perform.',
  isRead: false,
};

const devotional: Devotional = {
  id: 'devotional-1',
  title: 'The Names That Hold You',
  totalDays: 14,
  currentDay: 1,
  days: [day],
  createdAt: '2026-04-24T14:42:19.225Z',
  seriesStartDate: '2026-04-24T14:42:19.225Z',
  generationMode: 'progressive',
  userContext: {
    name: 'Nick',
    aboutMe: 'Following Jesus in daily life.',
    currentSituation: 'Building a devotional habit.',
    emotionalState: 'hopeful',
  },
};

describe('buildDevotionalReadSyncChanges', () => {
  it('pushes completed day state and advances the server-visible current day', () => {
    const readAt = '2026-04-25T12:00:00.000Z';
    const changes = buildDevotionalReadSyncChanges({ devotional, day, readAt });

    expect(changes).toHaveLength(2);
    expect(changes[0]).toMatchObject({
      table: 'devotional_days',
      id: 'day-devotional-1-1',
      clientUpdatedAt: readAt,
      data: {
        devotionalId: 'devotional-1',
        dayNumber: 1,
        isRead: true,
        readAt,
      },
    });
    expect(changes[1]).toMatchObject({
      table: 'devotionals',
      id: 'devotional-1',
      clientUpdatedAt: readAt,
      data: {
        currentDay: 2,
        generationMode: 'progressive',
      },
    });
  });
});
