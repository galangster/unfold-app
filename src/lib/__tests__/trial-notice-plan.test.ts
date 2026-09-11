import {
  TRIAL_NOTICE_DEADLINE_LEAD_MS,
  getTrialCheckInSkipLocalDate,
  planTrialEndingNotice,
  type TrialNoticePlan,
} from '../trial-notice-plan';

/** Non-DST January 2026 (OI-29: accept DST; no transition cases). Mon=5. */
function at(day: number, hour: number, minute: number, second = 0): Date {
  return new Date(2026, 0, day, hour, minute, second, 0);
}

const MIDDAY = { hour: 12, minute: 30 };

function plan(
  partial: Partial<Parameters<typeof planTrialEndingNotice>[0]> &
    Pick<Parameters<typeof planTrialEndingNotice>[0], 'purchasedAtMs' | 'expiresAtMs' | 'nowMs' | 'trialDays'>,
) {
  return planTrialEndingNotice({
    middaySlot: MIDDAY,
    priorFireAtMs: null,
    appActive: false,
    ...partial,
  });
}

function threeDay(
  purchase: Date,
  now: Date,
  extra?: Partial<Parameters<typeof planTrialEndingNotice>[0]>,
) {
  const expires = new Date(purchase.getTime() + 3 * 86_400_000);
  return {
    purchase,
    expires,
    result: plan({
      purchasedAtMs: purchase.getTime(),
      expiresAtMs: expires.getTime(),
      nowMs: now.getTime(),
      trialDays: 3,
      ...extra,
    }),
  };
}

function expectFire(result: TrialNoticePlan, fireAt: Date, copy: 'tomorrow' | 'two_days' | 'weekday', expiresAtMs: number) {
  expect(result.kind).toBe('schedule');
  if (result.kind !== 'schedule') return;
  expect(result.fireAt.getTime()).toBe(fireAt.getTime());
  expect(result.copy).toBe(copy);
  expect(result.fireAt.getTime()).toBeLessThanOrEqual(expiresAtMs - TRIAL_NOTICE_DEADLINE_LEAD_MS);
}

