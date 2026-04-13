/**
 * Pure-function tests for the check-in scheduling decision logic.
 *
 * The real `scheduleMiddayCheckIn` / `scheduleEveningWindDown` functions in
 * `src/lib/notifications.ts` branch on the presence of `middayCheckInByDay` /
 * `eveningWindDownByDay` to decide whether to schedule:
 *
 *   - A single DAILY trigger (uniform mode, byDay === null)
 *   - Up to 7 WEEKLY triggers (per-day mode, byDay is a partial record)
 *
 * This file mirrors the pure decision helper `buildCheckInSchedule` and tests
 * every branch + edge case. The live scheduling functions call into this
 * same helper, then loop the returned ops and hit
 * `Notifications.scheduleNotificationAsync`. Testing the pure helper in
 * isolation sidesteps mocking expo-notifications / React / Zustand entirely.
 *
 * Why per-day scheduling exists at all:
 *
 *   The `checkin-schedule.tsx` settings screen writes `middayCheckInByDay`
 *   and `eveningWindDownByDay` to Zustand for a "customize by day" UX.
 *   Before this refactor, those fields were DEAD WRITES — no consumer
 *   read them, so users could "save" per-day schedules that did nothing.
 *   Codex caught this during the churned-notification audit (see session
 *   memory `project_unfold_churned_notifications_complete_2026_04_12.md`,
 *   Finding #2). The fix is to branch on `byDay` and emit WEEKLY triggers
 *   when it's populated, falling back to a single DAILY trigger when it's
 *   null for backward compat.
 *
 * Apple weekday convention:
 *   expo-notifications' WeeklyTriggerInput uses `weekday: 1..7` where
 *   1 = Sunday, 2 = Monday, ..., 7 = Saturday. This matches iOS
 *   `Calendar.current` and NSDateComponents. Do NOT switch to ISO 8601
 *   (Mon=1..Sun=7) — it will silently fire on the wrong day.
 *
 * See also:
 *   - ~/vault/standards/grep-read-path-when-touching-ui.md (the miss that
 *     created this bug — dead writes at the UX layer)
 *   - ~/vault/standards/one-owner-per-os-resource.md (the hook that calls
 *     into this helper is the sole OS queue writer)
 */

type ScheduleOp =
  | { kind: 'daily'; id: string; hour: number; minute: number }
  | { kind: 'weekly'; id: string; weekday: number; hour: number; minute: number };

// Apple weekday convention: Sun=1..Sat=7. Do not change.
const WEEKDAY_NUMBER: Record<string, number> = {
  Sun: 1,
  Mon: 2,
  Tue: 3,
  Wed: 4,
  Thu: 5,
  Fri: 6,
  Sat: 7,
};

// Identifier suffix order: must match how we generate identifiers in
// `getAllCheckInIdentifiers`. Using lowercase 3-char day names keeps
// identifiers short and matches how we'd grep them in logs.
const DAY_KEYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;

function parseHhMm(time: string, fallback: { hour: number; minute: number }): { hour: number; minute: number } {
  const match = /^(\d{1,2}):(\d{2})$/.exec(time.trim());
  if (!match) return fallback;
  const hour = parseInt(match[1], 10);
  const minute = parseInt(match[2], 10);
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return fallback;
  return { hour, minute };
}

/**
 * Pure decision function. Given an identifier base, a default time, and an
 * optional per-day override map, returns the list of schedule operations to
 * install.
 *
 * Contract:
 *   - `byDay === null` → single DAILY trigger at `defaultTime` with id=`idBase`
 *   - `byDay !== null` → up to 7 WEEKLY triggers; `null` values in the map
 *     represent "skip this day"; missing keys also represent skip
 *   - Returns an empty array when per-day mode is active but no days are set
 *
 * Invariants:
 *   - Never emits BOTH a DAILY and WEEKLY op (mode is exclusive)
 *   - Identifier for DAILY = `idBase`
 *   - Identifier for WEEKLY = `${idBase}-${day.toLowerCase()}` (e.g., `unfold-midday-checkin-mon`)
 *   - WEEKLY ops are emitted in Mon→Sun order regardless of how `byDay` is keyed
 *   - Bad time strings fall back to the caller-supplied `fallback` (12:30 for midday, 20:30 for evening)
 */
