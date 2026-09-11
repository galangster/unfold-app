import type { AllowedTrialDays } from '@/lib/trial-facts';
import { selectRenderableDevotionalDay } from '@/lib/devotional-canonical-days';
import {
  getCalendarDayNumber,
  getSelectableDayLimit,
  getTodayReaderDayNumber,
  isDevotionalDaySelectable,
} from '@/lib/devotional-day-access';
import { getServerOwnedSeriesTotalDays } from '@/lib/devotional-series-boundary';
import type { Devotional, DevotionalDay } from '@/lib/store';

export type SeriesPathNodeState = 'read' | 'today' | 'tomorrow' | 'preparing' | 'locked';

export interface SeriesPathNode {
  dayNumber: number;
  state: SeriesPathNodeState;
  title: string | null;
  shapedByCheckIn: boolean;
  contentReady: boolean;
  dateWord: 'today' | 'tomorrow' | { weekday: 0 | 1 | 2 | 3 | 4 | 5 | 6 } | null;
}

export function countReadDaysWithinBoundary(d: Devotional): number {
  const totalDays = getServerOwnedSeriesTotalDays(d);
  return (d.days ?? []).filter((day) => (
    day.isRead && (totalDays <= 0 || day.dayNumber <= totalDays)
  )).length;
}

export function isSeriesComplete(d: Devotional): boolean {
  const totalDays = getServerOwnedSeriesTotalDays(d);
  return totalDays > 0 && countReadDaysWithinBoundary(d) >= totalDays;
}

function nodeTitle(
  row: DevotionalDay | undefined,
  d: Devotional,
  n: number,
): string | null {
  const rowTitle = row?.title?.trim();
  if (rowTitle) return rowTitle;
  const hint = d.seriesArc?.dayHints?.find((item) => item.dayNumber === n);
  return hint?.dayTitle ?? null;
}

function nodeState(
  d: Devotional,
  n: number,
  now: Date,
  opts: { isCurrentSeries: boolean },
  row: DevotionalDay | undefined,
  calendarDay: ReturnType<typeof getCalendarDayNumber>,
  seriesComplete: boolean,
  contentReady: boolean,
): SeriesPathNodeState {
  if (row?.isRead) return 'read';

  if (
    row &&
    isDevotionalDaySelectable(d, n, now) &&
    n === getTodayReaderDayNumber(d, now)
  ) {
    return 'today';
  }

  if (
    n === d.currentDay &&
    calendarDay != null &&
    n > calendarDay
  ) {
    return 'tomorrow';
  }

  if (
    !contentReady &&
    n === d.currentDay &&
    calendarDay != null &&
    n <= calendarDay &&
    opts.isCurrentSeries &&
    !seriesComplete
  ) {
    return 'preparing';
  }

  return 'locked';
}

function nodeDateWord(
  n: number,
  now: Date,
  state: SeriesPathNodeState,
  limit: number,
  seriesStartDateValid: boolean,
): SeriesPathNode['dateWord'] {
  if (!seriesStartDateValid) return null;
  if (state === 'read') return null;

  const offset = n - limit;
  if (offset < 0 || offset >= 7) return null;
  if (offset === 0) return state === 'today' ? 'today' : null;
  if (offset === 1) return 'tomorrow';

  const unlockDay = new Date(now.getFullYear(), now.getMonth(), now.getDate() + offset);
  return { weekday: unlockDay.getDay() as 0 | 1 | 2 | 3 | 4 | 5 | 6 };
}

export function buildSeriesPath(
  devotional: Devotional,
  now: Date,
  opts: { isCurrentSeries: boolean },
): SeriesPathNode[] {
  const totalDays = getServerOwnedSeriesTotalDays(devotional);
  const limit = getSelectableDayLimit(devotional, now);
  const calendarDay = getCalendarDayNumber(devotional, now);
  const seriesComplete = isSeriesComplete(devotional);
  const seriesStartDateValid = Boolean(
    devotional.seriesStartDate && !Number.isNaN(new Date(devotional.seriesStartDate).getTime()),
  );
  const daysByNumber = new Map(
    (devotional.days ?? []).map((day) => [day.dayNumber, day] as const),
  );
  const nodes: SeriesPathNode[] = [];

  for (let n = 1; n <= totalDays; n += 1) {
    const row = daysByNumber.get(n);
    const contentReady = selectRenderableDevotionalDay(devotional, n).status === 'ready';
    const state = nodeState(
      devotional,
      n,
      now,
      opts,
      row,
      calendarDay,
      seriesComplete,
      contentReady,
    );
    nodes.push({
      dayNumber: n,
      state,
      title: nodeTitle(row, devotional, n),
      shapedByCheckIn: row?.shapedByCheckIn === true,
      contentReady,
      dateWord: nodeDateWord(n, now, state, limit, seriesStartDateValid),
    });
  }

  return nodes;
}

export function buildPlannedSeriesPath(trialDays: AllowedTrialDays): SeriesPathNode[] {
  return Array.from({ length: trialDays }, (_, index) => {
    const dayNumber = index + 1;
    return {
      dayNumber,
      state: dayNumber === 1 ? 'preparing' : 'locked',
      title: null,
      shapedByCheckIn: false,
      contentReady: false,
      dateWord: null,
    };
  });
}

export function describeSeriesPath(nodes: SeriesPathNode[]): string {
  const sentence = nodes.map((node) => {
    if (node.state === 'read') return `Day ${node.dayNumber} read`;
    if (node.state === 'today') return `Day ${node.dayNumber} today`;
    if (node.state === 'tomorrow') {
      return node.contentReady
        ? `Day ${node.dayNumber} opens tomorrow`
        : `Day ${node.dayNumber} is on its way`;
    }
    if (node.state === 'preparing') return `Day ${node.dayNumber} preparing`;
    return `Day ${node.dayNumber} locked`;
  }).join('. ');
  return sentence ? `${sentence}.` : '';
}
