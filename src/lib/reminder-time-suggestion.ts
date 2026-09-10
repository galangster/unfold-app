/**
 * Suggests a reminder time from when the reader actually reads. Pure; the
 * settings screen shows it as an offer, never applies it on its own.
 */
import type { Devotional } from './store';
import { parseReminderClock } from './push-notification-helpers';
import { formatReminderTime } from './format-reminder-time';

export interface ReminderTimeSuggestion {
  /** "h:mm AM" like the rest of the reminder settings. */
  suggested: string;
  medianMinutes: number;
  sampleSize: number;
}

export interface ReminderTimeSuggestionInput {
  devotionals: readonly Devotional[];
  currentReminderTime: string | null | undefined;
  now?: Date;
  windowDays?: number;
  minReads?: number;
  /** Only suggest when the median differs from the current time by at least this much. */
  minDeltaMinutes?: number;
  /** A suggestion the reader already turned down. */
  dismissed?: string | null;
}

/** Minutes of day → the settings' "h:mm AM" display form. */
export function formatClockAsReminderTime(minutesOfDay: number): string {
  const hour24 = Math.floor(minutesOfDay / 60) % 24;
  const minute = minutesOfDay % 60;
  return formatReminderTime(`${String(hour24).padStart(2, '0')}:${String(minute).padStart(2, '0')}`);
}

function roundToQuarter(minutes: number): number {
  return Math.round(minutes / 15) * 15;
}

export function suggestReminderTime({
  devotionals,
  currentReminderTime,
  now = new Date(),
  windowDays = 14,
  minReads = 5,
  minDeltaMinutes = 45,
  dismissed,
}: ReminderTimeSuggestionInput): ReminderTimeSuggestion | null {
  const since = now.getTime() - windowDays * 24 * 60 * 60_000;
  const readMinutes: number[] = [];
  for (const devotional of devotionals) {
    for (const day of devotional.days) {
      if (!day.isRead || !day.readAt) continue;
      const readAt = new Date(day.readAt);
      const t = readAt.getTime();
      if (Number.isNaN(t) || t < since || t > now.getTime()) continue;
      readMinutes.push(readAt.getHours() * 60 + readAt.getMinutes());
    }
  }
  if (readMinutes.length < minReads) return null;

  readMinutes.sort((a, b) => a - b);
  const mid = Math.floor(readMinutes.length / 2);
  const median = readMinutes.length % 2 === 0
    ? Math.round((readMinutes[mid - 1] + readMinutes[mid]) / 2)
    : readMinutes[mid];
  const rounded = roundToQuarter(median) % (24 * 60);

  const current = parseReminderClock(currentReminderTime);
  if (Math.abs(current.hour * 60 + current.minute - rounded) < minDeltaMinutes) return null;

  const suggested = formatClockAsReminderTime(rounded);
  if (dismissed && dismissed === suggested) return null;
  return { suggested, medianMinutes: rounded, sampleSize: readMinutes.length };
}
