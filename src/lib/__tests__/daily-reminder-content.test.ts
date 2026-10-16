import {
  buildDailyReminderFingerprint,
  getDailyReminderContent,
} from '../daily-reminder-content';
import type { Devotional, DevotionalDay } from '../store';
import {
  FIRST_DAY_TITLES,
  NEXT_DAY_BODIES,
  OVERDUE_TITLES,
  PAST_END_BODIES,
  PAUSED_NO_SERIES_BODIES,
  PAUSED_SERIES_BODIES,
} from '@/constants/reading-reminder-messages';

const now = new Date(2026, 4, 14, 9, 0, 0);
const seed = 'test-install';

function day(overrides: Partial<DevotionalDay> = {}): DevotionalDay {
  return {
    id: 'day-6',
    devotionalId: 'dev-1',
    dayNumber: 6,
    title: 'Learning to Return',
    scriptureReference: 'Luke 15:20',
    scriptureText: 'And he arose and came to his father.',
    bodyText: 'Body',
    quotableLine: 'Grace meets you before you finish explaining yourself.',
    isRead: false,
    generatedAt: now.toISOString(),
    ...overrides,
  };
}

function devotional(overrides: Partial<Devotional> = {}): Devotional {
  return {
    id: 'dev-1',
    title: 'When God Calls You Home',
    totalDays: 7,
    currentDay: 7,
    days: [],
    createdAt: '2026-05-08T00:00:00.000Z',
    updatedAt: '2026-05-14T00:00:00.000Z',
    userContext: {
      name: 'Nick',
      aboutMe: '',
      currentSituation: '',
      emotionalState: '',
    },
    generationMode: 'progressive',
    ...overrides,
  };
}

