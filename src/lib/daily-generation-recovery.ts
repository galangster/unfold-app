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

export const DAILY_GENERATION_POLL_INTERVAL_MS = 15_000;
export const DAILY_GENERATION_SLOW_AFTER_MS = 2 * 60_000;

export type DailyGenerationRecoveryState =
  | { status: 'idle' }
  | { status: 'checking'; operation: 'discover' | 'retry' }
  | { status: 'running' | 'slow'; jobId: string }
  | { status: 'failed'; jobId: string; canRetry: boolean; failureKind: 'job' | 'invalid-result' }
  | { status: 'offline'; jobId?: string }
  | { status: 'blocked'; reason: 'day-not-ready' | 'series-read-only' }
  | { status: 'service-error'; jobId?: string }
  | { status: 'complete'; jobId?: string };

export interface DailyGenerationRecoveryDependencies {
  findDayJob: typeof findDayJob;
  submitGenerationJob: typeof submitGenerationJob;
  pollJobStatus: typeof pollJobStatus;
  recoverCompletedGenerationResult: typeof recoverCompletedGenerationResult;
  retryJob: typeof retryJob;
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
      publish({ status: 'blocked', reason: 'day-not-ready' });
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
      while (isCurrent() && online && token === pollToken && isActiveStatus(job.status)) {
        await deps.sleep(DAILY_GENERATION_POLL_INTERVAL_MS);
        if (!isCurrent() || !online || token !== pollToken) return;
        try {
          job = await deps.pollJobStatus(job.jobId, session);
        } catch (error) {
          if (isSessionCancellation(error) || !isCurrent()) return;
          markRequestFailure(error, initialJob.jobId);
          return;
        }
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

  const discover = async (): Promise<void> => {
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
        publish({ status: 'idle' });
        return;
      }

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
