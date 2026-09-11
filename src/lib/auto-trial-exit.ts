import type { CustomerInfo } from 'react-native-purchases';
import type { EntitlementExitSource, TrialFactsRejectReason } from '@/lib/trial-facts';

export type { EntitlementExitSource };

export type AutoTrialEntry = 'onboarding' | 'later';
export type AutoTrialSurface = 'onboarding_paywall' | 'paywall_route' | 'churned_sheet';

export interface VerifiedEntitlementExit {
  source: EntitlementExitSource;
  customerInfo: CustomerInfo;
}

export type AutoTrialFallbackReason = TrialFactsRejectReason
  | 'intent_exists'
  | 'simulated_without_qa'
  | 'ephemeral_device_id'
  | 'missing_time_zone'
  | 'switch_off'
  | 'trial_length_not_allowed'
  | 'no_completed_profile'
  | 'has_real_series'
  | 'internal_error';
