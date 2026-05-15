import type { PremiumAccessPolicy } from './premium-access-policy';
import type { Devotional, DevotionalDay } from './store';

export interface DailyReminderContentInput {
  currentDevotional: Devotional | null | undefined;
  premiumPolicy: PremiumAccessPolicy;
  now?: Date;
}

export interface DailyReminderFingerprintInput {
  reminderTime?: string | null;
  currentDevotional: Devotional | null | undefined;
  premiumPolicy: PremiumAccessPolicy;
}

export interface DailyReminderContent {
  title: string;
  body: string;
}

function getCurrentReminderDay(devotional: Devotional | null | undefined): DevotionalDay | null {
  if (!devotional) return null;
  return devotional.days.find((day) => day.dayNumber === devotional.currentDay) ?? null;
}

function truncateBody(text: string, maxLength = 100): string {
  return text.length > maxLength ? `${text.substring(0, maxLength - 3)}...` : text;
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

  // Content not generated yet for a confirmed/unknown access state.
  return {
    title: 'Your reading is being prepared',
    body: 'Check back soon — it\'ll be ready.',
  };
}

export function buildDailyReminderFingerprint({
  reminderTime,
  currentDevotional,
  premiumPolicy,
}: DailyReminderFingerprintInput): string {
  const currentDay = getCurrentReminderDay(currentDevotional);

  // JSON.stringify prevents collisions from content containing separators.
  // Keep this aligned with getDailyReminderContent().
  return JSON.stringify([
    reminderTime ?? '',
    premiumPolicy,
    currentDevotional?.id ?? '',
    currentDevotional?.title ?? '',
    currentDevotional?.currentDay ?? '',
    currentDay?.dayNumber ?? '',
    currentDay ? 'day' : currentDevotional ? 'pending' : 'empty',
    currentDay?.title ?? '',
    currentDay?.quotableLine ?? '',
    currentDay?.scriptureReference ?? '',
    currentDay?.isRead ? '1' : '0',
    currentDay?.generatedAt ?? '',
  ]);
}
