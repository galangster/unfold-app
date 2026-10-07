import {
  isDevotionalArchived,
  lifecycleTimestampMs,
} from './devotional-lifecycle';
import {
  activeSeriesRank,
  isStrictActiveSeriesWinner,
  outranksActiveSiblings,
  type ActiveSeriesCandidate,
} from './devotional-active-selection';

export type ResumeSelectionSeries = ActiveSeriesCandidate;

type SyncedSelection = {
  previousCurrentId: string | null | undefined;
  previous: readonly ResumeSelectionSeries[];
  next: readonly ResumeSelectionSeries[];
  /**
   * Every series row the pull returned. A pull of one series also carries
   * rows this device does not hold yet, and one of them can be the series
   * the server writes now.
   */
  pulled?: readonly ResumeSelectionSeries[];
};

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
 * resolve to the newest accepted intent clock. A current series paused by a
 * resume elsewhere hands Today to that resume (selectPausedCurrentSuccessor).
 * Today never moves to a series that another live series outranks, held here
 * or only pulled: a pull of one series can carry a newer series started on
 * another device, and the server writes that one.
 */
export function selectSyncedCurrentDevotionalId(options: SyncedSelection): string | null {
  const selected = options.next.find((item) => item.id === options.previousCurrentId);
  if (selected && !isDevotionalArchived(selected)) {
    return selected.id;
  }

  const candidates = withUnheldPulledSeries(options.next, options.pulled);
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
  if (chosen && outranksActiveSiblings(chosen, candidates)) return chosen.id;
  return selected ? selectPausedCurrentSuccessor(selected, options.next, candidates) : null;
}

/**
 * The series the server writes now, when this device does not hold it yet:
 * the strict active winner of the held rows and every pulled row. Until a
 * full sync brings it, the held rows alone prove nothing about the server's
 * series.
 */
export function selectUnheldActiveSeriesId(
  next: readonly ResumeSelectionSeries[],
  pulled: readonly ResumeSelectionSeries[] = [],
): string | null {
  const candidates = withUnheldPulledSeries(next, pulled);
  const unheld = candidates.slice(next.length);
  return unheld.find((series) => isStrictActiveSeriesWinner(series.id, candidates))?.id ?? null;
}

/**
 * "Continue this series" on another device resumes one series and pauses the
 * current one on the same clock, but the pause can reach the server long after
 * the resume. Once the resume was pulled its clock no longer reads as newer,
 * so when the pause lands, follow the strict active winner: the series the
 * server generates, proven on every held and pulled row. It must rank at or
 * above the paused series on the server's clock (the later of start and
 * resume, for both), so only a series resumed or started at or after the
 * pause qualifies. A device clock running slow can stamp the pause before an
 * older series' last resume, though the paused series began after it; the
 * paused series' start keeps that older series off Today. A winner this
 * device does not hold yet leaves Today empty until a full sync brings it.
 */
function selectPausedCurrentSuccessor(
  paused: ResumeSelectionSeries,
  held: readonly ResumeSelectionSeries[],
  candidates: readonly ResumeSelectionSeries[],
): string | null {
  if (lifecycleTimestampMs(paused.archivedStateAt) === 0) return null;
  const pausedRank = activeSeriesRank(paused);
  const successor = held.find((series) => activeSeriesRank(series) >= pausedRank
    && isStrictActiveSeriesWinner(series.id, candidates));
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
