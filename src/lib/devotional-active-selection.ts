import { lifecycleTimestampMs } from './devotional-lifecycle';

export type ActiveSeriesCandidate = {
  id: string;
  createdAt?: string;
  generationMode?: string;
  archivedAt?: string | null;
  archivedStateAt?: string;
};

/** Backend caller eligibility; unknown modes fail conservatively as candidates. */
export function isActiveSeriesCandidate(series: ActiveSeriesCandidate): boolean {
  return !series.id.startsWith('onboarding-sample-') && !series.archivedAt
    && (series.generationMode === undefined || series.generationMode === 'progressive');
}

export function activeSeriesRank(series: ActiveSeriesCandidate): number {
  return Math.max(lifecycleTimestampMs(series.createdAt), lifecycleTimestampMs(series.archivedStateAt));
}

/** Pull order is unspecified; only a strict winner proves backend selection. */
export function isStrictActiveSeriesWinner(id: string, series: readonly ActiveSeriesCandidate[]): boolean {
  const candidates = series.filter(isActiveSeriesCandidate);
  const target = candidates.find((candidate) => candidate.id === id);
  if (!target) return false;
  const rank = activeSeriesRank(target);
  return candidates.every((candidate) => candidate.id === id || activeSeriesRank(candidate) < rank);
}