function buildCheckInSchedule(
  idBase: string,
  defaultTime: string,
  byDay: Record<string, string | null> | null,
  fallback: { hour: number; minute: number },
): ScheduleOp[] {
  if (byDay === null) {
    const { hour, minute } = parseHhMm(defaultTime, fallback);
    return [{ kind: 'daily', id: idBase, hour, minute }];
  }

  const ops: ScheduleOp[] = [];
  for (const day of DAY_KEYS) {
    const value = byDay[day];
    if (value === undefined || value === null) continue;
    const { hour, minute } = parseHhMm(value, fallback);
    ops.push({
      kind: 'weekly',
      id: `${idBase}-${day.toLowerCase()}`,
      weekday: WEEKDAY_NUMBER[day],
      hour,
      minute,
    });
  }
  return ops;
}

/**
 * All identifiers that belong to a given check-in. The live cancel function
 * must clear ALL of these on every run so that mode transitions (uniform ↔
 * per-day) don't leave orphan triggers in the OS queue.
 *
 * Order: DAILY first, then weekday ids in Mon→Sun order.
 *
 * Length: always exactly 8 (1 daily + 7 weekly). Cancelling a nonexistent
 * identifier is a no-op in expo-notifications, so this is safe.
 */
function getAllCheckInIdentifiers(idBase: string): string[] {
  return [idBase, ...DAY_KEYS.map((d) => `${idBase}-${d.toLowerCase()}`)];
}

const MIDDAY_ID_BASE = 'unfold-midday-checkin';
const EVENING_ID_BASE = 'unfold-evening-winddown';
const MIDDAY_FALLBACK = { hour: 12, minute: 30 };
const EVENING_FALLBACK = { hour: 20, minute: 30 };

describe('buildCheckInSchedule — uniform mode (byDay === null)', () => {
  it('emits a single DAILY op at the default time', () => {
    const ops = buildCheckInSchedule(MIDDAY_ID_BASE, '12:30', null, MIDDAY_FALLBACK);
    expect(ops).toEqual([
      { kind: 'daily', id: 'unfold-midday-checkin', hour: 12, minute: 30 },
    ]);
  });

  it('respects a custom default time in uniform mode', () => {
    const ops = buildCheckInSchedule(MIDDAY_ID_BASE, '13:45', null, MIDDAY_FALLBACK);
    expect(ops).toEqual([
      { kind: 'daily', id: 'unfold-midday-checkin', hour: 13, minute: 45 },
    ]);
  });

  it('uses the DAILY id (no weekday suffix) in uniform mode', () => {
    const ops = buildCheckInSchedule(MIDDAY_ID_BASE, '12:30', null, MIDDAY_FALLBACK);
    expect(ops).toHaveLength(1);
    expect(ops[0].id).toBe('unfold-midday-checkin');
    expect(ops[0].id).not.toMatch(/-(mon|tue|wed|thu|fri|sat|sun)$/);
  });
});

