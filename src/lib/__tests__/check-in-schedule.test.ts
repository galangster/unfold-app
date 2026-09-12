/**
 * Tests for the real check-in schedule builder.
 *
 * The file this replaces (notifications-scheduling.test.ts) kept its own
 * inline COPY of buildCheckInSchedule and asserted against that. The copy
 * passed happily while the shipped function drifted, so it proved nothing
 * about the app. This file imports the shipped module.
 */

import {
  buildCheckInSchedule,
  getAllCheckInIdentifiers,
  PRE_ROLL_DAYS,
  type CheckInOccurrence,
} from '../check-in-schedule';
import { dayIndexFor } from '../variation-bag';

const MIDDAY = { hour: 12, minute: 30 };
const EVENING = { hour: 20, minute: 30 };
const MIDDAY_ID = 'unfold-midday-checkin';

/** Wednesday 2026-01-07, 09:00 local. */
const WED_0900 = new Date(2026, 0, 7, 9, 0, 0, 0);

function build(overrides: Partial<Parameters<typeof buildCheckInSchedule>[0]> = {}): CheckInOccurrence[] {
  return buildCheckInSchedule({
    idBase: MIDDAY_ID,
    defaultTime: '12:30',
    byDay: null,
    fallback: MIDDAY,
    now: WED_0900,
    ...overrides,
  });
}

const hhmm = (o: CheckInOccurrence) => `${o.date.getHours()}:${`${o.date.getMinutes()}`.padStart(2, '0')}`;

describe('buildCheckInSchedule — uniform mode', () => {
  it('pre-rolls one dated occurrence per day across the horizon', () => {
    const ops = build();
    expect(ops).toHaveLength(PRE_ROLL_DAYS);
    expect(ops.every((o) => hhmm(o) === '12:30')).toBe(true);
  });

  it('gives each occurrence its own calendar day, in order', () => {
    const ops = build();
    const days = ops.map((o) => o.dayIndex);
    expect(days).toEqual(days.slice().sort((a, b) => a - b));
    expect(new Set(days).size).toBe(days.length);
    expect(days[0]).toBe(dayIndexFor(WED_0900));
  });

  it('numbers identifiers from 0 in chronological order', () => {
    expect(build().map((o) => o.id)).toEqual(
      Array.from({ length: PRE_ROLL_DAYS }, (_, i) => `${MIDDAY_ID}-${i}`),
    );
  });

  it('respects a custom time', () => {
    expect(build({ defaultTime: '07:05' }).every((o) => hhmm(o) === '7:05')).toBe(true);
  });

  it('falls back on an unparseable or out-of-range time', () => {
    expect(build({ defaultTime: 'nonsense' })[0]).toEqual(expect.objectContaining({ id: `${MIDDAY_ID}-0` }));
    expect(hhmm(build({ defaultTime: 'nonsense' })[0])).toBe('12:30');
    expect(hhmm(build({ defaultTime: '24:00' })[0])).toBe('12:30');
    expect(hhmm(build({ defaultTime: '12:60' })[0])).toBe('12:30');
  });

  it('parses midnight and one minute to midnight', () => {
    expect(hhmm(build({ defaultTime: '00:00' })[0])).toBe('0:00');
    expect(hhmm(build({ defaultTime: '23:59' })[0])).toBe('23:59');
  });
});

describe('buildCheckInSchedule — a time that has already passed today', () => {
  it('starts tomorrow rather than scheduling into the past', () => {
    // 14:00 on the same Wednesday: the 12:30 slot is gone.
    const ops = build({ now: new Date(2026, 0, 7, 14, 0) });
    expect(ops).toHaveLength(PRE_ROLL_DAYS - 1);
    expect(ops[0].dayIndex).toBe(dayIndexFor(WED_0900) + 1);
    expect(ops.every((o) => o.date.getTime() > new Date(2026, 0, 7, 14, 0).getTime())).toBe(true);
  });

  it('keeps today when the slot is still ahead', () => {
    const ops = build({ now: new Date(2026, 0, 7, 12, 29, 59) });
    expect(ops[0].dayIndex).toBe(dayIndexFor(WED_0900));
  });
});

