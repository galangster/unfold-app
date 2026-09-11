import { captureAppEvent } from '@/lib/sentry';
import type { AutoTrialAbandonReason } from '@/lib/auto-trial-intent';
import type { AutoTrialEntry, AutoTrialFallbackReason, AutoTrialSurface } from '@/lib/auto-trial-exit';

type PurchaseSource = 'purchase' | 'offer' | 'restore' | 'lateGrant';

export function trackTrialStarted(data: {
  entry: AutoTrialEntry;
  surface: AutoTrialSurface;
  purchase_source: PurchaseSource;
  trial_days: number;
  auto_trial: boolean;
  is_sandbox: boolean;
}): void {
  captureAppEvent('trial_started', {
    entry: data.entry,
    surface: data.surface,
    purchase_source: data.purchase_source,
    trial_days: data.trial_days,
    auto_trial: data.auto_trial,
    is_sandbox: data.is_sandbox,
  });
}

export function trackAutoTrialSkipped(data: {
  entry: AutoTrialEntry;
  surface: AutoTrialSurface;
  purchase_source: PurchaseSource;
  reason: AutoTrialFallbackReason;
}): void {
  captureAppEvent('auto_trial_skipped', {
    entry: data.entry,
    surface: data.surface,
    purchase_source: data.purchase_source,
    reason: data.reason,
  });
}

export function trackAutoTrialSubmitted(data: {
  entry: AutoTrialEntry;
  trial_days: number;
  attempt: number;
  claim: 'created' | 'repointed' | 'existing' | 'resumed' | 'none';
}): void {
  captureAppEvent('auto_trial_submitted', {
    entry: data.entry,
    trial_days: data.trial_days,
    attempt: data.attempt,
    claim: data.claim,
  });
}

export function trackAutoTrialLanded(data: {
  entry: AutoTrialEntry;
  trial_days: number;
  wait_s: number;
}): void {
  captureAppEvent('auto_trial_landed', {
    entry: data.entry,
    trial_days: data.trial_days,
    wait_s: data.wait_s,
  });
}

export function trackAutoTrialRevealed(data: {
  entry: AutoTrialEntry;
  trial_days: number;
}): void {
  captureAppEvent('auto_trial_revealed', {
    entry: data.entry,
    trial_days: data.trial_days,
  });
}

export function trackAutoTrialFailed(data: {
  entry: AutoTrialEntry;
  phase: 'submit' | 'poll' | 'retry' | 'route';
  reason: string;
  status: number;
  can_retry: boolean;
}): void {
  captureAppEvent('auto_trial_failed', {
    entry: data.entry,
    phase: data.phase,
    reason: data.reason,
    status: data.status,
    can_retry: data.can_retry,
  });
}

export function trackAutoTrialAbandoned(data: {
  entry: AutoTrialEntry;
  reason: AutoTrialAbandonReason;
}): void {
  captureAppEvent('auto_trial_abandoned', {
    entry: data.entry,
    reason: data.reason,
  });
}

export function trackAutoTrialCompleted(data: {
  entry: AutoTrialEntry;
  trial_days: number;
}): void {
  captureAppEvent('auto_trial_completed', {
    entry: data.entry,
    trial_days: data.trial_days,
  });
}

export function trackAutoTrialDay2ChipShown(): void {
  captureAppEvent('auto_trial_day2_chip_shown', { day: 2 });
}

export function trackAutoTrialKeepsakeOpened(data: {
  opened_from: 'celebration' | 'today' | 'series_detail';
  completeness: 'full' | 'partial' | 'none';
}): void {
  captureAppEvent('auto_trial_keepsake_opened', {
    opened_from: data.opened_from,
    completeness: data.completeness,
  });
}

export function trackAutoTrialPickStartTapped(data: {
  gate_action: 'allow' | 'blocked' | 'exclusive-offer' | 'paywall';
  pick_source: 'stored' | 'fetched' | 'fallback';
}): void {
  captureAppEvent('auto_trial_pick_start_tapped', {
    gate_action: data.gate_action,
    pick_source: data.pick_source,
  });
}

export function trackNotificationPermissionAnswered(data: {
  trigger: 'reminder_time' | 'series_reveal' | 'generating' | 'later_entry_fallback';
  result: 'granted' | 'denied' | 'registration_failed';
  prior_status: 'undetermined' | 'granted' | 'denied';
}): void {
  captureAppEvent('notification_permission_answered', {
    trigger: data.trigger,
    result: data.result,
    prior_status: data.prior_status,
  });
}

export function trackTrialNoticeScheduled(data: {
  trial_days: number;
  copy: 'tomorrow' | 'two_days' | 'weekday';
  lead_h: number;
}): void {
  captureAppEvent('trial_notice_scheduled', {
    trial_days: data.trial_days,
    copy: data.copy,
    lead_h: data.lead_h,
  });
}

export function trackTrialNoticeSkipped(data: {
  reason: 'past_deadline' | 'invalid_dates' | 'no_permission' | 'already_delivered' | 'quiet_hours';
}): void {
  captureAppEvent('trial_notice_skipped', {
    reason: data.reason,
  });
}
