/**
 * Persisted onboarding answer draft (survives backgrounding, force-quit + relaunch).
 *
 * Onboarding used to hold every answer in React state and write to the store
 * exactly once, on the very last step. The three-step paywall sits before that
 * step and has no exit without a purchase, so anyone who closed the app there
 * relaunched with a null user, landed back on the first-run welcome screen, and
 * had to type their name and re-answer everything from the top. This MMKV-backed
 * store keeps the answers-so-far, the step they were on, and the generated
 * sample devotional, so a returning person resumes on their own content instead
 * of a cold form.
 *
 * Scoped by deviceId, exactly like onboarding-sample-job-store: a record whose
 * deviceId no longer matches (identity rotated / different install) is stale and
 * must never hijack a fresh user's onboarding.
 */
import { mmkvStorage } from './mmkv-storage';
import type { OnboardingData } from '@/app/onboarding';

/** Exported so full-reset can clear an abandoned draft. */
export const STORE_KEY = 'onboarding-draft-v1';

/**
 * The generated sample day lives under its own key, not in the hot record.
 *
 * The draft record is rewritten every time typing settles. The day is several
 * hundred words of prose that never changes once it arrives, so folding it into
 * that record would re-serialize the whole devotional on every keystroke burst
 * — JSON work on the JS thread while someone is typing into a text field.
 */
export const SAMPLE_DAY_KEY = 'onboarding-draft-sample-day-v1';

/** Mirrors ABANDONED_MARKER_KEY in onboarding-telemetry.ts; a test holds them equal. */
export const ABANDONED_MARKER_KEY = 'onboarding-abandon-reported-v1';

/** Records older than this are ignored (and treated as absent). */
export const ONBOARDING_DRAFT_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export interface OnboardingDraftRecord {
  /** Device identity this draft belongs to (scoping guard). */
  deviceId: string;
  /** Epoch ms when the record was written. */
  savedAt: number;
  /** The step the person was on when the draft was written. */
  stepId: string;
  /** Every answer collected so far. */
  data: OnboardingData;
  /** Whether the person already bought during this walk-through. */
  purchasedDuringOnboarding: boolean;
  /** Id of the generated sample devotional, once it exists. */
  sampleDevotionalId: string | null;
  /**
   * The generated devotional day itself. Persisting the whole object (not just
   * the id) is what lets a resumed session show the SAME first devotional
   * immediately, with no second generation and no loader.
   */
  sampleDevotionalDay: unknown | null;
}

export interface SaveOnboardingDraftInput {
  deviceId: string;
  stepId: string;
  data: OnboardingData;
  purchasedDuringOnboarding?: boolean;
  sampleDevotionalId?: string | null;
  sampleDevotionalDay?: unknown | null;
}

/**
 * Persist the onboarding draft. `savedAt` is stamped here so callers never have
 * to. Best-effort: storage errors are swallowed because a failed persist must
 * never break onboarding.
 */
export function saveOnboardingDraft(record: SaveOnboardingDraftInput): void {
  if (!record.deviceId || !record.stepId || !record.data) return;
  const payload: OnboardingDraftRecord = {
    deviceId: record.deviceId,
    savedAt: Date.now(),
    stepId: record.stepId,
    data: record.data,
    purchasedDuringOnboarding: record.purchasedDuringOnboarding ?? false,
    sampleDevotionalId: record.sampleDevotionalId ?? null,
    sampleDevotionalDay: null,
  };
  try {
    mmkvStorage.setItem(STORE_KEY, JSON.stringify(payload));
  } catch {
    // Best-effort persistence.
  }
}

/**
 * Persist the generated sample day once, under its own key. Idempotent: a
 * repeat call with the same day is a no-op, so the caller can fire it from an
 * effect without thinking about it.
 */
export function saveOnboardingSampleDay(day: unknown): void {
  if (day === null || day === undefined) return;
  try {
    const serialized = JSON.stringify(day);
    if (mmkvStorage.getItem(SAMPLE_DAY_KEY) === serialized) return;
    mmkvStorage.setItem(SAMPLE_DAY_KEY, serialized);
  } catch {
    // Best-effort persistence.
  }
}

function readSampleDay(): unknown | null {
  try {
    const raw = mmkvStorage.getItem(SAMPLE_DAY_KEY) as string | null;
    return raw ? (JSON.parse(raw) as unknown) : null;
  } catch {
    return null;
  }
}

/**
 * Read the persisted onboarding draft, or null when absent, malformed, expired
 * (older than the TTL), or scoped to a different device.
 *
 * `now` is injectable for deterministic tests; production callers omit it.
 */
export function getOnboardingDraft(options?: {
  deviceId?: string;
  now?: number;
}): OnboardingDraftRecord | null {
  let raw: string | null = null;
  try {
    // The concrete MMKV adapter is synchronous; StateStorage's type allows a
    // Promise, so narrow here as the rest of the codebase does.
    raw = mmkvStorage.getItem(STORE_KEY) as string | null;
  } catch {
    return null;
  }
  if (!raw) return null;

  let parsed: Partial<OnboardingDraftRecord>;
  try {
    parsed = JSON.parse(raw) as Partial<OnboardingDraftRecord>;
  } catch {
    return null;
  }

  if (
    !parsed ||
    typeof parsed.deviceId !== 'string' ||
    typeof parsed.savedAt !== 'number' ||
    typeof parsed.stepId !== 'string' ||
    !parsed.data ||
    typeof parsed.data !== 'object'
  ) {
    return null;
  }

  const now = options?.now ?? Date.now();
  if (now - parsed.savedAt > ONBOARDING_DRAFT_TTL_MS) {
    return null;
  }

  // Scoping guard: never surface a record that belongs to a different device.
  if (options?.deviceId !== undefined && options.deviceId !== parsed.deviceId) {
    return null;
  }

  return {
    deviceId: parsed.deviceId,
    savedAt: parsed.savedAt,
    stepId: parsed.stepId,
    data: parsed.data,
    purchasedDuringOnboarding: parsed.purchasedDuringOnboarding === true,
    sampleDevotionalId: parsed.sampleDevotionalId ?? null,
    // Written under its own key; a record from before that split may still
    // carry it inline, so prefer whichever is present.
    sampleDevotionalDay: readSampleDay() ?? parsed.sampleDevotionalDay ?? null,
  };
}

/** Remove the persisted draft (call once onboarding data reaches the store). */
export function clearOnboardingDraft(): void {
  try {
    mmkvStorage.removeItem(STORE_KEY);
    mmkvStorage.removeItem(SAMPLE_DAY_KEY);
    // The abandonment marker belongs to the draft's lifetime: a stale one
    // silences the next report on this device. Owned here so a future clear
    // path cannot forget it. The key is duplicated rather than imported to
    // keep this store free of a cycle through the telemetry module.
    mmkvStorage.removeItem(ABANDONED_MARKER_KEY);
  } catch {
    // Best-effort.
  }
}
