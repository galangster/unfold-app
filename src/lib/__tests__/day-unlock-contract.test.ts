/**
 * Day-unlock contract (docs/day-unlock-contract.md). The backend repo carries
 * the byte-identical fixture src/lib/__tests__/fixtures/day-unlock-vectors-v1.json
 * and asserts that its ready-push timing follows the same table. A push that
 * names a day this app keeps closed is the bug this file exists to stop.
 *
 * Times are wall-clock times in the reader's own zone, built with local
 * constructors, so the rule is checked in whichever zone the run uses.
 */
import { createHash } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { canonicalGeneratedDayId } from '../devotional-canonical-days';
import {
  getSelectableDayLimit,
  getTodayReaderDayNumber,
  isDevotionalDaySelectable,
} from '../devotional-day-access';
import { resolveRevealOutcome } from '../reveal-params';
import type { Devotional, DevotionalDay } from '../store';

interface Reads {
  currentDay: number;
  seriesStartLocal?: string;
  reads: { day: number; readAtLocal: string }[];
}

interface Vector extends Reads {
  name: string;
  timeZone: string;
  checks: { nowLocal: string; openThroughDay: number }[];
}

interface PushVector extends Reads {
  name: string;
  timeZone: string;
  preferredTimeLocal: string;
  day: number;
  generatedAtLocal: string;
  delayedBy: 'pacingLock' | 'preferredTime' | 'none';
  sendAtLocal: string;
}

// unfold-backend pins the same digest. Changing the vectors changes this line
// in both repos, so one repo cannot drift from the other without a reviewer
// seeing it.
const VECTORS_SHA256 = '54e3cfd898eda181cb78b0422bd1711accb8868f389968238f6e70b46dc781b9';
const vectorsBytes = fs.readFileSync(path.join(__dirname, 'fixtures', 'day-unlock-vectors-v1.json'));
const fixture = JSON.parse(vectorsBytes.toString('utf8')) as {
  version: number;
  cases: Vector[];
  pushCases: PushVector[];
};

function local(value: string): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);
  if (!match) throw new Error(`Bad wall-clock time in fixture: ${value}`);
  const [year, month, day, hour, minute] = match.slice(1).map(Number);
  return new Date(year, month - 1, day, hour, minute);
}

function wallClock(date: Date): string {
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

function devotionalFor(vector: Reads): Devotional {
  const readAtByDay = new Map(vector.reads.map((read) => [read.day, local(read.readAtLocal).toISOString()]));
  const seriesStart = local(vector.seriesStartLocal ?? vector.reads[0].readAtLocal).toISOString();
  const days: DevotionalDay[] = Array.from({ length: vector.currentDay }, (_, index) => {
    const dayNumber = index + 1;
    const readAt = readAtByDay.get(dayNumber);
    return {
      id: canonicalGeneratedDayId('unlock-vector', dayNumber),
      devotionalId: 'unlock-vector',
      dayNumber,
      title: `Reading ${dayNumber}`,
      scriptureReference: 'Hebrews 7:1-5',
      scriptureText: 'Scripture',
      bodyText: 'Reading content',
      quotableLine: 'A line to remember',
      isRead: readAt != null,
      ...(readAt ? { readAt } : {}),
    };
  });
  return {
    id: 'unlock-vector',
    title: 'A daily series',
    totalDays: 7,
    currentDay: vector.currentDay,
    createdAt: seriesStart,
    seriesStartDate: seriesStart,
    generationMode: 'progressive',
    days,
    userContext: { name: 'Reader', aboutMe: '', currentSituation: '', emotionalState: '' },
  };
}

describe('day-unlock vectors file', () => {
  it('is version 1 with uniquely named cases that each check at least one time', () => {
    expect(fixture.version).toBe(1);
    const names = [...fixture.cases, ...fixture.pushCases].map((vector) => vector.name);
    expect(new Set(names).size).toBe(names.length);
    for (const vector of fixture.cases) expect(vector.checks.length).toBeGreaterThan(0);
  });

  it('is the byte-identical file unfold-backend pins', () => {
    expect(createHash('sha256').update(vectorsBytes).digest('hex')).toBe(VECTORS_SHA256);
  });
});

describe('day-unlock vectors: the app opens through the vector day and keeps later days locked', () => {
  describe.each(fixture.cases.map((vector) => [vector.name, vector] as const))('%s', (_name, vector) => {
    const series = devotionalFor(vector);

    it.each(vector.checks.map((check) => [check.nowLocal, check] as const))(
      'at %s the app opens through the vector day and keeps the rest locked',
      (_nowLocal, check) => {
        const now = local(check.nowLocal);
        expect(getSelectableDayLimit(series, now)).toBe(check.openThroughDay);
        expect(getTodayReaderDayNumber(series, now)).toBe(check.openThroughDay);

        const lockedDay = check.openThroughDay + 1;
        expect(isDevotionalDaySelectable(series, lockedDay, now)).toBe(false);
        // A ready push for that day, while the lock is what keeps it closed,
        // must come back locked so the screen can report the disagreement.
        const outcome = resolveRevealOutcome(
          { devotionalId: series.id, dayNumber: String(lockedDay) },
          [series],
          now,
        );
        expect(outcome.kind).toBe(check.openThroughDay < vector.currentDay ? 'locked' : 'invalid');
      },
    );
  });
});

describe('day-unlock vectors: a ready push never goes out for a day the app keeps locked', () => {
  it.each(fixture.pushCases.map((vector) => [vector.name, vector] as const))('%s', (_name, vector) => {
    const series = devotionalFor(vector);
    const generatedAt = local(vector.generatedAtLocal);
    const sendAt = local(vector.sendAtLocal);
    const openAt = (at: Date) => getSelectableDayLimit(series, at) >= vector.day;

    expect(sendAt.getTime()).toBeGreaterThanOrEqual(generatedAt.getTime());
    // The day is open in the app when the push goes out.
    expect(openAt(sendAt)).toBe(true);
    // The app's own lock is what delays a `pacingLock` push, and only that push.
    expect(openAt(generatedAt)).toBe(vector.delayedBy !== 'pacingLock');

    if (vector.delayedBy === 'none') {
      expect(sendAt.getTime()).toBe(generatedAt.getTime());
      return;
    }
    expect(wallClock(sendAt)).toBe(vector.preferredTimeLocal);
    if (vector.delayedBy === 'pacingLock') {
      // The lock ends at the local midnight that starts the send day, not an hour earlier or later.
      const midnight = new Date(sendAt.getFullYear(), sendAt.getMonth(), sendAt.getDate());
      expect(openAt(new Date(midnight.getTime() - 60_000))).toBe(false);
      expect(openAt(midnight)).toBe(true);
    }
  });
});
