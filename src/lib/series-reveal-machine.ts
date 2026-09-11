import type { AutoTrialAbandonReason, AutoTrialIntentStatus, AutoTrialIntentV1 } from './auto-trial-intent';
import {
  countConsecutiveNetworkErrors,
  evaluateGenerationDeadline,
  MAX_CONSECUTIVE_POLL_NETWORK_ERRORS,
  type GenerationPollOutcome,
} from './generation-poll-outcome';

export type SeriesRevealFailureReason =
  | 'submit_failed'
  | 'rate_limited'
  | 'unreachable'
  | 'unknown_status'
  | 'job_failed'
  | 'invalid_result'
  | 'max_retries'
  | 'bad_request';

export type SeriesRevealState =
  | { kind: 'resolving' }
  | { kind: 'generating'; jobId: string | null; devotionalId: string | null; consecutiveNetworkErrors: number }
  | { kind: 'revealed'; devotionalId: string }
  | { kind: 'failed'; jobId: string | null; reason: SeriesRevealFailureReason; retryAtMs: number | null }
  | { kind: 'retry_exhausted'; jobId: string | null; reason: SeriesRevealFailureReason }
  | { kind: 'declined'; reason: 'switch_off' | 'platform' | 'trial_length' | 'trial_expired' };

export type SeriesRevealEvent =
  | {
      type: 'mounted';
      intent: AutoTrialIntentV1 | null;
      paramIntentId: string;
      hasCompletedOnboarding: boolean;
      day1Landed: boolean;
      expired: boolean;
      supersededByUserSeries: boolean;
    }
  | { type: 'submit_blocked'; reason: 'expired' | 'superseded' }
  | { type: 'submit_ok'; jobId: string; devotionalId: string; claim: 'created' | 'repointed' | 'existing' | 'resumed' | null }
  | { type: 'submit_error'; status: number | null; code: string | null; existingJobId: string | null; nowMs: number }
  | { type: 'poll'; outcome: GenerationPollOutcome }
  | { type: 'job_gone' }
  | { type: 'unreachable' }
  | { type: 'retry_error'; code: string | null }
  | { type: 'landed'; devotionalId: string }
  | { type: 'try_again'; nowMs: number }
  | { type: 'go_to_today' }
  | { type: 'set_up_series' };

export type SeriesRevealEffect =
  | { type: 'submit' }
  | { type: 'poll'; jobId: string }
  | { type: 'retry_job'; jobId: string }
  | { type: 'land' }
  | { type: 'transition'; to: AutoTrialIntentStatus; reason?: AutoTrialAbandonReason }
  | { type: 'redirect'; to: '/(tabs)/(today)' | '/onboarding' | 'new_series_setup' }
  | { type: 'clear_inflight' }
  | { type: 'clear_session' }
  | { type: 'none' };

export { MAX_CONSECUTIVE_POLL_NETWORK_ERRORS };

const FAILED_CLEARS: SeriesRevealEffect[] = [
  { type: 'transition', to: 'failed' },
  { type: 'clear_inflight' },
  { type: 'clear_session' },
];

function generating(
  jobId: string | null,
  devotionalId: string | null,
  consecutiveNetworkErrors = 0,
): SeriesRevealState {
  return { kind: 'generating', jobId, devotionalId, consecutiveNetworkErrors };
}

function failed(
  jobId: string | null,
  reason: SeriesRevealFailureReason,
  retryAtMs: number | null = null,
): SeriesRevealState {
  return { kind: 'failed', jobId, reason, retryAtMs };
}

function exhausted(jobId: string | null, reason: SeriesRevealFailureReason): SeriesRevealState {
  return { kind: 'retry_exhausted', jobId, reason };
}

function currentJob(state: SeriesRevealState): { jobId: string | null; devotionalId: string | null } {
  if (state.kind === 'generating') return { jobId: state.jobId, devotionalId: state.devotionalId };
  if (state.kind === 'failed' || state.kind === 'retry_exhausted') {
    return { jobId: state.jobId, devotionalId: null };
  }
  if (state.kind === 'revealed') return { jobId: null, devotionalId: state.devotionalId };
  return { jobId: null, devotionalId: null };
}

const FAILURE_REASONS: ReadonlySet<SeriesRevealFailureReason> = new Set([
  'submit_failed',
  'rate_limited',
  'unreachable',
  'unknown_status',
  'job_failed',
  'invalid_result',
  'max_retries',
  'bad_request',
]);

function reasonFromFailureCode(code: string | null): SeriesRevealFailureReason {
  if (!code) return 'max_retries';
  const normalized = code.toLowerCase();
  if (normalized === 'max_retries_exceeded') return 'max_retries';
  if (FAILURE_REASONS.has(normalized as SeriesRevealFailureReason)) {
    return normalized as SeriesRevealFailureReason;
  }
  return 'max_retries';
}