describe('buildCheckInSchedule — per-day mode: full population', () => {
  it('emits 7 WEEKLY ops when all days are populated with the same time', () => {
    const byDay = {
      Mon: '12:30',
      Tue: '12:30',
      Wed: '12:30',
      Thu: '12:30',
      Fri: '12:30',
      Sat: '12:30',
      Sun: '12:30',
    };
    const ops = buildCheckInSchedule(MIDDAY_ID_BASE, '12:30', byDay, MIDDAY_FALLBACK);
    expect(ops).toHaveLength(7);
    ops.forEach((op) => {
      expect(op.kind).toBe('weekly');
      if (op.kind === 'weekly') {
        expect(op.hour).toBe(12);
        expect(op.minute).toBe(30);
      }
    });
  });

  it('emits 7 WEEKLY ops with per-day times when all days differ', () => {
    const byDay = {
      Mon: '08:00',
      Tue: '09:00',
      Wed: '10:00',
      Thu: '11:00',
      Fri: '12:00',
      Sat: '13:00',
      Sun: '14:00',
    };
    const ops = buildCheckInSchedule(MIDDAY_ID_BASE, '12:30', byDay, MIDDAY_FALLBACK);
    expect(ops).toHaveLength(7);
    const expectedHours = [8, 9, 10, 11, 12, 13, 14];
    ops.forEach((op, i) => {
      if (op.kind !== 'weekly') throw new Error('expected weekly op');
      expect(op.hour).toBe(expectedHours[i]);
      expect(op.minute).toBe(0);
    });
  });

  it('ignores the defaultTime arg when byDay has values (per-day is the source of truth)', () => {
    const byDay = { Mon: '07:15', Tue: '07:15', Wed: '07:15', Thu: '07:15', Fri: '07:15', Sat: '07:15', Sun: '07:15' };
    const ops = buildCheckInSchedule(MIDDAY_ID_BASE, '12:30', byDay, MIDDAY_FALLBACK);
    ops.forEach((op) => {
      if (op.kind !== 'weekly') throw new Error('expected weekly op');
      expect(op.hour).toBe(7);
      expect(op.minute).toBe(15);
    });
  });
});

describe('buildCheckInSchedule — per-day mode: partial population / skipped days', () => {
  it('skips days set to null (weekday = null)', () => {
    const byDay = {
      Mon: '13:00',
      Tue: null,
      Wed: '13:00',
      Thu: null,
      Fri: '13:00',
      Sat: null,
      Sun: null,
    };
    const ops = buildCheckInSchedule(MIDDAY_ID_BASE, '12:30', byDay, MIDDAY_FALLBACK);
    expect(ops).toHaveLength(3);
    expect(ops.map((o) => o.kind === 'weekly' ? o.weekday : null)).toEqual([
      WEEKDAY_NUMBER.Mon, // 2
      WEEKDAY_NUMBER.Wed, // 4
      WEEKDAY_NUMBER.Fri, // 6
    ]);
  });

  it('treats missing keys the same as null (skip that day)', () => {
    const byDay: Record<string, string | null> = {
      Mon: '10:00',
      Wed: '10:00',
      Fri: '10:00',
      // Tue, Thu, Sat, Sun absent
    };
    const ops = buildCheckInSchedule(MIDDAY_ID_BASE, '12:30', byDay, MIDDAY_FALLBACK);
    expect(ops).toHaveLength(3);
    expect(ops.map((o) => o.kind === 'weekly' ? o.id : null)).toEqual([
      'unfold-midday-checkin-mon',
      'unfold-midday-checkin-wed',
      'unfold-midday-checkin-fri',
    ]);
  });

  it('weekday-only schedule (Mon-Fri) emits 5 WEEKLY ops at correct weekday numbers', () => {
    const byDay = {
      Mon: '08:30',
      Tue: '08:30',
      Wed: '08:30',
      Thu: '08:30',
      Fri: '08:30',
      Sat: null,
      Sun: null,
    };
    const ops = buildCheckInSchedule(MIDDAY_ID_BASE, '12:30', byDay, MIDDAY_FALLBACK);
    expect(ops).toHaveLength(5);
    const weekdays = ops.map((o) => (o.kind === 'weekly' ? o.weekday : null));
    // Apple convention: Mon=2, Tue=3, Wed=4, Thu=5, Fri=6
    expect(weekdays).toEqual([2, 3, 4, 5, 6]);
  });
});

describe('buildCheckInSchedule — per-day mode: all-skip edge case', () => {
  it('returns an empty array when every day is null', () => {
    const byDay = {
      Mon: null, Tue: null, Wed: null, Thu: null, Fri: null, Sat: null, Sun: null,
    };
    const ops = buildCheckInSchedule(MIDDAY_ID_BASE, '12:30', byDay, MIDDAY_FALLBACK);
    expect(ops).toEqual([]);
  });

  it('returns an empty array when byDay is {} (empty object treated as all-skip)', () => {
    const ops = buildCheckInSchedule(MIDDAY_ID_BASE, '12:30', {}, MIDDAY_FALLBACK);
    expect(ops).toEqual([]);
  });
});

