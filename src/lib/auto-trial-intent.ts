import type { AllowedTrialDays } from '@/lib/trial-facts';
import type { AutoTrialEntry, AutoTrialSurface } from '@/lib/auto-trial-exit';
import { isOnboardingSampleDevotionalId } from '@/lib/auto-trial-series';
import { trackAutoTrialAbandoned, trackAutoTrialLanded } from '@/lib/auto-trial-telemetry';
import { isEphemeralDeviceId } from '@/lib/device-id';
import { formatDateOnly } from '@/lib/onboarding-step-helpers';
import {
  clearInflightGenerationJob,
  readInflightGenerationJob,
  type InflightGenerationJob,
} from '@/lib/inflight-generation-job';
import { logger } from '@/lib/logger';
import { mmkvStorage } from '@/lib/mmkv-storage';
import { useUnfoldStore } from '@/lib/store';
import { newId } from '@/lib/sync-ids';

export const AUTO_TRIAL_INTENT_KEY = 'auto-trial-series-intent-v1';

// Same pattern as M/lib/initial-generation-request.ts:6 (that file is not in this lane).
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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

/** Synchronous key-value seam. `mmkvStorage` is sync at runtime; its zustand
 * `StateStorage` type only widens `getItem` to a Promise. */
export type IntentStorage = {
  getItem: (name: string) => string | null;
  setItem: (name: string, value: string) => void;
  removeItem: (name: string) => void;
};

export interface CreateAutoTrialIntentInput {
  deviceId: string;
  entry: AutoTrialEntry;
  surface: AutoTrialSurface;
  source: 'purchase' | 'offer' | 'lateGrant';
  simulated: boolean;
  trialDays: AllowedTrialDays;
  purchasedAt: string;
  expiresAt: string;
  timeZone: string;
  isSandbox: boolean;
  productIdentifier: string;
  switchFetchedAt: string;
  nowMs: number;
}

export type AutoTrialLaunchAction =
  | { action: 'none' }
  | { action: 'abandon'; reason: 'identity_changed' | 'trial_expired_before_submit' | 'superseded_by_user_series' }
  | { action: 'mark_landed'; then: 'open_reveal' | 'none' }
  | { action: 'open_reveal'; intentId: string };

const STATUSES = new Set<AutoTrialIntentStatus>([
  'purchased',
  'submitted',
  'landed',
  'revealed',
  'completed',
  'failed',
  'abandoned',
]);

const TRIAL_DAYS = new Set<AllowedTrialDays>([3, 7, 14, 30]);
const ENTRIES = new Set<AutoTrialEntry>(['onboarding', 'later']);
const SURFACES = new Set<AutoTrialSurface>(['onboarding_paywall', 'paywall_route', 'churned_sheet']);
const SOURCES = new Set<AutoTrialIntentV1['source']>(['purchase', 'offer', 'lateGrant']);
const ABANDON_REASONS = new Set<AutoTrialAbandonReason>([
  'server_unavailable',
  'trial_expired_before_submit',
  'identity_changed',
  'user_setup_fallback',
  'user_left_after_failure',
  'superseded_by_user_series',
]);

const ALLOWED_TRANSITIONS = new Set([
  'purchased->submitted',
  'purchased->failed',
  'purchased->abandoned',
  'submitted->submitted',
  'submitted->failed',
  'submitted->landed',
  'submitted->abandoned',
  'landed->revealed',
  'landed->completed',
  'revealed->completed',
  'failed->abandoned',
]);

function resolveStorage(storage?: IntentStorage): IntentStorage {
  return storage ?? (mmkvStorage as IntentStorage);
}

function parsesAsDate(value: unknown): value is string {
  return typeof value === 'string' && Number.isFinite(Date.parse(value));
}

function isNullableDate(value: unknown): value is string | null {
  return value === null || parsesAsDate(value);
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === 'string';
}

