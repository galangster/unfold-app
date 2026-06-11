const DAY_MS = 24 * 60 * 60 * 1000;

/** Maximum freezes a premium user can hold (free users cannot hold any). */
export const MAX_FREEZES = 99;

export type StreakDecisionInput = {
  streakCurrent: number;
  streakLastReadDate: string | null;
  streakGraceDaysUsedThisWeek: number;
  streakWeekStart: string | null;
  streakWeekendAmnesty: boolean;
  streakFreezes: number;
  isPremium: boolean;
};

export type ReconcileStreakInput = StreakDecisionInput & {
  streakJustReset: boolean;
};

export type ReconcileStreakResult = Pick<
  ReconcileStreakInput,
  | 'streakCurrent'
  | 'streakGraceDaysUsedThisWeek'
  | 'streakWeekStart'
  | 'streakJustReset'
>;

export function getWeekStart(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day;
  d.setDate(diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

export type StreakDecisionKind = 'no-streak' | 'same-day' | 'continue' | 'reset';

export type StreakDecision = {
  kind: StreakDecisionKind;
  /** ISO week start (Sunday) at `now`; both engine paths persist this. */
  weekStart: string;
  /** Grace counter after the weekly rollover, BEFORE any consumption by this decision. */
  graceAfterWeekRollover: number;
  /** True when kind === 'continue' and the weekly grace day covers one missed weekday. */
  usedGrace: boolean;
  /** Freezes consumed when kind === 'continue' — one per missed weekday not covered by grace. */
  freezesConsumed: number;
  /** Weekdays strictly between lastRead and now that weekend amnesty did not forgive. */
  missedWeekdays: number;
};

/**
 * Single source of truth for the streak miss/amnesty/grace/freeze decision.
 * Consumed by BOTH engine paths — applyStreakRead (active: applies costs) and
 * reconcileStreakState (passive: display only, never consumes grace/freezes) —
 * and by the premium-nudge streak-loss detector.
 *
 * Rules:
 *  - Reading today or yesterday continues the streak at no cost.
 *  - Saturdays/Sundays in the gap are forgiven when weekend amnesty is on.
 *  - The weekly grace day covers ONE missed weekday per week, for everyone.
 *  - Each freeze (premium only) covers ONE additional missed weekday.
 *  - If the gap cannot be fully covered, the streak resets.
 */
export function decideStreakContinuation(
  input: StreakDecisionInput,
  now = new Date(),
): StreakDecision {
  const weekStart = getWeekStart(now).toISOString();
  const isNewWeek = !input.streakWeekStart || input.streakWeekStart !== weekStart;
  const graceAfterWeekRollover = isNewWeek ? 0 : input.streakGraceDaysUsedThisWeek;

  const base = {
    weekStart,
    graceAfterWeekRollover,
    usedGrace: false,
    freezesConsumed: 0,
    missedWeekdays: 0,
  };

  if (!input.streakLastReadDate) {
    return { ...base, kind: 'no-streak' };
  }

  const today = now.toDateString();
  const lastRead = new Date(input.streakLastReadDate).toDateString();

  // Same-day must win over no-streak so a completed read stays a no-op.
  if (lastRead === today) {
    return { ...base, kind: 'same-day' };
  }

  if (input.streakCurrent === 0) {
    return { ...base, kind: 'no-streak' };
  }

  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (lastRead === yesterday.toDateString()) {
    return { ...base, kind: 'continue' };
  }

  const daySpan = Math.floor(
    (new Date(today).getTime() - new Date(lastRead).getTime()) / DAY_MS,
  );

  // Count weekdays strictly between lastRead and today. Weekend amnesty
  // (when enabled) forgives Saturdays/Sundays in the gap. A future lastRead
  // (negative span, device clock rolled back) counts zero missed days.
  let missedWeekdays = 0;
  for (let i = 1; i < daySpan; i++) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const isWeekend = d.getDay() === 0 || d.getDay() === 6;
    if (!(input.streakWeekendAmnesty && isWeekend)) {
      missedWeekdays++;
    }
  }

  if (missedWeekdays === 0) {
    return { ...base, kind: 'continue' };
  }

  // Coverage: the free weekly grace day covers one missed weekday; each
  // banked freeze covers one more. Banked freezes are CONSUMABLE regardless of
  // current plan status — churned-premium users keep and spend their banked
  // balance (REVM-3). Only EARNING new freezes is gated on isPremium (that
  // guard lives in applyStreakRead's milestone block, not here).
  const graceCover = graceAfterWeekRollover < 1 ? 1 : 0;
  const freezesAvailable = Math.max(0, input.streakFreezes);
  const freezesNeeded = missedWeekdays - graceCover;

  if (freezesNeeded <= freezesAvailable) {
    return {
      ...base,
      kind: 'continue',
      usedGrace: graceCover === 1,
      freezesConsumed: Math.max(0, freezesNeeded),
      missedWeekdays,
    };
  }

  return { ...base, kind: 'reset', missedWeekdays };
}

export type StreakReadInput = StreakDecisionInput & { streakLongest: number };

export type StreakReadResult = {
  streakLastReadDate: string;
  streakCurrent: number;
  streakLongest: number;
  streakGraceDaysUsedThisWeek: number;
  streakWeekStart: string;
  streakFreezes: number;
};

/**
 * Active engine path: apply a completed reading at `now`.
 * Returns null when the user already read today (caller keeps state as-is).
 * Reset keeps the week-rolled grace counter (not zero) so that running the
 * passive reconcile first and then reading yields identical state to reading
 * directly — the two paths must commute.
 */
export function applyStreakRead(
  input: StreakReadInput,
  now = new Date(),
): StreakReadResult | null {
  const decision = decideStreakContinuation(input, now);

  if (decision.kind === 'same-day') {
    return null;
  }

  let newStreak: number;
  let newGrace: number;
  let newFreezes = input.streakFreezes;

  if (decision.kind === 'reset') {
    newStreak = 1;
    newGrace = decision.graceAfterWeekRollover;
  } else {
    // 'no-streak' and 'continue' both extend by this read.
    newStreak = input.streakCurrent + 1;
    newGrace = decision.graceAfterWeekRollover + (decision.usedGrace ? 1 : 0);
    newFreezes = input.streakFreezes - decision.freezesConsumed;
  }

  // Earn a freeze at every 7-day milestone of the CURRENT streak — premium
  // only. Free (incl. churned-premium) users simply do not EARN here; a
  // banked balance from a past subscription is preserved, never clamped
  // away (REVM-3). No longest-streak dedupe: after a reset the user must be
  // able to earn again while rebuilding (COR-3).
  if (input.isPremium && newStreak > 0 && newStreak % 7 === 0) {
    newFreezes = Math.min(newFreezes + 1, MAX_FREEZES);
  }

  return {
    streakLastReadDate: now.toISOString(),
    streakCurrent: newStreak,
    streakLongest: Math.max(input.streakLongest, newStreak),
    streakGraceDaysUsedThisWeek: newGrace,
    streakWeekStart: decision.weekStart,
    streakFreezes: newFreezes,
  };
}

export function reconcileStreakState(
  input: ReconcileStreakInput,
  now = new Date(),
): ReconcileStreakResult {
  const decision = decideStreakContinuation(input, now);

  if (decision.kind === 'reset') {
    return {
      streakCurrent: 0,
      streakGraceDaysUsedThisWeek: decision.graceAfterWeekRollover,
      streakWeekStart: decision.weekStart,
      streakJustReset: input.streakCurrent > 0,
    };
  }

  // Passive path: never consumes grace or freezes — costs are only applied
  // by applyStreakRead when the user actually reads.
  return {
    streakCurrent: input.streakCurrent,
    streakGraceDaysUsedThisWeek: decision.graceAfterWeekRollover,
    streakWeekStart: decision.weekStart,
    streakJustReset: input.streakJustReset,
  };
}

/**
 * Calendar-day key for the unified streak engine's last-read timestamp.
 * toDateString() matches the day arithmetic used by decideStreakContinuation
 * and by widget-bridge's hasReadToday, so all "did I read today" definitions
 * derived from the engine agree.
 */
export function getStreakDayKey(streakLastReadDate: string | null): string | null {
  return streakLastReadDate ? new Date(streakLastReadDate).toDateString() : null;
}

export type StreakCelebrationFlipInput = {
  /** Day key from the previous render; undefined = first render after mount. */
  prevDayKey: string | null | undefined;
  /** Day key for the current render. */
  dayKey: string | null;
  /** Fresh calendar-day key for "now" — compute at event time, not render time. */
  todayKey: string;
};

/**
 * Celebrate at most once per calendar day: only when the streak engine's
 * last-read day key CHANGES (day-flip) and lands on today (COR-7/COR-8).
 * - Mount/remount never fires (prevDayKey undefined — no observed transition).
 * - Same-day re-reads never fire: recordStreakRead is a same-day no-op, so
 *   streakLastReadDate (and therefore the key) never changes (kills COR-7).
 * - A flip observed across midnight (yesterday→today) fires (kills COR-8).
 * - A flip to a non-today day (historic QA seed, clock rollback) never fires.
 */
export function shouldCelebrateStreakDayFlip({
  prevDayKey,
  dayKey,
  todayKey,
}: StreakCelebrationFlipInput): boolean {
  if (prevDayKey === undefined) return false;
  if (dayKey === null) return false;
  if (dayKey === prevDayKey) return false;
  return dayKey === todayKey;
}
