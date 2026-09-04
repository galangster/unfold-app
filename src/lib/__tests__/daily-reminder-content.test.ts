import {
  buildDailyReminderFingerprint,
  getDailyReminderContent,
} from '../daily-reminder-content';
import type { Devotional, DevotionalDay } from '../store';

const now = new Date(2026, 4, 14, 9, 0, 0);

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
  it('uses a non-generative Bible/Premium message for churned users whose next day is missing', () => {
    const content = getDailyReminderContent({
      currentDevotional: devotional({ currentDay: 7, days: [day({ dayNumber: 6, isRead: true })] }),
      premiumPolicy: 'denied',
      now,
    });

    expect(`${content.title} ${content.body}`).toMatch(/Bible/i);
    expect(`${content.title} ${content.body}`).toMatch(/Premium/i);
    expect(`${content.title} ${content.body}`).not.toMatch(/generat|prepar|created|next day/i);
  });

  it('keeps generated unread content reminders specific even if premium is denied', () => {
    const content = getDailyReminderContent({
      currentDevotional: devotional({ currentDay: 6, days: [day({ dayNumber: 6 })] }),
      premiumPolicy: 'denied',
      now,
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
    });

    expect(content.title).toBe('Day 7 of When God Calls You Home');
    expect(content.body).toBe('Your next reading is waiting for you.');
    expect(`${content.title} ${content.body}`).not.toMatch(/prepar|check back/i);
  });

  it('falls back to the series title when the pointer sits past the series end', () => {
    const content = getDailyReminderContent({
      currentDevotional: devotional({ currentDay: 8, totalDays: 7, days: [day({ dayNumber: 7, isRead: true })] }),
      premiumPolicy: 'unknown',
      now,
    });

    expect(content.title).toBe('When God Calls You Home');
    expect(`${content.title} ${content.body}`).not.toMatch(/prepar/i);
  });
});
