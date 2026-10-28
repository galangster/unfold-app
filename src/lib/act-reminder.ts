/**
 * Act reminder — the day's one concrete "act" (e.g. "Tonight after your
 * toddler is down, sit in the quiet for two minutes…") comes back as a single
 * local one-shot notification at the moment it names. Pure planning lives
 * here; `useActReminderSync` owns the OS queue.
 *
 * Local-only by design: it works for every reader with permission, token or
 * not, and it never repeats — one act, one nudge, then silence.
 */
import type { PremiumAccessPolicy } from './premium-access-policy';
import type { Devotional, DevotionalDay, UserProfile } from './store';
import { truncateNotificationBody } from './daily-reminder-content';
import { getCurrentDevotional, getDaysReadToday, localDayKey, localDayKeyFromIso } from './home-devotional-state';
import { parseReminderClock } from './push-notification-helpers';
import { QUIET_HOURS } from './quiet-hours';

export const ACT_SLOTS = ['midday', 'evening', 'morning-next'] as const;
export type ActSlot = (typeof ACT_SLOTS)[number];

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

/** The act reminder last written to the OS. Once its time passes, it has fired. */
export interface ActReminderWrite {
  devotionalId: string;
  dayNumber: number;
  fireAt: string;
}

export interface ActReminderPlanInput {
  devotional: Devotional | null | undefined;
  day: DevotionalDay | null | undefined;
  now?: Date;
  /** The last written reminder. One that fired for this day stops a replan. */
  lastWrite?: ActReminderWrite | null;
  /** "HH:mm" store value for the midday check-in. */
  middayTime?: string | null;
  /** "HH:mm" store value for the evening wind-down. */
  eveningTime?: string | null;
  /** Master toggle for the evening wind-down check-in. */
  eveningWindDownEnabled?: boolean;
  /** Per-weekday wind-down times. null means every weekday uses eveningTime. */
  eveningWindDownByDay?: Record<string, string | null> | null;
  /** OS permission, from the sync owner at plan time. */
  notificationsEnabled?: boolean;
  /** Check-in slots only write when this is granted. */
  premiumPolicy?: PremiumAccessPolicy;
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

/** JS Date.getDay() (Sun=0) to the key `eveningWindDownByDay` is written with. */
const JS_DAY_TO_KEY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;

/**
 * Whether the evening wind-down check-in will write an occurrence at `fireAt`.
 * Mirrors the gates in `scheduleCheckInSlot` / `buildCheckInSchedule` for
 * today's evening slot only: permission, premium, master toggle, weekday,
 * and a still-ahead clock that matches the act reminder.
 */
function isEveningWindDownScheduledAt(
  fireAt: Date,
  now: Date,
  {
    eveningWindDownEnabled,
    eveningWindDownByDay,
    eveningTime,
    notificationsEnabled,
    premiumPolicy,
  }: Pick<
    ActReminderPlanInput,
    | 'eveningWindDownEnabled'
    | 'eveningWindDownByDay'
    | 'eveningTime'
    | 'notificationsEnabled'
    | 'premiumPolicy'
  >,
): boolean {
  if (!notificationsEnabled) return false;
  if (premiumPolicy !== 'granted') return false;
  if (!eveningWindDownEnabled) return false;
  const time =
    eveningWindDownByDay == null
      ? (eveningTime || '20:30')
      : eveningWindDownByDay[JS_DAY_TO_KEY[fireAt.getDay()]];
  if (time == null) return false;
  const windDownAt = atClock(fireAt, parseReminderClock(time, DEFAULT_EVENING));
  if (windDownAt.getTime() <= now.getTime()) return false;
  return windDownAt.getTime() === fireAt.getTime();
}

/**
 * Whether the midday slot was far enough out when the day was read. Counted
 * from the read, not from now, so a replan later in the morning keeps the
 * slot the first plan chose, and the check-in claim agrees with the planner.
 */
function middayLeadMet(midday: Date, readAt: string | undefined): boolean {
  return midday.getTime() >= Date.parse(readAt ?? '') + MIN_LEAD_MS;
}

/**
 * Picks the fire time for a slot, or null when the moment has passed for
 * good (a midnight nudge helps nobody). `readAt` anchors the midday lead.
 */
export function getActReminderFireAt(
  slot: ActSlot,
  now: Date,
  clocks: { midday: { hour: number; minute: number }; evening: { hour: number; minute: number }; morning: { hour: number; minute: number } },
  readAt?: string,
): Date | null {
  const earliest = new Date(now.getTime() + MIN_LEAD_MS);
  if (slot === 'morning-next') {
    return atClock(now, clocks.morning, 1);
  }
  if (slot === 'midday') {
    const midday = atClock(now, clocks.midday);
    const leadMet = readAt ? middayLeadMet(midday, readAt) : midday >= earliest;
    if (leadMet && midday > now) return midday;
    // Missed midday: fall through to the evening slot.
  }
  const evening = atClock(now, clocks.evening);
  if (evening >= earliest) return evening;
  const cutoff = atClock(now, { hour: LATE_EVENING_CUTOFF_HOUR, minute: 0 });
  const late = new Date(now.getTime() + LATE_EVENING_DELAY_MS);
  return late <= cutoff ? late : null;
}

/** The store fields that pick the act reminder's day and switch it on. */
export interface ActReminderStoreSlice {
  devotionals: readonly Devotional[];
  currentDevotionalId: string | null;
  user: Pick<UserProfile, 'dailyReminderEnabled' | 'reminderTime'> | null;
  middayCheckInTime?: string | null;
}

// Rides on the daily-reminder preference: a reader who switched reminders
// off asked for silence, not a new kind of nudge.
function actRemindersEnabled(user: ActReminderStoreSlice['user']): boolean {
  return user?.dailyReminderEnabled ?? Boolean(user?.reminderTime);
}

/** The day the act reminder belongs to, and whether the reader wants it. */
export function readActReminderDay(state: ActReminderStoreSlice, now = new Date()): {
  devotional: Devotional | undefined;
  day: DevotionalDay | null;
  enabled: boolean;
} {
  const devotional = getCurrentDevotional(state.devotionals, state.currentDevotionalId);
  return {
    devotional,
    day: getDaysReadToday(devotional, now)[0] ?? null,
    enabled: actRemindersEnabled(state.user),
  };
}

/** The act to remind about: read today, not yet done. Null otherwise. */
function actToRemind(day: DevotionalDay, now: Date): string | null {
  const act = day.act?.trim();
  if (!act || !day.isRead || day.actOutcome) return null;
  return localDayKeyFromIso(day.readAt) === localDayKey(now) ? act : null;
}

/**
 * The midday instant today's act reminder takes from the midday check-in, or
 * null. One banner per moment: the act is the day's one thing and its tap
 * opens what it names, so today's check-in steps aside, as it does for the
 * trial notice. (At evening the wind-down carries the act instead.)
 *
 * Shares the planner's midday lead, counted from the read: a midday act read
 * too late rolls to the evening and leaves the check-in alone, and the claim
 * stays fixed for the day. While the act reminder write is failing, the slot
 * goes back to the check-in, so the reader still gets one banner.
 */
export function getMiddayActClaim(state: ActReminderStoreSlice, now = new Date(), actWriteFailed = false): Date | null {
  if (actWriteFailed || !actRemindersEnabled(state.user)) return null;
  const { day } = readActReminderDay(state, now);
  const act = day ? actToRemind(day, now) : null;
  if (!day || !act || inferActSlot(act, day.actSlot) !== 'midday') return null;
  const midday = atClock(now, parseReminderClock(state.middayCheckInTime, DEFAULT_MIDDAY));
  return middayLeadMet(midday, day.readAt) ? midday : null;
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
  eveningWindDownEnabled,
  eveningWindDownByDay,
  notificationsEnabled,
  premiumPolicy,
  morningTime,
  lastWrite,
}: ActReminderPlanInput): ActReminderPlan | null {
  if (!devotional || !day) return null;
  const act = actToRemind(day, now);
  if (!act) return null;
  // One nudge, then silence: a reminder for this day already fired, so a
  // later replan (timezone, settings) adds no second one. A write that failed
  // or was cancelled before its time leaves no fired record.
  if (
    lastWrite
    && lastWrite.devotionalId === devotional.id
    && lastWrite.dayNumber === day.dayNumber
    && Date.parse(lastWrite.fireAt) <= now.getTime()
  ) {
    return null;
  }

  const slot = inferActSlot(act, day.actSlot);
  const fireAt = getActReminderFireAt(slot, now, {
    midday: parseReminderClock(middayTime, DEFAULT_MIDDAY),
    evening: parseReminderClock(eveningTime, DEFAULT_EVENING),
    morning: parseReminderClock(morningTime, DEFAULT_MORNING),
  }, day.readAt);
  if (!fireAt) return null;
  // The wind-down body already carries the act. Two banners at the same
  // instant is the collision. A missed midday that rolled into the evening
  // clock collides the same way, so the guard keys off the fire time, not
  // the slot name. Morning-next never matches an evening clock.
  if (
    isEveningWindDownScheduledAt(fireAt, now, {
      eveningWindDownEnabled,
      eveningWindDownByDay,
      eveningTime,
      notificationsEnabled,
      premiumPolicy,
    })
  ) {
    return null;
  }

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
    input.eveningWindDownEnabled ? '1' : '0',
    input.eveningWindDownByDay ?? null,
    input.notificationsEnabled ? '1' : '0',
    input.premiumPolicy ?? '',
    input.morningTime ?? '',
  ]);
}
