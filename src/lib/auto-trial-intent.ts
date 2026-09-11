import type { AllowedTrialDays } from '@/lib/trial-facts';
import type { AutoTrialEntry, AutoTrialSurface } from '@/lib/auto-trial-exit';

export const AUTO_TRIAL_INTENT_KEY = 'auto-trial-series-intent-v1';

export type AutoTrialIntentStatus =
  | 'purchased'
  | 'submitted'
  | 'landed'
  | 'revealed'
  | 'completed'
  | 'failed'
  | 'abandoned';

export type AutoTrialAbandonReason =
  | 'server_unavailable'
  | 'trial_expired_before_submit'
  | 'identity_changed'
  | 'user_setup_fallback'
  | 'user_left_after_failure'
  | 'superseded_by_user_series';

export interface AutoTrialIntentV1 {
  version: 1;
  intentId: string;
  deviceId: string;
  entry: AutoTrialEntry;
  surface: AutoTrialSurface;
  source: 'purchase' | 'offer' | 'lateGrant';
  simulated: boolean;
  trialDays: AllowedTrialDays;
  purchasedAt: string;
  expiresAt: string;
  purchaseLocalDate: string;
  timeZone: string;
  platform: 'ios';
  isSandbox: boolean;
  productIdentifier: string;
  switchEnabledAtPurchase: true;
  switchFetchedAt: string;
  requestId: string;
  status: AutoTrialIntentStatus;
  jobId: string | null;
  devotionalId: string | null;
  createdAt: string;
  updatedAt: string;
  submittedAt: string | null;
  landedAt: string | null;
  revealedAt: string | null;
  completedAt: string | null;
  dismissedAt: string | null;
  failedAt: string | null;
  failureCode: string | null;
  abandonedAt: string | null;
  abandonReason: AutoTrialAbandonReason | null;
}
