import type { Devotional, DevotionalDay, NextPick } from '@/lib/store';

export type { NextPick };

export function isAutoTrialSeries(d?: Devotional | null): boolean {
  return d?.seriesArc?.seriesKind === 'auto_trial';
}

export function isOnboardingSampleDevotionalId(id?: string | null): boolean {
  return typeof id === 'string' && id.startsWith('onboarding-sample-');
}

export function shouldShowShapedByCheckInChip(d: Devotional, day: DevotionalDay): boolean {
  return isAutoTrialSeries(d) && day.dayNumber === 2 && day.shapedByCheckIn === true;
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
