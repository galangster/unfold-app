import {
  buildActReminderFingerprint,
  buildActReminderPlan,
  getActReminderFireAt,
  getEveningActClaim,
  getMiddayActClaim,
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

  it('keeps the midday slot on a replan inside the lead, so it never disagrees with the check-in claim', () => {
    // Read at 07:40, cold launch at 12:20: the hydration replan must still
    // land at 12:30, where today's check-in already stepped aside.
    const midday = day({ act: 'At lunch, text the friend you thought of.' });
    const relaunch = new Date(2026, 8, 8, 12, 20, 0);
    const plan = buildActReminderPlan({ devotional: devotional(), day: midday, now: relaunch, middayTime: '12:30' });
    expect(plan?.fireAt).toEqual(new Date(2026, 8, 8, 12, 30, 0));
    const claim = getMiddayActClaim(
      { devotionals: [{ ...devotional(), days: [midday] }], currentDevotionalId: 'dev-1', user: { dailyReminderEnabled: true, reminderTime: '8:00 AM' }, middayCheckInTime: '12:30' },
      relaunch,
    );
    expect(claim).toEqual(plan?.fireAt);
  });

  it('plans nothing more once a reminder for the day has fired, so a later replan adds no evening banner', () => {
    // Read at 07:40, the 12:30 reminder fired, then a timezone change replans at 15:00.
    const midday = day({ act: 'At lunch, text the friend you thought of.' });
    const afternoon = new Date(2026, 8, 8, 15, 0, 0);
    const lastWrite = { devotionalId: 'dev-1', dayNumber: midday.dayNumber, fireAt: new Date(2026, 8, 8, 12, 30).toISOString() };
    expect(buildActReminderPlan({ devotional: devotional(), day: midday, now: afternoon, middayTime: '12:30', lastWrite })).toBeNull();
  });

  it('rolls an unwritten midday reminder to the evening when the replan comes after midday', () => {
    // Read at 07:40 with reminders off or permission denied; switched on at 13:00.
    const midday = day({ act: 'At lunch, text the friend you thought of.' });
    const afternoon = new Date(2026, 8, 8, 13, 0, 0);
    const plan = buildActReminderPlan({ devotional: devotional(), day: midday, now: afternoon, middayTime: '12:30' });
    expect(plan?.fireAt).toEqual(new Date(2026, 8, 8, 20, 30));
    const yesterdays = { devotionalId: 'dev-1', dayNumber: midday.dayNumber - 1, fireAt: new Date(2026, 8, 7, 12, 30).toISOString() };
    expect(buildActReminderPlan({ devotional: devotional(), day: midday, now: afternoon, middayTime: '12:30', lastWrite: yesterdays })?.fireAt)
      .toEqual(new Date(2026, 8, 8, 20, 30));
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

  it('schedules an evening act at the wind-down clock, where the wind-down steps aside (design call 1)', () => {
    const plan = buildActReminderPlan({
      devotional: devotional(),
      day: day(),
      now,
      eveningTime: '20:30',
    });
    expect(plan!.slot).toBe('evening');
    expect(plan!.fireAt).toEqual(new Date(2026, 8, 8, 20, 30));
  });

  it('rolls a missed midday into the wind-down clock and keeps it', () => {
    const afternoon = new Date(2026, 8, 8, 14, 0);
    const plan = buildActReminderPlan({
      devotional: devotional(),
      day: day({ actSlot: 'midday' }),
      now: afternoon,
      eveningTime: '20:30',
    });
    expect(plan!.fireAt).toEqual(new Date(2026, 8, 8, 20, 30));
  });

  it('nudges 45 minutes out once today\'s wind-down time has passed', () => {
    const late = new Date(2026, 8, 8, 20, 45);
    const plan = buildActReminderPlan({
      devotional: devotional(),
      day: day(),
      now: late,
      eveningTime: '20:30',
    });
    expect(plan).not.toBeNull();
    expect(plan!.slot).toBe('evening');
    expect(plan!.fireAt).toEqual(new Date(2026, 8, 8, 21, 30));
  });

  it('keeps midday and morning-next act reminders at their own clocks', () => {
    const midday = buildActReminderPlan({
      devotional: devotional(),
      day: day({ act: 'At lunch, text the friend you thought of.' }),
      now,
      eveningTime: '20:30',
    });
    expect(midday!.slot).toBe('midday');
    expect(midday!.fireAt).toEqual(new Date(2026, 8, 8, 12, 30));

    const morning = buildActReminderPlan({
      devotional: devotional(),
      day: day({ act: 'Tomorrow, first thing, read Psalm 132 aloud.' }),
      now,
      eveningTime: '20:30',
      morningTime: '8:00 AM',
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
});

describe('getMiddayActClaim', () => {
  function state(today: DevotionalDay, reminders = true) {
    return {
      devotionals: [{ ...devotional(), days: [today] }],
      currentDevotionalId: 'dev-1',
      user: { dailyReminderEnabled: reminders, reminderTime: '8:00 AM' },
      middayCheckInTime: '13:00',
    };
  }

  it('claims the midday check-in clock for a midday act read today', () => {
    const claim = getMiddayActClaim(state(day({ act: 'At lunch, text the friend you thought of.' })), now);
    expect(claim).toEqual(new Date(2026, 8, 8, 13, 0, 0));
  });

  it('claims nothing for an evening act, a done act, a day read yesterday, or reminders off', () => {
    const midday = { act: 'At lunch, text the friend you thought of.' };
    expect(getMiddayActClaim(state(day()), now)).toBeNull();
    expect(getMiddayActClaim(state(day({ ...midday, actOutcome: 'done' })), now)).toBeNull();
    expect(getMiddayActClaim(state(day({ ...midday, readAt: new Date(2026, 8, 7, 7, 40).toISOString() })), now)).toBeNull();
    expect(getMiddayActClaim(state(day(midday), false), now)).toBeNull();
  });

  it('counts the lead from the read, so a later replan keeps the claim and a late read makes none', () => {
    const midday = { act: 'At lunch, text the friend you thought of.' };
    const afterLunch = new Date(2026, 8, 8, 12, 50, 0);
    expect(getMiddayActClaim(state(day(midday)), afterLunch)).toEqual(new Date(2026, 8, 8, 13, 0, 0));
    const lateRead = day({ ...midday, readAt: new Date(2026, 8, 8, 12, 50, 0).toISOString() });
    expect(getMiddayActClaim(state(lateRead), afterLunch)).toBeNull();
  });

  it('gives the slot back to the check-in while the act reminder write is failing', () => {
    const midday = day({ act: 'At lunch, text the friend you thought of.' });
    expect(getMiddayActClaim(state(midday), now, true)).toBeNull();
  });
});

describe('getEveningActClaim (design call 1, 2026-10-29)', () => {
  const READ = new Date(2026, 8, 8, 7, 40, 0).toISOString();
  function state(today: DevotionalDay, reminders = true) {
    return {
      devotionals: [{ ...devotional(), days: [today] }],
      currentDevotionalId: 'dev-1',
      user: { dailyReminderEnabled: reminders, reminderTime: '8:00 AM' },
      middayCheckInTime: '12:30',
      eveningWindDownTime: '21:00',
    };
  }
  const midday = { act: 'At lunch, text the friend you thought of.', actSlot: 'midday' as const };

  it('claims the wind-down clock for an evening act read today', () => {
    expect(getEveningActClaim(state(day()), now)).toEqual(new Date(2026, 8, 8, 21, 0, 0));
  });

  it('claims the wind-down clock for a midday act read too late for midday', () => {
    const lateRead = day({ ...midday, readAt: new Date(2026, 8, 8, 12, 25, 0).toISOString() });
    expect(getEveningActClaim(state(lateRead), new Date(2026, 8, 8, 12, 26, 0))).toEqual(new Date(2026, 8, 8, 21, 0, 0));
  });

  it('claims nothing for a midday act, a done act, a day read yesterday, or reminders off', () => {
    expect(getEveningActClaim(state(day(midday)), now)).toBeNull();
    expect(getEveningActClaim(state(day({ actOutcome: 'done' })), now)).toBeNull();
    expect(getEveningActClaim(state(day({ readAt: new Date(2026, 8, 7, 7, 40).toISOString() })), now)).toBeNull();
    expect(getEveningActClaim(state(day(), false), now)).toBeNull();
  });

  it('gives the slot back to the wind-down while the act reminder write is failing', () => {
    expect(getEveningActClaim(state(day()), now, true)).toBeNull();
  });

  it('claims nothing once the act reminder for the day has fired', () => {
    const fired = { devotionalId: 'dev-1', dayNumber: 4, fireAt: new Date(2026, 8, 8, 12, 30).toISOString() };
    expect(getEveningActClaim(state(day(midday)), new Date(2026, 8, 8, 15, 0, 0), false, fired)).toBeNull();
  });

  it('counts the lead from the read, so the claim and the planner agree on a replan near the slot', () => {
    const nearSlot = new Date(2026, 8, 8, 20, 50, 0);
    const claim = getEveningActClaim(state(day({ readAt: READ })), nearSlot);
    const plan = buildActReminderPlan({ devotional: devotional(), day: day({ readAt: READ }), now: nearSlot, eveningTime: '21:00' });
    expect(claim).toEqual(new Date(2026, 8, 8, 21, 0, 0));
    expect(plan?.fireAt).toEqual(claim);
    const lateRead = day({ readAt: new Date(2026, 8, 8, 20, 50, 0).toISOString() });
    expect(getEveningActClaim(state(lateRead), nearSlot)).toBeNull();
  });
});