function asIntent(value: unknown): AutoTrialIntentV1 | null {
  if (!value || typeof value !== 'object') return null;
  const row = value as Record<string, unknown>;
  if (row.version !== 1) return null;
  if (typeof row.intentId !== 'string' || row.intentId.length === 0) return null;
  if (typeof row.deviceId !== 'string') return null;
  if (typeof row.entry !== 'string' || !ENTRIES.has(row.entry as AutoTrialEntry)) return null;
  if (typeof row.surface !== 'string' || !SURFACES.has(row.surface as AutoTrialSurface)) return null;
  if (typeof row.source !== 'string' || !SOURCES.has(row.source as AutoTrialIntentV1['source'])) return null;
  if (typeof row.simulated !== 'boolean') return null;
  if (typeof row.trialDays !== 'number' || !TRIAL_DAYS.has(row.trialDays as AllowedTrialDays)) return null;
  if (!parsesAsDate(row.purchasedAt) || !parsesAsDate(row.expiresAt)) return null;
  if (typeof row.purchaseLocalDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(row.purchaseLocalDate)) return null;
  if (typeof row.timeZone !== 'string') return null;
  if (row.platform !== 'ios') return null;
  if (typeof row.isSandbox !== 'boolean') return null;
  if (typeof row.productIdentifier !== 'string') return null;
  if (row.switchEnabledAtPurchase !== true) return null;
  if (!parsesAsDate(row.switchFetchedAt)) return null;
  if (typeof row.requestId !== 'string' || !UUID_RE.test(row.requestId)) return null;
  if (typeof row.status !== 'string' || !STATUSES.has(row.status as AutoTrialIntentStatus)) return null;
  if (!isNullableString(row.jobId) || !isNullableString(row.devotionalId)) return null;
  if (!parsesAsDate(row.createdAt) || !parsesAsDate(row.updatedAt)) return null;
  if (!isNullableDate(row.submittedAt) || !isNullableDate(row.landedAt) || !isNullableDate(row.revealedAt)) return null;
  if (!isNullableDate(row.completedAt) || !isNullableDate(row.dismissedAt) || !isNullableDate(row.failedAt)) return null;
  if (!isNullableDate(row.abandonedAt)) return null;
  if (!isNullableString(row.failureCode)) return null;
  if (row.abandonReason !== null && (typeof row.abandonReason !== 'string' || !ABANDON_REASONS.has(row.abandonReason as AutoTrialAbandonReason))) {
    return null;
  }

  return {
    version: 1,
    intentId: row.intentId,
    deviceId: row.deviceId,
    entry: row.entry as AutoTrialEntry,
    surface: row.surface as AutoTrialSurface,
    source: row.source as AutoTrialIntentV1['source'],
    simulated: row.simulated,
    trialDays: row.trialDays as AllowedTrialDays,
    purchasedAt: row.purchasedAt,
    expiresAt: row.expiresAt,
    purchaseLocalDate: row.purchaseLocalDate,
    timeZone: row.timeZone,
    platform: 'ios',
    isSandbox: row.isSandbox,
    productIdentifier: row.productIdentifier,
    switchEnabledAtPurchase: true,
    switchFetchedAt: row.switchFetchedAt,
    requestId: row.requestId,
    status: row.status as AutoTrialIntentStatus,
    jobId: row.jobId,
    devotionalId: row.devotionalId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    submittedAt: row.submittedAt,
    landedAt: row.landedAt,
    revealedAt: row.revealedAt,
    completedAt: row.completedAt,
    dismissedAt: row.dismissedAt,
    failedAt: row.failedAt,
    failureCode: row.failureCode,
    abandonedAt: row.abandonedAt,
    abandonReason: row.abandonReason as AutoTrialAbandonReason | null,
  };
}

export function parseAutoTrialIntent(raw: string | null): AutoTrialIntentV1 | null {
  if (raw == null) return null;
  try {
    const parsed = asIntent(JSON.parse(raw));
    if (parsed) return parsed;
  } catch {
    // invalid JSON
  }
  logger.warn('auto-trial-intent-invalid');
  return null;
}

export function readAutoTrialIntent(storage?: IntentStorage): AutoTrialIntentV1 | null {
  return parseAutoTrialIntent(resolveStorage(storage).getItem(AUTO_TRIAL_INTENT_KEY));
}

function writeIntent(intent: AutoTrialIntentV1, storage: IntentStorage): AutoTrialIntentV1 {
  storage.setItem(AUTO_TRIAL_INTENT_KEY, JSON.stringify(intent));
  return intent;
}

