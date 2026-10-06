import { lifecycleTimestampMs } from './devotional-lifecycle';

export type ActiveSeriesCandidate = {
  id: string;
  createdAt?: string;
  generationMode?: string;
  archivedAt?: string | null;
  archivedStateAt?: string;
};

/** Structural eligibility shared by resume admission and backend selection. */
export function isProgressiveSeriesCandidate(series: Pick<ActiveSeriesCandidate, 'id' | 'generationMode'>): boolean {
  return !series.id.startsWith('onboarding-sample-') && series.generationMode === 'progressive';
}

/** An active target must have explicit progressive eligibility. */
export function isActiveSeriesCandidate(series: ActiveSeriesCandidate): boolean {
  return isProgressiveSeriesCandidate(series) && !series.archivedAt;
}

export function activeSeriesRank(series: ActiveSeriesCandidate): number {
  return Math.max(lifecycleTimestampMs(series.createdAt), lifecycleTimestampMs(series.archivedStateAt));
}

/** Pull order is unspecified; only a strict winner proves backend selection. */
export function isStrictActiveSeriesWinner(id: string, series: readonly ActiveSeriesCandidate[]): boolean {
  const target = series.find((candidate) => candidate.id === id);
  if (!target || !isActiveSeriesCandidate(target)) return false;
  const rank = activeSeriesRank(target);
  // Incomplete sibling metadata may block proof, but cannot prove target eligibility.
  return series.every((candidate) => candidate.id === id
    || !isActiveSeriesCandidate({ ...candidate, generationMode: candidate.generationMode ?? 'progressive' })
    || activeSeriesRank(candidate) < rank);
}
