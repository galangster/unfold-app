import type { Devotional, DevotionalDay, SeriesArc } from './store';
import {
  getDayMenuPresentation,
  getTodayReaderDayNumber,
  isDevotionalDaySelectable,
} from './devotional-day-access';
import { selectRenderableDevotionalDay } from './devotional-canonical-days';
import { getServerOwnedSeriesTotalDays } from './devotional-series-boundary';

export type BookChapterStatus = 'done' | 'current' | 'available' | 'upcoming';

export type BookChapter = {
  name: string;
  function?: string;
  fromDay: number;
  toDay: number;
  dayCount: number;
  readCount: number;
  status: BookChapterStatus;
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
  eyebrow: 'today' | 'today-complete' | 'series-complete' | 'preparing';
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

export function listSeriesActs(
  seriesArc: SeriesArc | null | undefined,
  totalDays = seriesArc?.totalDaysPlanned ?? 0,
): NonNullable<SeriesArc['acts']> {
  if (!Array.isArray(seriesArc?.acts)) return [];
  const valid = seriesArc.acts.every((act) => act && typeof act.name === 'string' && act.name.trim().length > 0
    && Number.isInteger(act.fromDay) && Number.isInteger(act.toDay)
    && act.fromDay >= 1 && act.toDay >= act.fromDay && act.toDay <= totalDays);
  if (!valid) return [];
  const acts = [...seriesArc.acts].sort((a, b) => a.fromDay - b.fromDay);
  let nextDay = 1;
  for (const act of acts) {
    if (act.fromDay !== nextDay) return [];
    nextDay = act.toDay + 1;
  }
  return nextDay === totalDays + 1 ? acts : [];
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
  if (!devotional) return [];

  const acts = listSeriesActs(devotional.seriesArc, getServerOwnedSeriesTotalDays(devotional));
  if (acts.length === 0) return [];

  const days = listDaysInOrder(devotional.days);
  const seriesComplete = isSeriesComplete(devotional);
  const todayReaderDayNumber = getTodayReaderDayNumber(devotional, now);

  const currentAct = acts.find(
    (act) => todayReaderDayNumber >= act.fromDay && todayReaderDayNumber <= act.toDay,
  ) ?? acts.find((act) => countReadInRange(days, act.fromDay, act.toDay) < Math.max(0, act.toDay - act.fromDay + 1));

  return acts.map((act) => {
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

    return {
      name: act.name,
      function: act.function,
      fromDay,
      toDay,
      dayCount,
      readCount,
      status,
    };
  });
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

  const lastRead = [...days]
    .reverse()
    .find(
      (day) =>
        day.isRead &&
        day.dayNumber >= chapter.fromDay &&
        day.dayNumber <= chapter.toDay,
    );
  if (lastRead) return lastRead.dayNumber;

  const firstOpenable = days.find(
    (day) =>
      day.dayNumber >= chapter.fromDay &&
      day.dayNumber <= chapter.toDay &&
      (day.isRead || isDevotionalDaySelectable(devotional, day.dayNumber, now)),
  );
  return firstOpenable?.dayNumber ?? null;
}

export function buildBookOfSeasonsModel(
  devotional: Devotional | null | undefined,
  now: Date,
): { page: BookTodayPage; chapters: BookChapter[] } | null {
  if (!devotional) return null;

  const totalDays = getServerOwnedSeriesTotalDays(devotional) || devotional.totalDays;
  const seriesComplete = isSeriesComplete(devotional);
  const days = listDaysInOrder(devotional.days);
  let dayNumber = Math.min(getTodayReaderDayNumber(devotional, now), Math.max(totalDays, 1));
  if (seriesComplete) {
    const lastRead = [...days].reverse().find((item) => item.isRead && item.dayNumber <= totalDays);
    dayNumber = lastRead?.dayNumber ?? Math.min(dayNumber, totalDays || dayNumber);
  }
  const chapters = buildBookChapters(devotional, now);
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
  else if (completedToday) eyebrow = 'today-complete';
  else if (!contentReady) eyebrow = 'preparing';

  let action: BookTodayPage['action'] = null;
  if (canOpen) {
    action = completedToday || seriesComplete ? 'read-again' : 'continue';
  }

  return {
    page: {
      dayNumber,
      totalDays,
      chapterName: currentChapter?.name,
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
  };
}

export function buildBookTodayPage(
  devotional: Devotional | null | undefined,
  now: Date,
): BookTodayPage | null {
  return buildBookOfSeasonsModel(devotional, now)?.page ?? null;
}

export function chapterStatusLabel(chapter: BookChapter): string {
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
