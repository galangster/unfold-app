/**
 * Recap Stats — computes all the data needed for the "Unfolded" year-in-review experience.
 * Purely derived from the Zustand store data.
 */

import type { Devotional, JournalEntry, CheckIn, UsedScripture } from './store';
import type { ThemeCategory } from '../constants/devotional-types';
import { THEME_CATEGORIES } from '../constants/devotional-types';

export type SpiritualArchetype = 'seeker' | 'diver' | 'faithful' | 'writer' | 'explorer' | 'beginner';

export interface RecapData {
  // Card 1: Hook
  firstDevotionalDate: string | null; // ISO date of first devotional read

  // Card 2: Days with God
  totalDaysRead: number;
  totalSeries: number;
  completedSeries: number;
  estimatedReadingMinutes: number; // totalDaysRead * 5 (avg 5 min/day)

  // Card 3: Archetype
  spiritualArchetype: SpiritualArchetype;
  archetypeName: string;
  archetypeDescription: string;

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

  // Card 7: Streak
  currentStreak: number;
  longestStreak: number;

  // Card 8: Closing — Theme identity
  topTheme: ThemeCategory | null;
  topThemeName: string | null;
  topThemeCount: number;
  themesExplored: number;
  themeBreakdown: { theme: ThemeCategory; name: string; count: number }[];

  // Computed narrative
  mostActiveWeekday: string | null;
  mostActiveWeekdayCount: number;
  transformationNarrative: string | null;

  // Overall
  hasEnoughData: boolean;
}

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const WEEKDAY_NAMES = [
  'Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday',
];

function getMonthKey(dateStr: string): string {
  const d = new Date(dateStr);
  return MONTH_NAMES[d.getMonth()] ?? 'Unknown';
}

function getWeekday(dateStr: string): number {
  return new Date(dateStr).getDay();
}

/** Determine archetype from usage patterns */
function computeArchetype(params: {
  themesExplored: number;
  themeBreakdown: { theme: ThemeCategory; count: number }[];
  longestStreak: number;
  totalJournalEntries: number;
  uniqueBooks: number;
}): { archetype: SpiritualArchetype; name: string; description: string } {
  const { themesExplored, themeBreakdown, longestStreak, totalJournalEntries, uniqueBooks } = params;

  // Priority order: most distinctive behavior first

  // Writer: 5+ journal entries — they process through words
  if (totalJournalEntries >= 5) {
    return {
      archetype: 'writer',
      name: 'The Writer',
      description: 'A heart that processes through pen and paper, turning prayer into prose.',
    };
  }

  // Faithful: longest streak >= 7 — consistency is their gift
  if (longestStreak >= 7) {
    return {
      archetype: 'faithful',
      name: 'The Faithful',
      description: 'Steady and rooted, showing up day after day without fanfare.',
    };
  }

  // Explorer: 3+ Bible books explored — they roam Scripture widely
  if (uniqueBooks >= 3) {
    return {
      archetype: 'explorer',
      name: 'The Explorer',
      description: 'An adventurous spirit, traversing the breadth of Scripture with curiosity.',
    };
  }

  // Seeker: explored 3+ themes — drawn to many conversations
  if (themesExplored >= 3) {
    return {
      archetype: 'seeker',
      name: 'The Seeker',
      description: 'A wide and curious heart, drawn to many conversations with God.',
    };
  }

  // Deep Diver: 1-2 themes with 10+ days in one
  const hasDeepTheme = themeBreakdown.some((t) => t.count >= 10);
  if (themesExplored <= 2 && hasDeepTheme) {
    return {
      archetype: 'diver',
      name: 'The Deep Diver',
      description: 'One who lingers, going deeper where others skim the surface.',
    };
  }

  // Beginner fallback
  return {
    archetype: 'beginner',
    name: 'The Beginner',
    description: 'Every journey starts with showing up. And you did.',
  };
}

/** Build a transformation narrative from first theme to most recent */
function computeTransformationNarrative(devotionals: Devotional[]): string | null {
  // Sort by creation date
  const sorted = [...devotionals]
    .filter((d) => d.themeCategory)
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

  if (sorted.length < 2) return null;

  const firstTheme = sorted[0].themeCategory;
  const lastTheme = sorted[sorted.length - 1].themeCategory;

  if (!firstTheme || !lastTheme || firstTheme === lastTheme) return null;

  const firstName = THEME_CATEGORIES.find((t) => t.id === firstTheme)?.name ?? firstTheme;
  const lastName = THEME_CATEGORIES.find((t) => t.id === lastTheme)?.name ?? lastTheme;

  return `You started with ${firstName} and found your way to ${lastName}.`;
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

  // --- Card 1: Hook — first devotional date ---
  let firstDevotionalDate: string | null = null;
  for (const d of devotionals) {
    for (const day of d.days) {
      if (day.readAt) {
        if (!firstDevotionalDate || new Date(day.readAt).getTime() < new Date(firstDevotionalDate).getTime()) {
          firstDevotionalDate = day.readAt;
        }
      }
    }
  }
  // Fallback to devotional creation date if no readAt found
  if (!firstDevotionalDate && devotionals.length > 0) {
    const sorted = [...devotionals].sort(
      (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
    );
    firstDevotionalDate = sorted[0].createdAt;
  }

  // --- Card 2: Days with God ---
  const totalDaysRead = devotionals.reduce(
    (acc, d) => acc + d.days.filter((day) => day.isRead).length,
    0,
  );
  const totalSeries = devotionals.length;
  const completedSeries = devotionals.filter(
    (d) => d.days.length === d.totalDays && d.days.every((day) => day.isRead),
  ).length;
  const estimatedReadingMinutes = totalDaysRead * 5;

  // --- Most active weekday ---
  const weekdayCounts = new Array<number>(7).fill(0);
  for (const d of devotionals) {
    for (const day of d.days) {
      if (day.readAt) {
        weekdayCounts[getWeekday(day.readAt)] += 1;
      }
    }
  }
  let mostActiveWeekdayIndex = -1;
  let mostActiveWeekdayCount = 0;
  for (let i = 0; i < 7; i++) {
    if (weekdayCounts[i] > mostActiveWeekdayCount) {
      mostActiveWeekdayCount = weekdayCounts[i];
      mostActiveWeekdayIndex = i;
    }
  }
  const mostActiveWeekday = mostActiveWeekdayIndex >= 0
    ? WEEKDAY_NAMES[mostActiveWeekdayIndex]
    : null;

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
  const uniqueBooks = bookCounts.size;

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

  // --- Theme identity ---
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

  // --- Archetype ---
  const { archetype: spiritualArchetype, name: archetypeName, description: archetypeDescription } = computeArchetype({
    themesExplored,
    themeBreakdown: themeBreakdown.map((t) => ({ theme: t.theme, count: t.count })),
    longestStreak,
    totalJournalEntries,
    uniqueBooks,
  });

  // --- Transformation narrative ---
  const transformationNarrative = computeTransformationNarrative(devotionals);

  // Has enough data to show recap
  const hasEnoughData = totalDaysRead >= 1;

  return {
    firstDevotionalDate,
    totalDaysRead,
    totalSeries,
    completedSeries,
    estimatedReadingMinutes,
    spiritualArchetype,
    archetypeName,
    archetypeDescription,
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
    currentStreak,
    longestStreak,
    topTheme,
    topThemeName,
    topThemeCount,
    themesExplored,
    themeBreakdown,
    mostActiveWeekday,
    mostActiveWeekdayCount,
    transformationNarrative,
    hasEnoughData,
  };
}
