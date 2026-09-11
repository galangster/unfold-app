import { countReadDaysWithinBoundary } from '@/lib/series-path';
import { getServerOwnedSeriesTotalDays } from '@/lib/devotional-series-boundary';
import type { CheckIn, Devotional, DevotionalDay, Highlight } from '@/lib/store';

export interface SeriesKeepsake {
  devotionalId: string;
  seriesTitle: string;
  totalDays: number;
  daysRead: number;
  isSeriesComplete: boolean;
  line: { text: string; dayNumber: number; source: 'highlight' | 'quotable' } | null;
  words: { text: string; dayNumber: number; source: 'freeText' | 'chip' } | null;
  act: { text: string; dayNumber: number; status: 'done' | 'skipped' | 'unmarked' } | null;
  nextPickLine: string | null;
  completeness: 'full' | 'partial' | 'none';
}

function withinBoundary(dayNumber: number, totalDays: number): boolean {
  return totalDays <= 0 || dayNumber <= totalDays;
}

function newestByCreatedAt<T extends { createdAt: string }>(items: T[]): T | undefined {
  return [...items].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))[0];
}

function selectLine(
  highlights: Highlight[],
  days: DevotionalDay[],
  totalDays: number,
): SeriesKeepsake['line'] {
  const highlight = newestByCreatedAt(
    highlights.filter((item) => withinBoundary(item.dayNumber, totalDays) && item.highlightedText.trim().length > 0),
  );
  if (highlight) {
    return { text: highlight.highlightedText.trim(), dayNumber: highlight.dayNumber, source: 'highlight' };
  }

  const quotable = days
    .filter((day) => day.isRead && withinBoundary(day.dayNumber, totalDays) && day.quotableLine.trim().length > 0)
    .sort((a, b) => b.dayNumber - a.dayNumber)[0];
  if (!quotable) return null;
  return { text: quotable.quotableLine.trim(), dayNumber: quotable.dayNumber, source: 'quotable' };
}

function selectWords(checkIns: CheckIn[], totalDays: number): SeriesKeepsake['words'] {
  const relevant = checkIns.filter((item) => (
    withinBoundary(item.dayNumber, totalDays) && item.moodLabel !== 'completed'
  ));

  const freeText = newestByCreatedAt(
    relevant.filter((item) => (item.freeText ?? '').trim().length > 0),
  );
  if (freeText?.freeText) {
    return { text: freeText.freeText.trim(), dayNumber: freeText.dayNumber, source: 'freeText' };
  }

  const chip = newestByCreatedAt(
    relevant.filter((item) => {
      const answer = item.chipAnswer?.trim() ?? '';
      return answer.length > 0 && !answer.startsWith('day1-pulse:');
    }),
  );
  if (!chip?.chipAnswer) return null;
  return { text: chip.chipAnswer.trim(), dayNumber: chip.dayNumber, source: 'chip' };
}

function selectAct(days: DevotionalDay[], totalDays: number): SeriesKeepsake['act'] {
  const withAct = days.filter((day) => (
    day.isRead && withinBoundary(day.dayNumber, totalDays) && (day.act ?? '').trim().length > 0
  ));
  const done = withAct.filter((day) => day.actOutcome === 'done');
  const pick = [...(done.length > 0 ? done : withAct)].sort((a, b) => b.dayNumber - a.dayNumber)[0];
  if (!pick?.act) return null;
  return {
    text: pick.act.trim(),
    dayNumber: pick.dayNumber,
    status: pick.actOutcome ?? 'unmarked',
  };
}

function completenessOf(keepsake: Pick<SeriesKeepsake, 'line' | 'words' | 'act'>): SeriesKeepsake['completeness'] {
  const present = [keepsake.line, keepsake.words, keepsake.act].filter(Boolean).length;
  if (present === 3) return 'full';
  if (present === 0) return 'none';
  return 'partial';
}

export function buildSeriesKeepsake(i: {
  devotional: Devotional;
  highlights: Highlight[];
  checkIns: CheckIn[];
}): SeriesKeepsake {
  const totalDays = getServerOwnedSeriesTotalDays(i.devotional);
  const daysRead = countReadDaysWithinBoundary(i.devotional);
  const isSeriesComplete = totalDays > 0 && daysRead >= totalDays;
  const days = (i.devotional.days ?? []).filter((day) => withinBoundary(day.dayNumber, totalDays));
  const highlights = i.highlights.filter((item) => item.devotionalId === i.devotional.id);
  const checkIns = i.checkIns.filter((item) => item.devotionalId === i.devotional.id);
  const finalDay = days.find((day) => day.dayNumber === totalDays);
  const line = selectLine(highlights, days, totalDays);
  const words = selectWords(checkIns, totalDays);
  const act = selectAct(days, totalDays);

  return {
    devotionalId: i.devotional.id,
    seriesTitle: i.devotional.title,
    totalDays,
    daysRead,
    isSeriesComplete,
    line,
    words,
    act,
    nextPickLine: isSeriesComplete ? finalDay?.nextPick?.line ?? null : null,
    completeness: completenessOf({ line, words, act }),
  };
}
