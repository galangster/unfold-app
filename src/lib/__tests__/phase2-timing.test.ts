import { getDailyReminderTrigger } from '../daily-reminder-content';
import { deferPastQuietHours, isQuietTime } from '../quiet-hours';
import { formatClockAsReminderTime, suggestReminderTime } from '../reminder-time-suggestion';
import type { Devotional } from '../store';

describe('getDailyReminderTrigger', () => {
  const clock = { hour: 8, minute: 0 };

  it('keeps the DAILY floor when nothing was read today', () => {
    expect(getDailyReminderTrigger({ readToday: false, clock, now: new Date(2026, 8, 8, 6, 30) })).toEqual({ kind: 'daily' });
  });

  it('skips today with a one-shot for tomorrow when the reader already read before the fire time', () => {
    expect(getDailyReminderTrigger({ readToday: true, clock, now: new Date(2026, 8, 8, 6, 30) })).toEqual({
      kind: 'date',
      date: new Date(2026, 8, 9, 8, 0),
    });
  });

  it('keeps DAILY when today\'s fire time already passed (nothing to skip)', () => {
    expect(getDailyReminderTrigger({ readToday: true, clock, now: new Date(2026, 8, 8, 9, 30) })).toEqual({ kind: 'daily' });
  });
});

describe('quiet hours', () => {
  it('covers 22:00 to 07:00', () => {
    expect(isQuietTime(new Date(2026, 8, 8, 22, 0))).toBe(true);
    expect(isQuietTime(new Date(2026, 8, 8, 6, 59))).toBe(true);
    expect(isQuietTime(new Date(2026, 8, 8, 7, 0))).toBe(false);
    expect(isQuietTime(new Date(2026, 8, 8, 21, 59))).toBe(false);
  });

  it('defers a night-time instant to 07:30 the next morning and leaves day-time alone', () => {
    expect(deferPastQuietHours(new Date(2026, 8, 8, 23, 15))).toEqual(new Date(2026, 8, 9, 7, 30));
    expect(deferPastQuietHours(new Date(2026, 8, 9, 2, 0))).toEqual(new Date(2026, 8, 9, 7, 30));
    const noon = new Date(2026, 8, 8, 12, 0);
    expect(deferPastQuietHours(noon)).toBe(noon);
  });
});

describe('suggestReminderTime', () => {
  const now = new Date(2026, 8, 8, 12, 0);
  function withReads(minutesOfDay: number[]): Devotional[] {
    return [{
      id: 'dev-1',
      days: minutesOfDay.map((m, i) => {
        const readAt = new Date(2026, 8, 8 - i, Math.floor(m / 60), m % 60);
        return { dayNumber: i + 1, isRead: true, readAt: readAt.toISOString() };
      }),
    } as unknown as Devotional];
  }

  it('formats minutes of day as the settings do', () => {
    expect(formatClockAsReminderTime(7 * 60 + 45)).toBe('7:45 AM');
    expect(formatClockAsReminderTime(0)).toBe('12:00 AM');
    expect(formatClockAsReminderTime(13 * 60 + 5)).toBe('1:05 PM');
  });

  it('suggests the median read time rounded to a quarter hour when it differs enough', () => {
    const reads = [7 * 60 + 41, 7 * 60 + 50, 7 * 60 + 38, 8 * 60 + 2, 7 * 60 + 44, 7 * 60 + 47];
    expect(suggestReminderTime({ devotionals: withReads(reads), currentReminderTime: '6:00 AM', now })).toEqual({
      suggested: '7:45 AM',
      medianMinutes: 7 * 60 + 45,
      sampleSize: 6,
    });
  });

  it('stays quiet with too few reads, a close-enough current time, or a dismissed suggestion', () => {
    const reads = [7 * 60 + 41, 7 * 60 + 50, 7 * 60 + 38, 8 * 60 + 2, 7 * 60 + 44, 7 * 60 + 47];
    expect(suggestReminderTime({ devotionals: withReads(reads.slice(0, 3)), currentReminderTime: '6:00 AM', now })).toBeNull();
    expect(suggestReminderTime({ devotionals: withReads(reads), currentReminderTime: '8:00 AM', now })).toBeNull();
    expect(suggestReminderTime({ devotionals: withReads(reads), currentReminderTime: '6:00 AM', now, dismissed: '7:45 AM' })).toBeNull();
  });

  it('ignores reads outside the window', () => {
    const old = withReads([7 * 60, 7 * 60, 7 * 60, 7 * 60, 7 * 60]);
    old[0].days.forEach((d) => { d.readAt = new Date(2026, 6, 1, 7, 0).toISOString(); });
    expect(suggestReminderTime({ devotionals: old, currentReminderTime: '9:00 AM', now })).toBeNull();
  });
});