export function createAutoTrialIntent(
  input: CreateAutoTrialIntentInput,
  storage?: IntentStorage,
): AutoTrialIntentV1 {
  const store = resolveStorage(storage);
  const existing = parseAutoTrialIntent(store.getItem(AUTO_TRIAL_INTENT_KEY));
  if (existing && existing.deviceId === input.deviceId) return existing;

  const now = new Date(input.nowMs).toISOString();
  return writeIntent({
    version: 1,
    intentId: newId(),
    deviceId: input.deviceId,
    entry: input.entry,
    surface: input.surface,
    source: input.source,
    simulated: input.simulated,
    trialDays: input.trialDays,
    purchasedAt: input.purchasedAt,
    expiresAt: input.expiresAt,
    purchaseLocalDate: formatDateOnly(new Date(input.purchasedAt)),
    timeZone: input.timeZone,
    platform: 'ios',
    isSandbox: input.isSandbox,
    productIdentifier: input.productIdentifier,
    switchEnabledAtPurchase: true,
    switchFetchedAt: input.switchFetchedAt,
    requestId: newId(),
    status: 'purchased',
    jobId: null,
    devotionalId: null,
    createdAt: now,
    updatedAt: now,
    submittedAt: null,
    landedAt: null,
    revealedAt: null,
    completedAt: null,
    dismissedAt: null,
    failedAt: null,
    failureCode: null,
    abandonedAt: null,
    abandonReason: null,
  }, store);
}

export function transitionAutoTrialIntent(
  to: AutoTrialIntentStatus,
  patch: Partial<Pick<AutoTrialIntentV1, 'jobId' | 'devotionalId' | 'failureCode' | 'abandonReason'>>,
  opts: { nowMs: number },
  storage?: IntentStorage,
): AutoTrialIntentV1 | null {
  const store = resolveStorage(storage);
  const current = readAutoTrialIntent(store);
  if (!current) return null;
  if (!ALLOWED_TRANSITIONS.has(`${current.status}->${to}`)) return null;

  const incomingId = patch.devotionalId;
  if (incomingId != null && current.devotionalId != null && incomingId !== current.devotionalId) {
    return null;
  }

  const now = new Date(opts.nowMs).toISOString();
  const next: AutoTrialIntentV1 = { ...current, status: to, updatedAt: now };

  if (to === 'submitted') {
    if (patch.jobId !== undefined) next.jobId = patch.jobId;
    if (patch.devotionalId !== undefined) next.devotionalId = patch.devotionalId;
    if (current.status === 'purchased') next.submittedAt = now;
  } else if (to === 'failed') {
    next.failedAt = now;
    if (patch.failureCode !== undefined) next.failureCode = patch.failureCode;
  } else if (to === 'landed') {
    next.landedAt = now;
  } else if (to === 'revealed') {
    next.revealedAt = now;
  } else if (to === 'completed') {
    next.completedAt = now;
  } else if (to === 'abandoned') {
    next.abandonedAt = now;
    if (patch.abandonReason !== undefined) next.abandonReason = patch.abandonReason;
    try {
      if (next.abandonReason) {
        trackAutoTrialAbandoned({ entry: current.entry, reason: next.abandonReason });
      }
    } catch {
      // Telemetry never changes the decision.
    }
  }

  return writeIntent(next, store);
}

export function markAutoTrialIntentDismissed(
  opts: { nowMs: number },
  storage?: IntentStorage,
): AutoTrialIntentV1 | null {
  const store = resolveStorage(storage);
  const current = readAutoTrialIntent(store);
  if (!current) return null;
  if (current.status !== 'purchased' && current.status !== 'submitted') return null;
  if (current.dismissedAt) return current;
  const now = new Date(opts.nowMs).toISOString();
  return writeIntent({ ...current, dismissedAt: now, updatedAt: now }, store);
}

export function applyAutoTrialProfileOverrides<T extends { devotionalLength: number }>(
  data: T,
  intent: AutoTrialIntentV1 | null,
): T {
  if (intent?.status === 'purchased') {
    return { ...data, devotionalLength: intent.trialDays };
  }
  return data;
}

export function isAutoTrialIntentExpired(intent: AutoTrialIntentV1, nowMs: number): boolean {
  return intent.status === 'purchased'
    && !intent.isSandbox
    && !intent.simulated
    && nowMs >= Date.parse(intent.expiresAt);
}

export function hasSupersedingUserSeries(i: {
  intent: AutoTrialIntentV1;
  devotionalIds: readonly string[];
  inflightJob: InflightGenerationJob | null;
}): boolean {
  const hasOtherSeries = i.devotionalIds.some((id) => (
    !isOnboardingSampleDevotionalId(id) && id !== i.intent.devotionalId
  ));
  const otherJob = i.inflightJob != null
    && !i.inflightJob.superseded
    && i.inflightJob.jobId !== i.intent.jobId;
  return hasOtherSeries || otherJob;
}

export function buildRevealGuardKey(
  intent: AutoTrialIntentV1,
  inflightJob: InflightGenerationJob | null,
): string {
  const jobToken = inflightJob
    && !inflightJob.superseded
    && inflightJob.jobId === intent.jobId
    ? 'job'
    : 'nojob';
  return `${intent.intentId}|${intent.status}|${jobToken}`;
}

