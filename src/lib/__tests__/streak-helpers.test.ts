import {
  applyStreakRead,
  decideStreakContinuation,
  getStreakDayKey,
  getWeekStart,
  reconcileStreakState,
  shouldCelebrateStreakDayFlip,
  type StreakDecisionInput,
} from '../streak-helpers';

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

  it('resets after a multi-weekday gap when the user has no freezes (COR-1)', () => {
    const now = new Date(2026, 5, 12, 12); // Friday Jun 12 2026 (local noon)

    const result = reconcileStreakState(
      {
        streakCurrent: 50,
        streakLastReadDate: new Date(2026, 5, 8, 12).toISOString(), // Monday — Tue/Wed/Thu all missed
        streakGraceDaysUsedThisWeek: 0,
        streakWeekStart: getWeekStart(now).toISOString(),
        streakWeekendAmnesty: true,
        streakFreezes: 0,
        isPremium: false,
        streakJustReset: false,
      },
      now,
    );

    expect(result.streakCurrent).toBe(0);
    expect(result.streakJustReset).toBe(true);
  });

  it('resets after a 6-month lapse (COR-1 headline)', () => {
    const now = new Date(2026, 5, 8, 12); // Monday Jun 8 2026

    const result = reconcileStreakState(
      {
        streakCurrent: 50,
        streakLastReadDate: new Date(2025, 11, 8, 12).toISOString(), // Monday Dec 8 2025
        streakGraceDaysUsedThisWeek: 0,
        streakWeekStart: getWeekStart(new Date(2025, 11, 8, 12)).toISOString(),
        streakWeekendAmnesty: true,
        streakFreezes: 0,
        isPremium: false,
        streakJustReset: false,
      },
      now,
    );

    expect(result.streakCurrent).toBe(0);
    expect(result.streakJustReset).toBe(true);
  });
});

