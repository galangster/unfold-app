/**
 * The properties that make notification copy feel endless rather than
 * calendar-driven. These are the guarantees the old
 * `pool[dayOfYear % pool.length]` selection did not have.
 */

import { dayIndexFor, minimumGapFor, pickFromBag } from '../variation-bag';
import {
  EVENING_MESSAGES,
  EVENING_TITLES,
  MIDDAY_MESSAGES,
  MIDDAY_TITLES,
  getEveningWindDownCopy,
  getMiddayCheckInCopy,
} from '@/constants/check-in-messages';

const POOL = Array.from({ length: 10 }, (_, i) => `m${i}`);
const run = (seed: string, from: number, count: number) =>
  Array.from({ length: count }, (_, i) => pickFromBag(POOL, seed, from + i));

describe('pickFromBag — coverage', () => {
  it('returns every entry exactly once per lap of the pool', () => {
    const lap = run('seed-a', 1000, POOL.length);
    expect(new Set(lap).size).toBe(POOL.length);
  });

  it('covers the pool from any starting day, not just a lap boundary', () => {
    for (const start of [1003, 1007, 999, 12345]) {
      expect(new Set(run('seed-a', start, POOL.length * 2)).size).toBe(POOL.length);
    }
  });

  it('never repeats on consecutive days, including across lap boundaries', () => {
    const long = run('seed-a', 0, POOL.length * 40);
    for (let i = 1; i < long.length; i += 1) expect(long[i]).not.toBe(long[i - 1]);
  });

  it('holds the guaranteed minimum gap between two draws of the same entry', () => {
    // Within a lap that is the whole lap; across a boundary it is the guard
    // band. Laps shuffle independently, so the boundary is the binding case.
    for (const n of [4, 7, 10, 40, 100]) {
      const pool = Array.from({ length: n }, (_, i) => `e${i}`);
      const gap = minimumGapFor(n);
      const seen = Array.from({ length: n * 30 }, (_, d) => pickFromBag(pool, 'seed-a', d));
      const lastAt = new Map<string, number>();
      seen.forEach((value, day) => {
        const previous = lastAt.get(value!);
        if (previous !== undefined) expect(day - previous).toBeGreaterThanOrEqual(gap);
        lastAt.set(value!, day);
      });
    }
  });
});

describe('pickFromBag — variation', () => {
  it('orders each lap differently, so the sequence does not repeat annually', () => {
    const first = run('seed-a', 0, POOL.length).join('|');
    const laps = new Set(
      Array.from({ length: 12 }, (_, lap) => run('seed-a', lap * POOL.length, POOL.length).join('|')),
    );
    expect(laps.size).toBeGreaterThan(6);
    expect(first).toBeTruthy();
  });

  it('puts two installs on different sequences for the same day', () => {
    const day = 20_000;
    const seeds = Array.from({ length: 40 }, (_, i) => pickFromBag(POOL, `install-${i}`, day));
    expect(new Set(seeds).size).toBeGreaterThan(1);
  });

  it('draws independently per salt, so a title and a body do not move together', () => {
    const pairs = new Set(
      Array.from({ length: 50 }, (_, d) =>
        `${pickFromBag(POOL, 'x|title', 20_000 + d)}/${pickFromBag(POOL, 'x|body', 20_000 + d)}`,
      ),
    );
    expect(pairs.size).toBeGreaterThan(POOL.length);
  });
});

describe('pickFromBag — totality', () => {
  it('is deterministic for the same inputs', () => {
    expect(pickFromBag(POOL, 's', 123)).toBe(pickFromBag(POOL, 's', 123));
  });

  it('handles empty, single and two-entry pools', () => {
    expect(pickFromBag([], 's', 1)).toBeUndefined();
    expect(pickFromBag(['only'], 's', 7)).toBe('only');
    const two = Array.from({ length: 8 }, (_, i) => pickFromBag(['a', 'b'], 's', i));
    expect(new Set(two)).toEqual(new Set(['a', 'b']));
  });

  it('stays inside the pool for a device clock set before 1970', () => {
    for (let i = -40; i < 0; i += 1) expect(POOL).toContain(pickFromBag(POOL, 's', i));
  });
});

