import { Platform } from 'react-native';
import type { CustomerInfo } from 'react-native-purchases';
import {
  createAutoTrialIntent,
  isAutoTrialIntentExpired,
  readAutoTrialIntent,
  transitionAutoTrialIntent,
  type AutoTrialIntentV1,
  type IntentStorage,
} from '@/lib/auto-trial-intent';
import { isOnboardingSampleDevotionalId } from '@/lib/auto-trial-series';
import { trackAutoTrialSkipped, trackTrialStarted } from '@/lib/auto-trial-telemetry';
import { isEphemeralDeviceId } from '@/lib/device-id';
import { getDeviceId } from '@/lib/mmkv-storage';
import { isQaToolsEnabled } from '@/lib/qa-tools';
import { readAutoTrialSwitchSnapshot, type AutoTrialSwitchSnapshot } from '@/lib/remote-config';
import { captureAppError } from '@/lib/sentry';
import { useUnfoldStore } from '@/lib/store';
import {
  isSimulatedTrialCustomerInfo,
  readTrialFacts,
  type EntitlementExitSource,
  type TrialFacts,
  type TrialFactsRejectReason,
} from '@/lib/trial-facts';

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

export type VerifiedExitDecision =
  | { kind: 'auto'; intent: AutoTrialIntentV1; created: boolean }
  | { kind: 'fallback'; reason: AutoTrialFallbackReason };

function entryFromSurface(surface: AutoTrialSurface): AutoTrialEntry {
  return surface === 'onboarding_paywall' ? 'onboarding' : 'later';
}

function reportInternalError(error: unknown): void {
  try {
    captureAppError(
      'auto-trial-exit',
      error instanceof Error ? error : new Error('internal_error'),
    );
  } catch {
    // Reporting must never change the decision.
  }
}

function shouldEmitFallbackTrialStarted(
  reason: AutoTrialFallbackReason,
  facts: TrialFacts | null,
  source: EntitlementExitSource,
): boolean {
  if (source === 'restore') return false;
  if (facts?.entitlement?.periodType !== 'TRIAL') return false;
  return reason === 'ephemeral_device_id'
    || reason === 'missing_time_zone'
    || reason === 'switch_off'
    || reason === 'trial_length_not_allowed'
    || reason === 'no_completed_profile'
    || reason === 'has_real_series';
}

function emitExitTelemetry(
  decision: VerifiedExitDecision,
  facts: TrialFacts | null,
  entry: AutoTrialEntry,
  surface: AutoTrialSurface,
  source: EntitlementExitSource,
): void {
  try {
    if (decision.kind === 'auto') {
      if (!decision.created) return;
      trackTrialStarted({
        entry,
        surface,
        purchase_source: source,
        trial_days: decision.intent.trialDays,
        auto_trial: true,
        is_sandbox: decision.intent.isSandbox,
      });
      return;
    }
    trackAutoTrialSkipped({
      entry,
      surface,
      purchase_source: source,
      reason: decision.reason,
    });
    if (shouldEmitFallbackTrialStarted(decision.reason, facts, source)) {
      trackTrialStarted({
        entry,
        surface,
        purchase_source: source,
        trial_days: facts?.trialDays ?? 0,
        auto_trial: false,
        is_sandbox: facts?.entitlement?.isSandbox === true,
      });
    }
  } catch {
    // Telemetry is isolated.
  }
}

