jest.mock('../mmkv-storage', () => ({
  mmkvStorage: { getItem: jest.fn(() => null) },
}));
jest.mock('../api-config', () => ({
  PRIMARY_BACKEND_URL: 'https://backend.test',
  getAuthHeaders: jest.fn(async () => ({ 'X-Device-ID': 'test-device-id' })),
}));

import {
  createDailyGenerationRecovery,
  resetDailyGenerationRecoveryForTesting,
  type DailyGenerationRecoveryDependencies,
  type DailyGenerationRecoveryState,
} from '../daily-generation-recovery';
import { ApiError, type GenerationJobResponse } from '../generation-api';

function generatedDay(dayNumber = 2, devotionalId = 'devo-1') {
  return {
    id: `server-${dayNumber}`,
    devotionalId,
    dayNumber,
    title: `Day ${dayNumber}`,
    scriptureReference: 'John 1:1',
    scriptureText: 'In the beginning was the Word.',
    bodyText: 'Body',
    quotableLine: 'Line',
    isRead: false,
  };
}

function job(overrides: Partial<GenerationJobResponse> = {}): GenerationJobResponse {
  return {
    jobId: 'job-1',
    jobType: 'day',
    status: 'processing',
    devotionalId: 'devo-1',
    dayNumber: 2,
    createdAt: '2026-09-08T11:59:30.000Z',
    ...overrides,
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

function setup(overrides: Partial<DailyGenerationRecoveryDependencies> = {}) {
  const states: DailyGenerationRecoveryState[] = [];
  const onDay = jest.fn();
  const pendingSleep = deferred<void>();
  const dependencies: DailyGenerationRecoveryDependencies = {
    findDayJob: jest.fn(async () => null),
    submitGenerationJob: jest.fn(async () => ({ jobId: 'job-new', status: 'pending' as const, devotionalId: 'devo-1' })),
    pollJobStatus: jest.fn(async () => job()),
    recoverCompletedGenerationResult: jest.fn(async () => null),
    retryJob: jest.fn(async () => ({ jobId: 'job-1', status: 'pending' })),
    sleep: jest.fn(() => pendingSleep.promise),
    now: () => new Date('2026-09-08T12:00:00.000Z').getTime(),
    isSessionCurrent: () => true,
    ...overrides,
  };
  const controller = createDailyGenerationRecovery({
    devotionalId: 'devo-1',
    dayNumber: 2,
    session: 7,
    canMutate: true,
    dependencies,
    onDay,
    onState: (state) => states.push(state),
  });
  return { controller, dependencies, states, onDay, pendingSleep };
}

describe('daily generation recovery', () => {
  beforeEach(() => {
    resetDailyGenerationRecoveryForTesting();
  });

  it('applies a completed discovered job with canonical day identity', async () => {
    const result = job({
      status: 'complete',
      result: { devotionalDay: generatedDay(), devotionalId: 'devo-1' },
    });
    const { controller, dependencies, states, onDay } = setup({
      findDayJob: jest.fn(async () => result),
    });

    await controller.start();

    expect(onDay).toHaveBeenCalledWith('devo-1', expect.objectContaining({
      id: 'day-devo-1-2',
      devotionalId: 'devo-1',
      dayNumber: 2,
    }));
    expect(states.at(-1)?.status).toBe('complete');
    expect(dependencies.submitGenerationJob).not.toHaveBeenCalled();
  });

  it('applies a day when an active job completes', async () => {
    const completed = job({
      status: 'complete',
      result: { devotionalDay: generatedDay(), devotionalId: 'devo-1' },
    });
    const { controller, dependencies, onDay, pendingSleep } = setup({
      findDayJob: jest.fn(async () => job({ status: 'processing' })),
      pollJobStatus: jest.fn(async () => completed),
    });

    await controller.start();
    pendingSleep.resolve();
    await Promise.resolve();
    await Promise.resolve();

    expect(dependencies.pollJobStatus).toHaveBeenCalledWith('job-1', 7);
    expect(onDay).toHaveBeenCalledWith('devo-1', expect.objectContaining({ dayNumber: 2 }));
  });

  it('shows a terminal failed job and does not submit a replacement', async () => {
    const { controller, dependencies, states } = setup({
      findDayJob: jest.fn(async () => job({ status: 'failed', error: 'worker failed', canRetry: true })),
    });

    await controller.start();

    expect(states.at(-1)).toMatchObject({ status: 'failed', jobId: 'job-1', canRetry: true });
    expect(dependencies.submitGenerationJob).not.toHaveBeenCalled();
  });

  it('recovers completed initial-arc day one before submitting a replacement day job', async () => {
    const recoveredDay = generatedDay(1);
    const states: DailyGenerationRecoveryState[] = [];
    const onDay = jest.fn();
    const dependencies: DailyGenerationRecoveryDependencies = {
      findDayJob: jest.fn(async () => null),
      submitGenerationJob: jest.fn(async () => ({ jobId: 'job-new', status: 'pending' as const, devotionalId: 'devo-1' })),
      pollJobStatus: jest.fn(async () => job()),
      retryJob: jest.fn(async () => ({ jobId: 'job-1', status: 'pending' })),
      recoverCompletedGenerationResult: jest.fn(async () => ({ devotionalId: 'devo-1', devotionalDay: recoveredDay })),
      sleep: jest.fn(() => new Promise(() => undefined)),
      now: () => Date.now(),
      isSessionCurrent: () => true,
    };
    const controller = createDailyGenerationRecovery({
      devotionalId: 'devo-1',
      dayNumber: 1,
      session: 7,
      canMutate: true,
      dependencies,
      onDay,
      onState: (state) => states.push(state),
    });

    await controller.start();

    expect(onDay).toHaveBeenCalledWith('devo-1', recoveredDay);
    expect(states.at(-1)?.status).toBe('complete');
    expect(dependencies.submitGenerationJob).not.toHaveBeenCalled();
  });

  it('discovers for a non-premium reader without submitting or retrying', async () => {
    const dependencies: DailyGenerationRecoveryDependencies = {
      findDayJob: jest.fn(async () => null),
      submitGenerationJob: jest.fn(async () => ({ jobId: 'job-new', status: 'pending' as const, devotionalId: 'devo-1' })),
      pollJobStatus: jest.fn(async () => job()),
      retryJob: jest.fn(async () => ({ jobId: 'job-1', status: 'pending' })),
      recoverCompletedGenerationResult: jest.fn(async () => null),
      sleep: jest.fn(() => new Promise(() => undefined)),
      now: () => Date.now(),
      isSessionCurrent: () => true,
    };
    const states: DailyGenerationRecoveryState[] = [];
    const controller = createDailyGenerationRecovery({
      devotionalId: 'devo-1',
      dayNumber: 2,
      session: 7,
      canMutate: false,
      dependencies,
      onDay: jest.fn(),
      onState: (state) => states.push(state),
    });

    await controller.start();
    await controller.retry();

    expect(states.at(-1)?.status).toBe('idle');
    expect(dependencies.submitGenerationJob).not.toHaveBeenCalled();
    expect(dependencies.retryJob).not.toHaveBeenCalled();
  });

  it('disables retry for a discovered failed job when generation mutations are not allowed', async () => {
    const states: DailyGenerationRecoveryState[] = [];
    const dependencies: DailyGenerationRecoveryDependencies = {
      findDayJob: jest.fn(async () => job({ status: 'failed', canRetry: true })),
      submitGenerationJob: jest.fn(async () => ({ jobId: 'job-new', status: 'pending' as const, devotionalId: 'devo-1' })),
      pollJobStatus: jest.fn(async () => job()),
      retryJob: jest.fn(async () => ({ jobId: 'job-1', status: 'pending' })),
      recoverCompletedGenerationResult: jest.fn(async () => null),
      sleep: jest.fn(() => new Promise(() => undefined)),
      now: () => Date.now(),
      isSessionCurrent: () => true,
    };
    const controller = createDailyGenerationRecovery({
      devotionalId: 'devo-1',
      dayNumber: 2,
      session: 7,
      canMutate: false,
      dependencies,
      onDay: jest.fn(),
      onState: (state) => states.push(state),
    });

    await controller.start();
    await controller.retry();

    expect(states.at(-1)).toMatchObject({ status: 'failed', canRetry: false });
    expect(dependencies.retryJob).not.toHaveBeenCalled();
    expect(dependencies.submitGenerationJob).not.toHaveBeenCalled();
  });

  it('reports connection loss and discovers the authoritative job after reconnecting', async () => {
    const findDayJob = jest.fn(async () => job({
      status: 'complete',
      result: { devotionalDay: generatedDay(), devotionalId: 'devo-1' },
    }));
    const { controller, states, onDay } = setup({ findDayJob });

    await controller.setOnline(false);
    await controller.start();
    expect(states.at(-1)?.status).toBe('offline');
    expect(findDayJob).not.toHaveBeenCalled();

    await controller.setOnline(true);
    expect(findDayJob).toHaveBeenCalledTimes(1);
    expect(onDay).toHaveBeenCalledTimes(1);
  });

  it('reports DAY_NOT_READY as a server pacing block, not connection loss', async () => {
    const { controller, states } = setup({
      submitGenerationJob: jest.fn(async () => {
        throw new ApiError("Day 2 isn't ready yet.", 425, 'DAY_NOT_READY');
      }),
    });

    await controller.start();

    expect(states.at(-1)).toEqual({ status: 'blocked', reason: 'day-not-ready' });
    expect(states).not.toContainEqual(expect.objectContaining({ status: 'offline' }));
  });

  it.each(['SERIES_ARCHIVED', 'SERIES_NOT_ACTIVE'])(
    'reports %s as a read-only series block, not connection loss',
    async (code) => {
      const { controller, states } = setup({
        submitGenerationJob: jest.fn(async () => {
          throw new ApiError('Series mutation refused.', 409, code);
        }),
      });

      await controller.start();

      expect(states.at(-1)).toEqual({ status: 'blocked', reason: 'series-read-only' });
      expect(states).not.toContainEqual(expect.objectContaining({ status: 'offline' }));
    },
  );

  it('reports an HTTP service response separately from connection loss', async () => {
    const { controller, states } = setup({
      submitGenerationJob: jest.fn(async () => {
        throw new ApiError('Service unavailable.', 503, 'UNAVAILABLE');
      }),
    });

    await controller.start();

    expect(states.at(-1)).toEqual({ status: 'service-error' });
    expect(states).not.toContainEqual(expect.objectContaining({ status: 'offline' }));
  });

  it.each(['pending', 'processing'] as const)(
    'keeps a slow %s job active without submitting another job',
    async (status) => {
      const { controller, dependencies, states } = setup({
        findDayJob: jest.fn(async () => job({ status, createdAt: '2026-09-08T11:55:00.000Z' })),
      });

      await controller.start();

      expect(states.at(-1)).toMatchObject({ status: 'slow', jobId: 'job-1' });
      expect(dependencies.sleep).toHaveBeenCalledTimes(1);
      expect(dependencies.submitGenerationJob).not.toHaveBeenCalled();
      controller.cancel();
    },
  );

  it('keeps a read-only slow batched job active without demanding it', async () => {
    const states: DailyGenerationRecoveryState[] = [];
    const submitGenerationJob = jest.fn(async () => ({
      jobId: 'job-1',
      status: 'pending' as const,
    }));
    const dependencies: DailyGenerationRecoveryDependencies = {
      findDayJob: jest.fn(async () => job({
        status: 'batched',
        createdAt: '2026-09-08T11:55:00.000Z',
      })),
      submitGenerationJob,
      pollJobStatus: jest.fn(async () => job({ status: 'batched' })),
      retryJob: jest.fn(async () => ({ jobId: 'job-1', status: 'pending' })),
      recoverCompletedGenerationResult: jest.fn(async () => null),
      sleep: jest.fn(() => new Promise(() => undefined)),
      now: () => new Date('2026-09-08T12:00:00.000Z').getTime(),
      isSessionCurrent: () => true,
    };
    const controller = createDailyGenerationRecovery({
      devotionalId: 'devo-1',
      dayNumber: 2,
      session: 7,
      canMutate: false,
      dependencies,
      onDay: jest.fn(),
      onState: (state) => states.push(state),
    });

    await controller.start();

    expect(states.at(-1)).toMatchObject({ status: 'slow', jobId: 'job-1' });
    expect(submitGenerationJob).not.toHaveBeenCalled();
    controller.cancel();
  });

  it('reclaims an allowed batched job once and polls the same job', async () => {
    const { controller, dependencies } = setup({
      findDayJob: jest.fn(async () => job({ status: 'batched' })),
      submitGenerationJob: jest.fn(async () => ({ jobId: 'job-1', status: 'pending' as const })),
      pollJobStatus: jest.fn(async () => job({ status: 'processing' })),
    });

    await controller.start();

    expect(dependencies.submitGenerationJob).toHaveBeenCalledTimes(1);
    expect(dependencies.pollJobStatus).toHaveBeenCalledWith('job-1', 7);
    controller.cancel();
  });

  it('applies a completed terminal race returned while reclaiming a batched job', async () => {
    const { controller, dependencies, onDay, states } = setup({
      findDayJob: jest.fn(async () => job({ status: 'batched' })),
      submitGenerationJob: jest.fn(async () => {
        throw new ApiError('Already generated', 409, 'ALREADY_GENERATED', 'job-1');
      }),
      pollJobStatus: jest.fn(async () => job({
        status: 'complete',
        result: { devotionalDay: generatedDay(), devotionalId: 'devo-1' },
      })),
    });

    await controller.start();

    expect(dependencies.pollJobStatus).toHaveBeenCalledWith('job-1', 7);
    expect(onDay).toHaveBeenCalledTimes(1);
    expect(states.at(-1)?.status).toBe('complete');
  });

  it('keeps a failed terminal race on the same job retry path', async () => {
    const { controller, dependencies, states } = setup({
      findDayJob: jest.fn(async () => job({ status: 'batched' })),
      submitGenerationJob: jest.fn(async () => {
        throw new ApiError('Job failed', 409, 'JOB_FAILED', 'job-1');
      }),
      pollJobStatus: jest.fn(async () => job({ status: 'failed', canRetry: true })),
    });

    await controller.start();
    await controller.retry();

    expect(states).toContainEqual(expect.objectContaining({ status: 'failed', jobId: 'job-1' }));
    expect(dependencies.retryJob).toHaveBeenCalledWith('job-1', 7);
    expect(dependencies.submitGenerationJob).toHaveBeenCalledTimes(1);
    controller.cancel();
  });

  it('does not repeat an ambiguous batched demand or submit a replacement', async () => {
    const { controller, dependencies, states } = setup({
      findDayJob: jest.fn(async () => job({ status: 'batched' })),
      submitGenerationJob: jest.fn(async () => { throw new Error('request timed out'); }),
    });

    await controller.start();
    await controller.checkAgain();

    expect(dependencies.submitGenerationJob).toHaveBeenCalledTimes(1);
    expect(states).toContainEqual(expect.objectContaining({ status: 'offline', jobId: 'job-1' }));
    controller.cancel();
  });

  it('deduplicates batched demand across Today and reading in one session', async () => {
    const demand = deferred<{ jobId: string; status: 'pending' }>();
    const submitGenerationJob = jest.fn(() => demand.promise);
    const first = setup({
      findDayJob: jest.fn(async () => job({ status: 'batched' })),
      submitGenerationJob,
    });
    const second = setup({
      findDayJob: jest.fn(async () => job({ status: 'batched' })),
      submitGenerationJob,
    });

    const firstStart = first.controller.start();
    const secondStart = second.controller.start();
    await Promise.resolve();
    await Promise.resolve();
    expect(submitGenerationJob).toHaveBeenCalledTimes(1);
    demand.resolve({ jobId: 'job-1', status: 'pending' });
    await Promise.all([firstStart, secondStart]);
    first.controller.cancel();
    second.controller.cancel();
  });

  it('deduplicates rapid retries and retries the failed job instead of submitting', async () => {
    const retryResponse = deferred<{ jobId: string; status: string }>();
    const retryJob = jest.fn(() => retryResponse.promise);
    const { controller, dependencies } = setup({
      findDayJob: jest.fn(async () => job({ status: 'failed', canRetry: true })),
      retryJob,
    });
    await controller.start();

    const first = controller.retry();
    const second = controller.retry();
    expect(retryJob).toHaveBeenCalledTimes(1);
    retryResponse.resolve({ jobId: 'job-1', status: 'pending' });
    await Promise.all([first, second]);

    expect(dependencies.submitGenerationJob).not.toHaveBeenCalled();
  });

  it('does not reuse a retry promise across generation sessions', async () => {
    const firstRetry = deferred<{ jobId: string; status: string }>();
    const retryJob = jest.fn()
      .mockImplementationOnce(() => firstRetry.promise)
      .mockResolvedValueOnce({ jobId: 'job-1', status: 'pending' });
    const dependencies: DailyGenerationRecoveryDependencies = {
      findDayJob: jest.fn(async () => job({ status: 'failed', canRetry: true })),
      submitGenerationJob: jest.fn(async () => ({ jobId: 'job-new', status: 'pending' as const, devotionalId: 'devo-1' })),
      pollJobStatus: jest.fn(async () => job()),
      retryJob,
      recoverCompletedGenerationResult: jest.fn(async () => null),
      sleep: jest.fn(() => new Promise(() => undefined)),
      now: () => Date.now(),
      isSessionCurrent: () => true,
    };
    const makeController = (session: number) => createDailyGenerationRecovery({
      devotionalId: 'devo-1',
      dayNumber: 2,
      session,
      canMutate: true,
      dependencies,
      onDay: jest.fn(),
      onState: jest.fn(),
    });
    const oldSession = makeController(7);
    const newSession = makeController(8);
    await oldSession.start();
    await newSession.start();

    const oldRetry = oldSession.retry();
    await newSession.retry();

    expect(retryJob).toHaveBeenCalledTimes(2);
    expect(retryJob).toHaveBeenNthCalledWith(1, 'job-1', 7);
    expect(retryJob).toHaveBeenNthCalledWith(2, 'job-1', 8);
    firstRetry.resolve({ jobId: 'job-1', status: 'pending' });
    await oldRetry;
    oldSession.cancel();
    newSession.cancel();
  });

  it('does not retry or submit when the failed job exhausted its manual retry budget', async () => {
    const { controller, dependencies, states } = setup({
      findDayJob: jest.fn(async () => job({ status: 'failed', canRetry: false })),
    });
    await controller.start();

    await controller.retry();

    expect(states.at(-1)).toMatchObject({ status: 'failed', canRetry: false });
    expect(dependencies.retryJob).not.toHaveBeenCalled();
    expect(dependencies.submitGenerationJob).not.toHaveBeenCalled();
  });

  it('treats an ambiguous retry transport failure as connection loss without submitting', async () => {
    const { controller, dependencies, states } = setup({
      findDayJob: jest.fn(async () => job({ status: 'failed', canRetry: true })),
      retryJob: jest.fn(async () => { throw new Error('request timed out'); }),
    });
    await controller.start();

    await controller.retry();

    expect(states.at(-1)).toMatchObject({ status: 'offline', jobId: 'job-1' });
    expect(dependencies.retryJob).toHaveBeenCalledTimes(1);
    expect(dependencies.submitGenerationJob).not.toHaveBeenCalled();
  });

  it('rediscovers an existing active job on a later focus check without submitting', async () => {
    const findDayJob = jest.fn(async () => job());
    const { controller, dependencies } = setup({ findDayJob });

    await controller.start();
    await controller.checkAgain();

    expect(findDayJob).toHaveBeenCalledTimes(2);
    expect(dependencies.submitGenerationJob).not.toHaveBeenCalled();
    controller.cancel();
  });

  it('deduplicates submission when Today and reading discover no job together', async () => {
    const submission = deferred<{ jobId: string; status: 'pending'; devotionalId: string }>();
    const submitGenerationJob = jest.fn(() => submission.promise);
    const first = setup({ submitGenerationJob });
    const second = setup({ submitGenerationJob });

    const firstStart = first.controller.start();
    const secondStart = second.controller.start();
    await Promise.resolve();
    expect(submitGenerationJob).toHaveBeenCalledTimes(1);

    submission.resolve({ jobId: 'job-new', status: 'pending', devotionalId: 'devo-1' });
    await Promise.all([firstStart, secondStart]);
    first.controller.cancel();
    second.controller.cancel();
  });

  it('adopts and applies the completed job returned by a current-session submit conflict', async () => {
    const completed = job({
      jobId: 'job-existing',
      status: 'complete',
      result: { devotionalDay: generatedDay(), devotionalId: 'devo-1' },
    });
    const { controller, dependencies, onDay, states } = setup({
      submitGenerationJob: jest.fn(async () => {
        throw new ApiError('Already generated', 409, 'ALREADY_GENERATED', 'job-existing');
      }),
      pollJobStatus: jest.fn(async () => completed),
    });

    await controller.start();

    expect(dependencies.pollJobStatus).toHaveBeenCalledWith('job-existing', 7);
    expect(onDay).toHaveBeenCalledWith('devo-1', expect.objectContaining({ dayNumber: 2 }));
    expect(states.at(-1)?.status).toBe('complete');
  });

  it('does not apply a submit-conflict result after its generation session is invalidated', async () => {
    const response = deferred<GenerationJobResponse>();
    let sessionCurrent = true;
    const { controller, states, onDay } = setup({
      submitGenerationJob: jest.fn(async () => {
        throw new ApiError('Already generated', 409, 'ALREADY_GENERATED', 'job-existing');
      }),
      pollJobStatus: jest.fn(() => response.promise),
      isSessionCurrent: () => sessionCurrent,
    });

    const started = controller.start();
    await Promise.resolve();
    await Promise.resolve();
    sessionCurrent = false;
    response.resolve(job({
      jobId: 'job-existing',
      status: 'complete',
      result: { devotionalDay: generatedDay(), devotionalId: 'devo-1' },
    }));
    await started;

    expect(onDay).not.toHaveBeenCalled();
    expect(states.map((state) => state.status)).toEqual(['checking']);
  });

  it('rejects a completed job for a different day instead of applying it', async () => {
    const { controller, states, onDay } = setup({
      findDayJob: jest.fn(async () => job({
        dayNumber: 3,
        status: 'complete',
        result: { devotionalDay: generatedDay(3), devotionalId: 'devo-1' },
      })),
    });

    await controller.start();

    expect(onDay).not.toHaveBeenCalled();
    expect(states.at(-1)).toMatchObject({ status: 'failed', canRetry: false });
  });

  it('preserves and rejects mismatched identity returned while polling a known job', async () => {
    const first = setup({
      findDayJob: jest.fn(async () => null),
      submitGenerationJob: jest.fn(async () => ({ jobId: 'job-known', status: 'pending' as const, devotionalId: 'devo-1' })),
    });
    await first.controller.start();
    first.controller.cancel();

    const second = setup({
      findDayJob: jest.fn(async () => null),
      pollJobStatus: jest.fn(async () => job({ jobId: 'job-known', devotionalId: 'devo-other', dayNumber: 9 })),
    });
    await second.controller.start();

    expect(second.onDay).not.toHaveBeenCalled();
    expect(second.states.at(-1)).toMatchObject({ status: 'failed', failureKind: 'invalid-result' });
    expect(second.dependencies.submitGenerationJob).not.toHaveBeenCalled();
  });

  it('does not publish state or content after the generation session changes', async () => {
    const response = deferred<GenerationJobResponse | null>();
    let sessionCurrent = true;
    const { controller, states, onDay } = setup({
      findDayJob: jest.fn(() => response.promise),
      isSessionCurrent: () => sessionCurrent,
    });

    const started = controller.start();
    sessionCurrent = false;
    response.resolve(job({
      status: 'complete',
      result: { devotionalDay: generatedDay(), devotionalId: 'devo-1' },
    }));
    await started;

    expect(onDay).not.toHaveBeenCalled();
    expect(states.map((state) => state.status)).toEqual(['checking']);
  });
});
