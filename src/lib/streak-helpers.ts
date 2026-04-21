export type ReconcileStreakInput = {
  streakCurrent: number;
  streakLastReadDate: string | null;
  streakGraceDaysUsedThisWeek: number;
  streakWeekStart: string | null;
  streakWeekendAmnesty: boolean;
  streakFreezes: number;
  isPremium: boolean;
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

export function reconcileStreakState(
  input: ReconcileStreakInput,
  now = new Date(),
): ReconcileStreakResult {
  const currentWeekStartIso = getWeekStart(now).toISOString();
  const isNewWeek = !input.streakWeekStart || input.streakWeekStart !== currentWeekStartIso;
  const nextGraceDays = isNewWeek ? 0 : input.streakGraceDaysUsedThisWeek;

  if (!input.streakLastReadDate || input.streakCurrent === 0) {
    return {
      streakCurrent: input.streakCurrent,
      streakGraceDaysUsedThisWeek: nextGraceDays,
      streakWeekStart: currentWeekStartIso,
      streakJustReset: input.streakJustReset,
    };
  }

  const today = now.toDateString();
  const lastRead = new Date(input.streakLastReadDate).toDateString();

  if (lastRead === today) {
    return {
      streakCurrent: input.streakCurrent,
      streakGraceDaysUsedThisWeek: nextGraceDays,
      streakWeekStart: currentWeekStartIso,
      streakJustReset: input.streakJustReset,
    };
  }

  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (lastRead === yesterday.toDateString()) {
    return {
      streakCurrent: input.streakCurrent,
      streakGraceDaysUsedThisWeek: nextGraceDays,
      streakWeekStart: currentWeekStartIso,
      streakJustReset: input.streakJustReset,
    };
  }

  const daysMissed = Math.floor(
    (new Date(today).getTime() - new Date(lastRead).getTime()) / (1000 * 60 * 60 * 24),
  );

  let missedWeekendDays = 0;
  if (input.streakWeekendAmnesty) {
    for (let i = 1; i < daysMissed; i++) {
      const missedDate = new Date(now);
      missedDate.setDate(missedDate.getDate() - i);
      if (missedDate.getDay() === 0 || missedDate.getDay() === 6) {
        missedWeekendDays++;
      }
    }
  }

  const effectiveMissed = daysMissed - missedWeekendDays;
  const streakWouldContinue =
    (effectiveMissed >= 1 && input.streakFreezes > 0 && input.isPremium) ||
    effectiveMissed === 1 ||
    (effectiveMissed > 1 && nextGraceDays < 1);

  if (streakWouldContinue) {
    return {
      streakCurrent: input.streakCurrent,
      streakGraceDaysUsedThisWeek: nextGraceDays,
      streakWeekStart: currentWeekStartIso,
      streakJustReset: input.streakJustReset,
    };
  }

  return {
    streakCurrent: 0,
    streakGraceDaysUsedThisWeek: nextGraceDays,
    streakWeekStart: currentWeekStartIso,
    streakJustReset: input.streakCurrent > 0,
  };
}