describe('dayIndexFor', () => {
  it('advances by one per local calendar day and ignores the time of day', () => {
    expect(dayIndexFor(new Date(2026, 0, 8, 23, 59))).toBe(dayIndexFor(new Date(2026, 0, 8, 0, 1)) + 0);
    expect(dayIndexFor(new Date(2026, 0, 9))).toBe(dayIndexFor(new Date(2026, 0, 8)) + 1);
  });

  it('crosses a month and a year boundary by one', () => {
    expect(dayIndexFor(new Date(2026, 1, 1))).toBe(dayIndexFor(new Date(2026, 0, 31)) + 1);
    expect(dayIndexFor(new Date(2027, 0, 1))).toBe(dayIndexFor(new Date(2026, 11, 31)) + 1);
  });
});

describe('check-in copy — the pools as shipped', () => {
  it('has no duplicate entry in any pool', () => {
    for (const pool of [MIDDAY_MESSAGES, EVENING_MESSAGES, MIDDAY_TITLES, EVENING_TITLES]) {
      expect(new Set(pool).size).toBe(pool.length);
    }
  });

  it('keeps titles short enough to survive a lock-screen banner', () => {
    for (const title of [...MIDDAY_TITLES, ...EVENING_TITLES]) {
      expect(title.length).toBeLessThanOrEqual(40);
    }
  });

  it('never opens a title with a question, because the body carries the question', () => {
    for (const title of [...MIDDAY_TITLES, ...EVENING_TITLES]) {
      expect(title).not.toContain('?');
    }
  });

  it('never reuses a title or a body inside the guaranteed gap', () => {
    const start = dayIndexFor(new Date(2026, 0, 1));
    const titles: string[] = [];
    const bodies: string[] = [];
    for (let d = 0; d < 365; d += 1) {
      const copy = getMiddayCheckInCopy(null, null, { seed: 'install-1', dayIndex: start + d });
      titles.push(copy.title);
      bodies.push(copy.body);
    }
    // 11 days for the 40 titles, 26 for the 100 bodies.
    const noRepeatWithin = (values: string[], window: number) => {
      for (let i = 0; i + window <= values.length; i += 1) {
        expect(new Set(values.slice(i, i + window)).size).toBe(window);
      }
    };
    // Literals on purpose. Deriving these from minimumGapFor would restate
    // the implementation's own formula, and the assertion could never fail.
    expect([MIDDAY_TITLES.length, MIDDAY_MESSAGES.length]).toEqual([40, 100]);
    expect([minimumGapFor(40), minimumGapFor(100)]).toEqual([11, 26]);
    noRepeatWithin(titles, 11);
    noRepeatWithin(bodies, 26);
  });

  it('fills most of a year with distinct banners from 140 authored strings', () => {
    const start = dayIndexFor(new Date(2026, 0, 1));
    const banners = new Set(
      Array.from({ length: 365 }, (_, d) => {
        const copy = getMiddayCheckInCopy(null, null, { seed: 'install-1', dayIndex: start + d });
        return `${copy.title}\n${copy.body}`;
      }),
    );
    // Titles and bodies are drawn independently, so the PAIRING is what a
    // reader sees repeat — and it takes a coincidence of both bags to do it.
    expect(banners.size).toBeGreaterThan(350);
  });

  it('does not repeat a title or a body on consecutive days', () => {
    const start = dayIndexFor(new Date(2026, 0, 1));
    let prev = getEveningWindDownCopy(null, { seed: 'install-1', dayIndex: start });
    for (let d = 1; d < 200; d += 1) {
      const next = getEveningWindDownCopy(null, { seed: 'install-1', dayIndex: start + d });
      expect(next.title).not.toBe(prev.title);
      expect(next.body).not.toBe(prev.body);
      prev = next;
    }
  });
});
