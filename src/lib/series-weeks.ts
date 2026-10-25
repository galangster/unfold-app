/**
 * Week framing for a chaptered series (weekly chapters, spec r2 2026-10-24).
 *
 * Every surface that frames a day by its week reads this module. A missing
 * arc, an arc with no `planning`, or `planning`/`acts` that do not describe
 * contiguous weeks returns null, and the caller renders today's display (R6).
 *
 * Reader-facing text says "Week". "Chapter" stays in code (Ruled 2).
 */
import type { SeriesArc, SeriesArcChapterPlan } from './store';

/** A `preparing` week older than this reads as `outline`: no worker, no promise (R4). */
export const WEEK_PREPARING_STALE_MS = 24 * 60 * 60 * 1000;

export type WeekStatus = SeriesArcChapterPlan['status'];

export interface SeriesWeek {
  /** 1-based. */
  index: number;
  fromDay: number;
  toDay: number;
  dayCount: number;
  /** Effective status: a stale `preparing` already reads as `outline`. */
  status: WeekStatus;
  /** The week's name, only once the week is `planned` (Ruled 6). */
  name: string | null;
}

export interface SeriesWeeks {
  totalDays: number;
  weeks: SeriesWeek[];
}

/** The progress of one series-detail row, as book-of-seasons computes it. */
export type WeekRowProgress = 'done' | 'current' | 'available' | 'upcoming';

const STATUSES = new Set<WeekStatus>(['planned', 'outline', 'preparing', 'outline_only']);

function isPositiveInteger(value: unknown): value is number {
  return Number.isInteger(value) && (value as number) >= 1;
}

function effectiveStatus(chapter: SeriesArcChapterPlan, nowMs: number): WeekStatus {
  if (chapter.status !== 'preparing') return chapter.status;
  const since = typeof chapter.preparingSince === 'string' ? Date.parse(chapter.preparingSince) : Number.NaN;
  if (!Number.isFinite(since)) return 'outline';
  return nowMs - since > WEEK_PREPARING_STALE_MS ? 'outline' : 'preparing';
}

export function readSeriesWeeks(
  arc: SeriesArc | null | undefined,
  options: { totalDays?: number; nowMs?: number } = {},
): SeriesWeeks | null {
  const planning = arc?.planning;
  if (!arc || !planning || planning.mode !== 'chapters' || planning.version !== 1) return null;
  if (!Array.isArray(planning.chapters) || planning.chapters.length === 0) return null;
  const totalDays = options.totalDays || arc.totalDaysPlanned;
  if (!isPositiveInteger(totalDays)) return null;

  const chapters = [...planning.chapters].sort((a, b) => (a?.fromDay ?? 0) - (b?.fromDay ?? 0));
  const acts = Array.isArray(arc.acts) ? [...arc.acts].sort((a, b) => (a?.fromDay ?? 0) - (b?.fromDay ?? 0)) : [];
  if (acts.length !== chapters.length) return null;

  const nowMs = options.nowMs ?? Date.now();
  const weeks: SeriesWeek[] = [];
  let nextDay = 1;
  for (let position = 0; position < chapters.length; position += 1) {
    const chapter = chapters[position];
    const act = acts[position];
    if (!chapter || chapter.index !== position + 1 || !STATUSES.has(chapter.status)) return null;
    if (!isPositiveInteger(chapter.fromDay) || !isPositiveInteger(chapter.toDay)) return null;
    if (chapter.fromDay !== nextDay || chapter.toDay < chapter.fromDay) return null;
    if (!act || act.fromDay !== chapter.fromDay || act.toDay !== chapter.toDay) return null;
    if (typeof act.name !== 'string' || act.name.trim().length === 0) return null;
    const status = effectiveStatus(chapter, nowMs);
    weeks.push({
      index: chapter.index,
      fromDay: chapter.fromDay,
      toDay: chapter.toDay,
      dayCount: chapter.toDay - chapter.fromDay + 1,
      status,
      name: status === 'planned' ? act.name.trim() : null,
    });
    nextDay = chapter.toDay + 1;
  }
  if (nextDay !== totalDays + 1) return null;
  return { totalDays, weeks };
}

export function findWeekForDay(
  weeks: SeriesWeeks | null | undefined,
  dayNumber: number,
): { week: SeriesWeek; dayInWeek: number } | null {
  const week = weeks?.weeks.find((item) => dayNumber >= item.fromDay && dayNumber <= item.toDay);
  return week ? { week, dayInWeek: dayNumber - week.fromDay + 1 } : null;
}

/** "Week 2 · Day 3 of 7" (Ruled 2). */
export function weekDayLabel(weeks: SeriesWeeks | null | undefined, dayNumber: number): string | null {
  const found = findWeekForDay(weeks, dayNumber);
  return found ? `Week ${found.week.index} · Day ${found.dayInWeek} of ${found.week.dayCount}` : null;
}

/** "Week 2, day 3 of 7". VoiceOver never reads the separator. */
export function weekDaySpokenLabel(weeks: SeriesWeeks | null | undefined, dayNumber: number): string | null {
  const found = findWeekForDay(weeks, dayNumber);
  return found ? `Week ${found.week.index}, day ${found.dayInWeek} of ${found.week.dayCount}` : null;
}

