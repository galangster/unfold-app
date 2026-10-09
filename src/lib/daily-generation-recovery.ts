import {
  ApiError,
  findDayJob,
  normalizeGenerationResult,
  pollJobStatus,
  recoverCompletedGenerationResult,
  retryJob,
  submitGenerationJob,
  type GenerationJobResponse,
} from './generation-api';
import { isSyncSessionCurrent, SyncSessionInvalidatedError } from './generation-session';
import type { DevotionalDay } from './store';
import { drainSyncChange, peekSyncOutbox } from './sync-outbox';
import type { SyncPushChange } from './sync-types';

export const DAILY_GENERATION_POLL_INTERVAL_MS = 15_000;
export const DAILY_GENERATION_SLOW_AFTER_MS = 2 * 60_000;
/** Longest wait between status requests while they keep failing. */
export const DAILY_GENERATION_POLL_BACKOFF_MAX_MS = 60_000;
/** Failed status requests in a row before the reader is told. Polling goes on. */
export const DAILY_GENERATION_FAILED_POLLS_BEFORE_NOTICE = 3;
/** How long a refused submit waits for the queued read the server needs. */
export const DAILY_GENERATION_READ_SYNC_TIMEOUT_MS = 5_000;

export type DailyGenerationRecoveryState =
  | { status: 'idle'; discovered?: true }
  | { status: 'checking'; operation: 'discover' | 'retry' }
  | { status: 'running' | 'slow'; jobId: string }
  // retriesExhausted: the server refuses another retry of this job. Only a
  // server reopen on a later day runs it again, so checks keep looking.
  | { status: 'failed'; jobId: string; canRetry: boolean; failureKind: 'job' | 'invalid-result'; retriesExhausted?: true }
  | { status: 'offline'; jobId?: string }
  // read-sync-pending: the server has not yet received the read of the day
  // before, and its pacing gate waits for it.
  | { status: 'blocked'; reason: 'day-not-ready' | 'read-sync-pending' | 'series-read-only' }
  | { status: 'service-error'; jobId?: string }
  | { status: 'complete'; jobId?: string };

export interface DailyGenerationRecoveryDependencies {
  findDayJob: typeof findDayJob;
  submitGenerationJob: typeof submitGenerationJob;
  pollJobStatus: typeof pollJobStatus;
  recoverCompletedGenerationResult: typeof recoverCompletedGenerationResult;
  retryJob: typeof retryJob;
  peekSyncOutbox: typeof peekSyncOutbox;
  drainSyncChange: typeof drainSyncChange;
  sleep: (ms: number) => Promise<void>;
  now: () => number;
  isSessionCurrent: (session: number) => boolean;
}

export interface DailyGenerationRecoveryController {
  start: () => Promise<void>;
  checkAgain: () => Promise<void>;
  retry: () => Promise<void>;
  setOnline: (online: boolean) => Promise<void>;
  cancel: () => void;
}

type ControllerOptions = {
  devotionalId: string;
  dayNumber: number;
  session: number;
  canMutate: boolean;
  onDay: (devotionalId: string, day: DevotionalDay) => void;
  onState: (state: DailyGenerationRecoveryState) => void;
  dependencies?: Partial<DailyGenerationRecoveryDependencies>;
};

const defaultDependencies: DailyGenerationRecoveryDependencies = {
  findDayJob,
  submitGenerationJob,
  pollJobStatus,
  recoverCompletedGenerationResult,
  retryJob,
  peekSyncOutbox,
  drainSyncChange,
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  now: () => Date.now(),
  isSessionCurrent: isSyncSessionCurrent,
};

const submissionFlights = new Map<string, Promise<Pick<GenerationJobResponse, 'jobId' | 'status' | 'devotionalId'>>>();
const retryFlights = new Map<string, Promise<{ jobId: string; status: string }>>();
const demandFlights = new Map<string, Promise<Pick<GenerationJobResponse, 'jobId' | 'status' | 'devotionalId'>>>();
const demandAttempts = new Set<string>();
const knownJobs = new Map<string, GenerationJobResponse>();

