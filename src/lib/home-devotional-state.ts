import type { Devotional, DevotionalDay } from '@/lib/store';
import type { PremiumAccessPolicy } from './premium-access-policy';
import { getLockedTodayDayNumber, getLatestReadDayNumberToday } from './devotional-day-access';

const DAY_MS = 24 * 60 * 60 * 1000;

export function getCurrentDevotional(
  devotionals: readonly Devotional[],
  currentDevotionalId: string | null | undefined,
): Devotional | undefined {
  if (!currentDevotionalId) return undefined;
  return devotionals.find((devotional) => devotional.id === currentDevotionalId);
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

  const today = now.toDateString();
  return devotional.days.some((day) => (
    day.isRead
    && day.readAt
    && new Date(day.readAt).toDateString() === today
  ));
}

export function shouldPrepareCurrentDevotionalDay(
  devotional: Devotional | undefined,
  now = new Date(),
): boolean {
  if (!devotional || devotional.generationMode !== 'progressive') return false;

  const dayExists = (devotional.days ?? []).some((day) => day.dayNumber === devotional.currentDay);
  if (dayExists) return false;

  if (devotional.seriesStartDate) {
    const startDate = new Date(devotional.seriesStartDate);
    const startDay = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate());
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const calendarDay = Math.floor((today.getTime() - startDay.getTime()) / DAY_MS) + 1;
    if (devotional.currentDay > calendarDay) return false;
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
