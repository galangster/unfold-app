import { buildDailyReminderFingerprint, getDailyReminderOwner } from '../daily-reminder-content';
import type { Devotional, DevotionalDay } from '../store';

function day(overrides: Partial<DevotionalDay> = {}): DevotionalDay {
  return {
    dayNumber: 3,
    title: 'Learning to Return',
    scriptureReference: 'Luke 15:20',
    scriptureText: 'And he arose and came to his father.',
    bodyText: 'Body',
    quotableLine: 'Grace meets you before you finish explaining yourself.',
    isRead: false,
    ...overrides,
  };
}

function devotional(overrides: Partial<Devotional> = {}): Devotional {
  return {
    id: 'dev-1',
    title: 'When God Calls You Home',
    totalDays: 7,
    currentDay: 3,
    days: [],
    createdAt: '2026-05-01T00:00:00.000Z',
    userContext: { name: 'N', aboutMe: '', currentSituation: '', emotionalState: '' },
    generationMode: 'progressive',
    ...overrides,
  } as Devotional;
}

describe('getDailyReminderOwner', () => {
  it('keeps the local reminder when the backend holds no push token', () => {
    expect(
      getDailyReminderOwner({ currentDevotional: devotional(), premiumPolicy: 'granted', pushRegistered: false }),
    ).toBe('local');
  });

  it('keeps the local reminder when premium is not granted (no overnight generation)', () => {
    expect(
      getDailyReminderOwner({ currentDevotional: devotional(), premiumPolicy: 'denied', pushRegistered: true }),
    ).toBe('local');
    expect(
      getDailyReminderOwner({ currentDevotional: devotional(), premiumPolicy: 'unknown', pushRegistered: true }),
    ).toBe('local');
  });

  it('keeps the local reminder when there is no active devotional', () => {
    expect(
      getDailyReminderOwner({ currentDevotional: null, premiumPolicy: 'granted', pushRegistered: true }),
    ).toBe('local');
  });

  it('keeps the local reminder when the current day is already on the device (its copy is specific)', () => {
    expect(
      getDailyReminderOwner({
        currentDevotional: devotional({ days: [day({ dayNumber: 3 })] }),
        premiumPolicy: 'granted',
        pushRegistered: true,
      }),
    ).toBe('local');
  });

  it('hands the slot to the server when the next in-series day is not on the device yet', () => {
    expect(
      getDailyReminderOwner({
        currentDevotional: devotional({ days: [day({ dayNumber: 2, isRead: true })], currentDay: 3 }),
        premiumPolicy: 'granted',
        pushRegistered: true,
      }),
    ).toBe('server');
  });

  it('keeps the local reminder past the end of the series', () => {
    expect(
      getDailyReminderOwner({
        currentDevotional: devotional({ days: [], currentDay: 8, totalDays: 7 }),
        premiumPolicy: 'granted',
        pushRegistered: true,
      }),
    ).toBe('local');
  });
});

describe('buildDailyReminderFingerprint', () => {
  it('changes when push registration changes so the owner decision re-runs', () => {
    const base = { reminderTime: '8:00 AM', currentDevotional: devotional(), premiumPolicy: 'granted' as const };
    expect(buildDailyReminderFingerprint({ ...base, pushRegistered: false })).not.toBe(
      buildDailyReminderFingerprint({ ...base, pushRegistered: true }),
    );
  });
});
