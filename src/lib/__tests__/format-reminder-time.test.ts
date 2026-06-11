import { formatReminderTime } from '@/lib/format-reminder-time';

describe('formatReminderTime', () => {
  it('formats 24h storage strings to h:mm AM/PM', () => {
    expect(formatReminderTime('08:00')).toBe('8:00 AM');
    expect(formatReminderTime('12:30')).toBe('12:30 PM');
    expect(formatReminderTime('20:30')).toBe('8:30 PM');
    expect(formatReminderTime('00:15')).toBe('12:15 AM');
    expect(formatReminderTime('12:00')).toBe('12:00 PM');
  });

  it('passes canonical 12h strings through unchanged', () => {
    expect(formatReminderTime('8:00 AM')).toBe('8:00 AM');
    expect(formatReminderTime('12:30 PM')).toBe('12:30 PM');
    expect(formatReminderTime('6:00 PM')).toBe('6:00 PM');
  });

  it('never yields NaN for 12h input (the formatCheckInTime gotcha)', () => {
    // '6:00 AM'.split(':').map(Number) gives minutes=NaN — the old bug class
    expect(formatReminderTime('6:00 AM')).not.toContain('NaN');
    expect(formatReminderTime('6:00 AM')).toBe('6:00 AM');
  });

  it('normalizes meridiem casing and leading zeros on 12h input', () => {
    expect(formatReminderTime('08:00 am')).toBe('8:00 AM');
    expect(formatReminderTime('8:00 a.m.')).toBe('8:00 AM');
  });

  it('returns unknown shapes unchanged', () => {
    expect(formatReminderTime('soon')).toBe('soon');
    expect(formatReminderTime('')).toBe('');
    expect(formatReminderTime('25:99')).toBe('25:99');
  });
});
