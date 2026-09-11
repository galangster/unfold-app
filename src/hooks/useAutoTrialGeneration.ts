import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'expo-router';
import {
  buildRevealGuardKey,
  hasSupersedingUserSeries,
  isAutoTrialIntentExpired,
  markAutoTrialIntentDismissed,
  readAutoTrialIntent,
  settleLandedAutoTrialSeries,
  transitionAutoTrialIntent,
  type AutoTrialIntentV1,
} from '@/lib/auto-trial-intent';
import {
  trackAutoTrialFailed,
  trackAutoTrialRevealed,
  trackAutoTrialSubmitted,
} from '@/lib/auto-trial-telemetry';
import { pullDevotionalContent } from '@/lib/devotional-sync-pull';
import {
  ApiError,
  buildAutoTrialUserContext,
  pollJobStatus,
  retryJob,
  submitGenerationJob,
} from '@/lib/generation-api';
import {
  classifyPollFailure,
  evaluateGenerationPoll,
  getNextPollDelayMs,
  resolveGoHomeCleanup,
  type ObservedJobState,
} from '@/lib/generation-poll-outcome';
import { captureSyncSession } from '@/lib/generation-session';
import {
  clearInflightGenerationJob,
  markInflightJobLeftForHome,
  readInflightGenerationJob,
  writeInflightGenerationJob,
} from '@/lib/inflight-generation-job';
import { applyInitialArcResult, type InitialArcResult } from '@/lib/initial-arc-result';
import { clearInitialGenerationRequestId } from '@/lib/initial-generation-request';
import {
  reduceSeriesReveal,
  type SeriesRevealEffect,
  type SeriesRevealEvent,
  type SeriesRevealState,
} from '@/lib/series-reveal-machine';
import { flushUnfoldStorePersistAsync, useUnfoldStore, type Devotional } from '@/lib/store';
import { useUIState } from '@/lib/ui-state';
import { syncUserProfileToBackend } from '@/lib/user-profile-sync';

export const PROFILE_PUSH_CAP_MS = 5_000;

export function nextPollDelayMs(
  elapsedMs: number,
  input: {
    unreachable: boolean;
    generating: boolean;
    consecutiveNetworkErrors: number;
    hasCompletedResult: boolean;
  },
): number {
  if (input.unreachable) return getNextPollDelayMs(elapsedMs) * 2;
  if (input.generating && input.consecutiveNetworkErrors === 0 && !input.hasCompletedResult) {
    return getNextPollDelayMs(elapsedMs);
  }
  return getNextPollDelayMs(elapsedMs);
}

function day1LandedFor(
  devotionalId: string | null,
  devotionals: readonly Devotional[],
): boolean {
  if (!devotionalId) return false;
  const series = devotionals.find((row) => row.id === devotionalId);
  return Boolean(series?.days.some((day) => day.dayNumber === 1));
}

function recordInflight(jobId: string, intent: AutoTrialIntentV1): void {
  writeInflightGenerationJob({
    jobId,
    ...(intent.devotionalId ? { devotionalId: intent.devotionalId } : {}),
    submittedAt: Date.now(),
    leftForHome: intent.dismissedAt != null,
  });
}

function jobIdOf(state: SeriesRevealState): string | null {
  if (state.kind === 'generating' || state.kind === 'failed' || state.kind === 'retry_exhausted') {
    return state.jobId;
  }
  return null;
}

function observedJobStateOf(state: SeriesRevealState): ObservedJobState {
  if (state.kind === 'generating') return 'alive';
  if (state.kind === 'revealed') return 'complete';
  if (state.kind === 'retry_exhausted') {
    return state.reason === 'invalid_result' ? 'invalid-result' : 'failed';
  }
  return 'unobserved';
}

function submitErrorFields(err: unknown): {
  status: number | null;
  code: string | null;
  existingJobId: string | null;
} {
  const api = err as Partial<ApiError> | null;
  const status = typeof api?.status === 'number' ? api.status : null;
  const existingJobId = typeof api?.existingJobId === 'string' && api.existingJobId.length > 0
    ? api.existingJobId
    : null;
  const rawCode = typeof api?.code === 'string' ? api.code : null;
  const reasons = ['trial_expired', 'switch_off', 'platform', 'trial_length'] as const;
  const declineReason = rawCode === 'AUTO_TRIAL_UNAVAILABLE' && typeof api?.reason === 'string'
    ? api.reason
    : null;
  const matched = reasons.find((reason) => (declineReason ?? rawCode) === reason);
  return { status, code: matched ?? rawCode, existingJobId };
}

