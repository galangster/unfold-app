import { buildDevotionalSyncMetadataPatch } from '@/lib/devotional-sync-metadata';
import type { Devotional } from '@/lib/store';

const baseDevotional: Devotional = {
  id: 'devotional-1',
  title: 'The Names That Hold You',
  totalDays: 14,
  currentDay: 1,
  days: [],
  createdAt: '2026-04-24T00:00:00.000Z',
  updatedAt: '2026-04-25T00:00:00.000Z',
  userContext: {
    name: 'Nick',
    aboutMe: '',
    currentSituation: '',
    emotionalState: '',
  },
  generationMode: 'progressive',
};

describe('buildDevotionalSyncMetadataPatch', () => {
  it('advances stale local currentDay when sync pull reports a later server currentDay', () => {
    expect(
      buildDevotionalSyncMetadataPatch(baseDevotional, {
        id: 'devotional-1',
        title: 'The Names That Hold You',
        totalDays: 14,
        currentDay: 2,
        updatedAt: '2026-04-25T13:29:48.574Z',
      }),
    ).toEqual({
      currentDay: 2,
      updatedAt: '2026-04-25T13:29:48.574Z',
    });
  });

  it('does not move local currentDay backwards if stale sync metadata arrives', () => {
    expect(
      buildDevotionalSyncMetadataPatch(
        { ...baseDevotional, currentDay: 3 },
        { id: 'devotional-1', currentDay: 2, updatedAt: '2026-04-25T13:29:48.574Z' },
      ),
    ).toEqual({ updatedAt: '2026-04-25T13:29:48.574Z' });
  });

  it('ignores metadata for a different devotional id', () => {
    expect(
      buildDevotionalSyncMetadataPatch(baseDevotional, {
        id: 'other-devotional',
        currentDay: 2,
      }),
    ).toEqual({});
  });
});
