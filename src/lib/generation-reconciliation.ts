import type { Devotional, DevotionalDay, SeriesArc } from './store';
import { canonicalGeneratedDayId } from './devotional-canonical-days';

export interface GenerationResultPayload {
  devotionalDay: DevotionalDay;
  seriesTitle?: string;
  totalDays?: number;
  arc?: SeriesArc;
  devotionalId?: string;
}

export type GeneratedDayWithIdentity = DevotionalDay & {
  devotionalId: string;
  dayNumber: number;
  id: string;
};

export function normalizeGeneratedDayIdentity(
  devotionalId: string,
  day: DevotionalDay,
  fallbackDayNumber?: number,
): GeneratedDayWithIdentity {
  const resolvedDayNumber =
    typeof day.dayNumber === 'number' && Number.isFinite(day.dayNumber) && day.dayNumber > 0
      ? day.dayNumber
      : fallbackDayNumber;

  if (!resolvedDayNumber || resolvedDayNumber < 1) {
    throw new Error(`Generated day is missing a valid dayNumber for devotional ${devotionalId}`);
  }

  return {
    ...day,
    devotionalId,
    dayNumber: resolvedDayNumber,
    id: canonicalGeneratedDayId(devotionalId, resolvedDayNumber),
  };
}

export function normalizeGeneratedDaysIdentity(
  devotionalId: string,
  days: DevotionalDay[],
): GeneratedDayWithIdentity[] {
  return days.map((day, index) =>
    normalizeGeneratedDayIdentity(devotionalId, day, index + 1),
  );
}

export function normalizeDevotionalIdentity(devotional: Devotional): Devotional {
  return {
    ...devotional,
    days: normalizeGeneratedDaysIdentity(devotional.id, devotional.days ?? []),
  };
}

export function reconcileGenerationResultIdentity(
  result: GenerationResultPayload,
  fallbackDevotionalId?: string | null,
  fallbackDayNumber?: number,
): GenerationResultPayload {
  const devotionalId = result.devotionalId ?? fallbackDevotionalId;

  if (!devotionalId) {
    throw new Error('Generation result is missing a canonical devotionalId');
  }

  return {
    ...result,
    devotionalId,
    devotionalDay: normalizeGeneratedDayIdentity(
      devotionalId,
      result.devotionalDay,
      fallbackDayNumber,
    ),
  };
}
