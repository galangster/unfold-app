import {
  buildActReminderFingerprint,
  buildActReminderPlan,
  getActReminderFireAt,
  inferActSlot,
} from '../act-reminder';
import type { Devotional, DevotionalDay } from '../store';

const ACT =
  'Tonight after your toddler is down, sit in the quiet for two full minutes before picking up your phone or your to-do list. Pray Psalm 132:1-5 slowly out loud, naming your own unfinished house where David names his oath.';

// A Tuesday at 09:15 local time.
const now = new Date(2026, 8, 8, 9, 15, 0);

function day(overrides: Partial<DevotionalDay> = {}): DevotionalDay {
  return {
    dayNumber: 4,
    title: 'The Unfinished House',
    scriptureReference: 'Psalm 132:1-5',
    scriptureText: '',
    bodyText: '',
    quotableLine: '',
    isRead: true,
    readAt: new Date(2026, 8, 8, 7, 40, 0).toISOString(),
    act: ACT,
    ...overrides,
  };
}

function devotional(): Devotional {
  return {
    id: 'dev-1',
    title: 'Building What Lasts',
    totalDays: 7,
    currentDay: 5,
    days: [],
    createdAt: '',
    userContext: { name: '', aboutMe: '', currentSituation: '', emotionalState: '' },
    generationMode: 'progressive',
  } as Devotional;
}

const clocks = {
  midday: { hour: 12, minute: 30 },
  evening: { hour: 20, minute: 30 },
  morning: { hour: 8, minute: 0 },
};

describe('inferActSlot', () => {
  it('reads the window the act names', () => {
    expect(inferActSlot(ACT)).toBe('evening');
    expect(inferActSlot('At lunch, text the friend you thought of.')).toBe('midday');
    expect(inferActSlot('Tomorrow morning, before work, read the psalm again.')).toBe('morning-next');
  });

  it('defaults to evening', () => {
    expect(inferActSlot('Write one sentence of thanks.')).toBe('evening');
  });

  it('trusts a generated slot over the text', () => {
    expect(inferActSlot(ACT, 'midday')).toBe('midday');
  });
});

describe('getActReminderFireAt', () => {
  it('fires at the slot when it is still ahead', () => {
    expect(getActReminderFireAt('evening', now, clocks)).toEqual(new Date(2026, 8, 8, 20, 30));
    expect(getActReminderFireAt('midday', now, clocks)).toEqual(new Date(2026, 8, 8, 12, 30));
    expect(getActReminderFireAt('morning-next', now, clocks)).toEqual(new Date(2026, 8, 9, 8, 0));
  });

  it('rolls a missed midday into the evening', () => {
    const afternoon = new Date(2026, 8, 8, 14, 0);
    expect(getActReminderFireAt('midday', afternoon, clocks)).toEqual(new Date(2026, 8, 8, 20, 30));
  });

  it('nudges 45 minutes out when the evening slot has passed, until 22:00', () => {
    const late = new Date(2026, 8, 8, 20, 45);
    expect(getActReminderFireAt('evening', late, clocks)).toEqual(new Date(2026, 8, 8, 21, 30));
    const tooLate = new Date(2026, 8, 8, 21, 30);
    expect(getActReminderFireAt('evening', tooLate, clocks)).toBeNull();
  });

  it('keeps a 15 minute lead so the reader is not pinged mid-read', () => {
    const almost = new Date(2026, 8, 8, 20, 20);
    expect(getActReminderFireAt('evening', almost, clocks)).toEqual(new Date(2026, 8, 8, 21, 5));
  });
});