function networkErrorsOf(state: SeriesRevealState): number {
  return state.kind === 'generating' ? state.consecutiveNetworkErrors : 0;
}

function declinedReasonFromCode(
  code: string | null,
): 'switch_off' | 'platform' | 'trial_length' | 'trial_expired' {
  if (code === 'trial_expired' || code === 'platform' || code === 'trial_length' || code === 'switch_off') {
    return code;
  }
  return 'switch_off';
}

function keep(state: SeriesRevealState): { state: SeriesRevealState; effects: SeriesRevealEffect[] } {
  return { state, effects: [] };
}

function reduceMounted(
  event: Extract<SeriesRevealEvent, { type: 'mounted' }>,
): { state: SeriesRevealState; effects: SeriesRevealEffect[] } {
  const { intent, paramIntentId, hasCompletedOnboarding, day1Landed, expired, supersededByUserSeries } = event;
  if (!intent || intent.intentId !== paramIntentId) {
    return { state: { kind: 'resolving' }, effects: [{ type: 'redirect', to: '/(tabs)/(today)' }] };
  }

  if (intent.status === 'abandoned') {
    return { state: { kind: 'resolving' }, effects: [{ type: 'redirect', to: '/(tabs)/(today)' }] };
  }

  if (intent.status === 'failed') {
    return {
      state: exhausted(intent.jobId, reasonFromFailureCode(intent.failureCode)),
      effects: [],
    };
  }

  if (intent.status === 'purchased') {
    if (expired) {
      return {
        state: { kind: 'declined', reason: 'trial_expired' },
        effects: [{ type: 'transition', to: 'abandoned', reason: 'trial_expired_before_submit' }],
      };
    }
    if (supersededByUserSeries) {
      return {
        state: { kind: 'resolving' },
        effects: [
          { type: 'transition', to: 'abandoned', reason: 'superseded_by_user_series' },
          { type: 'redirect', to: '/(tabs)/(today)' },
        ],
      };
    }
    if (!hasCompletedOnboarding) {
      return { state: { kind: 'resolving' }, effects: [{ type: 'redirect', to: '/onboarding' }] };
    }
    return {
      state: generating(null, null, 0),
      effects: [{ type: 'submit' }],
    };
  }

  if (intent.status === 'submitted') {
    if (day1Landed && intent.devotionalId) {
      return { state: { kind: 'revealed', devotionalId: intent.devotionalId }, effects: [{ type: 'land' }] };
    }
    if (intent.jobId) {
      return {
        state: generating(intent.jobId, intent.devotionalId, 0),
        effects: [{ type: 'poll', jobId: intent.jobId }],
      };
    }
    return { state: generating(null, intent.devotionalId, 0), effects: [{ type: 'submit' }] };
  }

  if (intent.status === 'landed' || intent.status === 'revealed' || intent.status === 'completed') {
    if (day1Landed && intent.devotionalId) {
      return { state: { kind: 'revealed', devotionalId: intent.devotionalId }, effects: [{ type: 'land' }] };
    }
    return { state: { kind: 'resolving' }, effects: [{ type: 'redirect', to: '/(tabs)/(today)' }] };
  }

  return { state: { kind: 'resolving' }, effects: [{ type: 'redirect', to: '/(tabs)/(today)' }] };
}

function reduceSubmitError(
  state: SeriesRevealState,
  event: Extract<SeriesRevealEvent, { type: 'submit_error' }>,
): { state: SeriesRevealState; effects: SeriesRevealEffect[] } {
  const ids = currentJob(state);
  if (event.existingJobId) {
    return {
      state: generating(event.existingJobId, ids.devotionalId, 0),
      effects: [
        { type: 'transition', to: 'submitted' },
        { type: 'poll', jobId: event.existingJobId },
      ],
    };
  }
  if (event.status === 409) {
    const reason = declinedReasonFromCode(event.code);
    return {
      state: { kind: 'declined', reason },
      effects: [{
        type: 'transition',
        to: 'abandoned',
        reason: reason === 'trial_expired' ? 'trial_expired_before_submit' : 'server_unavailable',
      }],
    };
  }
  if (event.status === 429) {
    return { state: failed(ids.jobId, 'rate_limited', event.nowMs + 60_000), effects: [] };
  }
  if (event.status === 400) {
    return { state: exhausted(ids.jobId, 'bad_request'), effects: FAILED_CLEARS };
  }
  return { state: failed(ids.jobId, 'submit_failed'), effects: [] };
}

