/**
 * Pure widget-timeline computation. NO native/zustand imports — keep this
 * module unit-testable and side-effect free. widget-bridge.ts owns the
 * native push; this module owns ALL date math.
 *
 * Vault rules in force here:
 * - deterministic-paths-must-receive-now-as-parameter: never call new Date()
 *   in this module; `now`/`forDate` are always parameters.
 * - deterministic-twin-paths-must-share-one-helper: the "now" entry and the
 *   "midnight" entry are both built by buildWidgetSharedProps.
 */
import type { Devotional } from '@/lib/store';
import { getServerOwnedSeriesTotalDays } from './devotional-series-boundary';
import { getDaysReadToday, getTodayDay, hasReadTodayGlobal } from './home-devotional-state';
import { countReadDaysWithinBoundary } from './series-path';
import { deriveLockLine } from './widget-lock-line';

export type WidgetSharedProps = {
  streakCount: number;
  streakLongest: number;
  hasReadToday: boolean;
  devotionalTitle: string;
  dayTitle: string;
  dayNumber: number;
  totalDays: number;
  scriptureReference: string;
  scriptureText: string;
  /**
   * UnfoldVerse (Lock Screen) fields. They follow the day the reader is on
   * today, so a finished reading keeps its verse and day until midnight.
   */
  lockLine: string;
  lockReference: string;
  lockDayNumber: number;
  /** Days of the series the reader has finished: the fill of the Lock Screen ring. */
  lockDaysRead: number;
  /** A day of THIS series was read today (hasReadToday counts any series). */
  lockReadToday: boolean;
  quotableLine: string;
  readingMinutes: number;
  weeklyProgress: string;
  /** 0 = Monday … 6 = Sunday, the slot in weeklyProgress that is `forDate`. */
  weekTodayIndex: number;
  nextDayTitle: string;
};

export type WidgetStateSlice = {
  streakCurrent: number;
  streakLongest: number;
  streakLastReadDate: string | null;
  readingDuration: number;
  currentDevotional: Devotional | null | undefined;
  allDevotionals: Devotional[];
};

/** 00:00:00.000 of the next local calendar day. */
export function getNextMidnight(now: Date): Date {
  const next = new Date(now);
  next.setHours(0, 0, 0, 0);
  next.setDate(next.getDate() + 1);
  return next;
}

/**
 * Build a comma-separated "1"/"0" string for M-Su of forDate's week.
 * Scans ALL devotionals (RT-WIDGETS-6): a day counts as read if any series
 * has a readAt on that calendar date.
 */
export function getWeeklyProgress(devotionals: Devotional[], forDate: Date): string {
  const dayOfWeek = forDate.getDay(); // 0=Sun, 1=Mon...
  const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;

  const bits: string[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(forDate);
    d.setDate(d.getDate() + mondayOffset + i);
    const dateStr = d.toDateString();

    const wasRead = devotionals.some((devotional) =>
      (devotional.days ?? []).some(
        (dayItem) => dayItem.readAt && new Date(dayItem.readAt).toDateString() === dateStr
      )
    );
    bits.push(wasRead ? '1' : '0');
  }

  return bits.join(',');
}

type LockScreenProps = Pick<
  WidgetSharedProps,
  'lockLine' | 'lockReference' | 'lockDayNumber' | 'lockDaysRead' | 'lockReadToday'
>;

/**
 * The UnfoldVerse (Lock Screen) fields. The timeline and the sync fingerprint
 * both use this, so a change the widget shows always triggers a push.
 */
export function getLockScreenProps(
  devotional: Devotional | null | undefined,
  forDate: Date
): LockScreenProps {
  const todayDay = getTodayDay(devotional, forDate);
  return {
    lockLine: deriveLockLine(todayDay?.scriptureText ?? ''),
    lockReference: todayDay?.scriptureReference ?? '',
    lockDayNumber: todayDay?.dayNumber ?? devotional?.currentDay ?? 0,
    lockDaysRead: devotional ? countReadDaysWithinBoundary(devotional) : 0,
    lockReadToday: getDaysReadToday(devotional, forDate).length > 0,
  };
}

type TodayReadingProps = Pick<
  WidgetSharedProps,
  'dayTitle' | 'dayNumber' | 'scriptureReference' | 'scriptureText' | 'quotableLine' | 'nextDayTitle'
>;

/**
 * The UnfoldToday and UnfoldDashboard reading fields. Like the Lock Screen,
 * they name the day Today shows: finishing a reading calls `advanceDay`, so
 * `currentDay` alone is tomorrow's locked day. A day whose content is not on
 * the device yet is named by its number. The timeline and the sync
 * fingerprint both use this, so a change the widget shows always triggers a
 * push.
 */
export function getTodayReadingProps(
  devotional: Devotional | null | undefined,
  forDate: Date
): TodayReadingProps {
  const todayDay = getTodayDay(devotional, forDate);
  const dayNumber = todayDay?.dayNumber ?? devotional?.currentDay ?? 0;
  const nextDay = devotional?.days?.find((d) => d.dayNumber === dayNumber + 1);
  const missingDayTitle = devotional ? `Day ${dayNumber} isn’t available yet` : 'Start your series';
  return {
    dayTitle: todayDay?.title ?? missingDayTitle,
    dayNumber,
    scriptureReference: todayDay?.scriptureReference ?? '',
    scriptureText: todayDay?.scriptureText ?? '',
    quotableLine: todayDay?.quotableLine ?? '',
    nextDayTitle: nextDay?.title ?? '',
  };
}

/** Snapshot of widget props as they should appear AT forDate. */
export function buildWidgetSharedProps(slice: WidgetStateSlice, forDate: Date): WidgetSharedProps {
  const devotional = slice.currentDevotional;

  const hasReadToday = hasReadTodayGlobal({
    streakLastReadDate: slice.streakLastReadDate,
    now: forDate,
  });

  const reading = getTodayReadingProps(devotional, forDate);
  return {
    streakCount: slice.streakCurrent,
    streakLongest: slice.streakLongest,
    hasReadToday,
    devotionalTitle: devotional?.title ?? 'Unfold',
    dayTitle: reading.dayTitle,
    dayNumber: reading.dayNumber,
    totalDays: getServerOwnedSeriesTotalDays(devotional),
    scriptureReference: reading.scriptureReference,
    scriptureText: reading.scriptureText,
    ...getLockScreenProps(devotional, forDate),
    quotableLine: reading.quotableLine,
    readingMinutes: slice.readingDuration,
    weeklyProgress: getWeeklyProgress(slice.allDevotionals, forDate),
    weekTodayIndex: (forDate.getDay() + 6) % 7,
    nextDayTitle: reading.nextDayTitle,
  };
}

/**
 * Two-entry timeline: current state now + recomputed state at next midnight,
 * so WidgetKit flips "read today" off at 00:00 without the app running
 * (RT-WIDGETS-5). Streak count intentionally stays as-last-synced; streak
 * reconciliation is app-side.
 */
export function buildWidgetTimelineEntries(
  slice: WidgetStateSlice,
  now: Date
): { date: Date; props: WidgetSharedProps }[] {
  const midnight = getNextMidnight(now);
  return [
    { date: now, props: buildWidgetSharedProps(slice, now) },
    { date: midnight, props: buildWidgetSharedProps(slice, midnight) },
  ];
}
