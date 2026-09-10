import type { Devotional, DevotionalDay } from '@/lib/store';
import type { PremiumAccessPolicy } from './premium-access-policy';
import { getCalendarDayNumber, getLockedTodayDayNumber, getLatestReadDayNumberToday } from './devotional-day-access';
import { getServerOwnedSeriesTotalDays } from './devotional-series-boundary';

function localDayKey(date: Date): string {
  return date.toDateString();
}

function localDayKeyFromIso(value: string | null | undefined): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return localDayKey(date);
}

export function hasReadTodayGlobal({
  streakLastReadDate,
  now = new Date(),
}: {
  streakLastReadDate: string | null | undefined;
  now?: Date;
}): boolean {
  return localDayKeyFromIso(streakLastReadDate) === localDayKey(now);
}

export function getCurrentDevotional(
  devotionals: readonly Devotional[],
  currentDevotionalId: string | null | undefined,
): Devotional | undefined {
  if (!currentDevotionalId) return undefined;
  return devotionals.find((devotional) => devotional.id === currentDevotionalId);
}

/**
 * The carry line for today's midday check-in notification: the recall line
 * from the day the reader completed TODAY (the line they met this morning,
 * surfacing again at 3pm). Null when the reader hasn't read today or the day
 * carries no line — callers fall back to the rotating generic copy, so a
 * stale line is never shown on a day the reader didn't actually read.
 */
/**
 * Days the reader finished today, latest day number first.
 */
export function getDaysReadToday(
  devotional: Devotional | null | undefined,
  now = new Date(),
): DevotionalDay[] {
  if (!devotional) return [];
  const todayKey = localDayKey(now);
  return devotional.days
    .filter((day) => day.isRead && localDayKeyFromIso(day.readAt) === todayKey)
    .sort((a, b) => b.dayNumber - a.dayNumber);
}

export function getTodayCarryLine(
  devotionals: readonly Devotional[],
  currentDevotionalId: string | null | undefined,
  now = new Date(),
): string | null {
  const devotional = getCurrentDevotional(devotionals, currentDevotionalId);
  const line = getDaysReadToday(devotional, now)
    .find((day) => typeof day.carryLine === 'string' && day.carryLine.trim().length > 0)
    ?.carryLine?.trim();
  return line || null;
}

export function getHomeDevotionalDayData(
  devotional: Devotional | null | undefined,
  now = new Date(),
): DevotionalDay | null {
  if (!devotional) return null;

  const lockedTodayDayNumber = getLockedTodayDayNumber(devotional, now);
  if (lockedTodayDayNumber != null) {
    return devotional.days.find((day) => day.dayNumber === lockedTodayDayNumber) ?? null;
  }

  const currentDayData = devotional.days.find((day) => day.dayNumber === devotional.currentDay);
  if (currentDayData) return currentDayData;

  const latestReadToday = getLatestReadDayNumberToday(devotional, now);
  if (latestReadToday != null) {
    return devotional.days.find((day) => day.dayNumber === latestReadToday) ?? null;
  }

  return null;
}

export function hasReadDevotionalToday({
  devotionals,
  currentDevotionalId,
  now = new Date(),
}: {
  devotionals: readonly Devotional[];
  currentDevotionalId: string | null | undefined;
  now?: Date;
}): boolean {
  const devotional = getCurrentDevotional(devotionals, currentDevotionalId);
  if (!devotional) return false;

  const today = localDayKey(now);
  return devotional.days.some((day) => (
    day.isRead
    && day.readAt
    && localDayKeyFromIso(day.readAt) === today
  ));
}

export function shouldPrepareCurrentDevotionalDay(
  devotional: Devotional | undefined,
  now = new Date(),
): boolean {
  if (!devotional || devotional.generationMode !== 'progressive') return false;

  const seriesTotalDays = getServerOwnedSeriesTotalDays(devotional);
  if (seriesTotalDays > 0 && devotional.currentDay > seriesTotalDays) return false;

  const dayExists = (devotional.days ?? []).some((day) => day.dayNumber === devotional.currentDay);
  if (dayExists) return false;

  if (devotional.seriesStartDate) {
    const calendarDay = getCalendarDayNumber(devotional, now);
    if (calendarDay != null && devotional.currentDay > calendarDay) return false;
  }

  return true;
}

export function shouldAutoPrepareCurrentDevotionalDay(
  devotional: Devotional | undefined,
  premiumPolicy: PremiumAccessPolicy,
  now = new Date(),
): boolean {
  if (premiumPolicy !== 'granted') return false;
  return shouldPrepareCurrentDevotionalDay(devotional, now);
}
