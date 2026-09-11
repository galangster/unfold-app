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
  captureAppEvent('trial_started', { ...data });
}

export function trackAutoTrialSkipped(data: {
  entry: AutoTrialEntry;
  surface: AutoTrialSurface;
  purchase_source: PurchaseSource;
  reason: AutoTrialFallbackReason;
}): void {
  captureAppEvent('auto_trial_skipped', { ...data });
}

export function trackAutoTrialSubmitted(data: {
  entry: AutoTrialEntry;
  trial_days: number;
  attempt: number;
  claim: 'created' | 'repointed' | 'existing' | 'resumed' | 'none';
}): void {
  captureAppEvent('auto_trial_submitted', { ...data });
}

export function trackAutoTrialLanded(data: {
  entry: AutoTrialEntry;
  trial_days: number;
  wait_s: number;
}): void {
  captureAppEvent('auto_trial_landed', { ...data });
}

export function trackAutoTrialRevealed(data: {
  entry: AutoTrialEntry;
  trial_days: number;
}): void {
  captureAppEvent('auto_trial_revealed', { ...data });
}

export function trackAutoTrialFailed(data: {
  entry: AutoTrialEntry;
  phase: 'submit' | 'poll' | 'retry' | 'route';
  reason: string;
  status: number;
  can_retry: boolean;
}): void {
  captureAppEvent('auto_trial_failed', { ...data });
}

export function trackAutoTrialAbandoned(data: {
  entry: AutoTrialEntry;
  reason: AutoTrialAbandonReason;
}): void {
  captureAppEvent('auto_trial_abandoned', { ...data });
}

export function trackAutoTrialCompleted(data: {
  entry: AutoTrialEntry;
  trial_days: number;
}): void {
  captureAppEvent('auto_trial_completed', { ...data });
}

export function trackAutoTrialDay2ChipShown(): void {
  captureAppEvent('auto_trial_day2_chip_shown', { day: 2 });
}

export function trackAutoTrialKeepsakeOpened(data: {
  opened_from: 'celebration' | 'today' | 'series_detail';
  completeness: 'full' | 'partial' | 'none';
}): void {
  captureAppEvent('auto_trial_keepsake_opened', { ...data });
}

export function trackAutoTrialPickStartTapped(data: {
  gate_action: 'allow' | 'blocked' | 'exclusive-offer' | 'paywall';
  pick_source: 'stored' | 'fetched' | 'fallback';
}): void {
  captureAppEvent('auto_trial_pick_start_tapped', { ...data });
}

export function trackNotificationPermissionAnswered(data: {
  trigger: 'reminder_time' | 'series_reveal' | 'generating' | 'later_entry_fallback';
  result: 'granted' | 'denied' | 'registration_failed';
  prior_status: 'undetermined' | 'granted' | 'denied';
}): void {
  captureAppEvent('notification_permission_answered', { ...data });
}

export function trackTrialNoticeScheduled(data: {
  trial_days: number;
  copy: 'tomorrow' | 'two_days' | 'weekday';
  lead_h: number;
}): void {
  captureAppEvent('trial_notice_scheduled', { ...data });
}

export function trackTrialNoticeSkipped(data: {
  reason: 'past_deadline' | 'invalid_dates' | 'no_permission' | 'already_delivered' | 'quiet_hours';
}): void {
  captureAppEvent('trial_notice_skipped', { ...data });
}
