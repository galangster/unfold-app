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
}

export type DailyReminderOwner = 'local' | 'server';

export interface DailyReminderOwnerInput {
  currentDevotional: Devotional | null | undefined;
  premiumPolicy: PremiumAccessPolicy;
  /** The backend holds an Expo push token for this device. */
  pushRegistered: boolean;
}

/**
 * Who fires the morning reminder.
 *
 * The local DAILY trigger bakes its copy at schedule time. When the next day
 * is not on the device yet (the normal bedtime state for a progressive
 * series) that copy can only say "your next reading is waiting". The server
 * generates that day overnight and knows its quotable line, so when it can
 * reach the device it owns the slot and the client schedules nothing. Every
 * other state keeps the local reminder: it is the only guaranteed channel,
 * and its copy is specific whenever the day is already on device.
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
    const todayStr = now.toDateString();
    const isOverdue =
      !currentDay.isRead &&
      currentDay.generatedAt &&
      new Date(currentDay.generatedAt).toDateString() !== todayStr;

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
}: DailyReminderFingerprintInput): string {
  const currentDay = getCurrentReminderDay(currentDevotional);

  // JSON.stringify prevents collisions from content containing separators.
  // Keep this aligned with getDailyReminderContent().
  return JSON.stringify([
    dailyReminderEnabled ? 'enabled' : 'disabled',
    reminderTime ?? '',
    premiumPolicy,
    pushRegistered ? 'push' : 'nopush',
    currentDevotional?.id ?? '',
    currentDevotional?.title ?? '',
    currentDevotional?.currentDay ?? '',
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