describe('buildCheckInSchedule — Apple weekday numbering', () => {
  it('uses Apple convention: Sun=1, Mon=2, Tue=3, Wed=4, Thu=5, Fri=6, Sat=7', () => {
    const byDay = {
      Sun: '09:00',
      Mon: '09:00',
      Tue: '09:00',
      Wed: '09:00',
      Thu: '09:00',
      Fri: '09:00',
      Sat: '09:00',
    };
    const ops = buildCheckInSchedule(MIDDAY_ID_BASE, '12:30', byDay, MIDDAY_FALLBACK);
    // Mon→Sun ordering of ops, but weekday numbers should match Apple convention
    const byDayMap = new Map<string, number>();
    ops.forEach((op) => {
      if (op.kind !== 'weekly') return;
      const daySuffix = op.id.split('-').pop()!;
      byDayMap.set(daySuffix, op.weekday);
    });
    expect(byDayMap.get('sun')).toBe(1);
    expect(byDayMap.get('mon')).toBe(2);
    expect(byDayMap.get('tue')).toBe(3);
    expect(byDayMap.get('wed')).toBe(4);
    expect(byDayMap.get('thu')).toBe(5);
    expect(byDayMap.get('fri')).toBe(6);
    expect(byDayMap.get('sat')).toBe(7);
  });

  it('emits WEEKLY ops in Mon→Sun order regardless of byDay key order', () => {
    // Key order Sun→Sat, but output should still be Mon→Sun
    const byDay = {
      Sun: '09:00',
      Sat: '09:00',
      Fri: '09:00',
      Thu: '09:00',
      Wed: '09:00',
      Tue: '09:00',
      Mon: '09:00',
    };
    const ops = buildCheckInSchedule(MIDDAY_ID_BASE, '12:30', byDay, MIDDAY_FALLBACK);
    const suffixes = ops.map((o) => o.id.split('-').pop());
    expect(suffixes).toEqual(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']);
  });
});

describe('buildCheckInSchedule — identifier format', () => {
  it('prefixes weekday ids with the idBase and a lowercase 3-char day suffix', () => {
    const byDay = { Mon: '12:30', Tue: '12:30', Wed: '12:30', Thu: '12:30', Fri: '12:30', Sat: '12:30', Sun: '12:30' };
    const ops = buildCheckInSchedule(MIDDAY_ID_BASE, '12:30', byDay, MIDDAY_FALLBACK);
    const ids = ops.map((o) => o.id);
    expect(ids).toEqual([
      'unfold-midday-checkin-mon',
      'unfold-midday-checkin-tue',
      'unfold-midday-checkin-wed',
      'unfold-midday-checkin-thu',
      'unfold-midday-checkin-fri',
      'unfold-midday-checkin-sat',
      'unfold-midday-checkin-sun',
    ]);
  });

  it('does not collide between midday and evening identifiers', () => {
    const byDay = { Mon: '12:30', Tue: '12:30', Wed: '12:30', Thu: '12:30', Fri: '12:30', Sat: '12:30', Sun: '12:30' };
    const middayOps = buildCheckInSchedule(MIDDAY_ID_BASE, '12:30', byDay, MIDDAY_FALLBACK);
    const eveningOps = buildCheckInSchedule(EVENING_ID_BASE, '20:30', byDay, EVENING_FALLBACK);
    const middayIds = new Set(middayOps.map((o) => o.id));
    const eveningIds = new Set(eveningOps.map((o) => o.id));
    const intersection = [...middayIds].filter((id) => eveningIds.has(id));
    expect(intersection).toEqual([]);
  });
});

describe('buildCheckInSchedule — time parsing edge cases', () => {
  it('parses midnight (00:00)', () => {
    const ops = buildCheckInSchedule(MIDDAY_ID_BASE, '00:00', null, MIDDAY_FALLBACK);
    expect(ops[0]).toMatchObject({ hour: 0, minute: 0 });
  });

  it('parses late night (23:59)', () => {
    const ops = buildCheckInSchedule(MIDDAY_ID_BASE, '23:59', null, MIDDAY_FALLBACK);
    expect(ops[0]).toMatchObject({ hour: 23, minute: 59 });
  });

  it('parses a single-digit hour with colon (9:05)', () => {
    const ops = buildCheckInSchedule(MIDDAY_ID_BASE, '9:05', null, MIDDAY_FALLBACK);
    expect(ops[0]).toMatchObject({ hour: 9, minute: 5 });
  });

  it('falls back to fallback time on unparseable input', () => {
    const ops = buildCheckInSchedule(MIDDAY_ID_BASE, 'garbage', null, MIDDAY_FALLBACK);
    expect(ops[0]).toMatchObject({ hour: 12, minute: 30 });
  });

  it('falls back on out-of-range hour (24:00)', () => {
    const ops = buildCheckInSchedule(MIDDAY_ID_BASE, '24:00', null, MIDDAY_FALLBACK);
    expect(ops[0]).toMatchObject({ hour: 12, minute: 30 });
  });

  it('falls back on out-of-range minute (12:60)', () => {
    const ops = buildCheckInSchedule(MIDDAY_ID_BASE, '12:60', null, MIDDAY_FALLBACK);
    expect(ops[0]).toMatchObject({ hour: 12, minute: 30 });
  });
});

describe('getAllCheckInIdentifiers — cancel list generation', () => {
  it('always returns exactly 8 identifiers (1 daily + 7 weekly)', () => {
    expect(getAllCheckInIdentifiers(MIDDAY_ID_BASE)).toHaveLength(8);
    expect(getAllCheckInIdentifiers(EVENING_ID_BASE)).toHaveLength(8);
  });

  it('returns DAILY id first, then weekday ids in Mon→Sun order', () => {
    expect(getAllCheckInIdentifiers(MIDDAY_ID_BASE)).toEqual([
      'unfold-midday-checkin',
      'unfold-midday-checkin-mon',
      'unfold-midday-checkin-tue',
      'unfold-midday-checkin-wed',
      'unfold-midday-checkin-thu',
      'unfold-midday-checkin-fri',
      'unfold-midday-checkin-sat',
      'unfold-midday-checkin-sun',
    ]);
  });

  it('generates distinct id sets for midday and evening', () => {
    const midday = new Set(getAllCheckInIdentifiers(MIDDAY_ID_BASE));
    const evening = new Set(getAllCheckInIdentifiers(EVENING_ID_BASE));
    const intersection = [...midday].filter((id) => evening.has(id));
    expect(intersection).toEqual([]);
    expect(midday.size).toBe(8);
    expect(evening.size).toBe(8);
  });
});

describe('buildCheckInSchedule — midday / evening parameterization', () => {
  it('midday uniform schedule uses midday id base and 12:30 fallback', () => {
    const ops = buildCheckInSchedule(MIDDAY_ID_BASE, '', null, MIDDAY_FALLBACK);
    expect(ops).toEqual([
      { kind: 'daily', id: 'unfold-midday-checkin', hour: 12, minute: 30 },
    ]);
  });

  it('evening uniform schedule uses evening id base and 20:30 fallback', () => {
    const ops = buildCheckInSchedule(EVENING_ID_BASE, '', null, EVENING_FALLBACK);
    expect(ops).toEqual([
      { kind: 'daily', id: 'unfold-evening-winddown', hour: 20, minute: 30 },
    ]);
  });

  it('evening per-day schedule uses evening id base for weekday suffixes', () => {
    const byDay = { Mon: '21:00', Tue: null, Wed: '21:00', Thu: null, Fri: '21:00', Sat: null, Sun: null };
    const ops = buildCheckInSchedule(EVENING_ID_BASE, '20:30', byDay, EVENING_FALLBACK);
    expect(ops.map((o) => o.id)).toEqual([
      'unfold-evening-winddown-mon',
      'unfold-evening-winddown-wed',
      'unfold-evening-winddown-fri',
    ]);
  });
});
