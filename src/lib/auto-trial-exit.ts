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
import { getDeviceTimezone } from '@/lib/device-timezone';
import { getDeviceId } from '@/lib/mmkv-storage';
import { isQaToolsEnabled } from '@/lib/qa-tools';
import {
  awaitRemoteConfigSettled,
  readAutoTrialSwitchSnapshot,
  REMOTE_CONFIG_PURCHASE_WAIT_MS,
  type AutoTrialSwitchSnapshot,
} from '@/lib/remote-config';
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

const EMIT_FALLBACK_TRIAL_STARTED: Record<AutoTrialFallbackReason, boolean> = {
  no_entitlement: false,
  unsupported_platform: false,
  restore_source: false,
  not_trial: false,
  not_app_store: false,
  family_shared: false,
  missing_expiration: false,
  missing_purchase_date: false,
  invalid_duration: false,
  already_expired: false,
  stale_purchase: false,
  intent_exists: true,
  simulated_without_qa: false,
  ephemeral_device_id: true,
  missing_time_zone: true,
  switch_off: true,
  trial_length_not_allowed: true,
  no_completed_profile: true,
  has_real_series: true,
  internal_error: false,
};

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
  return EMIT_FALLBACK_TRIAL_STARTED[reason];
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

export type VerifiedEntitlementExitInput = {
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
};

type ResolveVerifiedEntitlementExitInput = Omit<
  VerifiedEntitlementExitInput,
  | 'switchSnapshot'
  | 'deviceId'
  | 'nowMs'
  | 'platform'
  | 'timeZone'
  | 'profile'
  | 'devotionalIds'
  | 'simulated'
> & {
  deviceId?: string;
  nowMs?: number;
  platform?: string;
  timeZone?: string;
  profile?: { hasCompletedOnboarding: boolean } | null;
  devotionalIds?: readonly string[];
  simulated?: boolean;
  configTimeoutMs?: number;
  fetchImpl?: (url: string, init?: RequestInit) => Promise<Response>;
};

function resolveExitInput(
  i: ResolveVerifiedEntitlementExitInput,
): Omit<VerifiedEntitlementExitInput, 'switchSnapshot'> {
  const needsStore = i.profile === undefined || i.devotionalIds === undefined;
  const state = needsStore ? useUnfoldStore.getState() : undefined;
  return {
    exit: i.exit,
    surface: i.surface,
    deviceId: i.deviceId ?? getDeviceId(),
    nowMs: i.nowMs ?? Date.now(),
    platform: i.platform ?? Platform.OS,
    timeZone: i.timeZone ?? getDeviceTimezone() ?? '',
    profile: i.profile !== undefined
      ? i.profile
      : state?.user
        ? { hasCompletedOnboarding: state.user.hasCompletedOnboarding === true }
        : null,
    devotionalIds: i.devotionalIds
      ?? (state?.devotionals ?? []).map((devotional) => devotional.id),
    simulated: i.simulated ?? isSimulatedTrialCustomerInfo(i.exit.customerInfo),
    storage: i.storage,
  };
}

export async function resolveVerifiedEntitlementExit(
  i: ResolveVerifiedEntitlementExitInput,
): Promise<VerifiedExitDecision> {
  const input = resolveExitInput(i);
  const settled = await awaitRemoteConfigSettled(
    i.configTimeoutMs ?? REMOTE_CONFIG_PURCHASE_WAIT_MS,
    { nowMs: input.nowMs, fetchImpl: i.fetchImpl },
  );
  return handleVerifiedEntitlementExit({
    ...input,
    switchSnapshot: readAutoTrialSwitchSnapshot(input.nowMs, input.platform, settled),
  });
}

export function handleVerifiedEntitlementExit(i: VerifiedEntitlementExitInput): VerifiedExitDecision {
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

    const facts = readTrialFacts({
      customerInfo: i.exit.customerInfo,
      source: i.exit.source,
      platform: i.platform,
      nowMs: i.nowMs,
    });
    const fallback = (reason: AutoTrialFallbackReason): VerifiedExitDecision => {
      const decision: VerifiedExitDecision = { kind: 'fallback', reason };
      emitExitTelemetry(decision, facts, entry, i.surface, i.exit.source);
      return decision;
    };

    if (existing && existing.deviceId === i.deviceId) {
      if (isAutoTrialIntentExpired(existing, i.nowMs)) {
        transitionAutoTrialIntent(
          'abandoned',
          { abandonReason: 'trial_expired_before_submit' },
          { nowMs: i.nowMs },
          i.storage,
        );
      }
      return fallback('intent_exists');
    }

    if (isSimulatedTrialCustomerInfo(i.exit.customerInfo) && !isQaToolsEnabled()) {
      return fallback('simulated_without_qa');
    }

    if (facts.rejectReason !== null) {
      return fallback(facts.rejectReason);
    }
    if (isEphemeralDeviceId(i.deviceId)) {
      return fallback('ephemeral_device_id');
    }
    if (i.timeZone === '') {
      return fallback('missing_time_zone');
    }
    if (!i.switchSnapshot.enabled) {
      return fallback('switch_off');
    }
    if (facts.trialDays == null || facts.trialDays > i.switchSnapshot.maxTrialDays) {
      return fallback('trial_length_not_allowed');
    }
    if (entry === 'later' && i.profile?.hasCompletedOnboarding !== true) {
      return fallback('no_completed_profile');
    }
    if (entry === 'later' && i.devotionalIds.some((id) => !isOnboardingSampleDevotionalId(id))) {
      return fallback('has_real_series');
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

export async function resolveLaterEntryExit(
  exit: VerifiedEntitlementExit,
  surface: 'paywall_route' | 'churned_sheet',
): Promise<VerifiedExitDecision> {
  try {
    return await resolveVerifiedEntitlementExit({ exit, surface });
  } catch (error) {
    reportInternalError(error);
    return { kind: 'fallback', reason: 'internal_error' };
  }
}
