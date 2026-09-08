import type { Devotional } from './store';
import { getCalendarDayNumber } from './devotional-day-access';
import { getServerOwnedSeriesTotalDays } from './devotional-series-boundary';
import { isCanonicalProgressiveDevotional } from './reading-generation-policy';
import { selectRenderableDevotionalDay } from './devotional-canonical-days';

/** Shared wait for the initial-series watcher. */
export function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Whether a missing day is worth watching for: the series is server-generated,
 * the day is inside the series, it is not already on device, and the calendar
 * (when the series has an anchor) says it is due. Days that are not due yet
 * would just burn polls against a server that will refuse to generate them.
 */
export function shouldWatchForGeneratedDay(
  devotional: Devotional | null | undefined,
  dayNumber: number,
  now = new Date(),
): boolean {
  if (!devotional || !Number.isInteger(dayNumber) || dayNumber < 1) return false;
  if (!isCanonicalProgressiveDevotional(devotional)) return false;

  const totalDays = getServerOwnedSeriesTotalDays(devotional);
  if (totalDays > 0 && dayNumber > totalDays) return false;

  if (selectRenderableDevotionalDay(devotional, dayNumber).status === 'ready') return false;

  const calendarDayNumber = getCalendarDayNumber(devotional, now);
  if (calendarDayNumber != null && dayNumber > calendarDayNumber) return false;

  return true;
}
