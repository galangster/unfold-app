import {
  isDevotionalArchived,
  lifecycleTimestampMs,
} from './devotional-lifecycle';
import { isStrictActiveSeriesWinner, outranksActiveSiblings, type ActiveSeriesCandidate } from './devotional-active-selection';

export type ResumeSelectionSeries = ActiveSeriesCandidate;

/**
 * The rows held here, ranked by the server's creation time where the pull
 * returned one (a shell built from a pull without series dates carries this
 * phone's guess), each with a newer resume the pull returned for it, plus
 * every pulled row this device does not hold yet. A pulled resume can wait for
 * the full sync before it is saved, but the server already counts it, so it
 * still blocks an older resume. Only resumes are laid over: a pulled pause
 * waits for the full sync like any other write, so this can only keep Today
 * empty, never choose for it. Nothing is saved from these rows.
 */
function withPulledSeries(
  next: readonly ResumeSelectionSeries[],
  pulled: readonly ResumeSelectionSeries[] = [],
): ResumeSelectionSeries[] {
  const pulledById = new Map(pulled.map((series) => [series.id, series]));
  const held = next.map((series) => {
    const copy = pulledById.get(series.id);
    if (!copy) return series;
    const ranked = copy.createdAt ? { ...series, createdAt: copy.createdAt } : series;
    if (
      copy.archivedAt
      || !(lifecycleTimestampMs(copy.archivedStateAt) > lifecycleTimestampMs(series.archivedStateAt))
    ) {
      return ranked;
    }
    return { ...ranked, archivedAt: null, archivedStateAt: copy.archivedStateAt };
  });
  const heldIds = new Set(next.map((series) => series.id));
  return [...held, ...pulled.filter((series) => !heldIds.has(series.id))];
}

/**
 * Reading may make a series it just pulled current while Today is empty only
 * when no other live series outranks it, held here or only pulled: the same
 * check an explicit resume passes. Otherwise Today stays empty and the series
 * stays open in Reading.
 */
export function canPulledSeriesTakeEmptyToday(
  id: string,
  held: readonly ResumeSelectionSeries[],
  pulled?: readonly ResumeSelectionSeries[],
): boolean {
  const target = held.find((series) => series.id === id);
  return Boolean(target && !isDevotionalArchived(target) && outranksWithPulledSeries(id, held, pulled));
}

/** The series ranks above every other live series, each ranked as the pull shows it. */
function outranksWithPulledSeries(
  id: string,
  held: readonly ResumeSelectionSeries[],
  pulled?: readonly ResumeSelectionSeries[],
): boolean {
  const ranked = withPulledSeries(held, pulled);
  const target = ranked.find((series) => series.id === id);
  return Boolean(target && outranksActiveSiblings(target, ranked));
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
 * A series that arrives only from the server (started on another device, or a
 * failed first series the server ran again) has no resume clock. It takes
 * Today only when Today holds no live series or a finished one, and only as
 * the strict active winner. An unfinished current series always stays.
 * A series held before the pull never wins this way: an older reply can omit
 * a newer series that an earlier pull showed but did not save.
 */
export function selectSyncedCurrentDevotionalId<T extends ResumeSelectionSeries>(options: {
  previousCurrentId: string | null | undefined;
  previous: readonly ResumeSelectionSeries[];
  next: readonly T[];
  /**
   * Every series row the pull returned. A pull of one series also carries
   * rows this device does not hold yet, and one of them can be the series
   * the server writes now.
   */
  pulled?: readonly ResumeSelectionSeries[];
  /** The reader finished the series, so the series the server writes may replace it. */
  isFinished?: (series: T) => boolean;
}): string | null {
  const selected = options.next.find((item) => item.id === options.previousCurrentId);
  if (selected && !isDevotionalArchived(selected)) {
    if (!options.isFinished?.(selected)) return selected.id;
    return arrivedStrictWinner(options) ?? selected.id;
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
  if (chosenId && outranksWithPulledSeries(chosenId, options.next, options.pulled)) return chosenId;
  return arrivedStrictWinner(options);
}

/**
 * The series this pull brought here that the server writes: the device did
 * not hold it before, holds it live now, and the pull shows it live. No other
 * live series, held here or only pulled, ranks with or above it.
 */
function arrivedStrictWinner(options: {
  previous: readonly ResumeSelectionSeries[];
  next: readonly ResumeSelectionSeries[];
  pulled?: readonly ResumeSelectionSeries[];
}): string | null {
  const ranked = withPulledSeries(options.next, options.pulled);
  const winner = options.pulled?.find((copy) => {
    const held = options.next.find((series) => series.id === copy.id);
    return held && !isDevotionalArchived(held) && !isDevotionalArchived(copy)
      && !options.previous.some((series) => series.id === copy.id)
      && isStrictActiveSeriesWinner(copy.id, ranked);
  });
  return winner?.id ?? null;
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
