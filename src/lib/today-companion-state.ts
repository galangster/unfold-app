import type { Devotional } from '@/lib/store';
import {
  getLatestReadDayNumberToday,
  getTodayReaderDayNumber,
} from '@/lib/devotional-day-access';

function hasRenderableDay(devotional: Devotional, dayNumber: number): boolean {
  return (devotional.days ?? []).some((day) => day.dayNumber === dayNumber);
}

function getHighestReadDayNumber(devotional: Devotional): number | null {
  const readDayNumbers = (devotional.days ?? [])
    .filter((day) => day.isRead)
    .map((day) => day.dayNumber);

  return readDayNumbers.length > 0 ? Math.max(...readDayNumbers) : null;
}

/**
 * Midday check-ins belong to the currently readable day.
 *
 * The Today card can temporarily anchor to a completed day when the store has
 * already advanced `currentDay` to a locked tomorrow candidate. Keeping this
 * helper centralized prevents check-ins from drifting back to raw `currentDay`
 * semantics in one screen while the hero uses allowed-day semantics elsewhere.
 */
export function getMiddayCheckInDayNumber(
  devotional: Devotional | null | undefined,
  now = new Date(),
): number | null {
  if (!devotional) return null;

  const todayReaderDayNumber = getTodayReaderDayNumber(devotional, now);
  if (hasRenderableDay(devotional, todayReaderDayNumber)) {
    return todayReaderDayNumber;
  }

  return Math.max(1, devotional.currentDay || 1);
}

/**
 * Evening wind-down belongs to the day the user actually completed today.
 *
 * Most non-final completions advance `currentDay` immediately, so the raw
 * current day may point at tomorrow. Final-day completions do not advance, so a
 * blanket `currentDay - 1` would route Day 7 evening reflection back to Day 6.
 */
export function getEveningWindDownDayNumber(
  devotional: Devotional | null | undefined,
  now = new Date(),
): number | null {
  if (!devotional) return null;

  const latestReadToday = getLatestReadDayNumberToday(devotional, now);
  if (latestReadToday != null) return latestReadToday;

  const currentDay = Math.max(1, devotional.currentDay || 1);
  const currentDayData = (devotional.days ?? []).find((day) => day.dayNumber === currentDay);
  if (currentDayData?.isRead) return currentDay;

  return getHighestReadDayNumber(devotional) ?? currentDay;
}

/**
 * Bridge text is an intro into today's unread reading, not a post-completion
 * teaser for tomorrow's locked content.
 */
export function getBridgeDayNumber(
  devotional: Devotional | null | undefined,
  hasReadToday: boolean,
  now = new Date(),
): number | null {
  if (!devotional || hasReadToday) return null;

  const todayReaderDayNumber = getTodayReaderDayNumber(devotional, now);
  if (todayReaderDayNumber <= 1) return null;

  const dayData = (devotional.days ?? []).find((day) => day.dayNumber === todayReaderDayNumber);
  if (!dayData || dayData.isRead) return null;

  return todayReaderDayNumber;
}
