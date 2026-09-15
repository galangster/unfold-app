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