function isActiveStatus(status: string): status is 'pending' | 'processing' | 'batched' {
  return status === 'pending' || status === 'processing' || status === 'batched';
}

function isSessionCancellation(error: unknown): boolean {
  return error instanceof SyncSessionInvalidatedError;
}

/**
 * A network error, a client timeout or a 5xx is not a verdict on the job,
 * which keeps running on the server. A 4xx is: 400/404 mean the job is gone,
 * and a 429 hands the wait to the shared read budget.
 */
function isTransientRequestFailure(error: unknown): boolean {
  return !(error instanceof ApiError) || error.status >= 500;
}

function nextPollDelayMs(failedPolls: number): number {
  return Math.min(DAILY_GENERATION_POLL_INTERVAL_MS * 2 ** failedPolls, DAILY_GENERATION_POLL_BACKOFF_MAX_MS);
}

function isWaitingOnRead(error: unknown): boolean {
  return error instanceof ApiError && error.code === 'DAY_NOT_READY' && error.reason === 'ahead_of_reading';
}

function isQueuedReadOf(change: SyncPushChange, devotionalId: string, dayNumber: number): boolean {
  return change.table === 'devotional_days'
    && !change.deleted
    && change.data.devotionalId === devotionalId
    && change.data.dayNumber === dayNumber
    && change.data.isRead === true;
}

function jobMatchesDay(job: GenerationJobResponse, devotionalId: string, dayNumber: number): boolean {
  return job.jobType === 'day'
    && job.devotionalId === devotionalId
    && job.dayNumber === dayNumber;
}

function resultMatchesDay(job: GenerationJobResponse, devotionalId: string, dayNumber: number): boolean {
  const result = job.result;
  if (!result?.devotionalDay) return false;
  return (result.devotionalId == null || result.devotionalId === devotionalId)
    && (result.devotionalDay.devotionalId == null || result.devotionalDay.devotionalId === devotionalId)
    && (result.devotionalDay.dayNumber == null || result.devotionalDay.dayNumber === dayNumber);
}