export function useAutoTrialGeneration(intentId: string | null): {
  state: SeriesRevealState;
  tryAgain(): void;
  goToToday(): void;
  setUpSeries(): void;
  beginDayOne(): void;
} {
  const router = useRouter();
  const [state, setState] = useState<SeriesRevealState>({ kind: 'resolving' });
  const stateRef = useRef(state);
  const mountedRef = useRef(true);
  const isExitingRef = useRef(false);
  const pollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pollStartRef = useRef(Date.now());
  const lastUnreachableRef = useRef(false);
  const lastCompleteRef = useRef<InitialArcResult | null>(null);
  const revealedOnceRef = useRef(false);

  const runEffectsRef = useRef<(effects: SeriesRevealEffect[]) => void>(() => undefined);
  // The first poll after mount runs at once so a settled job resolves without
  // a visible wait; later polls follow the backoff schedule.
  const hasPolledRef = useRef(false);

  const apply = useCallback((event: SeriesRevealEvent) => {
    const next = reduceSeriesReveal(stateRef.current, event);
    stateRef.current = next.state;
    if (mountedRef.current) setState(next.state);
    runEffectsRef.current(next.effects);
    return next;
  }, []);

  const persistAcceptedSubmit = useCallback((
    intent: AutoTrialIntentV1,
    jobId: string,
    devotionalId: string | null,
    claim: 'created' | 'repointed' | 'existing' | 'resumed' | null,
  ) => {
    transitionAutoTrialIntent(
      'submitted',
      { jobId, ...(devotionalId ? { devotionalId } : {}) },
      { nowMs: Date.now() },
    );
    recordInflight(jobId, {
      ...intent,
      ...(devotionalId ? { devotionalId } : {}),
    });
    try {
      trackAutoTrialSubmitted({
        entry: intent.entry,
        trial_days: intent.trialDays,
        attempt: 1,
        claim: claim ?? 'none',
      });
    } catch {
      // Telemetry never changes the decision.
    }
  }, []);

  const doSubmit = useCallback(async (intent: AutoTrialIntentV1 | null) => {
    if (!intent) return;
    const nowMs = Date.now();
    if (isAutoTrialIntentExpired(intent, nowMs)) {
      apply({ type: 'submit_blocked', reason: 'expired' });
      return;
    }
    const store = useUnfoldStore.getState();
    if (hasSupersedingUserSeries({
      intent,
      devotionalIds: store.devotionals.map((row) => row.id),
      inflightJob: readInflightGenerationJob(),
    })) {
      apply({ type: 'submit_blocked', reason: 'superseded' });
      return;
    }
    await flushUnfoldStorePersistAsync();
    const flushed = useUnfoldStore.getState();
    if (flushed.user) {
      await Promise.race([
        syncUserProfileToBackend(flushed.user, flushed.userUpdatedAt).catch(() => undefined),
        new Promise<void>((resolve) => {
          setTimeout(resolve, PROFILE_PUSH_CAP_MS);
        }),
      ]);
    }
    try {
      const reply = await submitGenerationJob({
        requestId: intent.requestId,
        dayNumber: 1,
        jobType: 'initial_arc',
        userContext: buildAutoTrialUserContext(flushed.user ?? {
          name: '',
          aboutMe: '',
          currentSituation: '',
          emotionalState: '',
          spiritualSeeking: '',
        }, intent),
      }) as {
        jobId: string;
        devotionalId?: string | null;
        autoTrialClaim?: 'created' | 'repointed' | 'existing' | 'resumed';
      };
      persistAcceptedSubmit(intent, reply.jobId, reply.devotionalId ?? null, reply.autoTrialClaim ?? null);
      if (!mountedRef.current) return;
      apply({
        type: 'submit_ok',
        jobId: reply.jobId,
        devotionalId: reply.devotionalId ?? '',
        claim: reply.autoTrialClaim ?? null,
      });
    } catch (err) {
      if (!mountedRef.current) return;
      apply({ type: 'submit_error', ...submitErrorFields(err), nowMs: Date.now() });
    }
  }, [apply, persistAcceptedSubmit]);

  const doPoll = useCallback(async (jobId: string, intent: AutoTrialIntentV1 | null) => {
    try {
      const response = await pollJobStatus(jobId);
      const evaluated = evaluateGenerationPoll({
        status: response.status,
        result: response.result,
        error: response.error,
        canRetry: response.canRetry,
        fallbackDevotionalId: intent?.devotionalId,
        dayNumber: 1,
        priorConsecutiveUnknown: 0,
      });
      if (evaluated.outcome.kind === 'complete') {
        lastCompleteRef.current = evaluated.outcome.result as InitialArcResult;
      }
      lastUnreachableRef.current = false;
      apply({ type: 'poll', outcome: evaluated.outcome });
    } catch (err) {
      if (classifyPollFailure(err) === 'job-gone') {
        if (intent?.devotionalId) {
          try {
            const pulled = await pullDevotionalContent(intent.devotionalId);
            const day1 = pulled.days.find((day) => day.dayNumber === 1);
            if (day1) {
              lastCompleteRef.current = {
                devotionalId: intent.devotionalId,
                devotionalDay: day1,
                seriesTitle: pulled.devotional && 'title' in pulled.devotional
                  ? String((pulled.devotional as { title?: string }).title ?? '')
                  : undefined,
              };
              runEffectsRef.current([{ type: 'land' }]);
              return;
            }
          } catch {
            // Fall through to job_gone.
          }
        }
        apply({ type: 'job_gone' });
        return;
      }
      lastUnreachableRef.current = true;
      apply({ type: 'unreachable' });
    }
  }, [apply]);

  const doRetry = useCallback(async (jobId: string, intent: AutoTrialIntentV1 | null) => {
    try {
      await retryJob(jobId);
      if (!readInflightGenerationJob() && intent) {
        recordInflight(jobId, intent);
      }
      if (mountedRef.current) apply({ type: 'poll', outcome: { kind: 'waiting' } });
    } catch (err) {
      const code = (err as Partial<ApiError> | null)?.code ?? null;
      apply({ type: 'retry_error', code });
    }
  }, [apply]);

  const runEffects = useCallback((effects: SeriesRevealEffect[]) => {
    let intent = readAutoTrialIntent();
    for (const effect of effects) {
      if (effect.type === 'submit') {
        void doSubmit(intent);
      } else if (effect.type === 'poll') {
        const elapsed = Date.now() - pollStartRef.current;
        const current = stateRef.current;
        const delay = hasPolledRef.current
          ? nextPollDelayMs(elapsed, {
              unreachable: lastUnreachableRef.current,
              generating: current.kind === 'generating',
              consecutiveNetworkErrors: current.kind === 'generating' ? current.consecutiveNetworkErrors : 0,
              hasCompletedResult: lastCompleteRef.current != null,
            })
          : 0;
        hasPolledRef.current = true;
        lastUnreachableRef.current = false;
        if (pollTimerRef.current) clearTimeout(pollTimerRef.current);
        pollTimerRef.current = setTimeout(() => {
          if (!mountedRef.current) return;
          void doPoll(effect.jobId, intent);
        }, delay);
      } else if (effect.type === 'retry_job') {
        void doRetry(effect.jobId, intent);
      } else if (effect.type === 'land') {
        const payload = lastCompleteRef.current;
        const user = useUnfoldStore.getState().user;
        if (payload) {
          applyInitialArcResult(payload, {
            user,
            devotionalLength: intent?.trialDays ?? user?.devotionalLength ?? 3,
            session: captureSyncSession(),
          });
        }
        if (intent?.devotionalId) {
          settleLandedAutoTrialSeries(intent, intent.devotionalId);
        }
        const landedId = payload?.devotionalId ?? intent?.devotionalId;
        if (landedId) apply({ type: 'landed', devotionalId: landedId });
      } else if (effect.type === 'transition') {
        transitionAutoTrialIntent(
          effect.to,
          { abandonReason: effect.reason, failureCode: effect.to === 'failed' ? 'failed' : undefined },
          { nowMs: Date.now() },
        );
        intent = readAutoTrialIntent();
      } else if (effect.type === 'redirect') {
        if (effect.to === '/(tabs)/(today)') router.replace('/(tabs)/(today)' as never);
        else if (effect.to === '/onboarding') router.replace('/onboarding' as never);
        else {
          router.replace({ pathname: '/onboarding', params: { startAt: 'themeType', flow: 'newSeries' } } as never);
        }
      } else if (effect.type === 'clear_inflight') {
        clearInflightGenerationJob();
      } else if (effect.type === 'clear_session') {
        useUnfoldStore.getState().clearGenerationSession();
      }
    }
  }, [apply, doPoll, doRetry, doSubmit, router]);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  // Assigned during render on purpose: the mount effect below dispatches the
  // machine's first effects through this ref, and an effect-time assignment
  // can run after it and drop the submit.
  runEffectsRef.current = runEffects;

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (pollTimerRef.current) clearTimeout(pollTimerRef.current);
      useUIState.getState().setSeriesRevealMountedIntentId(null);
    };
  }, []);

  useEffect(() => {
    if (intentId == null) return;
    const intent = readAutoTrialIntent();
    const inflight = readInflightGenerationJob();
    const store = useUnfoldStore.getState();
    const ui = useUIState.getState();
    if (intent && intent.intentId === intentId) {
      ui.setAutoTrialRevealGuardKey(buildRevealGuardKey(intent, inflight));
      ui.setSeriesRevealMountedIntentId(intent.intentId);
    } else {
      try {
        trackAutoTrialFailed({
          entry: intent?.entry ?? 'onboarding',
          phase: 'route',
          reason: 'intent_missing',
          status: 0,
          can_retry: false,
        });
      } catch {
        // Telemetry never changes the decision.
      }
    }
    const nowMs = Date.now();
    apply({
      type: 'mounted',
      intent,
      paramIntentId: intentId,
      hasCompletedOnboarding: store.user?.hasCompletedOnboarding === true,
      day1Landed: day1LandedFor(intent?.devotionalId ?? null, store.devotionals),
      expired: intent ? isAutoTrialIntentExpired(intent, nowMs) : false,
      supersededByUserSeries: intent
        ? hasSupersedingUserSeries({
            intent,
            devotionalIds: store.devotionals.map((row) => row.id),
            inflightJob: inflight,
          })
        : false,
    });
  }, [apply, intentId]);

  useEffect(() => {
    if (state.kind !== 'revealed' || revealedOnceRef.current) return;
    const intent = readAutoTrialIntent();
    if (!intent || intent.revealedAt) return;
    if (intent.status !== 'landed' && intent.status !== 'revealed') return;
    revealedOnceRef.current = true;
    transitionAutoTrialIntent('revealed', {}, { nowMs: Date.now() });
    try {
      trackAutoTrialRevealed({ entry: intent.entry, trial_days: intent.trialDays });
    } catch {
      // Telemetry never changes the decision.
    }
  }, [state]);

  const beginExit = (run: () => void) => {
    if (isExitingRef.current) return;
    isExitingRef.current = true;
    run();
  };

  const tryAgain = useCallback(() => {
    apply({ type: 'try_again', nowMs: Date.now() });
  }, [apply]);

  const goToToday = useCallback(() => {
    beginExit(() => {
      const current = stateRef.current;
      const nowMs = Date.now();
      if (current.kind === 'retry_exhausted') {
        transitionAutoTrialIntent('abandoned', { abandonReason: 'user_left_after_failure' }, { nowMs });
      } else if (current.kind === 'generating' || current.kind === 'failed') {
        markAutoTrialIntentDismissed({ nowMs });
      }
      const cleanup = resolveGoHomeCleanup({
        pendingJobId: jobIdOf(current),
        observedState: observedJobStateOf(current),
      });
      if (cleanup === 'clear') clearInflightGenerationJob();
      else markInflightJobLeftForHome();
      apply({ type: 'go_to_today' });
    });
  }, [apply]);

  const setUpSeries = useCallback(() => {
    beginExit(() => {
      clearInitialGenerationRequestId();
      clearInflightGenerationJob();
      apply({ type: 'set_up_series' });
    });
  }, [apply]);

  const beginDayOne = useCallback(() => {
    beginExit(() => {
      const intent = readAutoTrialIntent();
      router.replace({
        pathname: '/(tabs)/(today)/reading',
        params: { devotionalId: intent?.devotionalId ?? '' },
      } as never);
    });
  }, [router]);

  return { state, tryAgain, goToToday, setUpSeries, beginDayOne };
}
