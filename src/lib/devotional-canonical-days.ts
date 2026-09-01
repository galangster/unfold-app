import type { Devotional, DevotionalDay } from './store';
import { isCanonicalProgressiveDevotional } from './reading-generation-policy';

export type RenderableDevotionalDay =
  | { status: 'ready'; day: DevotionalDay }
  | { status: 'awaiting-canonical-recovery'; dayNumber: number; reason: 'local_only_or_missing' };

export function canonicalGeneratedDayId(devotionalId: string, dayNumber: number): string {
  return `day-${devotionalId}-${dayNumber}`;
}

export function isCanonicalGeneratedDay(devotionalId: string, day: DevotionalDay): boolean {
  return day.id === canonicalGeneratedDayId(devotionalId, day.dayNumber);
}

export function selectRenderableDevotionalDay(
  devotional: Devotional | null | undefined,
  dayNumber: number,
): RenderableDevotionalDay {
  const day = devotional?.days.find((candidate) => candidate.dayNumber === dayNumber);

  if (!devotional || !day) {
    return { status: 'awaiting-canonical-recovery', dayNumber, reason: 'local_only_or_missing' };
  }

  if (!isCanonicalProgressiveDevotional(devotional)) {
    return { status: 'ready', day };
  }

  if (isCanonicalGeneratedDay(devotional.id, day)) {
    return { status: 'ready', day };
  }

  return { status: 'awaiting-canonical-recovery', dayNumber, reason: 'local_only_or_missing' };
}

export function selectNextRenderableDevotionalDay(
  devotional: Devotional | null | undefined,
  currentDayNumber: number,
): DevotionalDay | undefined {
  const result = selectRenderableDevotionalDay(devotional, currentDayNumber + 1);
  return result.status === 'ready' ? result.day : undefined;
}

export function getHighestContiguousRenderableDayNumber(
  devotional: Devotional | null | undefined,
): number {
  if (!devotional) return 0;

  if (!isCanonicalProgressiveDevotional(devotional)) {
    return devotional.days.length;
  }

  let highest = 0;
  for (let dayNumber = 1; dayNumber <= devotional.totalDays; dayNumber += 1) {
    if (selectRenderableDevotionalDay(devotional, dayNumber).status !== 'ready') {
      break;
    }
    highest = dayNumber;
  }

  return highest;
}

export interface RenderableDevotionalDaySummary {
  /** Distinct day numbers that pass the reader's renderable predicate. */
  readyDayCount: number;
  /** Highest renderable day number strictly below the target, or null when none exists. */
  fallbackDayNumber: number | null;
}

/**
 * Summarizes the days the reader can actually render, using the same
 * predicate the reader uses to decide whether a day is ready
 * (`selectRenderableDevotionalDay`). Raw `days.length` overcounts for
 * canonical progressive series, whose local-only placeholder days are
 * stored but never rendered, so the "isn't ready yet" screen uses this
 * for its "N days ready" count and its "Go back to Day N" target.
 */
export function summarizeRenderableDevotionalDays(
  devotional: Devotional | null | undefined,
  targetDayNumber: number,
): RenderableDevotionalDaySummary {
  if (!devotional) return { readyDayCount: 0, fallbackDayNumber: null };

  let readyDayCount = 0;
  let fallbackDayNumber: number | null = null;

  for (const dayNumber of [...new Set(devotional.days.map((day) => day.dayNumber))]) {
    if (selectRenderableDevotionalDay(devotional, dayNumber).status !== 'ready') continue;
    readyDayCount += 1;
    if (dayNumber < targetDayNumber && (fallbackDayNumber === null || dayNumber > fallbackDayNumber)) {
      fallbackDayNumber = dayNumber;
    }
  }

  return { readyDayCount, fallbackDayNumber };
}

export function buildReadOnlyCanonicalDayData(
  devotionalId: string,
  day: DevotionalDay,
  readAt: string,
): Record<string, unknown> {
  return {
    devotionalId,
    dayNumber: day.dayNumber,
    isRead: true,
    readAt,
  };
}
