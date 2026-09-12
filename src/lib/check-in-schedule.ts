/**
 * When the midday check-in and the evening wind-down fire.
 *
 * ## Why these are pre-rolled dates and not a repeating trigger
 *
 * expo/iOS bakes a notification's copy into the OS queue at SCHEDULE time.
 * A DAILY trigger therefore fires the same sentence every day, forever,
 * until something foregrounds the app and rewrites it. That made the copy
 * chain above this layer mostly decorative: a reader who stopped opening
 * Unfold got one sentence on a loop — often "Still thinking about <a day
 * title from three weeks ago>?" — from the exact channel meant to bring them
 * back. Per-day (WEEKLY) mode was worse: only the weekday that happened to
 * fire on sync day carried real copy, and the other six shared one generic
 * string.
 *
 * So this builder emits one dated occurrence per day across a short horizon,
 * and the caller gives each its own copy for the day it actually lands on.
 * `useCheckInNotifications` tops the queue back up on every foreground, so in
 * normal use the horizon never drains.
 *
 * The trade this accepts: a reader who does not open the app for
 * PRE_ROLL_DAYS stops receiving local check-ins, where before they received
 * a repeat. That is deliberate. Check-ins are premium-only, the server owns
 * the lapsed-reader path (backend lib/lapse-reentry.ts), and a fortnight of
 * identical banners is how an app gets its notifications switched off.
 *
 * DO NOT RAISE THIS NUMBER TO "FIX" THE DRAIN. 14 was ruled over 21 on
 * 2026-09-12: days 15-21 recover almost nobody (such a reader has already
 * ignored a fortnight of banners, the morning reminder, and a server
 * re-entry push), and the extra 14 pending slots would eat headroom that
 * protects the trial-ending notice. iOS keeps only the 64 soonest pending
 * requests, nothing in this app enforces a shared budget, and a dropped
 * trial notice means a surprise charge. The real fix for the drain is a
 * background top-up, not a longer horizon.
 *
 * ## Sizing the horizon
 *
 * iOS keeps only the 64 soonest pending local notifications per app and
 * silently drops the rest. Two slots across 14 days is at most 28, alongside
 * the daily reminder, one act reminder and one trial notice — comfortably
 * inside the cap with room for both slots to grow.
 *
 * One consequence of dated occurrences: they are absolute instants, so a
 * reader who changes timezone keeps the old local times until the schedule is
 * rewritten. The retired DAILY trigger fired on clock-time components and
 * never drifted. `useCheckInNotifications` carries the device timezone in its
 * fingerprint for exactly this reason — without it the foreground reconcile
 * hits its own skip gate (same fingerprint, same wall-clock day) and never
 * rewrites.
 *
 * This module is pure: no expo, no store, no clock of its own. Everything it
 * needs arrives as an argument so the whole schedule is testable directly.
 */

import { parseHhMm } from '@/lib/push-notification-helpers';
import { parseLocalYmd } from '@/lib/trial-notice-plan';
import { dayIndexFor } from '@/lib/variation-bag';

/** How many days ahead to pre-roll. See "Sizing the horizon" above. */
export const PRE_ROLL_DAYS = 14;

export const CHECKIN_DAY_KEYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;
export type CheckInDayKey = (typeof CHECKIN_DAY_KEYS)[number];

/** JS Date.getDay() (Sun=0) to the key `byDay` maps are written with. */
const JS_DAY_TO_KEY: CheckInDayKey[] = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export interface CheckInOccurrence {
  /** Stable within one build: `${idBase}-0` upward in chronological order. */
  id: string;
  /** Exact local moment this occurrence fires. */
  date: Date;
  /** Local day number of `date`, for drawing that day's copy. */
  dayIndex: number;
}

export interface BuildCheckInScheduleArgs {
  idBase: string;
  /** "HH:mm" used on every day in uniform mode. */
  defaultTime: string;
  /** Per-weekday times, or null for uniform. null/absent value = skip day. */
  byDay: Record<string, string | null> | null;
  fallback: { hour: number; minute: number };
  /** Local "YYYY-MM-DD" the trial flow asked to leave empty, if any. */
  skipLocalDate?: string | null;
  now: Date;
  horizonDays?: number;
}

/**
 * The dated occurrences to install, soonest first.
 *
 * A day is included when its weekday is enabled, it is not the skipped date,
 * and its fire time is still ahead of `now` — so a sync at 14:00 does not try
 * to schedule today's 12:30 slot in the past.
 *
 * Returns an empty array when every day is disabled. That is a valid outcome,
 * not an error.
 */
export function buildCheckInSchedule({
  idBase,
  defaultTime,
  byDay,
  fallback,
  skipLocalDate,
  now,
  horizonDays = PRE_ROLL_DAYS,
}: BuildCheckInScheduleArgs): CheckInOccurrence[] {
  const occurrences: CheckInOccurrence[] = [];
  // trial-notice-plan writes the skip date; parse it back with that module's
  // own reader rather than re-deriving its string form for all 14 days.
  const skipDay = skipLocalDate ? parseLocalYmd(skipLocalDate) : null;
  const skipDayIndex = skipDay ? dayIndexFor(skipDay) : null;

  for (let offset = 0; offset < horizonDays; offset += 1) {
    const day = new Date(now.getFullYear(), now.getMonth(), now.getDate() + offset);
    if (skipDayIndex !== null && dayIndexFor(day) === skipDayIndex) continue;

    const time = byDay === null ? defaultTime : byDay[JS_DAY_TO_KEY[day.getDay()]];
    if (time === undefined || time === null) continue;

    const { hour, minute } = parseHhMm(time, fallback);
    const fireAt = new Date(day);
    fireAt.setHours(hour, minute, 0, 0);
    if (fireAt.getTime() <= now.getTime()) continue;

    occurrences.push({
      id: `${idBase}-${occurrences.length}`,
      date: fireAt,
      dayIndex: dayIndexFor(fireAt),
    });
  }

  return occurrences;
}

/**
 * Every identifier a check-in slot could hold, so the cancel-then-write path
 * can clear the queue exactly. Cancelling an absent identifier is a no-op.
 *
 * Always covers the full PRE_ROLL_DAYS space rather than the count a given
 * build happens to have written. It takes no horizon argument on purpose: a
 * second default here could drift from the builder's, and a caller that
 * shortened one but not the other would orphan the difference.
 *
 * Includes the identifiers of the RETIRED repeating schedule — the bare
 * `idBase` DAILY, the seven weekday WEEKLY ids, and the trial `-resume`
 * one-off. An install upgrading from that build still has them pending, and
 * leaving them would fire the old frozen copy alongside the new dated
 * occurrences. Keep them here until no install can still be carrying one.
 */
export function getAllCheckInIdentifiers(idBase: string): string[] {
  return [
    ...Array.from({ length: PRE_ROLL_DAYS }, (_, index) => `${idBase}-${index}`),
    idBase,
    ...CHECKIN_DAY_KEYS.map((day) => `${idBase}-${day.toLowerCase()}`),
    `${idBase}-resume`,
  ];
}
