/**
 * Poll loop for the first-series (`initial_arc`) job when the reader is not on
 * /generating any more. Native-free so the loop is unit tested with an injected
 * clock and sleep; the /generating screen keeps its own timer-driven loop but
 * shares the same outcome classification (`evaluateGenerationPoll`), liveness
 * rule (`evaluateGenerationDeadline`), cadence and terminal copy, so both
 * screens fail and finish the same way.
 *
 * Time is never a verdict: a job past the long-running threshold keeps being
 * polled at the slow tier (Jordan, item 7 — a ten-minute wall clock declared a
 * running job failed without asking the server). The only client-side give-up
 * is a run of failed status requests, and that is 'unreachable', not
 * 'failed': the record stays so the job can be picked up again.
 */
import type { GenerationResultPayload } from './generation-reconciliation';
// Type-only import — erased at compile time, so this module stays free of the
// native (MMKV) dependencies that the generation-api runtime pulls in.
import type { CanonicalGenerationResultPayload } from './generation-api';
import {
  countConsecutiveNetworkErrors,
  evaluateGenerationDeadline,
  evaluateGenerationPoll,
  getNextPollDelayMs,
} from './generation-poll-outcome';

/** Terminal-error copy for a completed-but-unopenable / unrecognized job. */
export const INITIAL_ARC_INVALID_RESULT_MESSAGE = 'Your devotional finished, but we couldn’t open it. Please try again.';
export const INITIAL_ARC_UNKNOWN_STATUS_MESSAGE = 'We hit an unexpected problem finishing your devotional. Please try again.';
/**
 * Copy for the client-side give-up (MAX_CONSECUTIVE_POLL_NETWORK_ERRORS failed
 * status requests in a row). Not a verdict on the job — it may still be
 * running — so it routes through the connection branch of
 * toFriendlyOnboardingGenerationError and the inflight record is kept.
 */
export const INITIAL_ARC_UNREACHABLE_MESSAGE = 'Unable to connect to the writing service while checking on your devotional.';

export type InitialArcJobStatus = {
  status: string;
  result?: GenerationResultPayload | null;
  error?: string | null;
  canRetry?: boolean;
};

export type InitialArcFailurePhase =
  | 'server-poll'
  | 'server-poll-invalid-result'
  | 'server-poll-unknown-status';

export type InflightInitialArcWatchOutcome =
  | { kind: 'complete'; result: CanonicalGenerationResultPayload }
  | { kind: 'failed'; message: string; phase: InitialArcFailurePhase; canRetry: boolean }
  /** The client gave up reaching the server; the job may still be running. */
  | { kind: 'unreachable'; message: string }
  | { kind: 'cancelled' };

export type WatchInflightInitialArcOptions = {
  jobId: string;
  fetchStatus: (jobId: string) => Promise<InitialArcJobStatus>;
  /** Identity fallback when the server result omits its devotionalId. */
  fallbackDevotionalId?: string | null;
  /** When the job was submitted; the poll cadence escalates from here. */
  startedAt?: number;
  /** Consulted before each fetch and after each wait; true stops the loop. */
  isCancelled?: () => boolean;
  /** Injectable for tests. */
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
  delayFor?: (elapsedMs: number) => number;
};

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Poll the job until it completes, fails terminally, is cancelled, or the
 * server stops answering. The first poll is immediate (the reader just left a
 * screen that was polling). A throwing fetch is "not yet": the server job is
 * still running, so wait (at double cadence) and ask again — until the
 * consecutive-error cap, which ends the wait without a verdict.
 */
export async function watchInflightInitialArc(
  options: WatchInflightInitialArcOptions,
): Promise<InflightInitialArcWatchOutcome> {
  const {
    jobId,
    fetchStatus,
    fallbackDevotionalId = null,
    isCancelled = () => false,
    sleep = defaultSleep,
    now = Date.now,
    delayFor = getNextPollDelayMs,
  } = options;
  const startedAt = options.startedAt ?? now();
  let consecutiveUnknown = 0;
  let consecutiveNetworkErrors = 0;

  for (;;) {
    if (isCancelled()) return { kind: 'cancelled' };

    let status: InitialArcJobStatus;
    try {
      status = await fetchStatus(jobId);
    } catch {
      consecutiveNetworkErrors = countConsecutiveNetworkErrors(consecutiveNetworkErrors, false);
      const decision = evaluateGenerationDeadline({ elapsedMs: now() - startedAt, consecutiveNetworkErrors });
      if (decision === 'network-error') {
        return { kind: 'unreachable', message: INITIAL_ARC_UNREACHABLE_MESSAGE };
      }
      await sleep(delayFor(now() - startedAt) * 2);
      continue;
    }
    if (isCancelled()) return { kind: 'cancelled' };
    consecutiveNetworkErrors = countConsecutiveNetworkErrors(consecutiveNetworkErrors, true);

    const evaluated = evaluateGenerationPoll({
      status: status.status,
      result: status.result,
      error: status.error,
      canRetry: status.canRetry,
      fallbackDevotionalId,
      dayNumber: 1,
      priorConsecutiveUnknown: consecutiveUnknown,
    });
    consecutiveUnknown = evaluated.consecutiveUnknown;

    switch (evaluated.outcome.kind) {
      case 'complete':
        return { kind: 'complete', result: evaluated.outcome.result };
      case 'failed':
        return {
          kind: 'failed',
          message: evaluated.outcome.error,
          phase: 'server-poll',
          canRetry: evaluated.outcome.canRetry,
        };
      case 'invalid-result':
        return { kind: 'failed', message: INITIAL_ARC_INVALID_RESULT_MESSAGE, phase: 'server-poll-invalid-result', canRetry: true };
      case 'unknown-terminal':
        return { kind: 'failed', message: INITIAL_ARC_UNKNOWN_STATUS_MESSAGE, phase: 'server-poll-unknown-status', canRetry: true };
      case 'waiting':
      case 'unknown-retry':
      default:
        // Still pending / processing (or a tolerated unknown). Past the
        // long-running threshold this is a soft state, never a failure.
        await sleep(delayFor(now() - startedAt));
    }
  }
}
