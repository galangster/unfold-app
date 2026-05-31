import type { Devotional, DevotionalDay, SeriesArc } from './store';

type SeriesBoundaryInput = Pick<Devotional, 'totalDays'> & {
  seriesArc?: SeriesArc | null;
};

function isPositiveInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0;
}

export function getSeriesArcTotalDays(
  devotional: Pick<SeriesBoundaryInput, 'seriesArc'> | null | undefined,
): number {
  if (!devotional?.seriesArc) return 0;

  const plannedTotal = devotional.seriesArc.totalDaysPlanned;
  if (isPositiveInteger(plannedTotal)) return plannedTotal;

  const dayHints = Array.isArray(devotional.seriesArc.dayHints)
    ? devotional.seriesArc.dayHints
    : [];
  const dayHintNumbers = dayHints
    .map((hint) => hint?.dayNumber)
    .filter(isPositiveInteger);
  if (dayHintNumbers.length > 0) return Math.max(...dayHintNumbers);

  return 0;
}

export function getServerOwnedSeriesTotalDays(
  devotional: SeriesBoundaryInput | null | undefined,
): number {
  if (!devotional) return 0;

  const seriesArcTotalDays = getSeriesArcTotalDays(devotional);
  if (seriesArcTotalDays > 0) return seriesArcTotalDays;

  return isPositiveInteger(devotional.totalDays) ? devotional.totalDays : 0;
}

export function clampCurrentDayToSeriesBoundary(
  currentDay: number,
  devotional: SeriesBoundaryInput | null | undefined,
): number {
  const totalDays = getServerOwnedSeriesTotalDays(devotional);
  if (totalDays <= 0) return Math.max(1, currentDay || 1);
  return Math.min(Math.max(1, currentDay || 1), totalDays + 1);
}

export function filterDaysWithinSeriesBoundary(
  days: DevotionalDay[],
  devotional: SeriesBoundaryInput | null | undefined,
): DevotionalDay[] {
  const totalDays = getServerOwnedSeriesTotalDays(devotional);
  if (totalDays <= 0) return days;
  return days.filter((day) => day.dayNumber <= totalDays);
}
