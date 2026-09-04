import type { Devotional } from './store';
import { getCalendarDayNumber } from './devotional-day-access';
import { getServerOwnedSeriesTotalDays } from './devotional-series-boundary';
import { isCanonicalProgressiveDevotional } from './reading-generation-policy';
import { selectRenderableDevotionalDay } from './devotional-canonical-days';

/**
 * Both Today and the reader queue a day-generation job when the day they
 * need is missing, then showed "Being prepared…" until the user left the
 * screen and came back — nothing re-checked the server. This is the shared
 * "keep looking until it lands" loop they now run while that card is up.
 */

export const GENERATED_DAY_WATCH_INTERVAL_MS = 15_000;
/** ~10 minutes of polling; a day job normally lands well inside that. */
export const GENERATED_DAY_WATCH_MAX_ATTEMPTS = 40;

export type WatchForGeneratedDayOptions = {
  intervalMs?: number;
  maxAttempts?: number;
  /** Consulted before each wait and each fetch; true stops the loop. */
  isCancelled?: () => boolean;
  /** Injectable for tests. */
  sleep?: (ms: number) => Promise<void>;
};

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Poll `fetchDay` until it returns a value, the watch is cancelled, or the
 * attempt budget runs out. A throwing fetch (network blip, 5xx) is treated
 * like "not yet" so one bad poll never ends the watch early.
 */
export async function watchForGeneratedDay<T>(
  fetchDay: () => Promise<T | null | undefined>,
  options: WatchForGeneratedDayOptions = {},
): Promise<T | null> {
  const {
    intervalMs = GENERATED_DAY_WATCH_INTERVAL_MS,
    maxAttempts = GENERATED_DAY_WATCH_MAX_ATTEMPTS,
    isCancelled = () => false,
    sleep = defaultSleep,
  } = options;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    if (isCancelled()) return null;
    await sleep(intervalMs);
    if (isCancelled()) return null;

    try {
      const result = await fetchDay();
      if (result) return result;
    } catch {
      // Transient failure — keep watching.
    }
  }

  return null;
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
