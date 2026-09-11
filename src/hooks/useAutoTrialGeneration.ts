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
  askNotificationPermissionInContext,
  readNotificationPermissionState,
} from '@/lib/notification-ask';
import {
  reduceSeriesReveal,
  type SeriesRevealEffect,
  type SeriesRevealEvent,
  type SeriesRevealState,
} from '@/lib/series-reveal-machine';
import { flushUnfoldStorePersistAsync, useUnfoldStore } from '@/lib/store';
import { useUIState } from '@/lib/ui-state';
import { syncUserProfileToBackend } from '@/lib/user-profile-sync';

export const PROFILE_PUSH_CAP_MS = 5_000;

function day1LandedFor(devotionalId: string | null): boolean {
  if (!devotionalId) return false;
  const series = useUnfoldStore.getState().devotionals.find((row) => row.id === devotionalId);
  return Boolean(series?.days.some((day) => day.dayNumber === 1));
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
  const message = err instanceof Error ? err.message : '';
  const reasons = ['trial_expired', 'switch_off', 'platform', 'trial_length'] as const;
  const matched = reasons.find((reason) => rawCode === reason || message.includes(reason));
  return { status, code: matched ?? rawCode, existingJobId };
}

async function maybeExitAsk(): Promise<void> {
  try {
    const permission = await readNotificationPermissionState();
    if (permission === 'undetermined') {
      await askNotificationPermissionInContext({
        trigger: 'series_reveal',
        registration: 'background',
      });
    }
  } catch {
    // The OS ask never throws to the caller.
  }
}

