import type { Devotional, DevotionalDay, SeriesArc } from './store';
import {
  canOpenDevotionalDay,
  getDayMenuPresentation,
  getTodayReaderDayNumber,
  isPausedSeriesUnpreparedDay,
} from './devotional-day-access';
import { selectRenderableDevotionalDay } from './devotional-canonical-days';
import { getServerOwnedSeriesTotalDays } from './devotional-series-boundary';
import { listSeriesActs, readSeriesWeeks, weekRowDetail, type SeriesWeek, type SeriesWeeks } from './series-weeks';

export { listSeriesActs };

export type BookChapterStatus = 'done' | 'current' | 'available' | 'upcoming';

export type BookChapter = {
  name: string;
  function?: string;
  fromDay: number;
  toDay: number;
  dayCount: number;
  readCount: number;
  status: BookChapterStatus;
  /** Set only for a chaptered series: the act is a week (Ruled 2). */
  week?: SeriesWeek;
};

export type BookTodayPage = {
  dayNumber: number;
  totalDays: number;
  chapterName?: string;
  chapterDayNumber?: number;
  chapterDayCount?: number;
  title?: string;
  invitation?: string;
  scriptureReference?: string;
  contentReady: boolean;
  completedToday: boolean;
  seriesComplete: boolean;
  canOpen: boolean;
  action: 'continue' | 'read-again' | null;
  eyebrow: 'today' | 'today-complete' | 'next-not-prepared' | 'series-complete' | 'preparing' | 'not-prepared';
};

export function listDaysInOrder(
  days: readonly DevotionalDay[] | null | undefined,
): DevotionalDay[] {
  return [...(days ?? [])].sort((a, b) => a.dayNumber - b.dayNumber);
}

export function countReadDays(
  days: readonly DevotionalDay[] | null | undefined,
  fromDay = 1,
  toDay = Infinity,
): number {
  return new Set((days ?? [])
    .filter((day) => day.isRead && Number.isInteger(day.dayNumber) && day.dayNumber >= fromDay && day.dayNumber <= toDay)
    .map((day) => day.dayNumber)).size;
}

export function isSeriesComplete(devotional: Devotional | null | undefined): boolean {
  if (!devotional) return false;
  const totalDays = getServerOwnedSeriesTotalDays(devotional) || devotional.totalDays;
  if (totalDays <= 0) return false;
  return countReadDays(devotional.days, 1, totalDays) === totalDays;
}

function countReadInRange(
  days: readonly DevotionalDay[],
  fromDay: number,
  toDay: number,
): number {
  return countReadDays(days, fromDay, toDay);
}

export function buildBookChapters(
  devotional: Devotional | null | undefined,
  now: Date,
): BookChapter[] {
  return buildChaptersAndWeeks(devotional, now).chapters;
}

/** The series-detail rows and, for a chaptered series, its weeks, read once. */
function buildChaptersAndWeeks(
  devotional: Devotional | null | undefined,
  now: Date,
): { chapters: BookChapter[]; weeks: SeriesWeeks | null } {
  if (!devotional) return { chapters: [], weeks: null };

  const totalDays = getServerOwnedSeriesTotalDays(devotional);
  const acts = listSeriesActs(devotional.seriesArc, totalDays);
  if (acts.length === 0) return { chapters: [], weeks: null };
  const weeks = readSeriesWeeks(devotional.seriesArc, { totalDays, nowMs: now.getTime() });

  const days = listDaysInOrder(devotional.days);
  const seriesComplete = isSeriesComplete(devotional);
  const todayReaderDayNumber = getTodayReaderDayNumber(devotional, now);

  const currentAct = acts.find(
    (act) => todayReaderDayNumber >= act.fromDay && todayReaderDayNumber <= act.toDay,
  ) ?? acts.find((act) => countReadInRange(days, act.fromDay, act.toDay) < Math.max(0, act.toDay - act.fromDay + 1));

  const chapters = acts.map((act): BookChapter => {
    const fromDay = act.fromDay;
    const toDay = act.toDay;
    const dayCount = Math.max(0, toDay - fromDay + 1);
    const readCount = countReadInRange(days, fromDay, toDay);

    let status: BookChapterStatus;
    if (seriesComplete || (dayCount > 0 && readCount >= dayCount)) {
      status = 'done';
    } else if (!seriesComplete && currentAct === act) {
      status = 'current';
    } else if (fromDay > todayReaderDayNumber) {
      status = 'upcoming';
    } else {
      status = 'available';
    }

    const week = weeks?.weeks.find((item) => item.fromDay === fromDay);
    return {
      name: act.name,
      function: act.function,
      fromDay,
      toDay,
      dayCount,
      readCount,
      status,
      ...(week ? { week } : {}),
    };
  });
  return { chapters, weeks };
}

function dayInRange(
  days: readonly DevotionalDay[],
  dayNumber: number,
): DevotionalDay | undefined {
  return days.find((day) => day.dayNumber === dayNumber);
}

