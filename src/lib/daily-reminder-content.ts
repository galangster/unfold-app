import { getReadingDayLabel } from './devotional-day-access';
import { getServerOwnedSeriesTotalDays } from './devotional-series-boundary';
import type { PremiumAccessPolicy } from './premium-access-policy';
import type { Devotional, DevotionalDay } from './store';

export interface DailyReminderContentInput {
  currentDevotional: Devotional | null | undefined;
  premiumPolicy: PremiumAccessPolicy;
  now?: Date;
}

export interface DailyReminderFingerprintInput {
  reminderTime?: string | null;
  dailyReminderEnabled?: boolean;
  currentDevotional: Devotional | null | undefined;
  premiumPolicy: PremiumAccessPolicy;
  pushRegistered?: boolean;
  /** A read today changes the schedule (see buildDailyReminderSchedule). */
  readToday?: boolean;
}

export type DailyReminderOwner = 'local' | 'server';

export type DailyReminderTrigger =
  | { kind: 'daily' }
  | { kind: 'dates'; dates: Date[] };

/**
 * How many days ahead the morning reminder is pre-rolled. Same horizon as
 * the check-ins (check-in-schedule.ts), and the same budget: two check-in
 * slots plus this stay well inside the 64 pending requests iOS keeps, with
 * room for the act reminder and the trial-ending notice.
 */
export const DAILY_REMINDER_HORIZON_DAYS = 14;

export interface BuildDailyReminderScheduleArgs {
  clock: { hour: number; minute: number };
  owner: DailyReminderOwner;
  /** The reader finished a reading today, so today's slot stays quiet. */
  readToday: boolean;
  /** When the reader last finished a day of the current series, if ever. */
  lastReadAt: Date | null;
  now: Date;
  horizonDays?: number;
}

/**
 * The mornings the local reminder fires, soonest first: one dated request
 * per day, built the same way as the check-ins.
 *
 * A DAILY trigger cannot skip one occurrence, and a one-shot leaves nothing
 * behind once it fires. A dated horizon does both jobs: it skips today when
 * the reader already read (the reminder would otherwise announce a day the
 * app keeps locked until tomorrow), and every later morning stays queued
 * until an open or the BGAppRefresh task rolls it forward.
 *
 * When the server owns the slot, it owns one morning: the one on which the
 * day after the latest read opens, which its ready push takes. Every other
 * morning stays local, so one ignored push no longer silences the reminder.
 * That morning is anchored to the read, not to `now`, so a refill two days
 * later keeps today.
 */
export function buildDailyReminderSchedule({
  clock,
  owner,
  readToday,
  lastReadAt,
  now,
  horizonDays = DAILY_REMINDER_HORIZON_DAYS,
}: BuildDailyReminderScheduleArgs): Date[] {
  const serverMorning = owner === 'server' && lastReadAt
    ? new Date(lastReadAt.getFullYear(), lastReadAt.getMonth(), lastReadAt.getDate() + 1).toDateString()
    : null;
  const dates: Date[] = [];

  for (let offset = 0; offset < horizonDays; offset += 1) {
    const fireAt = new Date(now.getFullYear(), now.getMonth(), now.getDate() + offset);
    fireAt.setHours(clock.hour, clock.minute, 0, 0);
    if (fireAt.getTime() <= now.getTime()) continue;
    if (offset === 0 && readToday) continue;
    if (fireAt.toDateString() === serverMorning) continue;
    dates.push(fireAt);
  }

  return dates;
}

export interface DailyReminderOwnerInput {
  currentDevotional: Devotional | null | undefined;
  premiumPolicy: PremiumAccessPolicy;
  /** The backend holds an Expo push token for this device. */
  pushRegistered: boolean;
}

/**
 * Who fires the morning the next day opens.
 *
 * A local reminder bakes its copy at schedule time. When the next day is not
 * on the device yet (the normal bedtime state for a progressive series) that
 * copy can only say "your next reading is waiting". The server generates
 * that day overnight and knows its quotable line, so when it can reach the
 * device its ready push takes that one morning. The server pushes only when
 * a day finishes generating, so every later morning stays local
 * (buildDailyReminderSchedule): the local queue is the only guaranteed
 * channel, and its copy is specific whenever the day is already on device.
 */
export function getDailyReminderOwner({
  currentDevotional,
  premiumPolicy,
  pushRegistered,
}: DailyReminderOwnerInput): DailyReminderOwner {
  if (!pushRegistered) return 'local';
  if (premiumPolicy !== 'granted') return 'local';
  if (!currentDevotional) return 'local';
  if (getCurrentReminderDay(currentDevotional)) return 'local';
  const nextDayNumber = Math.max(1, currentDevotional.currentDay || 1);
  const inSeries = nextDayNumber <= getServerOwnedSeriesTotalDays(currentDevotional);
  return inSeries ? 'server' : 'local';
}