describe('decideStreakContinuation', () => {
  const at = (y: number, m1: number, d: number) => new Date(y, m1 - 1, d, 12, 0, 0);
  const iso = (y: number, m1: number, d: number) => at(y, m1, d).toISOString();

  const base = (now: Date, over: Partial<StreakDecisionInput> = {}): StreakDecisionInput => ({
    streakCurrent: 10,
    streakLastReadDate: null,
    streakGraceDaysUsedThisWeek: 0,
    streakWeekStart: getWeekStart(now).toISOString(),
    streakWeekendAmnesty: true,
    streakFreezes: 0,
    isPremium: false,
    ...over,
  });

  it('returns same-day when last read is today', () => {
    const now = at(2026, 6, 10); // Wed
    const d = decideStreakContinuation(base(now, { streakLastReadDate: iso(2026, 6, 10) }), now);
    expect(d.kind).toBe('same-day');
    expect(d.freezesConsumed).toBe(0);
  });

  it('continues at no cost when last read was yesterday', () => {
    const now = at(2026, 6, 10); // Wed; lastRead Tue 9
    const d = decideStreakContinuation(base(now, { streakLastReadDate: iso(2026, 6, 9) }), now);
    expect(d).toMatchObject({ kind: 'continue', usedGrace: false, freezesConsumed: 0, missedWeekdays: 0 });
  });

  it('returns no-streak when streakCurrent is 0', () => {
    const now = at(2026, 6, 10);
    const d = decideStreakContinuation(
      base(now, { streakCurrent: 0, streakLastReadDate: iso(2026, 6, 1) }),
      now,
    );
    expect(d.kind).toBe('no-streak');
  });

  it('returns no-streak when there is no last read date', () => {
    const now = at(2026, 6, 10);
    expect(decideStreakContinuation(base(now), now).kind).toBe('no-streak');
  });

  it('weekend-only gap continues free — no freeze burn even for premium holders (COR-2)', () => {
    const now = at(2026, 6, 15); // Mon; lastRead Fri 12; between = {Sat 13, Sun 14} → 0 missed weekdays
    const d = decideStreakContinuation(
      base(now, {
        streakLastReadDate: iso(2026, 6, 12),
        streakWeekStart: getWeekStart(at(2026, 6, 12)).toISOString(), // previous week
        streakFreezes: 3,
        isPremium: true,
      }),
      now,
    );
    expect(d).toMatchObject({ kind: 'continue', usedGrace: false, freezesConsumed: 0, missedWeekdays: 0 });
  });

  it('weekend gap with amnesty OFF: 2 missed days — grace covers 1, free user resets', () => {
    const now = at(2026, 6, 15); // between = {Sat 13, Sun 14} → 2 missed (no amnesty)
    const d = decideStreakContinuation(
      base(now, { streakLastReadDate: iso(2026, 6, 12), streakWeekendAmnesty: false }),
      now,
    );
    expect(d.kind).toBe('reset');
    expect(d.missedWeekdays).toBe(2);
  });

  it('weekend gap with amnesty OFF: premium with 1 freeze continues (grace + 1 freeze)', () => {
    const now = at(2026, 6, 15);
    const d = decideStreakContinuation(
      base(now, {
        streakLastReadDate: iso(2026, 6, 12),
        streakWeekendAmnesty: false,
        streakFreezes: 1,
        isPremium: true,
      }),
      now,
    );
    expect(d).toMatchObject({ kind: 'continue', usedGrace: true, freezesConsumed: 1, missedWeekdays: 2 });
  });

  it('single missed weekday uses grace BEFORE freezes (COR-2 ordering)', () => {
    const now = at(2026, 6, 10); // Wed; lastRead Mon 8; between = {Tue 9} → 1 missed
    const d = decideStreakContinuation(
      base(now, { streakLastReadDate: iso(2026, 6, 8), streakFreezes: 5, isPremium: true }),
      now,
    );
    expect(d).toMatchObject({ kind: 'continue', usedGrace: true, freezesConsumed: 0, missedWeekdays: 1 });
  });

  it('single missed weekday with grace already used: free user resets (1 grace/week)', () => {
    const now = at(2026, 6, 10);
    const d = decideStreakContinuation(
      base(now, { streakLastReadDate: iso(2026, 6, 8), streakGraceDaysUsedThisWeek: 1 }),
      now,
    );
    expect(d.kind).toBe('reset');
  });

  it('single missed weekday with grace already used: premium burns exactly one freeze', () => {
    const now = at(2026, 6, 10);
    const d = decideStreakContinuation(
      base(now, {
        streakLastReadDate: iso(2026, 6, 8),
        streakGraceDaysUsedThisWeek: 1,
        streakFreezes: 1,
        isPremium: true,
      }),
      now,
    );
    expect(d).toMatchObject({ kind: 'continue', usedGrace: false, freezesConsumed: 1, missedWeekdays: 1 });
  });

  it('three missed weekdays reset a free user even with fresh grace (COR-1)', () => {
    const now = at(2026, 6, 12); // Fri; lastRead Mon 8; between = {Tue 9, Wed 10, Thu 11} → 3 missed
    const d = decideStreakContinuation(base(now, { streakLastReadDate: iso(2026, 6, 8) }), now);
    expect(d.kind).toBe('reset');
    expect(d.missedWeekdays).toBe(3);
  });

  it('three missed weekdays: premium with 2 freezes continues via grace + 2 freezes', () => {
    const now = at(2026, 6, 12);
    const d = decideStreakContinuation(
      base(now, { streakLastReadDate: iso(2026, 6, 8), streakFreezes: 2, isPremium: true }),
      now,
    );
    expect(d).toMatchObject({ kind: 'continue', usedGrace: true, freezesConsumed: 2, missedWeekdays: 3 });
  });

  it('three missed weekdays: premium with only 1 freeze resets (gap must be fully covered)', () => {
    const now = at(2026, 6, 12);
    const d = decideStreakContinuation(
      base(now, { streakLastReadDate: iso(2026, 6, 8), streakFreezes: 1, isPremium: true }),
      now,
    );
    expect(d.kind).toBe('reset');
  });

  it('a new week renews the grace day (cross-week single missed weekday continues)', () => {
    const now = at(2026, 6, 8); // Mon (new week, weekStart Sun Jun 7); lastRead Thu 4
    // between = {Fri 5, Sat 6, Sun 7}; amnesty forgives Sat+Sun → 1 missed weekday (Fri 5)
    const d = decideStreakContinuation(
      base(now, {
        streakLastReadDate: iso(2026, 6, 4),
        streakWeekStart: getWeekStart(at(2026, 6, 4)).toISOString(), // stale (previous week)
        streakGraceDaysUsedThisWeek: 1, // used LAST week — must roll over to 0
      }),
      now,
    );
    expect(d).toMatchObject({ kind: 'continue', usedGrace: true, freezesConsumed: 0, missedWeekdays: 1 });
    expect(d.graceAfterWeekRollover).toBe(0);
  });

  it('a 6-month lapse resets even a premium user holding the max 99 freezes (COR-1 headline)', () => {
    const now = at(2026, 6, 8); // Mon Jun 8 2026; lastRead Mon Dec 8 2025
    // Span Mon→Mon = 182 days → 181 strictly-between days (Tue Dec 9 … Sun Jun 7):
    // 25 full Tue-anchored weeks (50 weekend days) + 6 remainder days Tue–Sun (2 weekend)
    // = 52 weekend days → 129 missed weekdays in UTC. In a US-DST timezone the
    // local-midnight span loses 1h at spring-forward → 128. Either way >> 99 + 1.
    const d = decideStreakContinuation(
      base(now, {
        streakLastReadDate: iso(2025, 12, 8),
        streakWeekStart: getWeekStart(at(2025, 12, 8)).toISOString(),
        streakFreezes: 99,
        isPremium: true,
      }),
      now,
    );
    expect(d.kind).toBe('reset');
    expect(d.missedWeekdays).toBeGreaterThan(100);
  });

  it('spring-forward weekend gap continues free in any timezone (DST)', () => {
    // lastRead Fri Mar 6 2026, now Mon Mar 9 2026; US DST starts Sun Mar 8.
    // DST zones: local-midnight span = 71h → daySpan 2, between = {Sun 8} (amnestied).
    // Non-DST zones: daySpan 3, between = {Sat 7, Sun 8} (amnestied). Both → 0 missed.
    const now = at(2026, 3, 9);
    const d = decideStreakContinuation(
      base(now, {
        streakLastReadDate: iso(2026, 3, 6),
        streakWeekStart: getWeekStart(at(2026, 3, 6)).toISOString(),
        streakFreezes: 2,
        isPremium: true,
      }),
      now,
    );
    expect(d).toMatchObject({ kind: 'continue', usedGrace: false, freezesConsumed: 0, missedWeekdays: 0 });
  });

  it('spring-forward calendar-day span still counts the missing Sunday when amnesty is off (FE-08)', () => {
    const previousTz = process.env.TZ;
    process.env.TZ = 'America/New_York';

    try {
      const now = at(2026, 3, 9); // Mon after US spring-forward Sunday
      const d = decideStreakContinuation(
        base(now, {
          streakLastReadDate: iso(2026, 3, 7), // Sat before 23-hour Sunday
          streakWeekStart: getWeekStart(now).toISOString(),
          streakWeekendAmnesty: false,
          streakGraceDaysUsedThisWeek: 1,
          streakFreezes: 0,
        }),
        now,
      );

      expect(d.kind).toBe('reset');
      expect(d.missedWeekdays).toBe(1);
    } finally {
      process.env.TZ = previousTz;
    }
  });

  it('fall-back weekend gap continues free in any timezone (DST)', () => {
    // lastRead Fri Oct 30 2026, now Mon Nov 2 2026; US DST ends Sun Nov 1.
    // DST zones: span 73h → daySpan 3; non-DST: 3. Between = {Sat 31, Sun 1} → 0 missed.
    const now = at(2026, 11, 2);
    const d = decideStreakContinuation(
      base(now, {
        streakLastReadDate: iso(2026, 10, 30),
        streakWeekStart: getWeekStart(at(2026, 10, 30)).toISOString(),
      }),
      now,
    );
    expect(d).toMatchObject({ kind: 'continue', usedGrace: false, freezesConsumed: 0, missedWeekdays: 0 });
  });

  it('a future lastRead (device clock rolled back) continues at no cost', () => {
    const now = at(2026, 6, 10);
    const d = decideStreakContinuation(base(now, { streakLastReadDate: iso(2026, 6, 12) }), now);
    expect(d).toMatchObject({ kind: 'continue', usedGrace: false, freezesConsumed: 0, missedWeekdays: 0 });
  });

  // ── REVM-3: churned-premium users can CONSUME banked freezes ─────────────
  it('churned-premium: 3 banked freezes + 2-weekday gap → grace covers 1, 1 freeze consumed, streak survives', () => {
    // Now = Wed Jun 10; lastRead = Mon Jun 8 (same week, grace not yet used).
    // Between = {Tue 9} → but let's use a Mon Jun 8 lastRead from the PREVIOUS
    // week so we get 2 missed weekdays cleanly.
    // now = Fri Jun 12, lastRead = Mon Jun 8: between = {Tue 9, Wed 10, Thu 11}
    // = 3 missed weekdays. With grace covering 1 and 3 banked freezes covering 2 more,
    // streak survives and freezesConsumed = 2.
    // For the stated "2-weekday gap" scenario: now = Wed Jun 10, lastRead = Fri Jun 6
    // (prev week); between = {Mon 8, Tue 9} = 2 missed weekdays. Grace covers 1
    // (new week rolled), 1 freeze covers the other.
    const now = at(2026, 6, 10); // Wed Jun 10; new week (Sun Jun 7 start)
    const d = decideStreakContinuation(
      base(now, {
        streakLastReadDate: iso(2026, 6, 6), // Fri Jun 6 (prev week)
        streakWeekStart: getWeekStart(at(2026, 6, 6)).toISOString(), // stale: prev week
        streakGraceDaysUsedThisWeek: 1, // used in previous week — must roll to 0 at new week
        streakFreezes: 3,
        isPremium: false, // CHURNED — no longer premium
      }),
      now,
    );
    // Between Fri Jun 6 and Wed Jun 10: {Mon 8, Tue 9} = 2 missed weekdays (Sat/Sun forgiven).
    // Grace rolls to 0 at new week, so graceCover = 1. freezesNeeded = 2 - 1 = 1.
    // Churned user has 3 banked freezes → can cover the gap → streak continues.
    expect(d.kind).toBe('continue');
    expect(d.missedWeekdays).toBe(2);
    expect(d.freezesConsumed).toBe(1);
    expect(d.usedGrace).toBe(true);
  });
});

