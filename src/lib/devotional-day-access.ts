import type { Devotional } from './store';
import {
  getHighestContiguousRenderableDayNumber,
  selectRenderableDevotionalDay,
} from './devotional-canonical-days';

function isSameLocalDate(value: string | undefined, now: Date): boolean {
  if (!value) return false;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return false;
  return parsed.toDateString() === now.toDateString();
}

export function getCalendarDayNumber(
  devotional: Devotional | null | undefined,
  now = new Date(),
): number | null {
  if (!devotional?.seriesStartDate) return null;

  const startDate = new Date(devotional.seriesStartDate);
  if (Number.isNaN(startDate.getTime())) return null;

  const startDay = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate());
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const dayNumber = Math.floor((today.getTime() - startDay.getTime()) / (24 * 60 * 60 * 1000)) + 1;

  return Math.max(1, dayNumber);
}

function isCurrentDayAfterCalendarDay(
  devotional: Devotional,
  now = new Date(),
): boolean {
  const calendarDayNumber = getCalendarDayNumber(devotional, now);
  if (calendarDayNumber == null) return true;
  return devotional.currentDay > calendarDayNumber;
}

export function getLatestReadDayNumberToday(
  devotional: Devotional | null | undefined,
  now = new Date(),
): number | null {
  if (!devotional) return null;

  const readToday = (devotional.days ?? [])
    .filter((day) => day.isRead && isSameLocalDate(day.readAt, now))
    .map((day) => day.dayNumber);

  return readToday.length > 0 ? Math.max(...readToday) : null;
}

export function getLockedTodayDayNumber(
  devotional: Devotional | null | undefined,
  now = new Date(),
): number | null {
  if (!devotional) return null;

  const latestReadToday = getLatestReadDayNumberToday(devotional, now);
  if (latestReadToday == null) return null;

  const currentDay = devotional.days?.find((day) => day.dayNumber === devotional.currentDay);
  const currentDayIsTomorrowCandidate = devotional.currentDay > latestReadToday && !currentDay?.isRead;

  return currentDayIsTomorrowCandidate && isCurrentDayAfterCalendarDay(devotional, now) ? latestReadToday : null;
}

export function getTodayReaderDayNumber(
  devotional: Devotional | null | undefined,
  now = new Date(),
): number {
  if (!devotional) return 1;
  return getLockedTodayDayNumber(devotional, now) ?? Math.max(1, devotional.currentDay || 1);
}

export function getSelectableDayLimit(
  devotional: Devotional | null | undefined,
  now = new Date(),
): number {
  if (!devotional) return 0;

  const highestRenderableDay = getHighestContiguousRenderableDayNumber(devotional);
  const lockedTodayDayNumber = getLockedTodayDayNumber(devotional, now);

  if (lockedTodayDayNumber != null) {
    return Math.min(lockedTodayDayNumber, Math.max(highestRenderableDay, lockedTodayDayNumber));
  }

  return Math.min(Math.max(1, devotional.currentDay || 1), highestRenderableDay);
}

export function isDevotionalDaySelectable(
  devotional: Devotional | null | undefined,
  dayNumber: number,
  now = new Date(),
): boolean {
  if (!devotional || dayNumber < 1) return false;
  if (dayNumber > getSelectableDayLimit(devotional, now)) return false;
  return selectRenderableDevotionalDay(devotional, dayNumber).status === 'ready';
}

export function resolveInitialReadingDayNumber(
  devotional: Devotional | null | undefined,
  requestedDayNumber: number | null | undefined,
  now = new Date(),
): number {
  const requested = requestedDayNumber && requestedDayNumber > 0 ? requestedDayNumber : null;
  if (!devotional) return requested ?? 1;

  const lockedTodayDayNumber = getLockedTodayDayNumber(devotional, now);
  if (lockedTodayDayNumber != null) {
    const target = requested ?? devotional.currentDay;
    return target > lockedTodayDayNumber ? lockedTodayDayNumber : Math.max(1, target);
  }

  if (requested) return requested;

  const currentDay = Math.max(1, devotional.currentDay || 1);
  const currentDayIsRenderable = selectRenderableDevotionalDay(devotional, currentDay).status === 'ready';
  if (currentDayIsRenderable) return currentDay;

  return devotional.days.length > 0 ? devotional.days.length : currentDay;
}