export function useAutoTrialGeneration(intentId: string): {
  state: SeriesRevealState;
  tryAgain(): void;
  goToToday(): void;
  setUpSeries(): void;
  beginDayOne(): void;
} {
  const router = useRouter();
  const [state, setState] = useState<SeriesRevealState>({ kind: 'resolving' });
  const stateRef = useRef(state);
  stateRef.current = state;
  const mountedRef = useRef(true);
  const isExitingRef = useRef(false);
  const pollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pollStartRef = useRef(Date.now());
  const lastUnreachableRef = useRef(false);
  const lastCompleteRef = useRef<InitialArcResult | null>(null);
  const revealedOnceRef = useRef(false);

  const runEffectsRef = useRef<(effects: SeriesRevealEffect[]) => void>(() => undefined);

  const apply = useCallback((event: SeriesRevealEvent) => {
    const next = reduceSeriesReveal(stateRef.current, event);
    stateRef.current = next.state;
    if (mountedRef.current) setState(next.state);
    runEffectsRef.current(next.effects);
    return next;
  }, []);

  const persistAcceptedSubmit = useCallback((
    jobId: string,
    devotionalId: string | null,
    claim: 'created' | 'repointed' | 'existing' | 'resumed' | null,
  ) => {
    const intent = readAutoTrialIntent();
    if (!intent) return;
    transitionAutoTrialIntent(
      'submitted',
      { jobId, ...(devotionalId ? { devotionalId } : {}) },
      { nowMs: Date.now() },
    );
    writeInflightGenerationJob({
      jobId,
      ...(devotionalId ? { devotionalId } : {}),
      submittedAt: Date.now(),
      leftForHome: intent.dismissedAt != null,
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

  const doSubmit = useCallback(async () => {
    const intent = readAutoTrialIntent();
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
    if (store.user && store.user.devotionalLength !== intent.trialDays) {
      store.updateUser({ devotionalLength: intent.trialDays });
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
      persistAcceptedSubmit(reply.jobId, reply.devotionalId ?? null, reply.autoTrialClaim ?? null);
      if (!mountedRef.current) return;
      apply({
        type: 'submit_ok',
        jobId: reply.jobId,
        devotionalId: reply.devotionalId ?? '',
        claim: reply.autoTrialClaim ?? null,
      });
    } catch (err) {
      if (!mountedRef.current && !(err instanceof Error)) return;
      apply({ type: 'submit_error', ...submitErrorFields(err) });
    }
  }, [apply, persistAcceptedSubmit]);

  const doPoll = useCallback(async (jobId: string) => {
    try {
      const response = await pollJobStatus(jobId);
      const evaluated = evaluateGenerationPoll({
        status: response.status,
        result: response.result,
        error: response.error,
        canRetry: response.canRetry,
        fallbackDevotionalId: readAutoTrialIntent()?.devotionalId,
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
        const intent = readAutoTrialIntent();
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
              applyInitialArcResult(lastCompleteRef.current, {
                user: useUnfoldStore.getState().user,
                devotionalLength: intent.trialDays,
                session: captureSyncSession(),
              });
              apply({ type: 'landed', devotionalId: intent.devotionalId });
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

  const doRetry = useCallback(async (jobId: string) => {
    try {
      await retryJob(jobId);
      const intent = readAutoTrialIntent();
      if (!readInflightGenerationJob() && intent) {
        writeInflightGenerationJob({
          jobId,
          ...(intent.devotionalId ? { devotionalId: intent.devotionalId } : {}),
          submittedAt: Date.now(),
          leftForHome: intent.dismissedAt != null,
        });
      }
      if (mountedRef.current) apply({ type: 'poll', outcome: { kind: 'waiting' } });
    } catch (err) {
      const code = (err as Partial<ApiError> | null)?.code ?? null;
      apply({ type: 'retry_error', code });
    }
  }, [apply]);

  const runEffects = useCallback((effects: SeriesRevealEffect[]) => {
    for (const effect of effects) {
      if (effect.type === 'submit') {
        void doSubmit();
      } else if (effect.type === 'poll') {
        const elapsed = Date.now() - pollStartRef.current;
        const delay = lastUnreachableRef.current
          ? getNextPollDelayMs(elapsed) * 2
          : stateRef.current.kind === 'generating' && stateRef.current.consecutiveNetworkErrors === 0
            && !lastCompleteRef.current
            ? 0
            : getNextPollDelayMs(elapsed);
        lastUnreachableRef.current = false;
        if (pollTimerRef.current) clearTimeout(pollTimerRef.current);
        pollTimerRef.current = setTimeout(() => {
          void doPoll(effect.jobId);
        }, delay);
      } else if (effect.type === 'retry_job') {
        void doRetry(effect.jobId);
      } else if (effect.type === 'land') {
        const intent = readAutoTrialIntent();
        const payload = lastCompleteRef.current;
        const user = useUnfoldStore.getState().user;
        if (payload) {
          applyInitialArcResult(payload, {
            user,
            devotionalLength: intent?.trialDays ?? user?.devotionalLength ?? 3,
            session: captureSyncSession(),
          });
        } else if (intent?.devotionalId) {
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
    const intent = readAutoTrialIntent();
    const inflight = readInflightGenerationJob();
    if (intent && intent.intentId === intentId) {
      useUIState.getState().setAutoTrialRevealGuardKey(buildRevealGuardKey(intent, inflight));
      useUIState.getState().setSeriesRevealMountedIntentId(intent.intentId);
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
      hasCompletedOnboarding: useUnfoldStore.getState().user?.hasCompletedOnboarding === true,
      day1Landed: day1LandedFor(intent?.devotionalId ?? null),
      expired: intent ? isAutoTrialIntentExpired(intent, nowMs) : false,
      supersededByUserSeries: intent
        ? hasSupersedingUserSeries({
            intent,
            devotionalIds: useUnfoldStore.getState().devotionals.map((row) => row.id),
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

  const tryAgain = useCallback(() => {
    apply({ type: 'try_again', nowMs: Date.now() });
  }, [apply]);

  const goToToday = useCallback(() => {
    if (isExitingRef.current) return;
    isExitingRef.current = true;
    void (async () => {
      // Fire the one-time exit ask and leave at once; the OS prompt overlays
      // the next screen and registration finishes in the background (§9.4).
      void maybeExitAsk();
      const current = stateRef.current;
      if (current.kind === 'retry_exhausted') {
        transitionAutoTrialIntent('abandoned', { abandonReason: 'user_left_after_failure' }, { nowMs: Date.now() });
        clearInflightGenerationJob();
      } else {
        if (
          (current.kind === 'generating' && current.jobId)
          || (current.kind === 'failed' && current.jobId)
        ) {
          markInflightJobLeftForHome();
        }
        if (current.kind === 'generating' || current.kind === 'failed') {
          markAutoTrialIntentDismissed({ nowMs: Date.now() });
        }
      }
      router.replace('/(tabs)/(today)' as never);
    })();
  }, [router]);

  const setUpSeries = useCallback(() => {
    if (isExitingRef.current) return;
    isExitingRef.current = true;
    void (async () => {
      // Fire the one-time exit ask and leave at once; the OS prompt overlays
      // the next screen and registration finishes in the background (§9.4).
      void maybeExitAsk();
      transitionAutoTrialIntent('abandoned', { abandonReason: 'user_setup_fallback' }, { nowMs: Date.now() });
      clearInitialGenerationRequestId();
      clearInflightGenerationJob();
      router.replace({ pathname: '/onboarding', params: { startAt: 'themeType', flow: 'newSeries' } } as never);
    })();
  }, [router]);

  const beginDayOne = useCallback(() => {
    if (isExitingRef.current) return;
    isExitingRef.current = true;
    void (async () => {
      // Fire the one-time exit ask and leave at once; the OS prompt overlays
      // the next screen and registration finishes in the background (§9.4).
      void maybeExitAsk();
      const intent = readAutoTrialIntent();
      router.replace({
        pathname: '/(tabs)/(today)/reading',
        params: { devotionalId: intent?.devotionalId ?? '' },
      } as never);
    })();
  }, [router]);

  return { state, tryAgain, goToToday, setUpSeries, beginDayOne };
}