export interface DailyReminderContent {
  title: string;
  body: string;
}

function getCurrentReminderDay(devotional: Devotional | null | undefined): DevotionalDay | null {
  if (!devotional) return null;
  return devotional.days.find((day) => day.dayNumber === devotional.currentDay) ?? null;
}

// iOS shows about four lines of body when the reader expands a banner and
// two when it is collapsed. 150 characters keeps a long "act" readable
// without the OS cutting it mid-sentence.
export const MAX_NOTIFICATION_BODY = 150;

/** Trims and cuts notification copy at a word boundary with an ellipsis. */
export function truncateNotificationBody(text: string, max = MAX_NOTIFICATION_BODY): string {
  const trimmed = text.trim();
  if (trimmed.length <= max) return trimmed;
  const cut = trimmed.slice(0, max - 1);
  const lastSpace = cut.lastIndexOf(' ');
  return `${(lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut).replace(/[,;:\s]+$/, '')}…`;
}

function truncateBody(text: string, maxLength = 100): string {
  return truncateNotificationBody(text, maxLength);
}

export function getDailyReminderContent({
  currentDevotional,
  premiumPolicy,
  now = new Date(),
}: DailyReminderContentInput): DailyReminderContent {
  const currentDay = getCurrentReminderDay(currentDevotional);

  // No active devotional
  if (!currentDevotional) {
    if (premiumPolicy === 'denied') {
      return {
        title: 'Your Bible rhythm is still here',
        body: 'Open scripture today, or renew Premium when you’re ready for another personal reading.',
      };
    }

    return {
      title: 'Ready for something new?',
      body: 'Start your next study when you\'re ready.',
    };
  }

  // Existing generated readings should remain specific and useful. Churned users
  // may still have a readable day in their local store; the misleading case is
  // a missing next day, not already-generated content.
  if (currentDay) {
    const isOverdue = getReadingDayLabel(currentDevotional, currentDay, now) === 'Overdue';

    if (isOverdue) {
      return {
        title: 'Pick up where you left off',
        body: `Day ${currentDay.dayNumber} of ${currentDevotional.title} is waiting for you.`,
      };
    }

    if (currentDay.quotableLine) {
      return {
        title: currentDay.title,
        body: truncateBody(currentDay.quotableLine),
      };
    }

    if (currentDay.scriptureReference) {
      return {
        title: currentDay.title,
        body: `Today's reading: ${currentDay.scriptureReference}`,
      };
    }

    return { title: currentDay.title, body: 'Your next reading is waiting.' };
  }

  // Premium-denied users should never see generation or "next day is being
  // prepared" copy. That implies work is happening when the series is paused.
  if (premiumPolicy === 'denied') {
    return {
      title: 'Your Bible rhythm is still here',
      body: 'Read scripture today, or renew Premium when you’re ready for the next personal reading.',
    };
  }

  // The next day is not on device yet. This is the NORMAL state at bedtime:
  // today's reading is done, tomorrow's is generated overnight and only
  // arrives when the app next opens. The reminder is baked into the OS at
  // schedule time, so "being prepared — check back soon" fired every morning
  // on a day that was already waiting. Name the day instead and let the app
  // fetch it on open.
  const nextDayNumber = Math.max(1, currentDevotional.currentDay || 1);
  const inSeries = nextDayNumber <= getServerOwnedSeriesTotalDays(currentDevotional);
  return {
    title: inSeries ? `Day ${nextDayNumber} of ${currentDevotional.title}` : currentDevotional.title,
    body: 'Your next reading is waiting for you.',
  };
}

export function buildDailyReminderFingerprint({
  reminderTime,
  dailyReminderEnabled = Boolean(reminderTime),
  currentDevotional,
  premiumPolicy,
  pushRegistered = false,
  readToday = false,
}: DailyReminderFingerprintInput): string {
  const currentDay = getCurrentReminderDay(currentDevotional);

  // JSON.stringify prevents collisions from content containing separators.
  // Keep this aligned with getDailyReminderContent().
  return JSON.stringify([
    'reading-calendar-v1',
    dailyReminderEnabled ? 'enabled' : 'disabled',
    reminderTime ?? '',
    premiumPolicy,
    pushRegistered ? 'push' : 'nopush',
    readToday ? 'read-today' : '',
    currentDevotional?.id ?? '',
    currentDevotional?.title ?? '',
    currentDevotional?.currentDay ?? '',
    currentDevotional?.seriesStartDate ?? '',
    currentDevotional ? getServerOwnedSeriesTotalDays(currentDevotional) : '',
    currentDay?.dayNumber ?? '',
    currentDay ? 'day' : currentDevotional ? 'pending' : 'empty',
    currentDay?.title ?? '',
    currentDay?.quotableLine ?? '',
    currentDay?.scriptureReference ?? '',
    currentDay?.isRead ? '1' : '0',
    currentDay?.generatedAt ?? '',
  ]);
}
