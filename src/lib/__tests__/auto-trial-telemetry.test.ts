jest.mock('../sentry', () => ({
  captureAppEvent: jest.fn(),
}));

import { captureAppEvent } from '../sentry';
import {
  trackAutoTrialAbandoned,
  trackAutoTrialCompleted,
  trackAutoTrialDay2ChipShown,
  trackAutoTrialFailed,
  trackAutoTrialKeepsakeOpened,
  trackAutoTrialLanded,
  trackAutoTrialPickStartTapped,
  trackAutoTrialRevealed,
  trackAutoTrialSkipped,
  trackAutoTrialSubmitted,
  trackNotificationPermissionAnswered,
  trackTrialNoticeScheduled,
  trackTrialNoticeSkipped,
  trackTrialStarted,
} from '../auto-trial-telemetry';

const capture = captureAppEvent as jest.Mock;

const FORBIDDEN = ['intentId', 'devotionalId', 'jobId', 'title', 'purchasedAt', 'expiresAt'];

function lastPayload(): Record<string, unknown> {
  const data = capture.mock.calls.at(-1)?.[1] as Record<string, unknown>;
  expect(data).toBeDefined();
  return data;
}

function expectOnlyKeys(keys: string[]) {
  expect(Object.keys(lastPayload()).sort()).toEqual([...keys].sort());
  const serialized = JSON.stringify(lastPayload());
  for (const token of FORBIDDEN) {
    expect(serialized).not.toContain(token);
  }
}

beforeEach(() => {
  capture.mockClear();
});

describe('K3 auto-trial telemetry keys', () => {
  it('sends only documented keys and no id, title, or date strings', () => {
    trackTrialStarted({
      entry: 'onboarding',
      surface: 'onboarding_paywall',
      purchase_source: 'purchase',
      trial_days: 3,
      auto_trial: true,
      is_sandbox: true,
    });
    expect(capture).toHaveBeenLastCalledWith('trial_started', expect.any(Object));
    expectOnlyKeys(['entry', 'surface', 'purchase_source', 'trial_days', 'auto_trial', 'is_sandbox']);

    trackAutoTrialSkipped({
      entry: 'later',
      surface: 'paywall_route',
      purchase_source: 'restore',
      reason: 'restore_source',
    });
    expectOnlyKeys(['entry', 'surface', 'purchase_source', 'reason']);

    trackAutoTrialSubmitted({
      entry: 'onboarding',
      trial_days: 7,
      attempt: 1,
      claim: 'created',
    });
    expectOnlyKeys(['entry', 'trial_days', 'attempt', 'claim']);

    trackAutoTrialLanded({ entry: 'onboarding', trial_days: 3, wait_s: 12 });
    expectOnlyKeys(['entry', 'trial_days', 'wait_s']);

    trackAutoTrialRevealed({ entry: 'onboarding', trial_days: 3 });
    expectOnlyKeys(['entry', 'trial_days']);

    trackAutoTrialFailed({
      entry: 'later',
      phase: 'submit',
      reason: 'unreachable',
      status: 0,
      can_retry: true,
    });
    expectOnlyKeys(['entry', 'phase', 'reason', 'status', 'can_retry']);

    trackAutoTrialAbandoned({ entry: 'onboarding', reason: 'trial_expired_before_submit' });
    expectOnlyKeys(['entry', 'reason']);

    trackAutoTrialCompleted({ entry: 'onboarding', trial_days: 3 });
    expectOnlyKeys(['entry', 'trial_days']);

    trackAutoTrialDay2ChipShown();
    expectOnlyKeys(['day']);
    expect(lastPayload().day).toBe(2);

    trackAutoTrialKeepsakeOpened({ opened_from: 'today', completeness: 'partial' });
    expectOnlyKeys(['opened_from', 'completeness']);

    trackAutoTrialPickStartTapped({ gate_action: 'allow', pick_source: 'stored' });
    expectOnlyKeys(['gate_action', 'pick_source']);

    trackNotificationPermissionAnswered({
      trigger: 'reminder_time',
      result: 'granted',
      prior_status: 'undetermined',
    });
    expectOnlyKeys(['trigger', 'result', 'prior_status']);

    trackTrialNoticeScheduled({ trial_days: 3, copy: 'tomorrow', lead_h: 25 });
    expectOnlyKeys(['trial_days', 'copy', 'lead_h']);

    trackTrialNoticeSkipped({ reason: 'no_permission' });
    expectOnlyKeys(['reason']);
  });
});