/** "Week 2 of 4". */
export function weekOfSeriesSpokenLabel(weeks: SeriesWeeks | null | undefined, dayNumber: number): string | null {
  const found = findWeekForDay(weeks, dayNumber);
  return found && weeks ? `Week ${found.week.index} of ${weeks.weeks.length}` : null;
}

/** The Today caption: the week's name once it is planned, else null (the caller shows the series title). */
export function weekCaption(weeks: SeriesWeeks | null | undefined, dayNumber: number): string | null {
  return findWeekForDay(weeks, dayNumber)?.week.name ?? null;
}

/** Only an unplanned week of a series with a worker behind it says when it is planned. */
function promisesPlanning(week: SeriesWeek, seriesPaused: boolean): boolean {
  return !seriesPaused && (week.status === 'outline' || week.status === 'preparing');
}

/** "Week 2 · <name>", "Week 3 · Planned when you reach it", or "Week 3". */
export function weekRowTitle(week: SeriesWeek, { seriesPaused }: { seriesPaused: boolean }): string {
  if (week.name) return `Week ${week.index} · ${week.name}`;
  if (promisesPlanning(week, seriesPaused)) return `Week ${week.index} · Planned when you reach it`;
  return `Week ${week.index}`;
}

function progressPhrase(week: SeriesWeek, progress: WeekRowProgress, readCount: number): string {
  if (progress === 'done') return 'Complete';
  if (progress === 'upcoming') return 'Still to come';
  if (progress === 'current' && readCount === 0) return 'Your current week';
  return `${readCount} of ${week.dayCount} days complete`;
}

/** "Days 8-14 · Your current week". */
export function weekRowDetail(week: SeriesWeek, progress: WeekRowProgress, readCount: number): string {
  return `Days ${week.fromDay}-${week.toDay} · ${progressPhrase(week, progress, readCount)}`;
}

/** "Week 2, Learning to Rest, days 8 to 14, current week, 3 of 7 days complete". */
export function weekRowSpokenLabel(
  week: SeriesWeek,
  progress: WeekRowProgress,
  readCount: number,
  { seriesPaused }: { seriesPaused: boolean },
): string {
  const parts = [`Week ${week.index}`];
  if (week.name) parts.push(week.name);
  else if (promisesPlanning(week, seriesPaused)) parts.push('planned when you reach it');
  parts.push(`days ${week.fromDay} to ${week.toDay}`);
  if (progress === 'current') {
    parts.push('current week');
    if (readCount > 0) parts.push(`${readCount} of ${week.dayCount} days complete`);
  } else {
    parts.push(progressPhrase(week, progress, readCount).toLowerCase());
  }
  return parts.join(', ');
}

/** "4 weeks · 28 days". */
export function weeksHeadingLabel(weeks: SeriesWeeks): string {
  const count = weeks.weeks.length;
  return `${count} ${count === 1 ? 'week' : 'weeks'} · ${weeks.totalDays} days`;
}

/** The week that `dayNumber` finishes, when it is not the last day of the series. */
function weekFinishedBy(weeks: SeriesWeeks | null | undefined, dayNumber: number): SeriesWeek | null {
  if (!weeks || dayNumber >= weeks.totalDays) return null;
  return weeks.weeks.find((week) => week.toDay === dayNumber) ?? null;
}

export interface WeekCompleteMoment {
  title: string;
  line: string;
  spokenLine: string;
  /** Null when no pacing backs a promise, or the series is paused. */
  nextLine: string | null;
}

/**
 * The restrained week-complete moment (spec r2 section 7). Shows after the
 * last day of weeks 1-3, never on the series' last day.
 * `nextOpens` follows the pacing rule: 'tomorrow', 'now', or null for no promise.
 */
export function weekCompleteMoment(
  weeks: SeriesWeeks | null | undefined,
  completedDay: number,
  nextOpens: 'tomorrow' | 'now' | null,
): WeekCompleteMoment | null {
  const week = weekFinishedBy(weeks, completedDay);
  if (!week || !weeks) return null;
  const count = weeks.weeks.length;
  const next = weeks.weeks.find((item) => item.index === week.index + 1);
  const nextName = next ? (next.name ? `Week ${next.index} · ${next.name}` : `Week ${next.index}`) : null;
  let nextLine: string | null = null;
  if (nextName && nextOpens === 'tomorrow') nextLine = `${nextName} begins tomorrow`;
  else if (nextName && nextOpens === 'now') nextLine = `${nextName} is ready`;
  return {
    title: `Week ${week.index} complete`,
    line: `${week.index} of ${count} weeks · ${week.toDay} of ${weeks.totalDays} days`,
    spokenLine: `${week.index} of ${count} weeks, ${week.toDay} of ${weeks.totalDays} days`,
    nextLine,
  };
}

/** The screen-reader announcement on days 7, 14 and 21 (row 20). */
export function weekCompleteAnnouncement(weeks: SeriesWeeks | null | undefined, completedDay: number): string | null {
  const week = weekFinishedBy(weeks, completedDay);
  return week ? `Week ${week.index} complete` : null;
}

/** The four-week length is the one length a reader sees in weeks. */
export const FOUR_WEEK_SERIES_DAYS = 28;

/** "4-week" for a 28-day series, else "N-day". */
export function seriesLengthPhrase(totalDays: number): string {
  return totalDays === FOUR_WEEK_SERIES_DAYS ? '4-week' : `${totalDays}-day`;
}