describe('applyStreakRead', () => {
  const at = (y: number, m1: number, d: number) => new Date(y, m1 - 1, d, 12, 0, 0);
  const iso = (y: number, m1: number, d: number) => at(y, m1, d).toISOString();

  const read = (now: Date, over: Partial<Parameters<typeof applyStreakRead>[0]> = {}) =>
    applyStreakRead(
      {
        streakCurrent: 10,
        streakLastReadDate: null,
        streakGraceDaysUsedThisWeek: 0,
        streakWeekStart: getWeekStart(now).toISOString(),
        streakWeekendAmnesty: true,
        streakFreezes: 0,
        isPremium: false,
        streakLongest: 20,
        ...over,
      },
      now,
    );

  it('returns null for a same-day repeat read', () => {
    const now = at(2026, 6, 10);
    expect(read(now, { streakLastReadDate: iso(2026, 6, 10) })).toBeNull();
  });

  it('extends the streak and stamps lastRead/weekStart on a next-day read', () => {
    const now = at(2026, 6, 10);
    const r = read(now, { streakLastReadDate: iso(2026, 6, 9) });
    expect(r).toEqual({
      streakLastReadDate: now.toISOString(),
      streakCurrent: 11,
      streakLongest: 20,
      streakGraceDaysUsedThisWeek: 0,
      streakWeekStart: getWeekStart(now).toISOString(),
      streakFreezes: 0,
    });
  });

  it('does not burn freezes across a weekend gap (COR-2)', () => {
    const now = at(2026, 6, 15); // Mon after lastRead Fri 12
    const r = read(now, {
      streakLastReadDate: iso(2026, 6, 12),
      streakWeekStart: getWeekStart(at(2026, 6, 12)).toISOString(),
      streakFreezes: 3,
      isPremium: true,
    });
    expect(r?.streakCurrent).toBe(11);
    expect(r?.streakFreezes).toBe(3);
  });

  it('burns one freeze per uncovered missed weekday and records the grace day', () => {
    const now = at(2026, 6, 12); // 3 missed weekdays (Tue/Wed/Thu)
    const r = read(now, {
      streakLastReadDate: iso(2026, 6, 8),
      streakFreezes: 2,
      isPremium: true,
    });
    expect(r?.streakCurrent).toBe(11);
    expect(r?.streakFreezes).toBe(0);
    expect(r?.streakGraceDaysUsedThisWeek).toBe(1);
  });

  it('resets to 1 on an uncoverable gap, preserving longest and freezes', () => {
    const now = at(2026, 6, 12);
    const r = read(now, { streakLastReadDate: iso(2026, 6, 8) }); // free, 3 missed
    expect(r?.streakCurrent).toBe(1);
    expect(r?.streakLongest).toBe(20);
    expect(r?.streakFreezes).toBe(0);
  });

  it('premium earns a freeze at the 7-day milestone even when streakLongest is far higher (COR-3)', () => {
    const now = at(2026, 6, 10);
    const r = read(now, {
      streakCurrent: 6,
      streakLastReadDate: iso(2026, 6, 9),
      streakLongest: 49, // rebuilt streak after losing a 49-day streak
      isPremium: true,
    });
    expect(r?.streakCurrent).toBe(7);
    expect(r?.streakFreezes).toBe(1);
  });

  it('free users never accumulate freezes at milestones', () => {
    const now = at(2026, 6, 10);
    const r = read(now, { streakCurrent: 6, streakLastReadDate: iso(2026, 6, 9) });
    expect(r?.streakCurrent).toBe(7);
    expect(r?.streakFreezes).toBe(0);
  });

  it('a churned-premium user keeps banked freezes at a 7-day milestone (REVM-3)', () => {
    const now = at(2026, 6, 10);
    const r = read(now, {
      streakCurrent: 6,
      streakLastReadDate: iso(2026, 6, 9),
      streakFreezes: 3, // banked while subscribed; subscription has since lapsed
      isPremium: false,
    });
    // Formula: yesterday-read → 'continue', freezesConsumed 0 → newFreezes = 3.
    // Milestone: newStreak 7 % 7 === 0, but isPremium false → NO earn, NO clamp.
    expect(r?.streakCurrent).toBe(7);
    expect(r?.streakFreezes).toBe(3);
  });

  it('churned-premium user CONSUMES banked freezes across a 2-weekday gap (REVM-3 consume path)', () => {
    // now = Wed Jun 10 (new week). Last read = Fri Jun 6 (prev week).
    // Between: {Mon 8, Tue 9} = 2 missed weekdays. Grace (new week) covers 1.
    // freezesNeeded = 1. Churned user (isPremium=false) has 3 banked freezes.
    // FIX-C: banked freezes are consumable regardless of plan status.
    const now = at(2026, 6, 10); // Wed Jun 10
    const r = read(now, {
      streakCurrent: 10,
      streakLastReadDate: iso(2026, 6, 6), // Fri Jun 6
      streakWeekStart: getWeekStart(at(2026, 6, 6)).toISOString(), // stale prev-week
      streakGraceDaysUsedThisWeek: 1, // used in prev week → rolls to 0 in new week
      streakFreezes: 3,
      isPremium: false, // churned
    });
    // Grace consumed (new week → rolled to 0 then used): 1; freezesNeeded = 1 → burns 1.
    expect(r).not.toBeNull();
    expect(r?.streakCurrent).toBe(11); // streak survived
    expect(r?.streakFreezes).toBe(2);  // 3 banked − 1 consumed = 2
    expect(r?.streakGraceDaysUsedThisWeek).toBe(1);
  });

  it('freeze earning caps at 99', () => {
    const now = at(2026, 6, 10);
    const r = read(now, {
      streakCurrent: 6,
      streakLastReadDate: iso(2026, 6, 9),
      streakFreezes: 99,
      isPremium: true,
    });
    expect(r?.streakFreezes).toBe(99);
  });

  it('passive reconcile followed by a read equals reading directly (paths commute)', () => {
    const rows: { name: string; now: Date; over: Partial<Parameters<typeof applyStreakRead>[0]> }[] = [
      {
        name: 'weekend gap, premium holder',
        now: at(2026, 6, 15),
        over: {
          streakLastReadDate: iso(2026, 6, 12),
          streakWeekStart: getWeekStart(at(2026, 6, 12)).toISOString(),
          streakFreezes: 3,
          isPremium: true,
        },
      },
      {
        name: '3-weekday gap, free user (reset)',
        now: at(2026, 6, 12),
        over: { streakLastReadDate: iso(2026, 6, 8) },
      },
      {
        name: 'single missed weekday covered by grace',
        now: at(2026, 6, 10),
        over: { streakLastReadDate: iso(2026, 6, 8), streakFreezes: 2, isPremium: true },
      },
    ];

    for (const row of rows) {
      const input = {
        streakCurrent: 10,
        streakLastReadDate: null as string | null,
        streakGraceDaysUsedThisWeek: 0,
        streakWeekStart: getWeekStart(row.now).toISOString(),
        streakWeekendAmnesty: true,
        streakFreezes: 0,
        isPremium: false,
        streakLongest: 20,
        ...row.over,
      };
      const direct = applyStreakRead(input, row.now);
      const rec = reconcileStreakState({ ...input, streakJustReset: false }, row.now);
      const viaReconcile = applyStreakRead(
        {
          ...input,
          streakCurrent: rec.streakCurrent,
          streakGraceDaysUsedThisWeek: rec.streakGraceDaysUsedThisWeek,
          streakWeekStart: rec.streakWeekStart,
        },
        row.now,
      );
      expect({ name: row.name, result: viaReconcile }).toEqual({ name: row.name, result: direct });
    }
  });
});

