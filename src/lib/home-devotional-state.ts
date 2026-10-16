import type { DayContext } from '@/constants/check-in-messages';
import type { Devotional, DevotionalDay } from '@/lib/store';
import type { PremiumAccessPolicy } from './premium-access-policy';
import { getCalendarDayNumber, getLockedTodayDayNumber, getLatestReadDayNumberToday } from './devotional-day-access';
import { getServerOwnedSeriesTotalDays } from './devotional-series-boundary';

export function localDayKey(date: Date): string {
  return date.toDateString();
}

export function localDayKeyFromIso(value: string | null | undefined): string | null {
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


/** Whether any day of any devotional was finished during the local today. */
export function hasReadAnyDayToday(devotionals: readonly Devotional[], now = new Date()): boolean {
  return devotionals.some((devotional) => getDaysReadToday(devotional, now).length > 0);
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

/**
 * The day the reader is on today: the day they finished today, otherwise the
 * day Today shows. Finishing a reading calls `advanceDay`, so `currentDay`
 * alone already points at tomorrow's material.
 */
export function getTodayDay(
  devotional: Devotional | null | undefined,
  now = new Date(),
): DevotionalDay | null {
  return getDaysReadToday(devotional, now)[0] ?? getHomeDevotionalDayData(devotional, now);
}

/**
 * The number of the day the reader is on today (getTodayDay), or
 * `currentDay` when that day is not on the device yet: then nothing was read
 * today, so `currentDay` has not moved past it. The widgets and the companion
 * request name today's day with this, so they cannot drift apart (APP-24).
 * Unlike getTodayReaderDayNumber, which picks the day the reading pane opens,
 * a day read today always comes first.
 */
export function getTodayDayNumber(
  devotional: Devotional | null | undefined,
  now = new Date(),
): number | undefined {
  return getTodayDay(devotional, now)?.dayNumber ?? devotional?.currentDay;
}

/**
 * The day the check-in copy should talk about.
 *
 * The day READ TODAY wins over whatever `currentDay` now points at. Finishing
 * a reading calls `advanceDay`, which moves `currentDay` to the next unread
 * day — so from that moment `currentDay` is TOMORROW's material. Copy drawn
 * from it would follow the reader into their afternoon talking about a day
 * they have not read yet, and would use tomorrow's companion nudge.
 *
 * The Today cards and the scheduled notifications both resolve their context
 * here, so "same copy, same day" holds for the context as well as the body.
 * Do not substitute the screen's own `currentDayData`: that deliberately
 * points at the next day for the rest of the home UI.
 *
 * The companion nudge is written for a banner some hours after the reading.
 * Before the reader finishes a day today, the context leaves it out, so the
 * midday card and the midday banner fall through to the day's other copy
 * instead of the closing words of a reading not yet read (V-03).
 */
export function getTodayDayContext(
  devotional: Devotional | null | undefined,
  now = new Date(),
): DayContext | null {
  const day = getTodayDay(devotional, now);
  if (!day) return null;
  return {
    title: day.title,
    scriptureReference: day.scriptureReference,
    quotableLine: day.quotableLine,
    checkInQuestion: day.checkInQuestion,
    act: day.act,
    eveningScriptureRef: day.eveningScriptureRef,
    companionNudge: getDaysReadToday(devotional, now).length > 0 ? day.companionNudge : undefined,
  };
}

/**
 * Today's companion nudge as the midday check-in copy carries it: the nudge
 * of the day finished today, or null before a read (getTodayDayContext). The
 * check-in fingerprint holds it next to the carry line, so a read that
 * brings the nudge rewrites today's banner even on a day with no carry line.
 */
export function getTodayCompanionNudge(
  devotionals: readonly Devotional[],
  currentDevotionalId: string | null | undefined,
  now = new Date(),
): string | null {
  const devotional = getCurrentDevotional(devotionals, currentDevotionalId);
  return getTodayDayContext(devotional, now)?.companionNudge?.trim() || null;
}
