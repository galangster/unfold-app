import { getWeekStart, reconcileStreakState } from '../streak-helpers';

describe('streak helpers', () => {
  it('resets a stale streak to 0 after enough missed weekdays', () => {
    const now = new Date('2026-04-20T12:00:00.000Z'); // Monday

    expect(
      reconcileStreakState(
        {
          streakCurrent: 13,
          streakLastReadDate: '2026-04-16T12:00:00.000Z', // Thursday
          streakGraceDaysUsedThisWeek: 1,
          streakWeekStart: getWeekStart(new Date('2026-04-20T12:00:00.000Z')).toISOString(),
          streakWeekendAmnesty: true,
          streakFreezes: 0,
          isPremium: false,
          streakJustReset: false,
        },
        now,
      ),
    ).toEqual({
      streakCurrent: 0,
      streakGraceDaysUsedThisWeek: 1,
      streakWeekStart: getWeekStart(now).toISOString(),
      streakJustReset: true,
    });
  });

  it('preserves a streak when only weekend-amnesty days were missed', () => {
    const now = new Date('2026-04-20T12:00:00.000Z'); // Monday

    expect(
      reconcileStreakState(
        {
          streakCurrent: 13,
          streakLastReadDate: '2026-04-17T12:00:00.000Z', // Friday
          streakGraceDaysUsedThisWeek: 0,
          streakWeekStart: getWeekStart(now).toISOString(),
          streakWeekendAmnesty: true,
          streakFreezes: 0,
          isPremium: false,
          streakJustReset: false,
        },
        now,
      ),
    ).toEqual({
      streakCurrent: 13,
      streakGraceDaysUsedThisWeek: 0,
      streakWeekStart: getWeekStart(now).toISOString(),
      streakJustReset: false,
    });
  });

  it('resets weekly grace bookkeeping when a new week starts without forcing a reset', () => {
    const now = new Date('2026-04-20T12:00:00.000Z'); // Monday

    expect(
      reconcileStreakState(
        {
          streakCurrent: 5,
          streakLastReadDate: '2026-04-19T12:00:00.000Z', // Sunday / yesterday
          streakGraceDaysUsedThisWeek: 1,
          streakWeekStart: getWeekStart(new Date('2026-04-12T12:00:00.000Z')).toISOString(),
          streakWeekendAmnesty: true,
          streakFreezes: 0,
          isPremium: false,
          streakJustReset: false,
        },
        now,
      ),
    ).toEqual({
      streakCurrent: 5,
      streakGraceDaysUsedThisWeek: 0,
      streakWeekStart: getWeekStart(now).toISOString(),
      streakJustReset: false,
    });
  });
});
