jest.mock('uuid', () => ({
  v4: jest.fn(() => '00000000-0000-4000-8000-000000000000'),
  v5: jest.fn((value: string, namespace: string) => `uuidv5:${namespace}:${value}`),
}));

import { buildDevotionalSeed } from '../dev-seed';
import { canonicalGeneratedDayId } from '../devotional-canonical-days';

describe('buildDevotionalSeed', () => {
  it('creates a real devotional object with a seeded current day ready for reveal and reading QA', () => {
    const seeded = buildDevotionalSeed({
      devotionalId: 'seeded-devotional',
      nowIso: '2026-04-20T22:40:00.000Z',
    });

    expect(seeded.id).toBe('seeded-devotional');
    expect(seeded.title).toBe('Quiet Path Series');
    expect(seeded.totalDays).toBe(3);
    expect(seeded.currentDay).toBe(1);
    expect(seeded.generationMode).toBe('progressive');
    expect(seeded.days).toHaveLength(3);
    expect(seeded.days[0]).toMatchObject({
      devotionalId: 'seeded-devotional',
      dayNumber: 1,
      id: canonicalGeneratedDayId('seeded-devotional', 1),
      title: 'When the Path Is Quiet',
      isRead: false,
      isRevealed: false,
    });
  });

  it('gives later seeded days stable ids and devotional identity too', () => {
    const seeded = buildDevotionalSeed({ devotionalId: 'seeded-devotional' });

    expect(seeded.days[1]).toMatchObject({
      devotionalId: 'seeded-devotional',
      dayNumber: 2,
      id: canonicalGeneratedDayId('seeded-devotional', 2),
    });
    expect(seeded.days[2]).toMatchObject({
      devotionalId: 'seeded-devotional',
      dayNumber: 3,
      id: canonicalGeneratedDayId('seeded-devotional', 3),
    });
  });
});
