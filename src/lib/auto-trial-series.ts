import type { Devotional, NextPick, SeriesArc } from '@/lib/store';

export type { NextPick };

export const ONBOARDING_FIRST_READING_ORIGIN = 'onboarding_first';

export function isAutoTrialSeries(
  d?: { seriesArc?: { seriesKind?: unknown } | null } | null,
): boolean {
  return d?.seriesArc?.seriesKind === 'auto_trial';
}

export function isOnboardingFirstReading(
  d?: { seriesArc?: { origin?: unknown } | null } | null,
): boolean {
  return d?.seriesArc?.origin === ONBOARDING_FIRST_READING_ORIGIN;
}

/** The series name the server's onboarding job gives the first reading. */
export const ONBOARDING_FIRST_READING_SERIES_NAME = 'Your First Devotional';

/**
 * The series name and the devotional title for a series. A first reading's
 * stored title has two writers: this phone names the row by its day, and the
 * server's onboarding job names it "Your First Devotional". A pull takes the
 * one the server holds, and can drop the first-reading arc with it, so the
 * sample id marks the row and day 1 names the devotional.
 */
export function seriesDisplayNames(
  devotional: Pick<Devotional, 'id' | 'title' | 'days' | 'seriesArc'>,
): { seriesName: string; devotionalTitle: string; isFirstReading: boolean } {
  if (!isOnboardingSampleDevotionalId(devotional.id) && !isOnboardingFirstReading(devotional)) {
    return { seriesName: devotional.title, devotionalTitle: devotional.title, isFirstReading: false };
  }
  const dayTitle = asTrimmedString(devotional.days.find((day) => day.dayNumber === 1)?.title);
  return {
    seriesName: ONBOARDING_FIRST_READING_SERIES_NAME,
    devotionalTitle: dayTitle ?? devotional.title,
    isFirstReading: true,
  };
}

export function withOnboardingFirstReadingArc(
  existing: SeriesArc | undefined,
  createdAt: string,
): SeriesArc {
  if (!existing) {
    return {
      totalDaysPlanned: 1,
      overarchingTheme: '',
      narrativeShape: '',
      dayHints: [],
      isOpenEnded: false,
      createdAt,
      origin: ONBOARDING_FIRST_READING_ORIGIN,
    };
  }
  const { seriesKind: _seriesKind, ...rest } = existing;
  return {
    ...rest,
    origin: ONBOARDING_FIRST_READING_ORIGIN,
  };
}

export function isOnboardingSampleDevotionalId(id?: string | null): boolean {
  return typeof id === 'string' && id.startsWith('onboarding-sample-');
}

export function asTrimmedString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

export function asNextPick(v: unknown): NextPick | undefined {
  if (v === null || typeof v !== 'object') return undefined;
  const row = v as Record<string, unknown>;
  if (typeof row.theme !== 'string' || row.theme.length === 0) return undefined;
  if (typeof row.themeName !== 'string' || row.themeName.length === 0) return undefined;
  if (typeof row.type !== 'string' || row.type.length === 0) return undefined;
  if (row.suggestedLength !== 7 && row.suggestedLength !== 14) return undefined;
  if (typeof row.line !== 'string' || row.line.length === 0) return undefined;
  return {
    theme: row.theme,
    themeName: row.themeName,
    type: row.type,
    suggestedLength: row.suggestedLength,
    line: row.line,
  };
}

export function shouldInsertPulledDevotional(
  mapped: Pick<Devotional, 'id'> & { seriesArc?: Devotional['seriesArc'] },
  hasAutoTrialSeries: boolean,
): boolean {
  if (isOnboardingFirstReading(mapped)) return true;
  return !(isOnboardingSampleDevotionalId(mapped.id) && hasAutoTrialSeries);
}
