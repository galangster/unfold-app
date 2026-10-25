import type { SeriesArc, SeriesArcChapterPlan } from '../../store';

/** Synthetic week names. Never reader text. */
export const SYNTHETIC_WEEK_NAMES = ['Synthetic Week One', 'Synthetic Week Two', 'Synthetic Week Three', 'Synthetic Week Four'];

export function chapterPlan(
  index: number,
  status: SeriesArcChapterPlan['status'],
  extra: Partial<SeriesArcChapterPlan> = {},
): SeriesArcChapterPlan {
  return { index, fromDay: (index - 1) * 7 + 1, toDay: index * 7, status, ...extra };
}

/** A 28-day chaptered arc: four weeks of 7, every name written at the first call. */
export function makeChapteredArc(
  statuses: SeriesArcChapterPlan['status'][] = ['planned', 'outline', 'outline', 'outline'],
  overrides: Partial<SeriesArc> = {},
): SeriesArc {
  return {
    totalDaysPlanned: 28,
    overarchingTheme: 'Synthetic theme',
    narrativeShape: 'Synthetic shape',
    dayHints: [],
    isOpenEnded: false,
    createdAt: '2026-10-20T00:00:00.000Z',
    acts: SYNTHETIC_WEEK_NAMES.map((name, i) => ({ name, fromDay: i * 7 + 1, toDay: (i + 1) * 7, function: 'synthetic' })),
    planning: { mode: 'chapters', version: 1, chapters: statuses.map((status, i) => chapterPlan(i + 1, status)) },
    ...overrides,
  };
}
