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
 * 'failed': the record stays so the job can be picked up again. A status
 * request the server answers with "no such job" (404 / 400) is the server's
 * verdict, though, and fails terminally on the spot so the record is dropped.
 */
import type { GenerationResultPayload } from './generation-reconciliation';
// Type-only import — erased at compile time, so this module stays free of the
// native (MMKV) dependencies that the generation-api runtime pulls in.
import type { CanonicalGenerationResultPayload } from './generation-api';
import { defaultSleep } from './generated-day-watch';
import {
  classifyPollFailure,
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
/**
 * Copy for the server's "no such job" answer (404 NOT_FOUND / 400
 * INVALID_PARAMS on the status request). A verdict, not a connection problem:
 * it takes the generic branch of toFriendlyOnboardingGenerationError, the
 * inflight record is dropped, and Try again submits a fresh series.
 */
export const INITIAL_ARC_JOB_NOT_FOUND_MESSAGE = 'We couldn’t find your devotional job on the writing service. Please try again.';

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
  /** The server does not hold the job (404 / 400 on the status request). */
  | 'server-poll-not-found';

export type InflightInitialArcWatchOutcome =
  | { kind: 'complete'; result: CanonicalGenerationResultPayload }
  | { kind: 'failed'; message: string; phase: InitialArcFailurePhase; canRetry: boolean }
  /** The client gave up reaching the server; the job may still be running. */
  | { kind: 'unreachable'; message: string }
  | { kind: 'cancelled' };

/** One status request's answer: what the server said, or the throw. */
export type InitialArcPollResult =
  | { status: InitialArcJobStatus }
  | { error: unknown };

/** What one poll reads from the loop and the next poll inherits. */
export type InitialArcPollState = {
  consecutiveUnknown: number;
  consecutiveNetworkErrors: number;
  /** How long the job has been polled; feeds the liveness rule. */
  elapsedMs: number;
  /** Identity fallback when the server result omits its devotionalId. */
  fallbackDevotionalId?: string | null;
};

export type InitialArcPollStep =
  /** A verdict, or the client's give-up: the wait ends here. */
  | { kind: 'settled'; outcome: Exclude<InflightInitialArcWatchOutcome, { kind: 'cancelled' }> }
  /** Not yet: ask again, at double cadence after a throwing fetch. */
  | {
      kind: 'poll-again';
      consecutiveUnknown: number;
      consecutiveNetworkErrors: number;
      cadence: 'normal' | 'doubled';
    };

function settled(outcome: Exclude<InflightInitialArcWatchOutcome, { kind: 'cancelled' }>): InitialArcPollStep {
  return { kind: 'settled', outcome };
}

/**
 * Classify one poll. Shared by the loop below and by Today's one-shot
 * app-kill-recovery probe, so a server verdict reads the same wherever it is
 * seen. A throwing fetch is "not yet" — the server job is still running —
 * and counts toward the consecutive-error give-up, which ends the wait
 * without a verdict; the one throw that is a verdict is the server's "no
 * such job" (404 / 400). A status goes through `evaluateGenerationPoll`.
 */
export function classifyInitialArcPoll(poll: InitialArcPollResult, state: InitialArcPollState): InitialArcPollStep {
  if ('error' in poll) {
    if (classifyPollFailure(poll.error) === 'job-gone') {
      return settled({ kind: 'failed', message: INITIAL_ARC_JOB_NOT_FOUND_MESSAGE, phase: 'server-poll-not-found', canRetry: true });
    }
    const consecutiveNetworkErrors = countConsecutiveNetworkErrors(state.consecutiveNetworkErrors, false);
    if (evaluateGenerationDeadline({ elapsedMs: state.elapsedMs, consecutiveNetworkErrors }) === 'network-error') {
      return settled({ kind: 'unreachable', message: INITIAL_ARC_UNREACHABLE_MESSAGE });
    }
    return { kind: 'poll-again', consecutiveUnknown: state.consecutiveUnknown, consecutiveNetworkErrors, cadence: 'doubled' };
  }

  const evaluated = evaluateGenerationPoll({
    status: poll.status.status,
    result: poll.status.result,
    error: poll.status.error,
    canRetry: poll.status.canRetry,
    fallbackDevotionalId: state.fallbackDevotionalId ?? null,
    dayNumber: 1,
    priorConsecutiveUnknown: state.consecutiveUnknown,
  });

  switch (evaluated.outcome.kind) {
    case 'complete':
      return settled({ kind: 'complete', result: evaluated.outcome.result });
    case 'failed':
      return settled({
        kind: 'failed',
        message: evaluated.outcome.error,
        phase: 'server-poll',
        canRetry: evaluated.outcome.canRetry,
      });
    case 'invalid-result':
      return settled({ kind: 'failed', message: INITIAL_ARC_INVALID_RESULT_MESSAGE, phase: 'server-poll-invalid-result', canRetry: true });
    case 'unknown-terminal':
      return settled({ kind: 'failed', message: INITIAL_ARC_UNKNOWN_STATUS_MESSAGE, phase: 'server-poll-unknown-status', canRetry: true });
    case 'waiting':
    case 'unknown-retry':
    default:
      // Still pending / processing (or a tolerated unknown). Past the
      // long-running threshold this is a soft state, never a failure.
      return {
        kind: 'poll-again',
        consecutiveUnknown: evaluated.consecutiveUnknown,
        consecutiveNetworkErrors: countConsecutiveNetworkErrors(state.consecutiveNetworkErrors, true),
        cadence: 'normal',
      };
  }
}

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

/**
 * Poll the job until it completes, fails terminally, is cancelled, or the
 * server stops answering. The first poll is immediate (the reader just left a
 * screen that was polling); every poll is classified by
 * `classifyInitialArcPoll`, and the loop only carries its state forward.
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

    let poll: InitialArcPollResult;
    try {
      poll = { status: await fetchStatus(jobId) };
    } catch (error) {
      poll = { error };
    }
    if (isCancelled()) return { kind: 'cancelled' };

    const step = classifyInitialArcPoll(poll, {
      consecutiveUnknown,
      consecutiveNetworkErrors,
      elapsedMs: now() - startedAt,
      fallbackDevotionalId,
    });
    if (step.kind === 'settled') return step.outcome;
    consecutiveUnknown = step.consecutiveUnknown;
    consecutiveNetworkErrors = step.consecutiveNetworkErrors;
    await sleep(delayFor(now() - startedAt) * (step.cadence === 'doubled' ? 2 : 1));
  }
}