export function resolveBookOpenDayNumber(
  devotional: Devotional | null | undefined,
  chapter: BookChapter,
  now: Date,
): number | null {
  if (!devotional) return null;

  const days = listDaysInOrder(devotional.days);
  const todayReaderDayNumber = getTodayReaderDayNumber(devotional, now);

  if (chapter.status === 'upcoming') return null;

  if (
    chapter.status === 'current' &&
    todayReaderDayNumber >= chapter.fromDay &&
    todayReaderDayNumber <= chapter.toDay
  ) {
    return todayReaderDayNumber;
  }

  const opensInChapter = (day: DevotionalDay) =>
    day.dayNumber >= chapter.fromDay &&
    day.dayNumber <= chapter.toDay &&
    canOpenDevotionalDay(devotional, day.dayNumber, now);

  const lastRead = [...days].reverse().find((day) => day.isRead && opensInChapter(day));
  if (lastRead) return lastRead.dayNumber;

  return days.find(opensInChapter)?.dayNumber ?? null;
}

export function buildBookOfSeasonsModel(
  devotional: Devotional | null | undefined,
  now: Date,
  seriesPaused: boolean,
): { page: BookTodayPage; chapters: BookChapter[]; weeks: SeriesWeeks | null } | null {
  if (!devotional) return null;

  const totalDays = getServerOwnedSeriesTotalDays(devotional) || devotional.totalDays;
  const seriesComplete = isSeriesComplete(devotional);
  const days = listDaysInOrder(devotional.days);
  let dayNumber = Math.min(getTodayReaderDayNumber(devotional, now), Math.max(totalDays, 1));
  if (seriesComplete) {
    const lastRead = [...days].reverse().find((item) => item.isRead && item.dayNumber <= totalDays);
    dayNumber = lastRead?.dayNumber ?? Math.min(dayNumber, totalDays || dayNumber);
  }
  const { chapters, weeks } = buildChaptersAndWeeks(devotional, now);
  const currentChapter = chapters.find(
    (chapter) => dayNumber >= chapter.fromDay && dayNumber <= chapter.toDay,
  );
  const renderable = selectRenderableDevotionalDay(devotional, dayNumber);
  const contentReady = renderable.status === 'ready';
  const day = contentReady ? renderable.day : dayInRange(days, dayNumber);
  const completedToday = Boolean(day?.isRead);
  // The current target already respects today's calendar lock. The reader
  // accepts it explicitly and owns recovery when canonical content has gaps.
  const canOpen = dayNumber >= 1 && dayNumber <= totalDays;
  const presentation = getDayMenuPresentation(devotional, dayNumber, now);

  let eyebrow: BookTodayPage['eyebrow'] = 'today';
  if (seriesComplete) eyebrow = 'series-complete';
  else if (completedToday) {
    eyebrow = isPausedSeriesUnpreparedDay(devotional, dayNumber + 1, seriesPaused)
      ? 'next-not-prepared'
      : 'today-complete';
  } else if (isPausedSeriesUnpreparedDay(devotional, dayNumber, seriesPaused)) eyebrow = 'not-prepared';
  else if (!contentReady) eyebrow = 'preparing';

  let action: BookTodayPage['action'] = null;
  if (canOpen) {
    action = completedToday || seriesComplete ? 'read-again' : 'continue';
  }

  return {
    page: {
      dayNumber,
      totalDays,
      // A week shows its name only once it is planned (Ruled 6).
      chapterName: currentChapter?.week ? currentChapter.week.name ?? undefined : currentChapter?.name,
      chapterDayNumber: currentChapter
        ? dayNumber - currentChapter.fromDay + 1
        : undefined,
      chapterDayCount: currentChapter?.dayCount,
      title: contentReady ? day?.title || presentation.title : undefined,
      invitation: contentReady ? day?.quotableLine : undefined,
      scriptureReference: contentReady ? day?.scriptureReference : undefined,
      contentReady,
      completedToday,
      seriesComplete,
      canOpen,
      action,
      eyebrow,
    },
    chapters,
    weeks,
  };
}

export function buildBookTodayPage(
  devotional: Devotional | null | undefined,
  now: Date,
  seriesPaused: boolean,
): BookTodayPage | null {
  return buildBookOfSeasonsModel(devotional, now, seriesPaused)?.page ?? null;
}

export function chapterStatusLabel(chapter: BookChapter): string {
  if (chapter.week) return weekRowDetail(chapter.week, chapter.status, chapter.readCount);
  if (chapter.status === 'done') {
    return chapter.dayCount === 1
      ? '1 day, complete'
      : `${chapter.dayCount} days, complete`;
  }
  if (chapter.status === 'current') {
    if (chapter.readCount > 0) {
      return `${chapter.readCount} of ${chapter.dayCount} days complete`;
    }
    return 'Your current chapter';
  }
  if (chapter.status === 'available') {
    return `${chapter.readCount} of ${chapter.dayCount} days complete`;
  }
  return chapter.dayCount === 1
    ? '1 day · Still to come'
    : `${chapter.dayCount} days · Still to come`;
}
