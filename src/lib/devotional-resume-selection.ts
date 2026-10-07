import {
  isDevotionalArchived,
  lifecycleTimestampMs,
} from './devotional-lifecycle';
import { isStrictActiveSeriesWinner, type ActiveSeriesCandidate } from './devotional-active-selection';

export type ResumeSelectionSeries = ActiveSeriesCandidate;

/**
 * After a pull applies archive/resume clocks, keep a still-valid current
 * series. Restore Today only from a newer accepted explicit resume
 * (archivedAt null plus a newer archivedStateAt). Stale, rejected, archived,
 * or omitted lifecycle rows never become current. Several qualifying resumes
 * resolve to the newest accepted intent clock. A current series paused by a
 * resume elsewhere hands Today to that resume (selectPausedCurrentSuccessor).
 */
export function selectSyncedCurrentDevotionalId(options: {
  previousCurrentId: string | null | undefined;
  previous: readonly ResumeSelectionSeries[];
  next: readonly ResumeSelectionSeries[];
}): string | null {
  const selected = options.next.find((item) => item.id === options.previousCurrentId);
  if (selected && !isDevotionalArchived(selected)) {
    return selected.id;
  }

  const previousById = new Map(options.previous.map((item) => [item.id, item]));
  let chosenId: string | null = null;
  let chosenClock = Number.NEGATIVE_INFINITY;
  for (const series of options.next) {
    if (!isAcceptedExplicitResume(previousById.get(series.id), series)) continue;
    const clock = lifecycleTimestampMs(series.archivedStateAt);
    if (
      chosenId === null
      || clock > chosenClock
      || (clock === chosenClock && series.id < chosenId)
    ) {
      chosenId = series.id;
      chosenClock = clock;
    }
  }
  return chosenId ?? (selected ? selectPausedCurrentSuccessor(selected, options.next) : null);
}

/**
 * "Continue this series" on another device resumes one series and pauses the
 * current one on the same clock, but the pause can reach the server long after
 * the resume. Once the resume was pulled its clock no longer reads as newer,
 * so when the pause lands, follow the strict active winner: the series the
 * server generates. Only a resume at least as new as the pause qualifies.
 * Ending a series to start a new one leaves Today empty, as before, and never
 * hands it to an older series still live from an earlier app version.
 */
function selectPausedCurrentSuccessor(
  paused: ResumeSelectionSeries,
  next: readonly ResumeSelectionSeries[],
): string | null {
  const pausedAt = lifecycleTimestampMs(paused.archivedStateAt);
  if (pausedAt === 0) return null;
  const successor = next.find((series) => lifecycleTimestampMs(series.archivedStateAt) >= pausedAt
    && isStrictActiveSeriesWinner(series.id, next));
  return successor?.id ?? null;
}

function isAcceptedExplicitResume(
  previous: ResumeSelectionSeries | undefined,
  next: ResumeSelectionSeries,
): boolean {
  if (isDevotionalArchived(next) || next.archivedAt !== null || !next.archivedStateAt) {
    return false;
  }
  const previousClock = lifecycleTimestampMs(previous?.archivedStateAt);
  const nextClock = lifecycleTimestampMs(next.archivedStateAt);
  if (nextClock === 0 || (previousClock !== 0 && !(previousClock < nextClock))) {
    return false;
  }
  return true;
}
