import type { Devotional } from '@/lib/store';
import {
  isCanonicalProgressiveDevotional,
  shouldUseLegacyDirectContinuation,
} from '@/lib/reading-generation-policy';

const baseDevotional: Devotional = {
  id: 'devotional-test',
  title: 'Test Series',
  totalDays: 7,
  currentDay: 1,
  days: [],
  createdAt: '2026-04-26T00:00:00.000Z',
  userContext: {
    name: 'Nick',
    aboutMe: 'Testing',
    currentSituation: 'Testing',
    emotionalState: 'steady',
  },
  generationMode: 'batch',
};

describe('reading generation policy', () => {
  it('allows legacy direct continuation only for plain batch devotionals', () => {
    expect(shouldUseLegacyDirectContinuation(baseDevotional)).toBe(true);
  });

  it('blocks legacy direct continuation for progressive devotionals', () => {
    expect(
      shouldUseLegacyDirectContinuation({
        ...baseDevotional,
        generationMode: 'progressive',
      })
    ).toBe(false);
  });

  it('blocks legacy direct continuation for canonical series metadata even if mode drift says batch', () => {
    expect(
      shouldUseLegacyDirectContinuation({
        ...baseDevotional,
        seriesStartDate: '2026-04-24T14:42:33.845Z',
      })
    ).toBe(false);

    expect(
      shouldUseLegacyDirectContinuation({
        ...baseDevotional,
        progressiveMemory: {
          fullDays: [],
          summaries: [],
          narrative: null,
        },
      })
    ).toBe(false);
  });

  it('identifies canonical progressive devotionals for missing-day job recovery', () => {
    expect(isCanonicalProgressiveDevotional(baseDevotional)).toBe(false);
    expect(isCanonicalProgressiveDevotional({ ...baseDevotional, generationMode: 'progressive' })).toBe(true);
    expect(isCanonicalProgressiveDevotional({ ...baseDevotional, seriesStartDate: '2026-04-24T14:42:33.845Z' })).toBe(true);
  });
});
