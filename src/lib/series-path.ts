import type { AllowedTrialDays } from '@/lib/trial-facts';
import { selectRenderableDevotionalDay } from '@/lib/devotional-canonical-days';
import {
  getCalendarDayNumber,
  getSelectableDayLimit,
  getTodayReaderDayNumber,
  isDevotionalDaySelectable,
} from '@/lib/devotional-day-access';
import { getServerOwnedSeriesTotalDays } from '@/lib/devotional-series-boundary';
import type { Devotional } from '@/lib/store';

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

function isSeriesComplete(d: Devotional): boolean {
  const totalDays = getServerOwnedSeriesTotalDays(d);
  return totalDays > 0 && countReadDaysWithinBoundary(d) >= totalDays;
}

function dayRow(d: Devotional, n: number) {
  return (d.days ?? []).find((day) => day.dayNumber === n);
}

function nodeTitle(d: Devotional, n: number): string | null {
  const rowTitle = dayRow(d, n)?.title?.trim();
  if (rowTitle) return rowTitle;
  const hint = d.seriesArc?.dayHints?.find((item) => item.dayNumber === n);
  return hint?.dayTitle ?? null;
}

function nodeState(
  d: Devotional,
  n: number,
  now: Date,
  opts: { isCurrentSeries: boolean },
): SeriesPathNodeState {
  const row = dayRow(d, n);
  if (row?.isRead) return 'read';

  const calendarDay = getCalendarDayNumber(d, now);
  if (
    row &&
    !row.isRead &&
    isDevotionalDaySelectable(d, n, now) &&
    n === getTodayReaderDayNumber(d, now)
  ) {
    return 'today';
  }

  if (
    !row?.isRead &&
    n === d.currentDay &&
    calendarDay != null &&
    n > calendarDay
  ) {
    return 'tomorrow';
  }

  const contentReady = selectRenderableDevotionalDay(d, n).status === 'ready';
  if (
    !contentReady &&
    n === d.currentDay &&
    calendarDay != null &&
    n <= calendarDay &&
    opts.isCurrentSeries &&
    !isSeriesComplete(d)
  ) {
    return 'preparing';
  }

  return 'locked';
}

function nodeDateWord(
  d: Devotional,
  n: number,
  now: Date,
  state: SeriesPathNodeState,
  limit: number,
): SeriesPathNode['dateWord'] {
  if (!d.seriesStartDate) return null;
  const startDate = new Date(d.seriesStartDate);
  if (Number.isNaN(startDate.getTime())) return null;
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
  const nodes: SeriesPathNode[] = [];

  for (let n = 1; n <= totalDays; n += 1) {
    const state = nodeState(devotional, n, now, opts);
    const row = dayRow(devotional, n);
    nodes.push({
      dayNumber: n,
      state,
      title: nodeTitle(devotional, n),
      shapedByCheckIn: row?.shapedByCheckIn === true,
      contentReady: selectRenderableDevotionalDay(devotional, n).status === 'ready',
      dateWord: nodeDateWord(devotional, n, now, state, limit),
    });
  }

  return nodes;
}

export function buildPlannedSeriesPath(trialDays: AllowedTrialDays, _now: Date): SeriesPathNode[] {
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
