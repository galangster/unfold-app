/**
 * Persisted onboarding sample-generation job (survives force-quit + relaunch).
 *
 * During onboarding the app submits a one-off "sample" devotional job early and
 * the DevotionalSegue screen polls it. The jobId used to live only in a React
 * ref, so a force-quit lost it and the segue submitted a DUPLICATE job on
 * relaunch, leaving users on an endless loader. This tiny MMKV-backed store
 * keeps the jobId across launches so the segue can resume the SAME job instead.
 *
 * Scoped by deviceId: the sample devotional id is derived from the device id
 * (buildOnboardingSampleDevotionalId(getDeviceId())), so a record whose deviceId
 * no longer matches (identity rotated / different install) is treated as stale
 * and ignored — it must never hijack a fresh user's onboarding.
 */
import { mmkvStorage } from './mmkv-storage';

/** Exported so full-reset can clear a stale in-flight sample job. */
export const STORE_KEY = 'onboarding-sample-job-v1';

/** Records older than this are ignored (and treated as absent). */
export const ONBOARDING_SAMPLE_JOB_TTL_MS = 24 * 60 * 60 * 1000;

export interface OnboardingSampleJobRecord {
  jobId: string;
  devotionalId: string | null;
  /** Device identity this job belongs to (scoping guard). */
  deviceId: string;
  /** Epoch ms when the record was written. */
  savedAt: number;
}

/**
 * Persist the in-flight onboarding sample job. `savedAt` is stamped here so
 * callers never have to. Best-effort: storage errors are swallowed because a
 * failed persist must never break onboarding.
 */
export function saveOnboardingSampleJob(record: {
  jobId: string;
  devotionalId: string | null;
  deviceId: string;
}): void {
  if (!record.jobId || !record.deviceId) return;
  const payload: OnboardingSampleJobRecord = {
    jobId: record.jobId,
    devotionalId: record.devotionalId ?? null,
    deviceId: record.deviceId,
    savedAt: Date.now(),
  };
  try {
    mmkvStorage.setItem(STORE_KEY, JSON.stringify(payload));
  } catch {
    // Best-effort persistence.
  }
}

/**
 * Read the persisted onboarding sample job, or null when absent, malformed,
 * expired (older than the TTL), or scoped to a different device.
 *
 * `now` is injectable for deterministic tests; production callers omit it.
 */
export function getOnboardingSampleJob(options?: {
  deviceId?: string;
  now?: number;
}): OnboardingSampleJobRecord | null {
  let raw: string | null = null;
  try {
    // The concrete MMKV adapter is synchronous; StateStorage's type allows a
    // Promise, so narrow here as the rest of the codebase does.
    raw = mmkvStorage.getItem(STORE_KEY) as string | null;
  } catch {
    return null;
  }
  if (!raw) return null;

  let parsed: Partial<OnboardingSampleJobRecord>;
  try {
    parsed = JSON.parse(raw) as Partial<OnboardingSampleJobRecord>;
  } catch {
    return null;
  }

  if (
    !parsed ||
    typeof parsed.jobId !== 'string' ||
    typeof parsed.deviceId !== 'string' ||
    typeof parsed.savedAt !== 'number'
  ) {
    return null;
  }

  const now = options?.now ?? Date.now();
  if (now - parsed.savedAt > ONBOARDING_SAMPLE_JOB_TTL_MS) {
    return null;
  }

  // Scoping guard: never surface a record that belongs to a different device.
  if (options?.deviceId !== undefined && options.deviceId !== parsed.deviceId) {
    return null;
  }

  return {
    jobId: parsed.jobId,
    devotionalId: parsed.devotionalId ?? null,
    deviceId: parsed.deviceId,
    savedAt: parsed.savedAt,
  };
}

/** Remove the persisted record (call once the sample result is delivered). */
export function clearOnboardingSampleJob(): void {
  try {
    mmkvStorage.removeItem(STORE_KEY);
  } catch {
    // Best-effort.
  }
}
