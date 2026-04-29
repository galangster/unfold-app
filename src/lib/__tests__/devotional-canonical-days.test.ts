import {
  canonicalGeneratedDayId,
  isCanonicalGeneratedDay,
  selectRenderableDevotionalDay,
  selectNextRenderableDevotionalDay,
  getHighestContiguousRenderableDayNumber,
  buildReadOnlyCanonicalDayData,
} from '../devotional-canonical-days';
import type { Devotional, DevotionalDay } from '../store';

function day(overrides: Partial<DevotionalDay> = {}): DevotionalDay {
  return {
    id: overrides.id,
    devotionalId: overrides.devotionalId ?? 'devotional-1',
    dayNumber: overrides.dayNumber ?? 1,
    title: overrides.title ?? 'Day title',
    scriptureReference: overrides.scriptureReference ?? 'John 1:1',
    scriptureText: overrides.scriptureText ?? 'Scripture',
    bodyText: overrides.bodyText ?? 'Body',
    quotableLine: overrides.quotableLine ?? 'Quote',
    isRead: overrides.isRead ?? false,
    reflectionQuestions: [],
    ...overrides,
  };
}

function devotional(overrides: Partial<Devotional> = {}): Devotional {
  return {
    id: 'devotional-1',
    title: 'Series',
    subtitle: 'Subtitle',
    days: [],
    totalDays: 14,
    currentDay: 1,
    createdAt: '2026-04-27T00:00:00.000Z',
    updatedAt: '2026-04-27T00:00:00.000Z',
    generationMode: 'progressive',
    seriesStartDate: '2026-04-24T00:00:00.000Z',
    ...overrides,
  } as Devotional;
}

describe('canonical devotional day selection', () => {
  it('returns awaiting recovery for a local-only future day in a progressive devotional', () => {
    const localDay = day({
      id: '4a77bc7a-51b3-5106-9243-3a1af346d6f7',
      dayNumber: 5,
      title: 'Local-only Day 5',
    });

    const result = selectRenderableDevotionalDay(
      devotional({ days: [localDay], currentDay: 5 }),
      5,
    );

    expect(result).toEqual({
      status: 'awaiting-canonical-recovery',
      dayNumber: 5,
      reason: 'local_only_or_missing',
    });
  });

  it('returns canonical worker-backed days for progressive devotionals', () => {
    const canonicalDay = day({
      id: canonicalGeneratedDayId('devotional-1', 5),
      dayNumber: 5,
    });

    const result = selectRenderableDevotionalDay(
      devotional({ days: [canonicalDay], currentDay: 5 }),
      5,
    );

    expect(result).toEqual({ status: 'ready', day: canonicalDay });
    expect(isCanonicalGeneratedDay('devotional-1', canonicalDay)).toBe(true);
  });

  it('still allows legacy batch devotionals to render local days', () => {
    const localDay = day({ id: 'local-day', dayNumber: 2 });
    const result = selectRenderableDevotionalDay(
      devotional({
        days: [localDay],
        currentDay: 2,
        generationMode: 'batch',
        seriesStartDate: undefined,
        seriesArc: undefined,
        progressiveMemory: undefined,
      }),
      2,
    );

    expect(result).toEqual({ status: 'ready', day: localDay });
  });

  it('does not expose a local-only next day as the next renderable progressive day', () => {
    const canonicalDay1 = day({
      id: canonicalGeneratedDayId('devotional-1', 1),
      dayNumber: 1,
      title: 'Canonical Day 1',
    });
    const localOnlyDay2 = day({
      id: 'local-only-day-2',
      dayNumber: 2,
      title: 'Local-only Day 2',
      bodyText: 'This teaser must stay hidden until the server canonicalizes it.',
    });

    const series = devotional({ days: [canonicalDay1, localOnlyDay2], currentDay: 1 });

    expect(selectNextRenderableDevotionalDay(series, 1)).toBeUndefined();
    expect(getHighestContiguousRenderableDayNumber(series)).toBe(1);
  });

  it('uses the next canonical worker-backed day for progressive preview and forward navigation', () => {
    const canonicalDay1 = day({
      id: canonicalGeneratedDayId('devotional-1', 1),
      dayNumber: 1,
    });
    const canonicalDay2 = day({
      id: canonicalGeneratedDayId('devotional-1', 2),
      dayNumber: 2,
      title: 'Canonical Day 2',
    });

    const series = devotional({ days: [canonicalDay1, canonicalDay2], currentDay: 1 });

    expect(selectNextRenderableDevotionalDay(series, 1)).toBe(canonicalDay2);
    expect(getHighestContiguousRenderableDayNumber(series)).toBe(2);
  });

  it('preserves legacy batch next-day behavior for local days', () => {
    const localDay1 = day({ id: 'local-day-1', dayNumber: 1 });
    const localDay2 = day({ id: 'local-day-2', dayNumber: 2 });
    const series = devotional({
      days: [localDay1, localDay2],
      generationMode: 'batch',
      seriesStartDate: undefined,
      seriesArc: undefined,
      progressiveMemory: undefined,
    });

    expect(selectNextRenderableDevotionalDay(series, 1)).toBe(localDay2);
    expect(getHighestContiguousRenderableDayNumber(series)).toBe(2);
  });

  it('builds read-only sync data without devotional body content', () => {
    const readAt = '2026-04-27T12:00:00.000Z';
    expect(buildReadOnlyCanonicalDayData('devotional-1', day({ dayNumber: 5 }), readAt)).toEqual({
      devotionalId: 'devotional-1',
      dayNumber: 5,
      isRead: true,
      readAt,
    });
  });
});