export function handleVerifiedEntitlementExit(i: {
  exit: VerifiedEntitlementExit;
  surface: AutoTrialSurface;
  deviceId: string;
  nowMs: number;
  platform: string;
  timeZone: string;
  switchSnapshot: AutoTrialSwitchSnapshot;
  profile: { hasCompletedOnboarding: boolean } | null;
  devotionalIds: readonly string[];
  simulated?: boolean;
  storage?: IntentStorage;
}): VerifiedExitDecision {
  const entry = entryFromSurface(i.surface);
  let attemptedRequestId: string | null = null;
  try {
    const existing = readAutoTrialIntent(i.storage);
    if (
      existing
      && existing.deviceId === i.deviceId
      && existing.status === 'purchased'
      && existing.entry === entry
      && !isAutoTrialIntentExpired(existing, i.nowMs)
    ) {
      return { kind: 'auto', intent: existing, created: false };
    }

    if (existing && existing.deviceId === i.deviceId) {
      if (isAutoTrialIntentExpired(existing, i.nowMs)) {
        transitionAutoTrialIntent(
          'abandoned',
          { abandonReason: 'trial_expired_before_submit' },
          { nowMs: i.nowMs },
          i.storage,
        );
      }
      const facts = readTrialFacts({
        customerInfo: i.exit.customerInfo,
        source: i.exit.source,
        platform: i.platform,
        nowMs: i.nowMs,
      });
      const decision: VerifiedExitDecision = { kind: 'fallback', reason: 'intent_exists' };
      emitExitTelemetry(decision, facts, entry, i.surface, i.exit.source);
      return decision;
    }

    if (isSimulatedTrialCustomerInfo(i.exit.customerInfo) && !isQaToolsEnabled()) {
      const facts = readTrialFacts({
        customerInfo: i.exit.customerInfo,
        source: i.exit.source,
        platform: i.platform,
        nowMs: i.nowMs,
      });
      const decision: VerifiedExitDecision = { kind: 'fallback', reason: 'simulated_without_qa' };
      emitExitTelemetry(decision, facts, entry, i.surface, i.exit.source);
      return decision;
    }

    const facts = readTrialFacts({
      customerInfo: i.exit.customerInfo,
      source: i.exit.source,
      platform: i.platform,
      nowMs: i.nowMs,
    });
    if (facts.rejectReason !== null) {
      const decision: VerifiedExitDecision = { kind: 'fallback', reason: facts.rejectReason };
      emitExitTelemetry(decision, facts, entry, i.surface, i.exit.source);
      return decision;
    }
    if (isEphemeralDeviceId(i.deviceId)) {
      const decision: VerifiedExitDecision = { kind: 'fallback', reason: 'ephemeral_device_id' };
      emitExitTelemetry(decision, facts, entry, i.surface, i.exit.source);
      return decision;
    }
    if (i.timeZone === '') {
      const decision: VerifiedExitDecision = { kind: 'fallback', reason: 'missing_time_zone' };
      emitExitTelemetry(decision, facts, entry, i.surface, i.exit.source);
      return decision;
    }
    if (!i.switchSnapshot.enabled) {
      const decision: VerifiedExitDecision = { kind: 'fallback', reason: 'switch_off' };
      emitExitTelemetry(decision, facts, entry, i.surface, i.exit.source);
      return decision;
    }
    if (facts.trialDays == null || facts.trialDays > i.switchSnapshot.maxTrialDays) {
      const decision: VerifiedExitDecision = { kind: 'fallback', reason: 'trial_length_not_allowed' };
      emitExitTelemetry(decision, facts, entry, i.surface, i.exit.source);
      return decision;
    }
    if (entry === 'later' && i.profile?.hasCompletedOnboarding !== true) {
      const decision: VerifiedExitDecision = { kind: 'fallback', reason: 'no_completed_profile' };
      emitExitTelemetry(decision, facts, entry, i.surface, i.exit.source);
      return decision;
    }
    if (entry === 'later' && i.devotionalIds.some((id) => !isOnboardingSampleDevotionalId(id))) {
      const decision: VerifiedExitDecision = { kind: 'fallback', reason: 'has_real_series' };
      emitExitTelemetry(decision, facts, entry, i.surface, i.exit.source);
      return decision;
    }

    const source = i.exit.source === 'restore' ? 'purchase' : i.exit.source;
    const intent = createAutoTrialIntent({
      deviceId: i.deviceId,
      entry,
      surface: i.surface,
      source,
      simulated: i.simulated === true,
      trialDays: facts.trialDays,
      purchasedAt: facts.purchasedAt ?? new Date(i.nowMs).toISOString(),
      expiresAt: facts.expiresAt ?? new Date(i.nowMs).toISOString(),
      timeZone: i.timeZone,
      isSandbox: facts.entitlement?.isSandbox === true,
      productIdentifier: facts.entitlement?.productIdentifier ?? '',
      switchFetchedAt: i.switchSnapshot.fetchedAtMs != null
        ? new Date(i.switchSnapshot.fetchedAtMs).toISOString()
        : new Date(i.nowMs).toISOString(),
      nowMs: i.nowMs,
    }, i.storage);
    attemptedRequestId = intent.requestId;
    const decision: VerifiedExitDecision = { kind: 'auto', intent, created: true };
    emitExitTelemetry(decision, facts, entry, i.surface, i.exit.source);
    return decision;
  } catch (error) {
    const stored = readAutoTrialIntent(i.storage);
    if (
      stored?.status === 'purchased'
      && attemptedRequestId != null
      && stored.requestId === attemptedRequestId
    ) {
      return { kind: 'auto', intent: stored, created: true };
    }
    reportInternalError(error);
    return { kind: 'fallback', reason: 'internal_error' };
  }
}

export function resolveLaterEntryExit(
  exit: VerifiedEntitlementExit,
  surface: 'paywall_route' | 'churned_sheet',
): VerifiedExitDecision {
  try {
    const state = useUnfoldStore.getState();
    const nowMs = Date.now();
    const platform = Platform.OS;
    return handleVerifiedEntitlementExit({
      exit,
      surface,
      deviceId: getDeviceId(),
      nowMs,
      platform,
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone ?? '',
      switchSnapshot: readAutoTrialSwitchSnapshot(nowMs, platform),
      profile: state.user
        ? { hasCompletedOnboarding: state.user.hasCompletedOnboarding === true }
        : null,
      devotionalIds: (state.devotionals ?? []).map((devotional) => devotional.id),
      simulated: isSimulatedTrialCustomerInfo(exit.customerInfo),
    });
  } catch (error) {
    reportInternalError(error);
    return { kind: 'fallback', reason: 'internal_error' };
  }
}