describe('daily reminder content', () => {
  it('keeps an overnight-prepared reading specific when no calendar anchor exists', () => {
    const currentDay = day({ generatedAt: new Date(2026, 4, 13, 23).toISOString() });
    const content = getDailyReminderContent({ currentDevotional: devotional({ currentDay: 6, days: [currentDay] }), premiumPolicy: 'granted', now, seed });
    expect(content.title).toBe(currentDay.title);
    expect(content.body).toBe(currentDay.quotableLine);
  });

  it('uses the series calendar for a reading generated ahead of its reading date', () => {
    const currentDay = day({ generatedAt: new Date(2026, 4, 12, 23).toISOString() });
    const series = devotional({ currentDay: 6, days: [currentDay], seriesStartDate: new Date(2026, 4, 9, 12).toISOString() });
    expect(getDailyReminderContent({ currentDevotional: series, premiumPolicy: 'granted', now, seed }).title).toBe(currentDay.title);
    const overdue = getDailyReminderContent({ currentDevotional: series, premiumPolicy: 'granted', now: new Date(2026, 4, 16, 9), seed });
    expect(OVERDUE_TITLES).toContain(overdue.title);
    expect(overdue.body).toMatch(/day 6\b/i);
    expect(overdue.body).toContain('When God Calls You Home');
  });

  it('refreshes notification copy when a calendar anchor arrives from sync', () => {
    const series = devotional({ currentDay: 6, days: [day()] });
    const first = buildDailyReminderFingerprint({ currentDevotional: series, premiumPolicy: 'granted', reminderTime: '08:00' });
    const synced = buildDailyReminderFingerprint({ currentDevotional: { ...series, seriesStartDate: now.toISOString() }, premiumPolicy: 'granted', reminderTime: '08:00' });
    expect(synced).not.toBe(first);
    expect(JSON.parse(first)[0]).toBe('reading-calendar-v1');
  });

  it('uses a non-generative Bible/Premium message for churned users whose next day is missing', () => {
    const content = getDailyReminderContent({
      currentDevotional: devotional({ currentDay: 7, days: [day({ dayNumber: 6, isRead: true })] }),
      premiumPolicy: 'denied',
      now,
      seed,
    });

    expect(`${content.title} ${content.body}`).toMatch(/Bible/i);
    expect(`${content.title} ${content.body}`).toMatch(/Premium/i);
    expect(`${content.title} ${content.body}`).not.toMatch(/generat|prepar|created|next day/i);
    expect(PAUSED_SERIES_BODIES).toContain(content.body);
  });

  it('names no series in the paused reminder for a churned reader without one', () => {
    const content = getDailyReminderContent({ currentDevotional: null, premiumPolicy: 'denied', now, seed });

    expect(PAUSED_NO_SERIES_BODIES).toContain(content.body);
    expect(content.body).not.toMatch(/series|devotional/i);
  });

  it('gives an unread Day 1 its own lines, overdue on the device or not there yet', () => {
    const overdue = devotional({ currentDay: 1, days: [day({ id: 'day-1', dayNumber: 1 })], seriesStartDate: new Date(2026, 4, 9, 12).toISOString() });
    const pending = devotional({ currentDay: 1, days: [] });
    for (const currentDevotional of [overdue, pending]) {
      const content = getDailyReminderContent({ currentDevotional, premiumPolicy: 'granted', now, seed });
      expect(FIRST_DAY_TITLES).toContain(content.title);
      expect(content.body).toContain('When God Calls You Home');
      expect(`${content.title} ${content.body}`).not.toMatch(/left off|stopped|again|back|return/i);
    }
  });

  it('keeps generated unread content reminders specific even if premium is denied', () => {
    const content = getDailyReminderContent({
      currentDevotional: devotional({ currentDay: 6, days: [day({ dayNumber: 6 })] }),
      premiumPolicy: 'denied',
      now,
      seed,
    });

    expect(content.title).toBe('Learning to Return');
    expect(content.body).toBe('Grace meets you before you finish explaining yourself.');
  });

  it('changes the fingerprint when premium policy resolves so frozen OS notification copy is refreshed', () => {
    const currentDevotional = devotional({ currentDay: 7, days: [day({ dayNumber: 6, isRead: true })] });

    const unknownFingerprint = buildDailyReminderFingerprint({
      reminderTime: '08:00',
      currentDevotional,
      premiumPolicy: 'unknown',
    });
    const deniedFingerprint = buildDailyReminderFingerprint({
      reminderTime: '08:00',
      currentDevotional,
      premiumPolicy: 'denied',
    });

    expect(deniedFingerprint).not.toBe(unknownFingerprint);
  });

  it('changes the fingerprint when durable reminder intent is toggled off', () => {
    const currentDevotional = devotional({ currentDay: 6, days: [day({ dayNumber: 6 })] });

    const enabledFingerprint = buildDailyReminderFingerprint({
      reminderTime: '8:00 AM',
      dailyReminderEnabled: true,
      currentDevotional,
      premiumPolicy: 'granted',
    });
    const disabledFingerprint = buildDailyReminderFingerprint({
      reminderTime: '8:00 AM',
      dailyReminderEnabled: false,
      currentDevotional,
      premiumPolicy: 'granted',
    });

    expect(disabledFingerprint).not.toBe(enabledFingerprint);
  });

  it('names the next day instead of "being prepared" when tomorrow has not been pulled yet', () => {
    // Bedtime state: Day 6 read today, currentDay advanced to 7, Day 7 is
    // generated overnight and only lands when the app opens. The 8am
    // reminder used to say the reading was still being prepared.
    const content = getDailyReminderContent({
      currentDevotional: devotional({ currentDay: 7, days: [day({ dayNumber: 6, isRead: true })] }),
      premiumPolicy: 'granted',
      now,
      seed,
    });

    expect(content.title).toMatch(/\bday 7\b/i);
    expect(content.title).toContain('When God Calls You Home');
    expect(NEXT_DAY_BODIES).toContain(content.body);
    expect(`${content.title} ${content.body}`).not.toMatch(/prepar|check back/i);
  });

  it('falls back to the series title when the pointer sits past the series end', () => {
    const content = getDailyReminderContent({
      currentDevotional: devotional({ currentDay: 8, totalDays: 7, days: [day({ dayNumber: 7, isRead: true })] }),
      premiumPolicy: 'unknown',
      now,
      seed,
    });

    expect(content.title).toBe('When God Calls You Home');
    expect(`${content.title} ${content.body}`).not.toMatch(/prepar/i);
    // Past the end there is no next reading to promise.
    expect(PAST_END_BODIES).toContain(content.body);
  });
});