function applyRevealGuard(
  action: AutoTrialLaunchAction,
  intent: AutoTrialIntentV1,
  inflightJob: InflightGenerationJob | null,
  revealGuardKey: string | null,
): AutoTrialLaunchAction {
  const matches = revealGuardKey === buildRevealGuardKey(intent, inflightJob);
  if (!matches) return action;
  if (action.action === 'open_reveal') return { action: 'none' };
  if (action.action === 'mark_landed' && action.then === 'open_reveal') {
    return { action: 'mark_landed', then: 'none' };
  }
  return action;
}

export function reconcileAutoTrialIntentOnLaunch(i: {
  intent: AutoTrialIntentV1 | null;
  deviceId: string;
  nowMs: number;
  hasCompletedOnboarding: boolean;
  landedDevotionalIds: readonly string[];
  inflightJob: InflightGenerationJob | null;
  revealGuardKey: string | null;
}): AutoTrialLaunchAction {
  const { intent, deviceId, nowMs, hasCompletedOnboarding, landedDevotionalIds, inflightJob, revealGuardKey } = i;
  if (!intent || isEphemeralDeviceId(deviceId)) return { action: 'none' };

  const terminal = intent.status === 'completed' || intent.status === 'abandoned';
  if (intent.deviceId !== deviceId && !terminal) {
    return { action: 'abandon', reason: 'identity_changed' };
  }

  if (isAutoTrialIntentExpired(intent, nowMs)) {
    return { action: 'abandon', reason: 'trial_expired_before_submit' };
  }

  if (
    intent.status === 'purchased'
    && hasSupersedingUserSeries({ intent, devotionalIds: landedDevotionalIds, inflightJob })
  ) {
    return { action: 'abandon', reason: 'superseded_by_user_series' };
  }

  if (intent.status === 'purchased' && !hasCompletedOnboarding) return { action: 'none' };

  const day1Present = intent.devotionalId != null && landedDevotionalIds.includes(intent.devotionalId);
  let action: AutoTrialLaunchAction;
  if (intent.status === 'purchased' && hasCompletedOnboarding) {
    action = { action: 'open_reveal', intentId: intent.intentId };
  } else if (intent.status === 'submitted' && day1Present) {
    const then: 'open_reveal' | 'none' =
      intent.revealedAt == null && intent.dismissedAt == null ? 'open_reveal' : 'none';
    action = { action: 'mark_landed', then };
  } else if (
    (intent.status === 'submitted' || intent.status === 'landed')
    && intent.revealedAt == null
    && intent.dismissedAt == null
  ) {
    action = { action: 'open_reveal', intentId: intent.intentId };
  } else if (
    intent.status === 'submitted'
    && !day1Present
    && (inflightJob == null || inflightJob.superseded || inflightJob.jobId !== intent.jobId)
  ) {
    action = { action: 'open_reveal', intentId: intent.intentId };
  } else if (intent.status === 'failed') {
    action = { action: 'open_reveal', intentId: intent.intentId };
  } else {
    return { action: 'none' };
  }

  return applyRevealGuard(action, intent, inflightJob, revealGuardKey);
}

export function settleLandedAutoTrialSeries(intent: AutoTrialIntentV1, devotionalId: string): void {
  if (devotionalId !== intent.devotionalId) return;
  const store = useUnfoldStore.getState();
  const series = store.devotionals.find((row) => row.id === devotionalId);
  if (!series || !series.days.some((day) => day.dayNumber === 1)) return;

  store.setCurrentDevotional(devotionalId);
  store.retireOnboardingSamples({ keepId: devotionalId });

  const inflight = readInflightGenerationJob();
  if (inflight?.jobId === intent.jobId) clearInflightGenerationJob();

  // OI-47: generationSession is persisted across a kill (`partialize` keeps it).
  if (store.generationSession.status === 'running' && store.generationSession.devotionalId === devotionalId) {
    store.completeGenerationSession();
  }

  if (intent.status !== 'submitted') return;
  const nowMs = Date.now();
  const next = transitionAutoTrialIntent('landed', { devotionalId }, { nowMs });
  if (!next) return;
  try {
    const startedAt = Date.parse(intent.submittedAt ?? intent.createdAt);
    trackAutoTrialLanded({
      entry: intent.entry,
      trial_days: intent.trialDays,
      wait_s: Number.isFinite(startedAt) ? Math.round((nowMs - startedAt) / 1000) : 0,
    });
  } catch {
    // Telemetry never changes the decision.
  }
}
