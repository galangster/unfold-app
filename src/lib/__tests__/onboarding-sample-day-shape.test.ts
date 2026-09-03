import { isUsableSampleDevotionalDay } from '@/lib/onboarding-sample-day-shape';

const validDay = {
  dayNumber: 1,
  title: 'Held',
  scriptureReference: 'Psalm 23:1',
  scriptureText: 'The Lord is my shepherd.',
  bodyText: 'A paragraph of devotional prose.',
  quotableLine: 'He leads me.',
  isRead: false,
};

describe('isUsableSampleDevotionalDay', () => {
  it('accepts a fully formed day', () => {
    expect(isUsableSampleDevotionalDay(validDay)).toBe(true);
  });

  it.each(['title', 'scriptureReference', 'scriptureText', 'bodyText'])(
    'rejects a day missing %s',
    (field) => {
      const { [field]: _dropped, ...partial } = validDay as Record<string, unknown>;
      expect(isUsableSampleDevotionalDay(partial)).toBe(false);
    },
  );

  it('rejects a day whose text is present but empty', () => {
    expect(isUsableSampleDevotionalDay({ ...validDay, bodyText: '' })).toBe(false);
  });

  it('rejects null, primitives and arrays', () => {
    expect(isUsableSampleDevotionalDay(null)).toBe(false);
    expect(isUsableSampleDevotionalDay(undefined)).toBe(false);
    expect(isUsableSampleDevotionalDay('a devotional')).toBe(false);
    expect(isUsableSampleDevotionalDay([validDay])).toBe(false);
  });
});

