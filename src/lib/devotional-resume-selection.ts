import {
  isDevotionalArchived,
  lifecycleTimestampMs,
} from './devotional-lifecycle';
import { outranksActiveSiblings, type ActiveSeriesCandidate } from './devotional-active-selection';

export type ResumeSelectionSeries = ActiveSeriesCandidate;

/** The rows held here, plus every pulled row this device does not hold yet. */
function withUnheldPulledSeries(
  next: readonly ResumeSelectionSeries[],
  pulled: readonly ResumeSelectionSeries[] = [],
): ResumeSelectionSeries[] {
  const held = new Set(next.map((series) => series.id));
  return [...next, ...pulled.filter((series) => !held.has(series.id))];
}

/**
 * After a pull applies archive/resume clocks, keep a still-valid current
 * series. Restore Today only from a newer accepted explicit resume
 * (archivedAt null plus a newer archivedStateAt). Stale, rejected, archived,
 * or omitted lifecycle rows never become current. Several qualifying resumes
 * resolve to the newest accepted intent clock.
 * Today never moves to a series that another live series outranks, held here
 * or only pulled: a pull of one series can carry a newer series started on
 * another device, and the server writes that one. Today stays empty instead.
 */
export function selectSyncedCurrentDevotionalId(options: {
  previousCurrentId: string | null | undefined;
  previous: readonly ResumeSelectionSeries[];
  next: readonly ResumeSelectionSeries[];
  /**
   * Every series row the pull returned. A pull of one series also carries
   * rows this device does not hold yet, and one of them can be the series
   * the server writes now.
   */
  pulled?: readonly ResumeSelectionSeries[];
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
  const chosen = options.next.find((series) => series.id === chosenId);
  return chosen && outranksActiveSiblings(chosen, withUnheldPulledSeries(options.next, options.pulled))
    ? chosen.id
    : null;
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