describe('I1 planTrialEndingNotice', () => {
  describe('§9.2 table', () => {
    it('Mon 10:00 fires Wed 09:00 tomorrow', () => {
      const { expires, result } = threeDay(at(5, 10, 0), at(5, 10, 0));
      expectFire(result, at(7, 9, 0), 'tomorrow', expires.getTime());
    });

    it('Mon 14:00 fires Wed 12:30 tomorrow', () => {
      const { expires, result } = threeDay(at(5, 14, 0), at(5, 14, 0));
      expectFire(result, at(7, 12, 30), 'tomorrow', expires.getTime());
    });

    it('Mon 23:30 fires Wed 12:30 tomorrow', () => {
      const { expires, result } = threeDay(at(5, 23, 30), at(5, 23, 30));
      expectFire(result, at(7, 12, 30), 'tomorrow', expires.getTime());
    });

    it('Mon 08:00 fires Wed 07:00 tomorrow', () => {
      const { expires, result } = threeDay(at(5, 8, 0), at(5, 8, 0));
      expectFire(result, at(7, 7, 0), 'tomorrow', expires.getTime());
    });

    it('Mon 07:59 fires Tue 21:59 two_days (OI-4)', () => {
      const { expires, result } = threeDay(at(5, 7, 59), at(5, 7, 59));
      expectFire(result, at(6, 21, 59), 'two_days', expires.getTime());
    });

    it('late grant Wed 12:45 with priorFireAtMs null still fires 12:46 tomorrow', () => {
      const { expires, result } = threeDay(at(5, 14, 0), at(7, 12, 45), { priorFireAtMs: null });
      expectFire(result, at(7, 12, 46), 'tomorrow', expires.getTime());
    });

    it('Mon 06:30 grant Wed 06:00 is past_deadline', () => {
      const { result } = threeDay(at(5, 6, 30), at(7, 6, 0));
      expect(result).toEqual({ kind: 'skip', reason: 'past_deadline' });
    });

    it('armed Wed 12:30, cold launch Wed 12:40 is already_delivered', () => {
      const { result } = threeDay(at(5, 23, 30), at(7, 12, 40), {
        priorFireAtMs: at(7, 12, 30).getTime(),
      });
      expect(result).toEqual({ kind: 'skip', reason: 'already_delivered' });
    });

    it('Mon 00:30 active sync Tue 22:10 fires 22:11 two_days', () => {
      const { expires, result } = threeDay(at(5, 0, 30), at(6, 22, 10), { appActive: true });
      expectFire(result, at(6, 22, 11), 'two_days', expires.getTime());
    });

    it('Mon 00:30 background sync Tue 22:10 is quiet_hours', () => {
      const { result } = threeDay(at(5, 0, 30), at(6, 22, 10), { appActive: false });
      expect(result).toEqual({ kind: 'skip', reason: 'quiet_hours' });
    });

    it('slot 06:30 purchase Mon 10:00 fires Wed 07:00 tomorrow', () => {
      const { expires, result } = threeDay(at(5, 10, 0), at(5, 10, 0), {
        middaySlot: { hour: 6, minute: 30 },
      });
      expectFire(result, at(7, 7, 0), 'tomorrow', expires.getTime());
    });

    it('slot 06:30 purchase Mon 07:30 fires Tue 21:59 two_days (OI-4)', () => {
      const { expires, result } = threeDay(at(5, 7, 30), at(5, 7, 30), {
        middaySlot: { hour: 6, minute: 30 },
      });
      expectFire(result, at(6, 21, 59), 'two_days', expires.getTime());
    });

    it('sandbox compressed trial (minutes) is past_deadline', () => {
      const purchased = at(5, 14, 0);
      const expires = new Date(purchased.getTime() + 3 * 60_000);
      const result = plan({
        purchasedAtMs: purchased.getTime(),
        expiresAtMs: expires.getTime(),
        nowMs: purchased.getTime() + 5_000,
        trialDays: 3,
      });
      expect(result).toEqual({ kind: 'skip', reason: 'past_deadline' });
    });
  });

  it('7-day trial bought at 23:30 fires 21:59 two days before expiry, two_days', () => {
    const purchased = at(5, 23, 30);
    const expires = at(12, 23, 30);
    const result = plan({
      purchasedAtMs: purchased.getTime(),
      expiresAtMs: expires.getTime(),
      nowMs: purchased.getTime(),
      trialDays: 7,
    });
    expectFire(result, at(10, 21, 59), 'two_days', expires.getTime());
  });

  it('trialDays null uses the 48 h lead', () => {
    const purchased = at(5, 10, 0);
    const expires = at(8, 10, 0);
    const result = plan({
      purchasedAtMs: purchased.getTime(),
      expiresAtMs: expires.getTime(),
      nowMs: purchased.getTime(),
      trialDays: null,
    });
    expectFire(result, at(6, 10, 0), 'two_days', expires.getTime());
  });

  it('already_delivered for 3-day Mon 14:00 with priorFireAtMs Wed 12:30 at Wed 12:31', () => {
    const { result } = threeDay(at(5, 14, 0), at(7, 12, 31), {
      priorFireAtMs: at(7, 12, 30).getTime(),
    });
    expect(result).toEqual({ kind: 'skip', reason: 'already_delivered' });
  });

  it('already_delivered for a 7-day trial at fireAt + 2 h', () => {
    const purchased = at(5, 23, 30);
    const expires = at(12, 23, 30);
    const fireAt = at(10, 21, 59);
    const result = plan({
      purchasedAtMs: purchased.getTime(),
      expiresAtMs: expires.getTime(),
      nowMs: fireAt.getTime() + 2 * 3_600_000,
      trialDays: 7,
      priorFireAtMs: fireAt.getTime(),
    });
    expect(result).toEqual({ kind: 'skip', reason: 'already_delivered' });
  });

  it('past_deadline only when now + 60 s > deadline', () => {
    const purchased = at(5, 14, 0);
    const expires = new Date(purchased.getTime() + 3 * 86_400_000);
    const deadline = expires.getTime() - TRIAL_NOTICE_DEADLINE_LEAD_MS;

    const stillFires = plan({
      purchasedAtMs: purchased.getTime(),
      expiresAtMs: expires.getTime(),
      nowMs: deadline - 90_000,
      trialDays: 3,
    });
    expect(stillFires.kind).toBe('schedule');
    if (stillFires.kind === 'schedule') {
      expect(stillFires.fireAt.getTime()).toBe(deadline - 30_000);
      expect(stillFires.fireAt.getTime()).toBeLessThanOrEqual(deadline);
    }

    const skipped = plan({
      purchasedAtMs: purchased.getTime(),
      expiresAtMs: expires.getTime(),
      nowMs: deadline - 30_000,
      trialDays: 3,
    });
    expect(skipped).toEqual({ kind: 'skip', reason: 'past_deadline' });
  });

  describe('getTrialCheckInSkipLocalDate', () => {
    it('returns Day 3 for a 3-day trial', () => {
      expect(
        getTrialCheckInSkipLocalDate({ purchasedAtMs: at(5, 14, 0).getTime(), trialDays: 3 }),
      ).toBe('2026-01-07');
    });

    it('returns null for 7 days and for purchasedAtMs null', () => {
      expect(
        getTrialCheckInSkipLocalDate({ purchasedAtMs: at(5, 14, 0).getTime(), trialDays: 7 }),
      ).toBeNull();
      expect(getTrialCheckInSkipLocalDate({ purchasedAtMs: null, trialDays: 3 })).toBeNull();
    });
  });
});