describe('streak celebration day-flip gate (COR-7/COR-8)', () => {
  it('derives a calendar-day key from streakLastReadDate', () => {
    expect(getStreakDayKey(null)).toBeNull();
    expect(getStreakDayKey('2026-06-10T08:30:00.000Z')).toBe(
      new Date('2026-06-10T08:30:00.000Z').toDateString(),
    );
  });

  const TODAY = new Date('2026-06-10T12:00:00.000Z').toDateString();
  const YESTERDAY = new Date('2026-06-09T12:00:00.000Z').toDateString();

  it.each([
    // [label, prevDayKey, dayKey, todayKey, expected]
    ['first-ever read today fires', null, TODAY, TODAY, true],
    ['yesterday→today flip fires (post-midnight session, COR-8)', YESTERDAY, TODAY, TODAY, true],
    ['mount with an already-read today never fires (prev undefined)', undefined, TODAY, TODAY, false],
    ['same-day re-read never fires (key unchanged, COR-7)', TODAY, TODAY, TODAY, false],
    ['no read recorded never fires', null, null, TODAY, false],
    ['flip to a non-today day never fires (QA seed of historic read)', null, YESTERDAY, TODAY, false],
    ['read date wiped (reset) never fires', TODAY, null, TODAY, false],
  ] as const)('%s', (_label, prevDayKey, dayKey, todayKey, expected) => {
    expect(shouldCelebrateStreakDayFlip({ prevDayKey, dayKey, todayKey })).toBe(expected);
  });
});
