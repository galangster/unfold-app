/**
 * Pure decision logic for the post-paywall /generating screen's poll loop and
 * submit-failure handling. Extracted from the component so each terminal-vs-retry
 * decision is unit tested (the screen itself pulls in Reanimated / navigation).
 *
 * Folding the identity reconciliation in here means a `complete` response whose
 * result can't be reconciled is classified as a TERMINAL invalid result rather
 * than being swallowed by the transient-network catch and re-polled forever.
 */
import {
  reconcileGenerationResultIdentity,
  type GenerationResultPayload,
} from './generation-reconciliation';
// Type-only import — erased at compile time, so this module stays free of the
// native (MMKV) dependencies that the generation-api runtime pulls in.
import type { CanonicalGenerationResultPayload } from './generation-api';

/** Consecutive unrecognized-status responses tolerated before giving up. */
export const MAX_UNKNOWN_GENERATION_STATUS = 3;

export type GenerationPollOutcome =
  | { kind: 'complete'; result: CanonicalGenerationResultPayload }
  | { kind: 'invalid-result' }
  | { kind: 'failed'; canRetry: boolean; error: string }
  | { kind: 'waiting' }
  | { kind: 'unknown-retry' }
  | { kind: 'unknown-terminal' };

/**
 * Classify a single poll response. Returns the outcome plus the next
 * consecutive-unknown counter (reset to 0 on any recognized status).
 */
export function evaluateGenerationPoll(input: {
  status: string;
  result?: GenerationResultPayload | null;
  error?: string | null;
  canRetry?: boolean;
  fallbackDevotionalId?: string | null;
  dayNumber?: number;
  priorConsecutiveUnknown: number;
}): { outcome: GenerationPollOutcome; consecutiveUnknown: number } {
  if (input.status === 'complete') {
    // Complete but empty is terminal — retrying never conjures a result.
    if (!input.result?.devotionalDay) {
      return { outcome: { kind: 'invalid-result' }, consecutiveUnknown: 0 };
    }
    try {
      const result = reconcileGenerationResultIdentity(
        input.result,
        input.fallbackDevotionalId,
        input.dayNumber ?? 1,
      ) as CanonicalGenerationResultPayload;
      return { outcome: { kind: 'complete', result }, consecutiveUnknown: 0 };
    } catch {
      // Identity reconciliation failed — the finished reading can't be opened.
      // Terminal invalid result, NOT a transient error to re-poll.
      return { outcome: { kind: 'invalid-result' }, consecutiveUnknown: 0 };
    }
  }

  if (input.status === 'failed') {
    return {
      outcome: {
        kind: 'failed',
        canRetry: input.canRetry !== false,
        error: input.error ?? 'Generation failed on server',
      },
      consecutiveUnknown: 0,
    };
  }

  if (input.status === 'pending' || input.status === 'processing') {
    return { outcome: { kind: 'waiting' }, consecutiveUnknown: 0 };
  }

  // Unrecognized status. Tolerate a few (transient server quirk) but don't poll
  // forever against a status we don't understand.
  const consecutiveUnknown = input.priorConsecutiveUnknown + 1;
  return {
    outcome:
      consecutiveUnknown >= MAX_UNKNOWN_GENERATION_STATUS
        ? { kind: 'unknown-terminal' }
        : { kind: 'unknown-retry' },
    consecutiveUnknown,
  };
}

/**
 * Decide how to handle a failed job submission. When the server reports that a
 * job already exists for this user/day (ApiError carries `existingJobId`), the
 * caller should ADOPT that job instead of dead-ending and resubmitting from
 * scratch on retry. Structural check keeps this module native-free.
 */
export function resolveGenerationSubmitFailure(
  err: unknown,
): { kind: 'adopt-existing'; jobId: string } | { kind: 'fail'; message: string } {
  const existingJobId = (err as { existingJobId?: unknown } | null | undefined)?.existingJobId;
  if (typeof existingJobId === 'string' && existingJobId.length > 0) {
    return { kind: 'adopt-existing', jobId: existingJobId };
  }
  return {
    kind: 'fail',
    message: err instanceof Error ? err.message : String(err),
  };
}

// ── Poll cadence ──────────────────────────────────────────────────────────

/** Fixed cadence for the first minute of a job, when completion is likeliest. */
export const POLL_DELAY_INITIAL_MS = 3_000;
/** Cadence once a job has been running for a minute. */
export const POLL_DELAY_AFTER_1_MIN_MS = 5_000;
/** Cadence cap, reached once a job has been running for three minutes. */
export const POLL_DELAY_AFTER_3_MIN_MS = 8_000;
/** Escalation boundaries, measured from the job's poll start. */
export const POLL_ESCALATE_AT_1_MIN_MS = 60_000;
export const POLL_ESCALATE_AT_3_MIN_MS = 180_000;
/** Jitter applied to the escalated tiers: ±20% of the tier's base delay. */
export const POLL_JITTER_RATIO = 0.2;

/**
 * Delay before the next job-status poll, given how long this job has been
 * polled so far. Escalates 3s → 5s → 8s at the one- and three-minute marks;
 * the escalated tiers carry ±20% jitter (never more than 9.6s) so many clients
 * that started together don't keep hitting the server in lockstep. The first
 * minute stays a fixed 3s. Callers reset their elapsed clock whenever the job
 * changes, so each job starts back at the fast tier.
 *
 * @param rng - Uniform source in [0, 1); injectable for tests.
 */
export function getNextPollDelayMs(elapsedMs: number, rng: () => number = Math.random): number {
  // Written as a negated `>=` so a non-finite elapsed value (NaN) also lands
  // on the fast, fixed tier rather than the slow one.
  if (!(elapsedMs >= POLL_ESCALATE_AT_1_MIN_MS)) return POLL_DELAY_INITIAL_MS;
  const base = elapsedMs >= POLL_ESCALATE_AT_3_MIN_MS ? POLL_DELAY_AFTER_3_MIN_MS : POLL_DELAY_AFTER_1_MIN_MS;
  const unit = Math.min(Math.max(rng(), 0), 1); // clamp so the bounds hold for any rng
  const jitter = (unit * 2 - 1) * POLL_JITTER_RATIO; // [-0.2, +0.2]
  return Math.round(base * (1 + jitter));
}