describe('buildActReminderPlan', () => {
  it('plans one evening notification carrying the act and the route data', () => {
    const plan = buildActReminderPlan({ devotional: devotional(), day: day(), now, eveningTime: '21:00' });
    expect(plan).not.toBeNull();
    expect(plan!.slot).toBe('evening');
    expect(plan!.fireAt).toEqual(new Date(2026, 8, 8, 21, 0));
    expect(plan!.title).toBe('The Unfinished House');
    expect(plan!.body.startsWith('Tonight after your toddler is down')).toBe(true);
    expect(plan!.body.length).toBeLessThanOrEqual(150);
    expect(plan!.data).toEqual({
      type: 'act_reminder',
      devotionalId: 'dev-1',
      dayNumber: 4,
      dayTitle: 'The Unfinished House',
      seriesTitle: 'Building What Lasts',
      slot: 'evening',
    });
  });

  it('uses the profile reminder time for a next-morning act', () => {
    const plan = buildActReminderPlan({
      devotional: devotional(),
      day: day({ act: 'Tomorrow, first thing, read Psalm 132 aloud.' }),
      now,
      morningTime: '6:30 AM',
    });
    expect(plan!.fireAt).toEqual(new Date(2026, 8, 9, 6, 30));
  });

  it('plans nothing without an act, before the day is read, on another day, or once answered', () => {
    expect(buildActReminderPlan({ devotional: devotional(), day: day({ act: undefined }), now })).toBeNull();
    expect(buildActReminderPlan({ devotional: devotional(), day: day({ isRead: false }), now })).toBeNull();
    expect(
      buildActReminderPlan({ devotional: devotional(), day: day({ readAt: new Date(2026, 8, 7, 8, 0).toISOString() }), now }),
    ).toBeNull();
    expect(buildActReminderPlan({ devotional: devotional(), day: day({ actOutcome: 'done' }), now })).toBeNull();
    expect(buildActReminderPlan({ devotional: null, day: day(), now })).toBeNull();
  });

  it('does not schedule an evening act reminder when wind-down is scheduled at the same time', () => {
    const plan = buildActReminderPlan({
      devotional: devotional(),
      day: day(),
      now,
      eveningTime: '20:30',
      eveningWindDownEnabled: true,
      eveningWindDownByDay: null,
      notificationsEnabled: true,
      premiumPolicy: 'granted',
    });
    expect(plan).toBeNull();
  });

  it('drops a missed midday that rolled into a scheduled wind-down clock', () => {
    const afternoon = new Date(2026, 8, 8, 14, 0);
    const plan = buildActReminderPlan({
      devotional: devotional(),
      day: day({ actSlot: 'midday' }),
      now: afternoon,
      eveningTime: '20:30',
      eveningWindDownEnabled: true,
      eveningWindDownByDay: null,
      notificationsEnabled: true,
      premiumPolicy: 'granted',
    });
    expect(plan).toBeNull();
  });

  it('still schedules an evening act reminder when wind-down is disabled for that day', () => {
    const plan = buildActReminderPlan({
      devotional: devotional(),
      day: day(),
      now,
      eveningTime: '20:30',
      eveningWindDownEnabled: true,
      eveningWindDownByDay: {
        Mon: '20:30',
        Tue: null,
        Wed: '20:30',
        Thu: '20:30',
        Fri: '20:30',
        Sat: '20:30',
        Sun: '20:30',
      },
      notificationsEnabled: true,
      premiumPolicy: 'granted',
    });
    expect(plan).not.toBeNull();
    expect(plan!.slot).toBe('evening');
    expect(plan!.fireAt).toEqual(new Date(2026, 8, 8, 20, 30));
  });

  it('keeps a late evening act reminder once today\'s wind-down time has passed', () => {
    const late = new Date(2026, 8, 8, 20, 45);
    const plan = buildActReminderPlan({
      devotional: devotional(),
      day: day(),
      now: late,
      eveningTime: '20:30',
      eveningWindDownEnabled: true,
      eveningWindDownByDay: null,
      notificationsEnabled: true,
      premiumPolicy: 'granted',
    });
    expect(plan).not.toBeNull();
    expect(plan!.slot).toBe('evening');
    expect(plan!.fireAt).toEqual(new Date(2026, 8, 8, 21, 30));
  });

  it('keeps midday and morning-next act reminders when evening wind-down is scheduled', () => {
    const midday = buildActReminderPlan({
      devotional: devotional(),
      day: day({ act: 'At lunch, text the friend you thought of.' }),
      now,
      eveningTime: '20:30',
      eveningWindDownEnabled: true,
      notificationsEnabled: true,
      premiumPolicy: 'granted',
    });
    expect(midday!.slot).toBe('midday');
    expect(midday!.fireAt).toEqual(new Date(2026, 8, 8, 12, 30));

    const morning = buildActReminderPlan({
      devotional: devotional(),
      day: day({ act: 'Tomorrow, first thing, read Psalm 132 aloud.' }),
      now,
      eveningTime: '20:30',
      morningTime: '8:00 AM',
      eveningWindDownEnabled: true,
      notificationsEnabled: true,
      premiumPolicy: 'granted',
    });
    expect(morning!.slot).toBe('morning-next');
    expect(morning!.fireAt).toEqual(new Date(2026, 8, 9, 8, 0));
  });
});

describe('fingerprint', () => {
  it('changes when the outcome, the act, or a slot time changes', () => {
    const base = { devotional: devotional(), day: day(), enabled: true, eveningTime: '20:30' };
    const a = buildActReminderFingerprint(base);
    expect(buildActReminderFingerprint({ ...base, day: day({ actOutcome: 'done' }) })).not.toBe(a);
    expect(buildActReminderFingerprint({ ...base, eveningTime: '21:00' })).not.toBe(a);
    expect(buildActReminderFingerprint({ ...base, enabled: false })).not.toBe(a);
    expect(buildActReminderFingerprint(base)).toBe(a);
  });

  it('changes when evening wind-down enablement changes', () => {
    const base = {
      devotional: devotional(),
      day: day(),
      enabled: true,
      eveningTime: '20:30',
      eveningWindDownEnabled: false,
    };
    const a = buildActReminderFingerprint(base);
    expect(buildActReminderFingerprint({ ...base, eveningWindDownEnabled: true })).not.toBe(a);
  });
});
