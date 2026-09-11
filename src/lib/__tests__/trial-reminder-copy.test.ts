import { getPaywallRenewalDisclosure } from '../paywall-disclosure';
import {
  getTrialNoticeTitle,
  getTrialPaywallTimeline,
  trialLabelToDays,
} from '../trial-reminder-copy';

const MIDDAY = { hour: 12, minute: 30 };

function at(day: number, hour: number, minute: number): Date {
  return new Date(2026, 0, day, hour, minute, 0, 0);
}

describe('I6 trial-reminder-copy', () => {
  it('sizes 3-minute sandbox and 3/5/6 days as 3 with Mon 10:00 default slot', () => {
    const nowMs = at(5, 10, 0).getTime();
    const expected = { reminderLeadLabel: '1 day' as const, reminderDay: 3, chargeDay: 4 };
    expect(getTrialPaywallTimeline({ trialDays: 3 / (24 * 60), nowMs, middaySlot: MIDDAY })).toEqual(expected);
    expect(getTrialPaywallTimeline({ trialDays: 3, nowMs, middaySlot: MIDDAY })).toEqual(expected);
    expect(getTrialPaywallTimeline({ trialDays: 5, nowMs, middaySlot: MIDDAY })).toEqual(expected);
    expect(getTrialPaywallTimeline({ trialDays: 6, nowMs, middaySlot: MIDDAY })).toEqual(expected);
  });

  it('sizes 7 days as 2 days on day 6, charge day 8', () => {
    expect(
      getTrialPaywallTimeline({ trialDays: 7, nowMs: at(5, 10, 0).getTime(), middaySlot: MIDDAY }),
    ).toEqual({ reminderLeadLabel: '2 days', reminderDay: 6, chargeDay: 8 });
  });

  it('returns all null for 8, 14, and 30 days and for trialDays null', () => {
    const nowMs = at(5, 10, 0).getTime();
    const empty = { reminderLeadLabel: null, reminderDay: null, chargeDay: null };
    expect(getTrialPaywallTimeline({ trialDays: 8, nowMs, middaySlot: MIDDAY })).toEqual(empty);
    expect(getTrialPaywallTimeline({ trialDays: 14, nowMs, middaySlot: MIDDAY })).toEqual(empty);
    expect(getTrialPaywallTimeline({ trialDays: 30, nowMs, middaySlot: MIDDAY })).toEqual(empty);
    expect(getTrialPaywallTimeline({ trialDays: null, nowMs, middaySlot: MIDDAY })).toEqual(empty);
  });

  it('Mon 07:30 3-day timeline is 2 days on day 2, charge day 4', () => {
    expect(
      getTrialPaywallTimeline({ trialDays: 3, nowMs: at(5, 7, 30).getTime(), middaySlot: MIDDAY }),
    ).toEqual({ reminderLeadLabel: '2 days', reminderDay: 2, chargeDay: 4 });
  });

  it('maps trial labels and rejects month and year', () => {
    expect(trialLabelToDays('3-day')).toBe(3);
    expect(trialLabelToDays('1-week')).toBe(7);
    expect(trialLabelToDays('1-month')).toBeNull();
    expect(trialLabelToDays('1-year')).toBeNull();
    expect(trialLabelToDays('unknown')).toBeNull();
  });

  it('titles each copy kind', () => {
    expect(getTrialNoticeTitle('tomorrow', 3)).toBe('Your Unfold trial ends tomorrow');
    expect(getTrialNoticeTitle('two_days', 3)).toBe('Your Unfold trial ends in 2 days');
    expect(getTrialNoticeTitle('weekday', 3)).toBe('Your Unfold trial ends Wednesday');
  });

  it('prints a month label in disclosure, never 30 days free', () => {
    const text = getPaywallRenewalDisclosure({
      offeringsReady: true,
      selectedPlan: 'yearly',
      hasFreeTrial: true,
      trialDays: 30,
      trialLabel: '1-month',
      yearlyPrice: '$59.99',
      monthlyPrice: '$9.99',
    });
    expect(text).toBe('1 month free, then $59.99/yr. Cancel anytime.');
    expect(text).not.toContain('30 days free');
  });
});
