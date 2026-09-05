/**
 * Poll loop for the first-series (`initial_arc`) job when the reader is not on
 * /generating any more. Native-free so the loop is unit tested with an injected
 * clock and sleep; the /generating screen keeps its own timer-driven loop but
 * shares the same outcome classification (`evaluateGenerationPoll`), cadence
 * and terminal copy, so both screens fail and finish the same way.
 */
import type { GenerationResultPayload } from './generation-reconciliation';
// Type-only import — erased at compile time, so this module stays free of the
// native (MMKV) dependencies that the generation-api runtime pulls in.
import type { CanonicalGenerationResultPayload } from './generation-api';
import { evaluateGenerationPoll, getNextPollDelayMs } from './generation-poll-outcome';

/** Maximum time to poll one job before giving up (10 minutes). */
export const INITIAL_ARC_MAX_POLL_DURATION_MS = 10 * 60 * 1000;
export const INITIAL_ARC_TIMEOUT_MESSAGE = 'Generation is taking longer than expected. Please try again.';
/** Terminal-error copy for a completed-but-unopenable / unrecognized job. */
export const INITIAL_ARC_INVALID_RESULT_MESSAGE = 'Your devotional finished, but we couldn’t open it. Please try again.';
export const INITIAL_ARC_UNKNOWN_STATUS_MESSAGE = 'We hit an unexpected problem finishing your devotional. Please try again.';

export type InitialArcJobStatus = {
  status: string;
  result?: GenerationResultPayload | null;
  error?: string | null;
  canRetry?: boolean;
};

export type InitialArcFailurePhase =
  | 'server-poll'
  | 'server-poll-invalid-result'
  | 'server-poll-unknown-status'
  | 'server-poll-timeout';

export type InflightInitialArcWatchOutcome =
  | { kind: 'complete'; result: CanonicalGenerationResultPayload }
  | { kind: 'failed'; message: string; phase: InitialArcFailurePhase; canRetry: boolean }
  | { kind: 'cancelled' };

export type WatchInflightInitialArcOptions = {
  jobId: string;
  fetchStatus: (jobId: string) => Promise<InitialArcJobStatus>;
  /** Identity fallback when the server result omits its devotionalId. */
  fallbackDevotionalId?: string | null;
  /** When the job was submitted; the 10-minute budget counts from here. */
  startedAt?: number;
  maxDurationMs?: number;
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
 * Poll the job until it completes, fails terminally, is cancelled, or runs
 * past its budget. The first poll is immediate (the reader just left a screen
 * that was polling). A throwing fetch is "not yet": the server job is still
 * running, so wait (at double cadence) and ask again.
 */
export async function watchInflightInitialArc(
  options: WatchInflightInitialArcOptions,
): Promise<InflightInitialArcWatchOutcome> {
  const {
    jobId,
    fetchStatus,
    fallbackDevotionalId = null,
    maxDurationMs = INITIAL_ARC_MAX_POLL_DURATION_MS,
    isCancelled = () => false,
    sleep = defaultSleep,
    now = Date.now,
    delayFor = getNextPollDelayMs,
  } = options;
  const startedAt = options.startedAt ?? now();
  let consecutiveUnknown = 0;

  for (;;) {
    if (isCancelled()) return { kind: 'cancelled' };
    const elapsedMs = now() - startedAt;
    if (elapsedMs > maxDurationMs) {
      return { kind: 'failed', message: INITIAL_ARC_TIMEOUT_MESSAGE, phase: 'server-poll-timeout', canRetry: true };
    }

    let status: InitialArcJobStatus;
    try {
      status = await fetchStatus(jobId);
    } catch {
      await sleep(delayFor(elapsedMs) * 2);
      continue;
    }
    if (isCancelled()) return { kind: 'cancelled' };

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
        await sleep(delayFor(now() - startedAt));
    }
  }
}
