import {
  beginRitualSessionRecord,
  isRitualSessionIdentity,
  localCalendarYmd,
  resolveRitualCompletion,
  resolveRitualCompletionInstant,
} from '../ritual-session';

describe('ritual session calendar day', () => {
  const mondayNight = new Date(2026, 8, 14, 23, 50, 0);
  const tuesdayMorning = new Date(2026, 8, 15, 0, 20, 0);
  const tuesdayAfternoon = new Date(2026, 8, 15, 15, 0, 0);
  const thursdayMorning = new Date(2026, 8, 17, 8, 0, 0);

  it('keeps a same-day completion on the finish instant', () => {
    const start = new Date(2026, 8, 14, 20, 0, 0);
    const finish = new Date(2026, 8, 14, 21, 10, 0);
    expect(
      resolveRitualCompletionInstant({
        startedAt: start,
        completedAt: finish,
        startedTimeZone: 'Pacific/Honolulu',
        completedTimeZone: 'Pacific/Honolulu',
      }),
    ).toBe(finish);
  });

  it('pins a midnight-crossing session to the start calendar day', () => {
    const at = resolveRitualCompletionInstant({
      startedAt: mondayNight,
      completedAt: tuesdayMorning,
      startedTimeZone: 'Pacific/Honolulu',
      completedTimeZone: 'Pacific/Honolulu',
    });
    expect(at).toBe(mondayNight);
    expect(at.toDateString()).toBe(mondayNight.toDateString());
    expect(at.toDateString()).not.toBe(tuesdayMorning.toDateString());
    expect(localCalendarYmd(at)).toBe('2026-09-14');
  });

  it('still pins across midnight when timezone was never reported', () => {
    const at = resolveRitualCompletionInstant({
      startedAt: mondayNight,
      completedAt: tuesdayMorning,
      startedTimeZone: null,
      completedTimeZone: null,
    });
    expect(localCalendarYmd(at)).toBe('2026-09-14');
  });

  it('keeps completion-time behavior when the device timezone changes (travel)', () => {
    const at = resolveRitualCompletionInstant({
      startedAt: mondayNight,
      completedAt: tuesdayAfternoon,
      startedTimeZone: 'America/Los_Angeles',
      completedTimeZone: 'Pacific/Honolulu',
    });
    expect(at).toBe(tuesdayAfternoon);
    expect(localCalendarYmd(at)).toBe('2026-09-15');
  });

  it('credits the finish day when a preview stays open until the next morning', () => {
    const preview = new Date(2026, 8, 14, 20, 0, 0);
    const finish = new Date(2026, 8, 15, 8, 0, 0);
    const identity = { kind: 'reading' as const, devotionalId: 'next-series', dayNumber: 1 };
    const session = beginRitualSessionRecord(null, { ...identity, now: preview });
    const clock = resolveRitualCompletion({ session, identity, completedAt: finish });
    expect(clock.iso).toBe(finish.toISOString());
    expect(resolveRitualCompletionInstant({
      startedAt: preview,
      completedAt: finish,
      startedTimeZone: null,
      completedTimeZone: null,
    })).toBe(finish);
  });

  it('expires midnight carryover after four hours', () => {
    const start = new Date(2026, 8, 14, 23, 0, 0);
    const atLimit = new Date(start.getTime() + 4 * 60 * 60 * 1000);
    const afterLimit = new Date(atLimit.getTime() + 1);
    const times = { startedAt: start, startedTimeZone: null, completedTimeZone: null };
    expect(resolveRitualCompletionInstant({ ...times, completedAt: atLimit })).toBe(start);
    expect(resolveRitualCompletionInstant({ ...times, completedAt: afterLimit })).toBe(afterLimit);
  });

  it('does not treat a DST stay in the same IANA zone as travel', () => {
    const beforeSpring = new Date(2026, 2, 7, 23, 50, 0);
    const afterSpring = new Date(2026, 2, 8, 0, 20, 0);
    const at = resolveRitualCompletionInstant({
      startedAt: beforeSpring,
      completedAt: afterSpring,
      startedTimeZone: 'America/Chicago',
      completedTimeZone: 'America/Chicago',
    });
    expect(localCalendarYmd(at)).toBe('2026-03-07');
  });

  it('reuses the open session for the same day and starts a new one after the day changes', () => {
    const first = beginRitualSessionRecord(null, {
      kind: 'reading',
      devotionalId: 'dev-1',
      dayNumber: 5,
      now: mondayNight,
      timeZone: 'Pacific/Honolulu',
    });
    const same = beginRitualSessionRecord(first, {
      kind: 'reading',
      devotionalId: 'dev-1',
      dayNumber: 5,
      now: tuesdayMorning,
      timeZone: 'Pacific/Honolulu',
    });
    expect(same).toBe(first);

    const nextDay = beginRitualSessionRecord(first, {
      kind: 'reading',
      devotionalId: 'dev-1',
      dayNumber: 6,
      now: tuesdayMorning,
      timeZone: 'Pacific/Honolulu',
    });
    expect(nextDay.startedAt).toBe(tuesdayMorning.toISOString());
    expect(isRitualSessionIdentity(nextDay, {
      kind: 'reading',
      devotionalId: 'dev-1',
      dayNumber: 6,
    })).toBe(true);
  });

  it('resolves a stored midnight-crossing reading onto the start day number', () => {
    const session = beginRitualSessionRecord(null, {
      kind: 'reading',
      devotionalId: 'dev-1',
      dayNumber: 5,
      now: mondayNight,
      timeZone: 'Pacific/Honolulu',
    });
    const clock = resolveRitualCompletion({
      session,
      identity: { kind: 'reading', devotionalId: 'dev-1', dayNumber: 5 },
      completedAt: tuesdayMorning,
      completedTimeZone: 'Pacific/Honolulu',
    });
    expect(clock.dayNumber).toBe(5);
    expect(clock.localYmd).toBe('2026-09-14');
    expect(clock.iso).toBe(mondayNight.toISOString());
  });

  it('keeps the open session day when the computed day has already advanced', () => {
    const session = beginRitualSessionRecord(null, {
      kind: 'midday',
      devotionalId: 'dev-1',
      dayNumber: 5,
      now: mondayNight,
      timeZone: 'Pacific/Honolulu',
    });
    const clock = resolveRitualCompletion({
      session,
      identity: { kind: 'midday', devotionalId: 'dev-1', dayNumber: 6 },
      completedAt: tuesdayMorning,
      completedTimeZone: 'Pacific/Honolulu',
    });
    expect(clock.dayNumber).toBe(5);
    expect(clock.localYmd).toBe('2026-09-14');
  });

  it('falls back to completion time when no matching session was opened', () => {
    const clock = resolveRitualCompletion({
      session: undefined,
      identity: { kind: 'evening', devotionalId: 'dev-1', dayNumber: 5 },
      completedAt: tuesdayMorning,
      completedTimeZone: 'Pacific/Honolulu',
    });
    expect(clock.iso).toBe(tuesdayMorning.toISOString());
    expect(clock.localYmd).toBe('2026-09-15');
  });

  it('starts a new session when the same identity is reopened days later', () => {
    const abandoned = beginRitualSessionRecord(null, {
      kind: 'reading',
      devotionalId: 'dev-1',
      dayNumber: 5,
      now: mondayNight,
      timeZone: 'Pacific/Honolulu',
    });
    const reopened = beginRitualSessionRecord(abandoned, {
      kind: 'reading',
      devotionalId: 'dev-1',
      dayNumber: 5,
      now: thursdayMorning,
      timeZone: 'Pacific/Honolulu',
    });
    expect(reopened).not.toBe(abandoned);
    expect(reopened.startedAt).toBe(thursdayMorning.toISOString());
  });

  it('does not backdate a completion from an abandoned session days later', () => {
    const abandoned = beginRitualSessionRecord(null, {
      kind: 'reading',
      devotionalId: 'dev-1',
      dayNumber: 5,
      now: mondayNight,
      timeZone: 'Pacific/Honolulu',
    });
    const at = resolveRitualCompletionInstant({
      startedAt: mondayNight,
      completedAt: thursdayMorning,
      startedTimeZone: 'Pacific/Honolulu',
      completedTimeZone: 'Pacific/Honolulu',
    });
    expect(at).toBe(thursdayMorning);

    const clock = resolveRitualCompletion({
      session: abandoned,
      identity: { kind: 'reading', devotionalId: 'dev-1', dayNumber: 5 },
      completedAt: thursdayMorning,
      completedTimeZone: 'Pacific/Honolulu',
    });
    expect(clock.iso).toBe(thursdayMorning.toISOString());
    expect(clock.localYmd).toBe('2026-09-17');
    expect(clock.dayNumber).toBe(5);
  });
});
