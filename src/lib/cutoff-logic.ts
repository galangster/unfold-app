/**
 * Returns the local date as YYYY-MM-DD string.
 * Uses local timezone (not UTC) so "midnight" tracks the user's actual day boundary.
 */
export function todayDateString(now: Date = new Date()): string {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Returns true if generation should run (past midnight cutoff).
 * Compares lastCutoffDate (YYYY-MM-DD) against today's local date.
 *
 * Returns true when:
 * - lastCutoffDate is empty (never generated)
 * - lastCutoffDate is before today (new day has started)
 */
export function isPastCutoff(lastCutoffDate: string, now: Date = new Date()): boolean {
  if (!lastCutoffDate) return true;
  return lastCutoffDate < todayDateString(now);
}

// ─── Evening cutoff ──────────────────────────────────────────

const DEFAULT_EVENING_CUTOFF_HOUR = 21; // 9 PM local time

/**
 * Returns true if current time is past the evening cutoff (default 9 PM).
 * Used for evening generation triggers — not related to midnight cutoff.
 */
export function isPastEveningCutoff(
  now: Date = new Date(),
  cutoffHour: number = DEFAULT_EVENING_CUTOFF_HOUR,
): boolean {
  return now.getHours() >= cutoffHour;
}