export function createDailyGenerationRecovery(options: ControllerOptions): DailyGenerationRecoveryController {
  const deps: DailyGenerationRecoveryDependencies = { ...defaultDependencies, ...options.dependencies };
  const { devotionalId, dayNumber, session, canMutate, onDay, onState } = options;
  const identityKey = `${session}:${devotionalId}:${dayNumber}`;
  let currentState: DailyGenerationRecoveryState = { status: 'idle' };
  let online = true;
  let cancelled = false;
  let checkFlight: Promise<void> | null = null;
  let retryFlight: Promise<void> | null = null;
  let pollToken = 0;

  const isCurrent = () => !cancelled && deps.isSessionCurrent(session);
  const publish = (state: DailyGenerationRecoveryState) => {
    if (!isCurrent()) return;
    currentState = state;
    onState(state);
  };

  const markConnectionLost = (jobId?: string) => {
    if (!isCurrent()) return;
    publish({ status: 'offline', ...(jobId ? { jobId } : {}) });
  };

  const markRequestFailure = (error: unknown, jobId?: string) => {
    if (!isCurrent()) return;
    if (!(error instanceof ApiError)) {
      markConnectionLost(jobId);
      return;
    }
    if (error.code === 'DAY_NOT_READY') {
      publish({ status: 'blocked', reason: isWaitingOnRead(error) ? 'read-sync-pending' : 'day-not-ready' });
      return;
    }
    if (error.code === 'SERIES_ARCHIVED' || error.code === 'SERIES_NOT_ACTIVE') {
      publish({ status: 'blocked', reason: 'series-read-only' });
      return;
    }
    publish({ status: 'service-error', ...(jobId ? { jobId } : {}) });
  };

  const markInvalid = (jobId: string) => {
    knownJobs.delete(identityKey);
    publish({
      status: 'failed',
      jobId,
      canRetry: false,
      failureKind: 'invalid-result',
    });
  };

  const poll = (initialJob: GenerationJobResponse) => {
    const token = ++pollToken;
    const firstSeenAt = deps.now();
    void (async () => {
      let job = initialJob;
      // A failed status request says nothing about the job, so the loop backs
      // off and keeps asking. The reader is told only after a few in a row.
      let failedPolls = 0;
      while (isCurrent() && online && token === pollToken && isActiveStatus(job.status)) {
        await deps.sleep(nextPollDelayMs(failedPolls));
        if (!isCurrent() || !online || token !== pollToken) return;
        try {
          job = await deps.pollJobStatus(job.jobId, session);
        } catch (error) {
          // A newer check owns the state now; this loop's failure is stale.
          if (isSessionCancellation(error) || !isCurrent() || token !== pollToken) return;
          if (!isTransientRequestFailure(error)) {
            markRequestFailure(error, initialJob.jobId);
            return;
          }
          failedPolls += 1;
          if (failedPolls >= DAILY_GENERATION_FAILED_POLLS_BEFORE_NOTICE) {
            markRequestFailure(error, initialJob.jobId);
          }
          continue;
        }
        failedPolls = 0;
        if (!isCurrent() || token !== pollToken) return;
        await observe(job, firstSeenAt);
      }
    })();
  };

  async function demandBatchedJob(job: GenerationJobResponse): Promise<void> {
    const demandKey = `${session}:${job.jobId}`;
    demandAttempts.add(demandKey);
    const shared = demandFlights.get(demandKey) ?? deps.submitGenerationJob({
      devotionalId,
      dayNumber,
      jobType: 'day',
      session,
    });
    demandFlights.set(demandKey, shared);

    try {
      const demanded = await shared;
      if (!isCurrent()) return;
      const authoritative = await deps.pollJobStatus(demanded.jobId, session);
      if (!isCurrent()) return;
      await observe(authoritative);
    } catch (error) {
      if (isSessionCancellation(error) || !isCurrent()) return;
      if (error instanceof ApiError && error.status === 409 && error.existingJobId) {
        try {
          const terminal = await deps.pollJobStatus(error.existingJobId, session);
          if (!isCurrent()) return;
          await observe(terminal);
          return;
        } catch (pollError) {
          if (isSessionCancellation(pollError) || !isCurrent()) return;
          markRequestFailure(pollError, job.jobId);
          return;
        }
      }
      markRequestFailure(error, job.jobId);
    } finally {
      if (demandFlights.get(demandKey) === shared) demandFlights.delete(demandKey);
    }
  }

  async function observe(job: GenerationJobResponse, firstSeenAt = deps.now()): Promise<void> {
    if (!isCurrent()) return;
    if (!jobMatchesDay(job, devotionalId, dayNumber)) {
      markInvalid(job.jobId);
      return;
    }

    knownJobs.set(identityKey, job);
    const demandKey = `${session}:${job.jobId}`;
    if (job.status === 'batched' && canMutate && !demandAttempts.has(demandKey)) {
      await demandBatchedJob(job);
      return;
    }
    if (job.status === 'complete') {
      pollToken += 1;
      if (!resultMatchesDay(job, devotionalId, dayNumber)) {
        markInvalid(job.jobId);
        return;
      }
      try {
        const result = normalizeGenerationResult(job.result!, devotionalId, dayNumber);
        if (!isCurrent()) return;
        onDay(devotionalId, result.devotionalDay);
        knownJobs.delete(identityKey);
        publish({ status: 'complete', jobId: job.jobId });
      } catch {
        if (isCurrent()) markInvalid(job.jobId);
      }
      return;
    }

    if (job.status === 'failed') {
      pollToken += 1;
      publish({
        status: 'failed',
        jobId: job.jobId,
        canRetry: canMutate && job.canRetry !== false,
        failureKind: 'job',
        ...(job.canRetry === false ? { retriesExhausted: true as const } : {}),
      });
      return;
    }

    if (isActiveStatus(job.status)) {
      const createdAt = job.createdAt ? Date.parse(job.createdAt) : firstSeenAt;
      const runningSince = Number.isFinite(createdAt) ? createdAt : firstSeenAt;
      publish({
        status: deps.now() - runningSince >= DAILY_GENERATION_SLOW_AFTER_MS ? 'slow' : 'running',
        jobId: job.jobId,
      });
      poll(job);
      return;
    }

    markInvalid(job.jobId);
  }

  const submitShared = (): Promise<Pick<GenerationJobResponse, 'jobId' | 'status' | 'devotionalId'>> => {
    const existing = submissionFlights.get(identityKey);
    if (existing) return existing;
    const flight = deps.submitGenerationJob({ devotionalId, dayNumber, jobType: 'day', session });
    submissionFlights.set(identityKey, flight);
    void flight.finally(() => {
      if (submissionFlights.get(identityKey) === flight) submissionFlights.delete(identityKey);
    }).catch(() => undefined);
    return flight;
  };

  // The pacing gate counts only reads the server holds, so a read of the day
  // before that is still queued here makes the server refuse this day.
  const findQueuedPreviousRead = (): SyncPushChange | undefined => (
    dayNumber > 1
      ? deps.peekSyncOutbox().find((change) => isQueuedReadOf(change, devotionalId, dayNumber - 1))
      : undefined
  );

  /** True once the queued read has reached the server, within a short wait. */
  const saveQueuedRead = async (read: SyncPushChange): Promise<boolean> => {
    const acknowledged = await deps.drainSyncChange(read, session, {
      deadlineAt: deps.now() + DAILY_GENERATION_READ_SYNC_TIMEOUT_MS,
    });
    if (acknowledged) return acknowledged.status !== 'rejected';
    // A queued record leaves the outbox only once the server takes it, so a
    // read that is gone landed before this wait could observe it.
    return !deps.peekSyncOutbox().some((change) => change.table === read.table && change.id === read.id);
  };

  const discover = async (readSyncAttempted = false): Promise<void> => {
    if (!isCurrent()) return;
    if (!online) {
      markConnectionLost(currentState.status === 'running' || currentState.status === 'slow' ? currentState.jobId : undefined);
      return;
    }
    publish({ status: 'checking', operation: 'discover' });

    try {
      const discovered = await deps.findDayJob(devotionalId, dayNumber, session);
      if (!isCurrent()) return;
      if (discovered) {
        await observe(discovered);
        return;
      }

      if (dayNumber === 1) {
        const recovered = await deps.recoverCompletedGenerationResult({
          devotionalId,
          dayNumber,
          session,
        });
        if (!isCurrent()) return;
        if (recovered?.devotionalDay) {
          if (recovered.devotionalId !== devotionalId || recovered.devotionalDay.dayNumber !== dayNumber) {
            markInvalid('completed-day-1');
            return;
          }
          onDay(devotionalId, recovered.devotionalDay);
          knownJobs.delete(identityKey);
          publish({ status: 'complete' });
          return;
        }
      }

      const known = knownJobs.get(identityKey);
      if (known) {
        try {
          const authoritative = await deps.pollJobStatus(known.jobId, session);
          if (!isCurrent()) return;
          await observe({
            ...authoritative,
            devotionalId: authoritative.devotionalId ?? known.devotionalId,
            dayNumber: authoritative.dayNumber ?? known.dayNumber,
            jobType: authoritative.jobType ?? known.jobType,
          });
          return;
        } catch (error) {
          if (isSessionCancellation(error) || !isCurrent()) return;
          if (!(error instanceof ApiError) || (error.status !== 400 && error.status !== 404)) {
            markRequestFailure(error, known.jobId);
            return;
          }
          knownJobs.delete(identityKey);
        }
      }

      if (!canMutate) {
        publish({ status: 'idle', discovered: true });
        return;
      }

      const queuedRead = readSyncAttempted ? undefined : findQueuedPreviousRead();
      try {
        const submitted = await submitShared();
        if (!isCurrent()) return;
        const submittedJob: GenerationJobResponse = {
          ...submitted,
          status: isActiveStatus(submitted.status) ? submitted.status : 'pending',
          devotionalId,
          dayNumber,
          jobType: 'day',
          createdAt: new Date(deps.now()).toISOString(),
        };
        knownJobs.set(identityKey, submittedJob);
        await observe(submittedJob);
      } catch (error) {
        if (isSessionCancellation(error) || !isCurrent()) return;
        if (error instanceof ApiError && error.status === 409 && error.existingJobId) {
          const adopted = await deps.pollJobStatus(error.existingJobId, session);
          if (!isCurrent()) return;
          await observe(adopted);
          return;
        }
        // Wait briefly for that read, then check once more. One re-check per
        // discovery keeps a read the server keeps refusing from spending the
        // generate-day budget.
        if (queuedRead && isWaitingOnRead(error)) {
          publish({ status: 'blocked', reason: 'read-sync-pending' });
          const saved = await saveQueuedRead(queuedRead);
          if (!isCurrent()) return;
          if (saved) {
            await discover(true);
            return;
          }
        }
        markRequestFailure(error);
      }
    } catch (error) {
      if (isSessionCancellation(error) || !isCurrent()) return;
      markRequestFailure(error, currentState.status === 'running' || currentState.status === 'slow' ? currentState.jobId : undefined);
    }
  };

  const checkAgain = (): Promise<void> => {
    if (checkFlight) return checkFlight;
    pollToken += 1;
    const flight = discover();
    checkFlight = flight;
    void flight.finally(() => {
      if (checkFlight === flight) checkFlight = null;
    }).catch(() => undefined);
    return flight;
  };

  const retry = (): Promise<void> => {
    if (retryFlight) return retryFlight;
    if (currentState.status !== 'failed' || !currentState.canRetry || currentState.failureKind !== 'job') {
      return Promise.resolve();
    }
    if (!online) {
      markConnectionLost(currentState.jobId);
      return Promise.resolve();
    }
    const failedJobId = currentState.jobId;
    const retryKey = `${session}:${failedJobId}`;
    publish({ status: 'checking', operation: 'retry' });
    const shared = retryFlights.get(retryKey) ?? deps.retryJob(failedJobId, session);
    retryFlights.set(retryKey, shared);
    const flight = (async () => {
      try {
        const retried = await shared;
        if (!isCurrent()) return;
        const next: GenerationJobResponse = {
          jobId: retried.jobId,
          status: isActiveStatus(retried.status) ? retried.status : 'pending',
          jobType: 'day',
          devotionalId,
          dayNumber,
          createdAt: new Date(deps.now()).toISOString(),
        };
        knownJobs.set(identityKey, next);
        await observe(next);
      } catch (error) {
        if (isSessionCancellation(error) || !isCurrent()) return;
        // 409: the job is no longer this retry's to take. Another check already
        // retried it, or its retries are spent. Show what the server holds now.
        if (error instanceof ApiError && error.status === 409) {
          await checkAgain();
          return;
        }
        markRequestFailure(error, failedJobId);
      } finally {
        if (retryFlights.get(retryKey) === shared) retryFlights.delete(retryKey);
      }
    })();
    retryFlight = flight;
    void flight.finally(() => {
      if (retryFlight === flight) retryFlight = null;
    }).catch(() => undefined);
    return flight;
  };

  return {
    start: checkAgain,
    checkAgain,
    retry,
    setOnline: async (nextOnline) => {
      const reconnected = !online && nextOnline;
      online = nextOnline;
      if (!online) {
        pollToken += 1;
        markConnectionLost(currentState.status === 'running' || currentState.status === 'slow' ? currentState.jobId : undefined);
      } else if (reconnected) {
        await checkAgain();
      }
    },
    cancel: () => {
      cancelled = true;
      pollToken += 1;
    },
  };
}

export function resetDailyGenerationRecoveryForTesting(): void {
  submissionFlights.clear();
  retryFlights.clear();
  demandFlights.clear();
  demandAttempts.clear();
  knownJobs.clear();
}