describe('buildCheckInSchedule — per-day mode', () => {
  const everyDay = { Mon: '12:30', Tue: '12:30', Wed: '12:30', Thu: '12:30', Fri: '12:30', Sat: '12:30', Sun: '12:30' };

  it('matches uniform mode when every day is populated with the same time', () => {
    expect(build({ byDay: everyDay })).toHaveLength(PRE_ROLL_DAYS);
  });

  it('uses each weekday’s own time', () => {
    const ops = build({ byDay: { ...everyDay, Thu: '08:15' } });
    const thursdays = ops.filter((o) => o.date.getDay() === 4);
    expect(thursdays.length).toBeGreaterThan(0);
    expect(thursdays.every((o) => hhmm(o) === '8:15')).toBe(true);
  });

  it('skips days set to null and days missing from the map alike', () => {
    const weekdaysOnly = { Mon: '12:30', Tue: '12:30', Wed: '12:30', Thu: '12:30', Fri: '12:30', Sat: null };
    const ops = build({ byDay: weekdaysOnly });
    expect(ops.every((o) => o.date.getDay() !== 0 && o.date.getDay() !== 6)).toBe(true);
    expect(ops).toHaveLength(10); // 14 days from a Wednesday contains 10 weekdays
  });

  it('returns an empty array when every day is off', () => {
    expect(build({ byDay: {} })).toHaveLength(0);
    expect(build({ byDay: { Mon: null, Tue: null, Wed: null, Thu: null, Fri: null, Sat: null, Sun: null } })).toHaveLength(0);
  });

  it('ignores defaultTime once byDay is the source of truth', () => {
    const ops = build({ defaultTime: '06:00', byDay: everyDay });
    expect(ops.every((o) => hhmm(o) === '12:30')).toBe(true);
  });

  it('renumbers identifiers over the emitted occurrences, with no gaps', () => {
    const ops = build({ byDay: { Wed: '12:30', Thu: '12:30' } });
    expect(ops.map((o) => o.id)).toEqual([`${MIDDAY_ID}-0`, `${MIDDAY_ID}-1`, `${MIDDAY_ID}-2`, `${MIDDAY_ID}-3`]);
  });
});

describe('buildCheckInSchedule — trial skip date', () => {
  it('drops exactly that calendar day and keeps the rest of the horizon', () => {
    const ops = build({ skipLocalDate: '2026-01-09' });
    expect(ops).toHaveLength(PRE_ROLL_DAYS - 1);
    expect(ops.some((o) => o.dayIndex === dayIndexFor(new Date(2026, 0, 9)))).toBe(false);
    expect(ops.some((o) => o.dayIndex === dayIndexFor(new Date(2026, 0, 10)))).toBe(true);
  });

  it('is a no-op when the skip date is outside the horizon', () => {
    expect(build({ skipLocalDate: '2026-03-01' })).toHaveLength(PRE_ROLL_DAYS);
  });

  it('is a no-op for a null skip date', () => {
    expect(build({ skipLocalDate: null })).toHaveLength(PRE_ROLL_DAYS);
  });
});

describe('buildCheckInSchedule — parameterisation', () => {
  it('does not collide between midday and evening identifiers', () => {
    const midday = build().map((o) => o.id);
    const evening = build({ idBase: 'unfold-evening-winddown', defaultTime: '20:30', fallback: EVENING }).map((o) => o.id);
    expect(midday.some((id) => evening.includes(id))).toBe(false);
  });

  it('honours a custom horizon', () => {
    expect(build({ horizonDays: 3 })).toHaveLength(3);
  });
});

describe('getAllCheckInIdentifiers', () => {
  it('covers every pre-rolled slot', () => {
    const ids = getAllCheckInIdentifiers(MIDDAY_ID);
    for (const op of build()) expect(ids).toContain(op.id);
  });

  it('still cancels the retired repeating schedule so upgrades do not double-fire', () => {
    const ids = getAllCheckInIdentifiers(MIDDAY_ID);
    expect(ids).toContain(MIDDAY_ID);
    expect(ids).toContain(`${MIDDAY_ID}-resume`);
    for (const day of ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']) {
      expect(ids).toContain(`${MIDDAY_ID}-${day}`);
    }
  });

  it('lists every identifier exactly once', () => {
    const ids = getAllCheckInIdentifiers(MIDDAY_ID);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('generates distinct sets for midday and evening', () => {
    const midday = getAllCheckInIdentifiers(MIDDAY_ID);
    const evening = getAllCheckInIdentifiers('unfold-evening-winddown');
    expect(midday.some((id) => evening.includes(id))).toBe(false);
  });
});