function reducePoll(
  state: SeriesRevealState,
  outcome: GenerationPollOutcome,
): { state: SeriesRevealState; effects: SeriesRevealEffect[] } {
  const ids = currentJob(state);
  if (outcome.kind === 'waiting' || outcome.kind === 'unknown-retry') {
    const nextErrors = countConsecutiveNetworkErrors(networkErrorsOf(state), true);
    if (!ids.jobId) return keep(state);
    return {
      state: generating(ids.jobId, ids.devotionalId, nextErrors),
      effects: [{ type: 'poll', jobId: ids.jobId }],
    };
  }
  if (outcome.kind === 'complete') {
    return { state, effects: [{ type: 'land' }] };
  }
  if (outcome.kind === 'failed' && outcome.canRetry) {
    return { state: failed(ids.jobId, 'job_failed'), effects: [] };
  }
  if (outcome.kind === 'failed') {
    return { state: exhausted(ids.jobId, 'max_retries'), effects: FAILED_CLEARS };
  }
  if (outcome.kind === 'invalid-result') {
    return { state: exhausted(ids.jobId, 'invalid_result'), effects: FAILED_CLEARS };
  }
  if (outcome.kind === 'unknown-terminal') {
    return { state: failed(ids.jobId, 'unknown_status'), effects: [] };
  }
  return keep(state);
}

function reduceTryAgain(
  state: SeriesRevealState,
  nowMs: number,
): { state: SeriesRevealState; effects: SeriesRevealEffect[] } {
  if (state.kind !== 'failed') return keep(state);
  if (state.reason === 'rate_limited' && state.retryAtMs != null && nowMs < state.retryAtMs) {
    return keep(state);
  }
  if (state.reason === 'job_failed') {
    if (!state.jobId) return keep(state);
    return {
      state: generating(state.jobId, null, 0),
      effects: [{ type: 'retry_job', jobId: state.jobId }],
    };
  }
  if (state.reason === 'unreachable' || state.reason === 'unknown_status') {
    if (!state.jobId) return keep(state);
    return {
      state: generating(state.jobId, null, 0),
      effects: [{ type: 'poll', jobId: state.jobId }],
    };
  }
  return {
    state: generating(state.jobId, null, 0),
    effects: [{ type: 'submit' }],
  };
}

export function reduceSeriesReveal(
  s: SeriesRevealState,
  e: SeriesRevealEvent,
): { state: SeriesRevealState; effects: SeriesRevealEffect[] } {
  if (e.type === 'mounted') return reduceMounted(e);

  if (e.type === 'submit_blocked') {
    if (e.reason === 'expired') {
      return {
        state: { kind: 'declined', reason: 'trial_expired' },
        effects: [{ type: 'transition', to: 'abandoned', reason: 'trial_expired_before_submit' }],
      };
    }
    return {
      state: { kind: 'resolving' },
      effects: [
        { type: 'transition', to: 'abandoned', reason: 'superseded_by_user_series' },
        { type: 'redirect', to: '/(tabs)/(today)' },
      ],
    };
  }

  if (e.type === 'submit_ok') {
    return {
      state: generating(e.jobId, e.devotionalId, 0),
      effects: [
        { type: 'transition', to: 'submitted' },
        { type: 'poll', jobId: e.jobId },
      ],
    };
  }

  if (e.type === 'submit_error') return reduceSubmitError(s, e);

  if (e.type === 'poll') return reducePoll(s, e.outcome);

  if (e.type === 'job_gone') {
    if (s.kind === 'generating' && s.jobId != null) {
      return { state: generating(null, s.devotionalId, 0), effects: [{ type: 'submit' }] };
    }
    return { state: failed(currentJob(s).jobId, 'submit_failed'), effects: [] };
  }

  if (e.type === 'unreachable') {
    const prior = networkErrorsOf(s);
    const nextErrors = countConsecutiveNetworkErrors(prior, false);
    const ids = currentJob(s);
    if (evaluateGenerationDeadline({ elapsedMs: 0, consecutiveNetworkErrors: nextErrors }) === 'network-error') {
      return { state: failed(ids.jobId, 'unreachable'), effects: [] };
    }
    if (!ids.jobId) return { state: generating(null, ids.devotionalId, nextErrors), effects: [] };
    return {
      state: generating(ids.jobId, ids.devotionalId, nextErrors),
      effects: [{ type: 'poll', jobId: ids.jobId }],
    };
  }

  if (e.type === 'retry_error') {
    if (e.code === 'MAX_RETRIES_EXCEEDED') {
      return { state: exhausted(currentJob(s).jobId, 'max_retries'), effects: FAILED_CLEARS };
    }
    return keep(s);
  }

  if (e.type === 'landed') {
    return { state: { kind: 'revealed', devotionalId: e.devotionalId }, effects: [] };
  }

  if (e.type === 'try_again') return reduceTryAgain(s, e.nowMs);

  if (e.type === 'go_to_today') {
    return { state: s, effects: [{ type: 'redirect', to: '/(tabs)/(today)' }] };
  }

  if (e.type === 'set_up_series') {
    return {
      state: { kind: 'resolving' },
      effects: [
        { type: 'transition', to: 'abandoned', reason: 'user_setup_fallback' },
        { type: 'redirect', to: 'new_series_setup' },
      ],
    };
  }

  return keep(s);
}
