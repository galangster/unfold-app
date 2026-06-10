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
import { decideStreakContinuation } from '@/lib/streak-helpers';

interface UsePremiumNudgeParams {
  screen: 'home' | 'reading';
}

interface UsePremiumNudgeResult {
  nudge: EligibleNudge | null;
  onAction: () => void;
  onDismiss: () => void;
}


export function usePremiumNudge({ screen }: UsePremiumNudgeParams): UsePremiumNudgeResult {
  // Store selectors — all primitives or stable references
  const premiumPolicy = usePremiumAccessPolicy();
  // Premium nudges are upsells. Suppress them not only for granted access,
  // but also while entitlement resolution is still unknown so paid users don't
  // see a brief churn/upgrade card during RevenueCat cold-start windows.
  const shouldSuppressPremiumNudges = premiumPolicy !== 'denied';
  const streakCurrent = useUnfoldStore((s) => s.streakCurrent);
  const streakLastReadDate = useUnfoldStore((s) => s.streakLastReadDate);
  const streakWeekendAmnesty = useUnfoldStore((s) => s.streakWeekendAmnesty);
  const streakFreezes = useUnfoldStore((s) => s.streakFreezes);
  const streakGraceDaysUsedThisWeek = useUnfoldStore((s) => s.streakGraceDaysUsedThisWeek);
  const streakWeekStart = useUnfoldStore((s) => s.streakWeekStart);
  const isPremiumUser = useUnfoldStore((s) => Boolean(s.user?.isPremium));
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

  // Detect streak loss — same decision helper as the engine, so the nudge
  // can never disagree with what recordStreakRead/reconcileStreakState do.
  const streakJustReset = useMemo(
    () =>
      streakJustResetFlag ||
      decideStreakContinuation({
        streakCurrent,
        streakLastReadDate,
        streakGraceDaysUsedThisWeek,
        streakWeekStart,
        streakWeekendAmnesty,
        streakFreezes,
        isPremium: isPremiumUser,
      }).kind === 'reset',
    [streakJustResetFlag, streakCurrent, streakLastReadDate, streakGraceDaysUsedThisWeek, streakWeekStart, streakWeekendAmnesty, streakFreezes, isPremiumUser]
  );

  // Build context and evaluate
  const nudge = useMemo(() => {
    const ctx: NudgeContext = {
      screen,
      isPremium: shouldSuppressPremiumNudges,
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
    shouldSuppressPremiumNudges,
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
