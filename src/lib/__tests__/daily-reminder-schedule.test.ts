import { buildCheckInSchedule } from '../check-in-schedule';
import {
  buildDailyReminderSchedule,
  DAILY_REMINDER_HORIZON_DAYS,
} from '../daily-reminder-content';

const clock = { hour: 8, minute: 0 };

function at(day: number, hour: number, minute = 0): Date {
  return new Date(2026, 9, day, hour, minute);
}

function mornings(from: number, to: number): Date[] {
  return Array.from({ length: to - from + 1 }, (_, index) => at(from + index, 8));
}

describe('buildDailyReminderSchedule', () => {
  it('keeps a dated horizon from today when nothing was read yet', () => {
    expect(
      buildDailyReminderSchedule({ clock, owner: 'local', readToday: false, lastReadAt: at(6, 7), now: at(7, 6, 30) }),
    ).toEqual(mornings(7, 20));
  });

  it('starts the horizon tomorrow after a read before the reminder time, not a lone one-shot', () => {
    const dates = buildDailyReminderSchedule({
      clock,
      owner: 'local',
      readToday: true,
      lastReadAt: at(7, 6, 15),
      now: at(7, 6, 30),
    });
    expect(dates).toEqual(mornings(8, 20));
    expect(dates.length).toBeGreaterThan(1);
  });

  it('leaves the morning the next day opens to the server push and keeps every later morning local', () => {
    // Day 5 read at 08:30. Day 6 opens tomorrow; its ready push takes that slot.
    expect(
      buildDailyReminderSchedule({ clock, owner: 'server', readToday: true, lastReadAt: at(7, 8, 30), now: at(7, 8, 35) }),
    ).toEqual(mornings(9, 20));
  });

  it('leaves this morning to the server push when the next day opened at midnight', () => {
    expect(
      buildDailyReminderSchedule({ clock, owner: 'server', readToday: false, lastReadAt: at(6, 21), now: at(7, 6) }),
    ).toEqual(mornings(8, 20));
  });

  it('keeps today once the server push morning has passed, so a later refill never drops a morning', () => {
    expect(
      buildDailyReminderSchedule({ clock, owner: 'server', readToday: false, lastReadAt: at(5, 8, 30), now: at(7, 5) }),
    ).toEqual(mornings(7, 20));
  });

  it('skips nothing for the server when the series has no read yet', () => {
    expect(
      buildDailyReminderSchedule({ clock, owner: 'server', readToday: false, lastReadAt: null, now: at(7, 6) }),
    ).toEqual(mornings(7, 20));
  });

  // Only meaningful in a zone whose offset changes inside the horizon: Oct 20
  // to Nov 2 2026 crosses the EU (Oct 25) and US (Nov 1) fall-back. Under
  // UTC it would pass whatever the builder did, so it reports as skipped
  // there instead. `bun run test:day-unlock` runs it under
  // America/Los_Angeles.
  const dstNow = new Date(2026, 9, 20, 6);
  const horizonCrossesDst =
    dstNow.getTimezoneOffset() !== new Date(2026, 10, 2, 8).getTimezoneOffset();
  (horizonCrossesDst ? it : it.skip)('keeps the reader\'s clock time across a daylight-saving change', () => {
    const dates = buildDailyReminderSchedule({
      clock,
      owner: 'local',
      readToday: false,
      lastReadAt: null,
      now: dstNow,
    });
    expect(dates).toHaveLength(DAILY_REMINDER_HORIZON_DAYS);
    expect(new Set(dates.map((date) => date.getTimezoneOffset())).size).toBe(2);
    expect(dates.every((date) => date.getHours() === 8 && date.getMinutes() === 0)).toBe(true);
  });

  it('drops today once its fire time has passed', () => {
    expect(
      buildDailyReminderSchedule({ clock, owner: 'local', readToday: false, lastReadAt: at(5, 8), now: at(7, 9) }),
    ).toEqual(mornings(8, 20));
  });
});

describe('pending notification budget', () => {
  // iOS keeps only the 64 soonest pending local notifications per app and
  // drops the rest without telling anyone.
  const IOS_PENDING_LIMIT = 64;
  // One each at most: the act reminder, its "remind me in an hour", the
  // reading "remind me later", the trial-ending notice and the ambient
  // timer backup.
  const SINGLE_REQUESTS = 5;

  it('fits the worst case under the iOS cap, so the trial-ending notice is never dropped', () => {
    const now = at(7, 0, 1);
    const checkIns = (idBase: string) =>
      buildCheckInSchedule({ idBase, defaultTime: '12:30', byDay: null, fallback: { hour: 12, minute: 30 }, now }).length;
    const daily = buildDailyReminderSchedule({ clock, owner: 'local', readToday: false, lastReadAt: null, now }).length;

    expect(daily).toBe(DAILY_REMINDER_HORIZON_DAYS);
    expect(checkIns('midday') + checkIns('evening') + daily + SINGLE_REQUESTS).toBeLessThan(IOS_PENDING_LIMIT);
  });
});
