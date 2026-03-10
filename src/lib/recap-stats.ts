/**
 * Recap Stats — computes all the data needed for the "Unfolded" year-in-review experience.
 * Purely derived from the Zustand store data.
 */

import type { Devotional, JournalEntry, CheckIn, UsedScripture } from './store';
import type { ThemeCategory } from '../constants/devotional-types';
import { THEME_CATEGORIES } from '../constants/devotional-types';

export interface RecapData {
  // Card 2: Days with God
  totalDaysRead: number;
  totalSeries: number;
  completedSeries: number;

  // Card 3: Streak
  currentStreak: number;
  longestStreak: number;

  // Card 4: Scripture map
  totalScriptures: number;
  uniqueScriptures: number;
  topBook: string | null;
  topBookCount: number;
  bookBreakdown: { book: string; count: number }[];

  // Card 5: Mood journey
  totalCheckIns: number;
  averageMood: number;
  moodTrend: 'rising' | 'steady' | 'falling';
  moodByMonth: { month: string; avg: number; count: number }[];

  // Card 6: Journal depth
  totalJournalEntries: number;
  totalWordsWritten: number;
  mostReflectiveMonth: string | null;
  mostReflectiveMonthCount: number;

  // Card 7: Theme identity
  topTheme: ThemeCategory | null;
  topThemeName: string | null;
  topThemeCount: number;
  themesExplored: number;
  themeBreakdown: { theme: ThemeCategory; name: string; count: number }[];

  // Overall
  hasEnoughData: boolean;
}

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function getMonthKey(dateStr: string): string {
  const d = new Date(dateStr);
  return MONTH_NAMES[d.getMonth()] ?? 'Unknown';
}

export function computeRecapData(params: {
  devotionals: Devotional[];
  journalEntries: JournalEntry[];
  checkIns: CheckIn[];
  usedScriptures: UsedScripture[];
  streakCurrent: number;
  streakLongest: number;
}): RecapData {
  const {
    devotionals,
    journalEntries,
    checkIns,
    usedScriptures,
    streakCurrent: currentStreak,
    streakLongest: longestStreak,
  } = params;

  // --- Card 2: Days with God ---
  const totalDaysRead = devotionals.reduce(
    (acc, d) => acc + d.days.filter((day) => day.isRead).length,
    0,
  );
  const totalSeries = devotionals.length;
  const completedSeries = devotionals.filter(
    (d) => d.days.length === d.totalDays && d.days.every((day) => day.isRead),
  ).length;

  // --- Card 4: Scripture map ---
  const totalScriptures = usedScriptures.length;
  const uniqueScriptureSet = new Set(usedScriptures.map((s) => s.reference));
  const uniqueScriptures = uniqueScriptureSet.size;

  const bookCounts = new Map<string, number>();
  for (const s of usedScriptures) {
    const book = s.book || 'Unknown';
    bookCounts.set(book, (bookCounts.get(book) ?? 0) + 1);
  }
  const bookBreakdown = Array.from(bookCounts.entries())
    .map(([book, count]) => ({ book, count }))
    .sort((a, b) => b.count - a.count);

  const topBook = bookBreakdown[0]?.book ?? null;
  const topBookCount = bookBreakdown[0]?.count ?? 0;

  // --- Card 5: Mood journey ---
  const totalCheckIns = checkIns.length;
  const averageMood =
    totalCheckIns > 0
      ? checkIns.reduce((sum, c) => sum + c.mood, 0) / totalCheckIns
      : 0;

  // Compute mood by month
  const moodByMonthMap = new Map<string, { sum: number; count: number }>();
  for (const c of checkIns) {
    const month = getMonthKey(c.createdAt);
    const existing = moodByMonthMap.get(month) ?? { sum: 0, count: 0 };
    existing.sum += c.mood;
    existing.count += 1;
    moodByMonthMap.set(month, existing);
  }
  const moodByMonth = MONTH_NAMES
    .filter((m) => moodByMonthMap.has(m))
    .map((month) => {
      const data = moodByMonthMap.get(month)!;
      return { month, avg: data.sum / data.count, count: data.count };
    });

  // Mood trend: compare first half to second half of check-ins
  let moodTrend: 'rising' | 'steady' | 'falling' = 'steady';
  if (checkIns.length >= 4) {
    const sorted = [...checkIns].sort(
      (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
    );
    const mid = Math.floor(sorted.length / 2);
    const firstHalf = sorted.slice(0, mid);
    const secondHalf = sorted.slice(mid);
    const firstAvg = firstHalf.reduce((s, c) => s + c.mood, 0) / firstHalf.length;
    const secondAvg = secondHalf.reduce((s, c) => s + c.mood, 0) / secondHalf.length;
    const diff = secondAvg - firstAvg;
    if (diff > 0.3) moodTrend = 'rising';
    else if (diff < -0.3) moodTrend = 'falling';
  }

  // --- Card 6: Journal depth ---
  const totalJournalEntries = journalEntries.length;
  const totalWordsWritten = journalEntries.reduce((acc, e) => {
    const mainWords = (e.content || '').split(/\s+/).filter(Boolean).length;
    const questionWords = (e.questionResponses ?? []).reduce(
      (sum, qr) => sum + (qr.response || '').split(/\s+/).filter(Boolean).length,
      0,
    );
    return acc + mainWords + questionWords;
  }, 0);

  const journalByMonth = new Map<string, number>();
  for (const e of journalEntries) {
    const month = getMonthKey(e.createdAt);
    journalByMonth.set(month, (journalByMonth.get(month) ?? 0) + 1);
  }
  let mostReflectiveMonth: string | null = null;
  let mostReflectiveMonthCount = 0;
  for (const [month, count] of journalByMonth.entries()) {
    if (count > mostReflectiveMonthCount) {
      mostReflectiveMonth = month;
      mostReflectiveMonthCount = count;
    }
  }

  // --- Card 7: Theme identity ---
  const themeCounts = new Map<ThemeCategory, number>();
  for (const d of devotionals) {
    if (d.themeCategory) {
      themeCounts.set(d.themeCategory, (themeCounts.get(d.themeCategory) ?? 0) + 1);
    }
  }
  const themeBreakdown = Array.from(themeCounts.entries())
    .map(([theme, count]) => ({
      theme,
      name: THEME_CATEGORIES.find((t) => t.id === theme)?.name ?? theme,
      count,
    }))
    .sort((a, b) => b.count - a.count);

  const topTheme = themeBreakdown[0]?.theme ?? null;
  const topThemeName = themeBreakdown[0]?.name ?? null;
  const topThemeCount = themeBreakdown[0]?.count ?? 0;
  const themesExplored = themeCounts.size;

  // Has enough data to show recap
  const hasEnoughData = totalDaysRead >= 1;

  return {
    totalDaysRead,
    totalSeries,
    completedSeries,
    currentStreak,
    longestStreak,
    totalScriptures,
    uniqueScriptures,
    topBook,
    topBookCount,
    bookBreakdown,
    totalCheckIns,
    averageMood,
    moodTrend,
    moodByMonth,
    totalJournalEntries,
    totalWordsWritten,
    mostReflectiveMonth,
    mostReflectiveMonthCount,
    topTheme,
    topThemeName,
    topThemeCount,
    themesExplored,
    themeBreakdown,
    hasEnoughData,
  };
}
