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
});
