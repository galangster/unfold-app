/**
 * Act reminder — the day's one concrete "act" (e.g. "Tonight after your
 * toddler is down, sit in the quiet for two minutes…") comes back as a single
 * local one-shot notification at the moment it names. Pure planning lives
 * here; `useActReminderSync` owns the OS queue.
 *
 * Local-only by design: it works for every reader with permission, token or
 * not, and it never repeats — one act, one nudge, then silence.
 */
import type { Devotional, DevotionalDay } from './store';
import { truncateNotificationBody } from './daily-reminder-content';
import { localDayKey, localDayKeyFromIso } from './home-devotional-state';
import { parseReminderClock } from './push-notification-helpers';
import { QUIET_HOURS } from './quiet-hours';

export type ActSlot = 'midday' | 'evening' | 'morning-next';

export interface ActReminderData extends Record<string, unknown> {
  type: 'act_reminder';
  devotionalId: string;
  dayNumber: number;
  dayTitle: string;
  seriesTitle: string;
  slot: ActSlot;
}

export interface ActReminderPlan {
  fireAt: Date;
  slot: ActSlot;
  title: string;
  body: string;
  data: ActReminderData;
}

export interface ActReminderPlanInput {
  devotional: Devotional | null | undefined;
  day: DevotionalDay | null | undefined;
  now?: Date;
  /** "HH:mm" store value for the midday check-in. */
  middayTime?: string | null;
  /** "HH:mm" store value for the evening wind-down. */
  eveningTime?: string | null;
  /** "h:mm AM" reminder time from the profile. */
  morningTime?: string | null;
}

const DEFAULT_MIDDAY = { hour: 12, minute: 30 };
const DEFAULT_EVENING = { hour: 20, minute: 30 };
const DEFAULT_MORNING = { hour: 8, minute: 0 };
/** Fire at least this far out so the reader is not pinged mid-read. */
const MIN_LEAD_MS = 15 * 60_000;
/** A passed evening slot still gets a nudge this far out, until the cutoff. */
const LATE_EVENING_DELAY_MS = 45 * 60_000;
const LATE_EVENING_CUTOFF_HOUR = QUIET_HOURS.startHour;

const MORNING_NEXT_PATTERNS = [
  /\btomorrow\b/i,
  /\bnext morning\b/i,
  /\bwhen you wake\b/i,
  /\bfirst thing\b/i,
  /\bbefore work\b/i,
];
const MIDDAY_PATTERNS = [
  /\blunch\b/i,
  /\bmidday\b/i,
  /\bnoon\b/i,
  /\bthis afternoon\b/i,
  /\bafternoon\b/i,
  /\bduring your (commute|drive|break)\b/i,
];

/**
 * When the act asks to be done. Generation may name the slot outright
 * (`day.actSlot`); older days only name a window in the act text
 * ("tonight", "this afternoon", "tomorrow morning"), so the regex fallback
 * stays until every day carries the field. Evening is the default because
 * most acts land after the day's obligations.
 */
export function inferActSlot(act: string, generatedSlot?: ActSlot | null): ActSlot {
  if (generatedSlot) return generatedSlot;
  if (MORNING_NEXT_PATTERNS.some((pattern) => pattern.test(act))) return 'morning-next';
  if (MIDDAY_PATTERNS.some((pattern) => pattern.test(act))) return 'midday';
  return 'evening';
}


function atClock(base: Date, clock: { hour: number; minute: number }, dayOffset = 0): Date {
  const date = new Date(base);
  date.setDate(date.getDate() + dayOffset);
  date.setHours(clock.hour, clock.minute, 0, 0);
  return date;
}

/**
 * Picks the fire time for a slot, or null when the moment has passed for
 * good (a midnight nudge helps nobody).
 */
export function getActReminderFireAt(
  slot: ActSlot,
  now: Date,
  clocks: { midday: { hour: number; minute: number }; evening: { hour: number; minute: number }; morning: { hour: number; minute: number } },
): Date | null {
  const earliest = new Date(now.getTime() + MIN_LEAD_MS);
  if (slot === 'morning-next') {
    return atClock(now, clocks.morning, 1);
  }
  if (slot === 'midday') {
    const midday = atClock(now, clocks.midday);
    if (midday >= earliest) return midday;
    // Missed midday: fall through to the evening slot.
  }
  const evening = atClock(now, clocks.evening);
  if (evening >= earliest) return evening;
  const cutoff = atClock(now, { hour: LATE_EVENING_CUTOFF_HOUR, minute: 0 });
  const late = new Date(now.getTime() + LATE_EVENING_DELAY_MS);
  return late <= cutoff ? late : null;
}

/**
 * The reminder for the day the reader finished today, or null when there is
 * nothing to remind about: no act, day not read today, outcome already
 * recorded, or the moment has passed.
 */
export function buildActReminderPlan({
  devotional,
  day,
  now = new Date(),
  middayTime,
  eveningTime,
  morningTime,
}: ActReminderPlanInput): ActReminderPlan | null {
  if (!devotional || !day) return null;
  const act = day.act?.trim();
  if (!act || !day.isRead || day.actOutcome) return null;
  if (localDayKeyFromIso(day.readAt) !== localDayKey(now)) return null;

  const slot = inferActSlot(act, day.actSlot);
  const fireAt = getActReminderFireAt(slot, now, {
    midday: parseReminderClock(middayTime, DEFAULT_MIDDAY),
    evening: parseReminderClock(eveningTime, DEFAULT_EVENING),
    morning: parseReminderClock(morningTime, DEFAULT_MORNING),
  });
  if (!fireAt) return null;

  return {
    fireAt,
    slot,
    title: day.title,
    body: truncateNotificationBody(act),
    data: {
      type: 'act_reminder',
      devotionalId: devotional.id,
      dayNumber: day.dayNumber,
      dayTitle: day.title,
      seriesTitle: devotional.title,
      slot,
    },
  };
}

/** Fingerprint of every input that changes the plan. */
export function buildActReminderFingerprint(input: ActReminderPlanInput & { enabled: boolean }): string {
  const { devotional, day } = input;
  return JSON.stringify([
    input.enabled ? '1' : '0',
    devotional?.id ?? '',
    day?.dayNumber ?? '',
    day?.readAt ?? '',
    day?.act ?? '',
    day?.actSlot ?? '',
    day?.actOutcome ?? '',
    input.middayTime ?? '',
    input.eveningTime ?? '',
    input.morningTime ?? '',
  ]);
}
