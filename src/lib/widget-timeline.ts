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
  quotableLine: string;
  readingMinutes: number;
  weeklyProgress: string;
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

/** Snapshot of widget props as they should appear AT forDate. */
export function buildWidgetSharedProps(slice: WidgetStateSlice, forDate: Date): WidgetSharedProps {
  const devotional = slice.currentDevotional;

  const hasReadToday = slice.streakLastReadDate
    ? new Date(slice.streakLastReadDate).toDateString() === forDate.toDateString()
    : false;

  const currentDay = devotional?.days?.find((d) => d.dayNumber === devotional.currentDay);
  const nextDay = devotional?.days?.find(
    (d) => d.dayNumber === (devotional?.currentDay ?? 0) + 1
  );

  return {
    streakCount: slice.streakCurrent,
    streakLongest: slice.streakLongest,
    hasReadToday,
    devotionalTitle: devotional?.title ?? 'Unfold',
    dayTitle: currentDay?.title ?? 'Start your series',
    dayNumber: devotional?.currentDay ?? 0,
    totalDays: devotional?.totalDays ?? 0,
    scriptureReference: currentDay?.scriptureReference ?? '',
    scriptureText: currentDay?.scriptureText ?? '',
    quotableLine: currentDay?.quotableLine ?? '',
    readingMinutes: slice.readingDuration,
    weeklyProgress: getWeeklyProgress(slice.allDevotionals, forDate),
    nextDayTitle: nextDay?.title ?? '',
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
