import { useUnfoldStore } from '@/lib/store';
import { isSameDay, isYesterday, startOfDay, differenceInDays, addDays, isWeekend } from 'date-fns';

export interface StreakState {
  currentStreak: number;
  longestStreak: number;
  lastReadDate: string | null;
  streakFreezes: number;
  freezeEarnedAt: string | null;
  weekendAmnestyEnabled: boolean;
  streakHistory: Array<{
    date: string;
    completed: boolean;
    usedFreeze: boolean;
  }>;
}

export const DEFAULT_STREAK_STATE: StreakState = {
  currentStreak: 0,
  longestStreak: 0,
  lastReadDate: null,
  streakFreezes: 0,
  freezeEarnedAt: null,
  weekendAmnestyEnabled: true,
  streakHistory: [],
};

/**
 * Check if user read yesterday and update streak accordingly
 * Returns the updated streak state
 */
export function calculateStreakState(
  currentState: StreakState,
  today: Date = new Date()
): StreakState {
  const { lastReadDate, currentStreak, longestStreak, streakFreezes, weekendAmnestyEnabled } = currentState;
  
  // If never read before, return as-is
  if (!lastReadDate) {
    return currentState;
  }
  
  const lastRead = new Date(lastReadDate);
  const todayStart = startOfDay(today);
  const lastReadStart = startOfDay(lastRead);
  
  // Already read today - no change
  if (isSameDay(lastRead, today)) {
    return currentState;
  }
  
  // Check if we missed days
  const daysSinceLastRead = differenceInDays(todayStart, lastReadStart);
  
  // Read yesterday - streak continues
  if (isYesterday(lastRead)) {
    return currentState;
  }
  
  // Missed at least one day
  let newStreak = currentStreak;
  let newFreezes = streakFreezes;
  let usedFreeze = false;
  
  // Calculate which days were missed
  const missedDays: Date[] = [];
  for (let i = 1; i < daysSinceLastRead; i++) {
    const missedDate = addDays(lastReadStart, i);
    missedDays.push(missedDate);
  }
  
  // Check if we can use freeze for the first missed day
  if (streakFreezes > 0 && missedDays.length > 0) {
    // Use freeze for the first missed day
    newFreezes--;
    usedFreeze = true;
    
    // Check remaining missed days
    const remainingMissed = missedDays.slice(1);
    
    // Apply weekend amnesty if enabled
    const nonWeekendMissed = weekendAmnestyEnabled
      ? remainingMissed.filter(d => !isWeekend(d))
      : remainingMissed;
    
    if (nonWeekendMissed.length > 0) {
      // Streak broken
      newStreak = 0;
    }
    // If all remaining missed days were weekends, streak continues
  } else {
    // No freeze available - check missed days
    const nonWeekendMissed = weekendAmnestyEnabled
      ? missedDays.filter(d => !isWeekend(d))
      : missedDays;
    
    if (nonWeekendMissed.length > 0) {
      newStreak = 0;
    }
  }
  
  return {
    ...currentState,
    currentStreak: newStreak,
    streakFreezes: newFreezes,
    streakHistory: [
      ...currentState.streakHistory,
      {
        date: lastReadDate,
        completed: true,
        usedFreeze,
      },
    ],
  };
}

/**
 * Called when user completes a devotional
 * Updates streak and potentially earns a freeze
 */
export function onDevotionalComplete(
  currentState: StreakState,
  today: Date = new Date()
): StreakState {
  const { currentStreak, longestStreak, lastReadDate, freezeEarnedAt } = currentState;
  
  // Don't double-count same day
  if (lastReadDate && isSameDay(new Date(lastReadDate), today)) {
    return currentState;
  }
  
  // Calculate new streak
  let newStreak = currentStreak;
  
  if (!lastReadDate) {
    // First read ever
    newStreak = 1;
  } else if (isYesterday(new Date(lastReadDate))) {
    // Read yesterday - increment streak
    newStreak = currentStreak + 1;
  } else {
    // Check if streak was preserved by freeze/weekend
    const calculated = calculateStreakState(currentState, today);
    if (calculated.currentStreak > 0) {
      newStreak = calculated.currentStreak + 1;
    } else {
      newStreak = 1; // Start fresh
    }
  }
  
  // Check if earned a freeze (perfect week = 7 days)
  let newFreezes = currentState.streakFreezes;
  let newFreezeEarnedAt = freezeEarnedAt;
  
  if (newStreak > 0 && newStreak % 7 === 0) {
    // Check if we already earned for this week
    const weekStart = addDays(startOfDay(today), -6);
    const lastFreezeDate = freezeEarnedAt ? new Date(freezeEarnedAt) : null;
    
    if (!lastFreezeDate || lastFreezeDate < weekStart) {
      newFreezes = Math.min(newFreezes + 1, 1); // Max 1 freeze
      newFreezeEarnedAt = today.toISOString();
    }
  }
  
  return {
    ...currentState,
    currentStreak: newStreak,
    longestStreak: Math.max(newStreak, longestStreak),
    lastReadDate: today.toISOString(),
    streakFreezes: newFreezes,
    freezeEarnedAt: newFreezeEarnedAt,
    streakHistory: [
      ...currentState.streakHistory,
      {
        date: today.toISOString(),
        completed: true,
        usedFreeze: false,
      },
    ],
  };
}

/**
 * Get streak status message for notifications
 */
export function getStreakStatusMessage(streak: number): string {
  if (streak === 0) return 'Start your streak today!';
  if (streak === 1) return '🔥 1 day! Great start!';
  if (streak === 7) return '🔥 7 days! One week strong!';
  if (streak === 30) return '🔥 30 days! Amazing dedication!';
  if (streak === 100) return '🔥 100 days! Incredible!';
  if (streak % 7 === 0) return `🔥 ${streak} days! Another week!`;
  return `🔥 ${streak}-day streak! Keep it going!`;
}

/**
 * Check if user should get evening warning notification
 */
export function shouldShowEveningWarning(
  lastReadDate: string | null,
  today: Date = new Date()
): boolean {
  if (!lastReadDate) return false;
  
  const lastRead = new Date(lastReadDate);
  
  // Already read today
  if (isSameDay(lastRead, today)) return false;
  
  // Last read was yesterday - streak is still active but at risk
  return isYesterday(lastRead);
}
