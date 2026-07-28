/**
 * Pure decision logic for the onboarding DevotionalSegue screen.
 *
 * Extracted from the component so the two race-condition fixes can be unit
 * tested without rendering Reanimated / navigation:
 *
 *  1. `decideOnboardingSeguePoll` — the deadline is only consulted when a poll
 *     comes back STILL non-terminal. A job that finishes at or after the
 *     deadline must still land as "ready" instead of being declared a timeout
 *     one tick too late (the production endless-loader incident).
 *
 *  2. `runOnboardingSampleFallback` — when the segue mounts without a jobId, it
 *     must (a) resume a persisted job, else (b) recover a completed job that
 *     already exists server-side, and only then (c) submit a fresh job. This
 *     ordering kills the duplicate-job path.
 */

export type OnboardingSeguePollDecision =
  | { kind: 'ready' }
  | { kind: 'invalid' }
  | { kind: 'failed'; canRetry: boolean }
  | { kind: 'timeout' }
  | { kind: 'waiting' };

/**
 * Decide what a single poll response means. The deadline (`elapsedMs` vs
 * `timeoutMs`) is checked ONLY on the non-terminal branch — a `complete`
 * response always wins, even past the deadline.
 */
export function decideOnboardingSeguePoll(input: {
  status: string;
  /** True when a `complete` response also produced a usable normalized result. */
  hasNormalizedResult: boolean;
  elapsedMs: number;
  timeoutMs: number;
  /** Server-reported retryability for a failed job. */
  canRetry?: boolean;
  /** Whether a fallback submit is available (keeps a failed job retryable). */
  hasFallback: boolean;
}): OnboardingSeguePollDecision {
  if (input.status === 'complete') {
    return input.hasNormalizedResult ? { kind: 'ready' } : { kind: 'invalid' };
  }

  if (input.status === 'failed') {
    return {
      kind: 'failed',
      canRetry: input.canRetry !== false || input.hasFallback,
    };
  }

  // Non-terminal (pending / processing / anything unexpected): only now does
  // the deadline matter. This is the core of the timeout fix — the check no
  // longer short-circuits before we know whether the job already finished.
  if (input.elapsedMs > input.timeoutMs) {
    return { kind: 'timeout' };
  }

  return { kind: 'waiting' };
}

/**
 * Orchestrate the segue's mount-without-jobId path with injected side effects
 * so the ordering (persisted → recover → submit) is testable in isolation.
 *
 * Returns which branch was taken (useful for tests / instrumentation).
 */
export async function runOnboardingSampleFallback(deps: {
  persistedJobId: string | null;
  usePersistedJob: (jobId: string) => void;
  recoverCompleted: () => Promise<boolean>;
  submitFallback: () => Promise<void>;
}): Promise<'persisted' | 'recovered' | 'submitted'> {
  if (deps.persistedJobId) {
    deps.usePersistedJob(deps.persistedJobId);
    return 'persisted';
  }

  if (await deps.recoverCompleted()) {
    return 'recovered';
  }

  await deps.submitFallback();
  return 'submitted';
}
