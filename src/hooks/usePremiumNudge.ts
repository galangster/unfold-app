/**
 * usePremiumNudge — Determines which premium nudge (if any) to show.
 *
 * Checks all nudge conditions against priority rules, frequency caps,
 * and cooldowns, then returns the highest-priority eligible nudge or null.
 */

import { useMemo, useCallback } from 'react';
import { useUnfoldStore } from '@/lib/store';
import { usePremiumAccessPolicy } from '@/hooks/usePremiumAccessPolicy';
import {
  evaluateNudges,
  type NudgeContext,
  type NudgeState,
  type EligibleNudge,
} from '@/lib/nudges';

interface UsePremiumNudgeParams {
  screen: 'home' | 'reading';
}

interface UsePremiumNudgeResult {
  nudge: EligibleNudge | null;
  onAction: () => void;
  onDismiss: () => void;
}

/**
 * Detect whether the user's streak has effectively been lost.
 *
 * Checks if the last read date is more than 2 days ago (accounting for
 * weekend amnesty and freezes) which means the streak would reset to 1
 * on next read. We consider the streak "lost" if it was previously > 0
 * and would reset.
 */
function detectStreakLoss(
  streakCurrent: number,
  lastReadDate: string | null,
  weekendAmnesty: boolean,
  freezes: number
): boolean {
  if (streakCurrent === 0) return false; // Already at 0, no new loss
  if (!lastReadDate) return false;

  const today = new Date();
  const todayStr = today.toDateString();
  const lastRead = new Date(lastReadDate).toDateString();

  // Already read today
  if (lastRead === todayStr) return false;

  // Check if yesterday
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  if (lastRead === yesterday.toDateString()) return false;

  // More than 1 day missed — calculate effective missed days
  const daysMissed = Math.floor(
    (new Date(todayStr).getTime() - new Date(lastRead).getTime()) / (1000 * 60 * 60 * 24)
  );

  let missedWeekendDays = 0;
  if (weekendAmnesty) {
    for (let i = 1; i < daysMissed; i++) {
      const missedDate = new Date();
      missedDate.setDate(missedDate.getDate() - i);
      if (missedDate.getDay() === 0 || missedDate.getDay() === 6) {
        missedWeekendDays++;
      }
    }
  }

  const effectiveMissed = daysMissed - missedWeekendDays;

  // Would a freeze save them?
  if (effectiveMissed >= 1 && freezes > 0) return false;
  // Just missed 1 effective day — streak continues
  if (effectiveMissed === 1) return false;

  // Streak would be broken
  return effectiveMissed > 1;
}

export function usePremiumNudge({ screen }: UsePremiumNudgeParams): UsePremiumNudgeResult {
  // Store selectors — all primitives or stable references
  const premiumPolicy = usePremiumAccessPolicy();
  const isPremium = premiumPolicy === 'granted';
  const streakCurrent = useUnfoldStore((s) => s.streakCurrent);
  const streakLastReadDate = useUnfoldStore((s) => s.streakLastReadDate);
  const streakWeekendAmnesty = useUnfoldStore((s) => s.streakWeekendAmnesty);
  const streakFreezes = useUnfoldStore((s) => s.streakFreezes);
  const streakJustResetFlag = useUnfoldStore((s) => s.streakJustReset);
  const hasUsedAudio = useUnfoldStore((s) => s.hasUsedAudio);
  const justCompletedSeriesTitle = useUnfoldStore((s) => s.justCompletedSeriesTitle);
  const nudgeShownThisSession = useUnfoldStore((s) => s.nudgeShownThisSession);

  // Compute total readings completed across all devotionals
  const devotionals = useUnfoldStore((s) => s.devotionals);
  const totalReadingsCompleted = useMemo(() => {
    let count = 0;
    for (const d of devotionals ?? []) {
      for (const day of d.days ?? []) {
        if (day.isRead) count++;
      }
    }
    return count;
  }, [devotionals]);

  // Nudge state — select as a computed object (acceptable because it's used in a memo)
  const nudgeImpressions = useUnfoldStore((s) => s.nudgeImpressions);
  const nudgeDismissals = useUnfoldStore((s) => s.nudgeDismissals);

  // Detect streak loss
  const streakJustReset = useMemo(
    () => streakJustResetFlag || detectStreakLoss(streakCurrent, streakLastReadDate, streakWeekendAmnesty, streakFreezes),
    [streakJustResetFlag, streakCurrent, streakLastReadDate, streakWeekendAmnesty, streakFreezes]
  );

  // Build context and evaluate
  const nudge = useMemo(() => {
    const ctx: NudgeContext = {
      screen,
      isPremium,
      streakCurrent,
      streakJustReset,
      totalReadingsCompleted,
      hasUsedAudio,
      seriesJustCompleted: justCompletedSeriesTitle,
    };

    const state: NudgeState = {
      nudgeImpressions,
      nudgeShownThisSession,
      nudgeDismissals,
    };

    return evaluateNudges(ctx, state);
  }, [
    screen,
    isPremium,
    streakCurrent,
    streakJustReset,
    totalReadingsCompleted,
    hasUsedAudio,
    justCompletedSeriesTitle,
    nudgeImpressions,
    nudgeShownThisSession,
    nudgeDismissals,
  ]);

  const onAction = useCallback(() => {
    if (!nudge) return;
    const store = useUnfoldStore.getState();
    store.recordNudgeImpression(nudge.type);
    // Journey completion nudge: clear the flag after action
    if (nudge.type === 'journey_completion') {
      store.clearJustCompletedSeriesTitle();
    }
  }, [nudge]);

  const onDismiss = useCallback(() => {
    if (!nudge) return;
    const store = useUnfoldStore.getState();
    store.recordNudgeDismissal(nudge.type);
    store.recordNudgeImpression(nudge.type); // counts as an impression too
    // Journey completion nudge: clear the flag after dismiss
    if (nudge.type === 'journey_completion') {
      store.clearJustCompletedSeriesTitle();
    }
  }, [nudge]);

  return { nudge, onAction, onDismiss };
}
