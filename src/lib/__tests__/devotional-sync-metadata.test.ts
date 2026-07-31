import { buildDevotionalSyncMetadataPatch } from '@/lib/devotional-sync-metadata';
import type { Devotional } from '@/lib/store';

const baseDevotional: Devotional = {
  id: 'devotional-1',
  title: 'The Names That Hold You',
  totalDays: 14,
  currentDay: 1,
  days: [],
  createdAt: '2026-04-24T00:00:00.000Z',
  seriesStartDate: '2026-04-24T00:00:00.000Z',
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

  it('ignores synced totalDays/currentDay beyond the server-owned series arc boundary', () => {
    expect(
      buildDevotionalSyncMetadataPatch(
        {
          ...baseDevotional,
          currentDay: 14,
          seriesArc: {
            totalDaysPlanned: 14,
            dayHints: Array.from({ length: 14 }, (_unused, index) => ({
              dayNumber: index + 1,
              themeHint: `Theme ${index + 1}`,
              scriptureRegion: 'Psalms',
              narrativeRole: 'deepening' as const,
            })),
            overarchingTheme: 'Boundary',
            narrativeShape: 'Arc',
            isOpenEnded: false,
            createdAt: '2026-04-24T00:00:00.000Z',
          },
        },
        {
          id: 'devotional-1',
          totalDays: 15,
          currentDay: 16,
          updatedAt: '2026-04-25T13:29:48.574Z',
        },
      ),
    ).toEqual({ updatedAt: '2026-04-25T13:29:48.574Z' });
  });

  it('applies repaired server parent totals when no series arc is present', () => {
    expect(
      buildDevotionalSyncMetadataPatch(
        { ...baseDevotional, totalDays: 16, currentDay: 17, seriesArc: undefined },
        {
          id: 'devotional-1',
          totalDays: 14,
          currentDay: 15,
          updatedAt: '2026-05-31T20:29:21.896Z',
        },
      ),
    ).toEqual({
      totalDays: 14,
      currentDay: 15,
      updatedAt: '2026-05-31T20:29:21.896Z',
    });
  });

  it('ignores metadata for a different devotional id', () => {
    expect(
      buildDevotionalSyncMetadataPatch(baseDevotional, {
        id: 'other-devotional',
        currentDay: 2,
      }),
    ).toEqual({});
  });

  // Regression: a devotional restored from sync can arrive with no calendar
  // anchor. getCalendarDayNumber() returns null without it, which makes
  // isCurrentDayAfterCalendarDay() fail closed and locks catch-up users out of
  // days they are entitled to. The patch must repair it.
  it('repairs a missing seriesStartDate from the local createdAt', () => {
    const anchorless = { ...baseDevotional, seriesStartDate: undefined };
    expect(
      buildDevotionalSyncMetadataPatch(anchorless, {
        id: 'devotional-1',
        updatedAt: '2026-04-25T13:29:48.574Z',
      }),
    ).toEqual({
      seriesStartDate: '2026-04-24T00:00:00.000Z',
      updatedAt: '2026-04-25T13:29:48.574Z',
    });
  });

  it('prefers the server seriesStartDate over the local createdAt', () => {
    const anchorless = { ...baseDevotional, seriesStartDate: undefined };
    expect(
      buildDevotionalSyncMetadataPatch(anchorless, {
        id: 'devotional-1',
        seriesStartDate: '2026-04-20T00:00:00.000Z',
        updatedAt: '2026-04-25T13:29:48.574Z',
      }).seriesStartDate,
    ).toBe('2026-04-20T00:00:00.000Z');
  });

  it('leaves an already-anchored devotional untouched', () => {
    expect(
      buildDevotionalSyncMetadataPatch(baseDevotional, {
        id: 'devotional-1',
        updatedAt: '2026-04-25T13:29:48.574Z',
      }),
    ).toEqual({ updatedAt: '2026-04-25T13:29:48.574Z' });
  });
});
