/**
 * Thin API client for server-side generation job endpoints.
 *
 * Three operations:
 *   1. submitGenerationJob — POST /api/jobs/generate-day
 *   2. pollJobStatus       — GET  /api/jobs/:jobId
 *   3. retryJob            — POST /api/jobs/:jobId/retry
 */
import { PRIMARY_BACKEND_URL, getAuthHeaders } from "./api-config";
import { reconcileGenerationResultIdentity, type GeneratedDayWithIdentity, type GenerationResultPayload } from './generation-reconciliation';
import {
  assertSyncSessionCurrent,
  isSyncSessionCurrent,
  registerSyncTransport,
  resolveGenerationSession,
  SyncSessionInvalidatedError,
} from './generation-session';
import { mmkvStorage } from "./mmkv-storage";

/** MMKV key for caching the active dynamic prompt example */
export const DYNAMIC_EXAMPLE_KEY = 'active-dynamic-example';

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public code: string,
    public existingJobId?: string | null,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/** Hermes-compatible fetch timeout (AbortSignal.timeout() not available) */
async function fetchWithTimeout(
  url: string,
  options: RequestInit,
  ms: number,
  session: number,
  action: string,
): Promise<Response> {
  assertSyncSessionCurrent(session, action);
  const controller = new AbortController();
  const unregister = registerSyncTransport(controller);
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    assertSyncSessionCurrent(session, action);
    return response;
  } catch (error) {
    if (!isSyncSessionCurrent(session)) {
      throw new SyncSessionInvalidatedError(action);
    }
    throw error;
  } finally {
    clearTimeout(timer);
    unregister();
  }
}

export interface GenerationJobResponse {
  jobId: string;
  status: "pending" | "processing" | "batched" | "complete" | "failed";
  jobType?: "initial_arc" | "day" | "onboarding";
  devotionalId?: string;
  dayNumber?: number;
  result?: GenerationResultPayload;
  error?: string;
  retryCount?: number;
  manualRetries?: number;
  canRetry?: boolean;
  createdAt?: string;
  startedAt?: string;
  completedAt?: string;
}

export type CanonicalGenerationResultPayload = Omit<GenerationResultPayload, 'devotionalDay' | 'devotionalId'> & {
  devotionalDay: GeneratedDayWithIdentity;
  devotionalId: string;
};

export function normalizeGenerationResult(
  result: GenerationResultPayload,
  fallbackDevotionalId?: string | null,
  fallbackDayNumber?: number,
): CanonicalGenerationResultPayload {
  return reconcileGenerationResultIdentity(
    result,
    fallbackDevotionalId,
    fallbackDayNumber,
  ) as CanonicalGenerationResultPayload;
}

export interface InitialArcUserContext {
  name: string;
  aboutMe: string;
  situation: string;
  emotion: string;
  faith: string;
  seeking: string;
  themeCategory: string;
  devotionalType: string;
  studySubject?: string;
  readingDuration?: number;
  devotionalLength?: number;
  bibleTranslation?: string;
  writingStyle?: Record<string, string>;
  relationshipWithGod?: string;
  growthGoals?: string[];
  obstacles?: string[];
  keyPeople?: { name: string; relationship: string }[];
  upcomingEvent?: { label: string; date: string };
  diagnosticAnswers?: { question: string; answer: string }[];
  workingRead?: string;
  userCorrection?: string;
}

/** Duck-typed source for buildInitialArcUserContext — kept independent of UserProfile to avoid a store.ts import. */
export interface InitialArcUserSource {
  name: string;
  aboutMe: string;
  currentSituation: string;
  emotionalState: string;
  faithImpact?: string;
  spiritualSeeking: string;
  selectedTheme?: string;
  selectedType?: string;
  selectedStudySubject?: string;
  readingDuration?: number;
  devotionalLength?: number;
  bibleTranslation?: string;
  writingStyle?: unknown;
  relationshipWithGod?: string;
  growthGoals?: string[];
  obstacles?: string[];
  keyPeople?: { name: string; relationship: string }[];
  upcomingEvent?: { label: string; date: string };
  diagnosticAnswers?: { question: string; answer: string }[];
  mirrorWorkingRead?: string;
  mirrorCorrection?: string;
}

/** Builds the initial_arc submission's userContext from a user profile. Pure — safe to unit test. */
export function buildInitialArcUserContext(user: InitialArcUserSource): InitialArcUserContext {
  return {
    name: user.name,
    aboutMe: user.aboutMe,
    situation: user.currentSituation,
    emotion: user.emotionalState,
    faith: user.faithImpact ?? '',
    seeking: user.spiritualSeeking,
    themeCategory: user.selectedTheme ?? '',
    devotionalType: user.selectedType ?? 'personal',
    studySubject: user.selectedStudySubject,
    readingDuration: user.readingDuration,
    devotionalLength: user.devotionalLength,
    bibleTranslation: user.bibleTranslation ?? 'BSB',
    writingStyle: user.writingStyle as Record<string, string> | undefined,
    relationshipWithGod: user.relationshipWithGod,
    growthGoals: user.growthGoals,
    obstacles: user.obstacles,
    keyPeople: user.keyPeople,
    upcomingEvent: user.upcomingEvent,
    diagnosticAnswers: user.diagnosticAnswers,
    workingRead: user.mirrorWorkingRead,
    userCorrection: user.mirrorCorrection,
  };
}

export async function submitGenerationJob(params: {
  devotionalId?: string;
  dayNumber: number;
  jobType: "initial_arc" | "day" | "onboarding";
  userContext?: InitialArcUserContext;
  session?: number;
}): Promise<Pick<GenerationJobResponse, 'jobId' | 'status' | 'devotionalId'>> {
  const session = resolveGenerationSession(params.session);
  assertSyncSessionCurrent(session, 'submit generation job');

  // Read cached dynamic prompt example (if any) for self-improving generation quality
  let dynamicExample: { rule: string; badText: string; goodText: string } | undefined;
  try {
    const cached = await Promise.resolve(mmkvStorage.getItem(DYNAMIC_EXAMPLE_KEY));
    if (cached) {
      dynamicExample = JSON.parse(cached);
    }
  } catch {
    // Silent -- example is best-effort enrichment
  }

  assertSyncSessionCurrent(session, 'submit generation job');
  const headers = await getAuthHeaders();
  assertSyncSessionCurrent(session, 'submit generation job');
  const { session: _session, ...requestParams } = params;
  const body = dynamicExample ? { ...requestParams, dynamicExample } : requestParams;
  const response = await fetchWithTimeout(
    `${PRIMARY_BACKEND_URL}/api/jobs/generate-day`,
    { method: "POST", headers, body: JSON.stringify(body) },
    15_000,
    session,
    'submit generation job',
  );

  if (response.status === 409) {
    const conflictBody = await response.json();
    assertSyncSessionCurrent(session, 'submit generation job');
    throw new ApiError(
      conflictBody.error?.message ?? 'Already generated today',
      409,
      conflictBody.error?.code ?? 'ALREADY_GENERATED_TODAY',
      conflictBody.existingJobId,
    );
  }

  if (!response.ok) {
    const errorBody = await response.text().catch(() => "");
    assertSyncSessionCurrent(session, 'submit generation job');
    throw new Error(
      `Submit job failed: ${response.status} — ${errorBody.slice(0, 200)}`
    );
  }

  const payload = await response.json();
  assertSyncSessionCurrent(session, 'submit generation job');
  return payload;
}

export async function pollJobStatus(
  jobId: string,
  session?: number,
): Promise<GenerationJobResponse> {
  const origin = resolveGenerationSession(session);
  assertSyncSessionCurrent(origin, 'poll generation job');
  const headers = await getAuthHeaders();
  assertSyncSessionCurrent(origin, 'poll generation job');
  const response = await fetchWithTimeout(
    `${PRIMARY_BACKEND_URL}/api/jobs/${jobId}`,
    { method: "GET", headers },
    10_000,
    origin,
    'poll generation job',
  );

  if (!response.ok) {
    // Carry the status and code: 404 / 400 is the server's word that it does
    // not hold this job (`classifyPollFailure`), not a connection problem.
    const body = (await response.json().catch(() => null)) as { error?: { code?: string; message?: string } } | null;
    assertSyncSessionCurrent(origin, 'poll generation job');
    const detail = body?.error?.message ? ` — ${body.error.message}` : '';
    throw new ApiError(`Poll job failed: ${response.status}${detail}`, response.status, body?.error?.code ?? 'POLL_FAILED');
  }

  const payload = await response.json();
  assertSyncSessionCurrent(origin, 'poll generation job');
  return payload;
}

export async function retryJob(
  jobId: string,
  session?: number,
): Promise<{ jobId: string; status: string }> {
  const origin = resolveGenerationSession(session);
  assertSyncSessionCurrent(origin, 'retry generation job');
  const headers = await getAuthHeaders();
  assertSyncSessionCurrent(origin, 'retry generation job');
  const response = await fetchWithTimeout(
    `${PRIMARY_BACKEND_URL}/api/jobs/${jobId}/retry`,
    { method: "POST", headers },
    10_000,
    origin,
    'retry generation job',
  );

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    assertSyncSessionCurrent(origin, 'retry generation job');
    throw new Error(
      `Retry job failed: ${response.status} — ${body.slice(0, 200)}`
    );
  }

  const payload = await response.json();
  assertSyncSessionCurrent(origin, 'retry generation job');
  return payload;
}

/**
 * Discover the authoritative job for one progressive devotional day.
 * The server prefers completed content, then an active job, then the latest
 * failed job. A 404 means this owner has no matching day job.
 */
export async function findDayJob(
  devotionalId: string,
  dayNumber: number,
  session?: number,
): Promise<GenerationJobResponse | null> {
  if (!Number.isInteger(dayNumber) || dayNumber < 1) {
    throw new RangeError('dayNumber must be a positive integer');
  }
  const origin = resolveGenerationSession(session);
  assertSyncSessionCurrent(origin, 'find day generation job');
  const headers = await getAuthHeaders();
  assertSyncSessionCurrent(origin, 'find day generation job');
  const response = await fetchWithTimeout(
    `${PRIMARY_BACKEND_URL}/api/jobs/find-day?devotionalId=${encodeURIComponent(devotionalId)}&dayNumber=${dayNumber}`,
    { method: 'GET', headers },
    10_000,
    origin,
    'find day generation job',
  );
  if (response.status === 404) {
    assertSyncSessionCurrent(origin, 'find day generation job');
    return null;
  }
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { error?: { code?: string; message?: string } } | null;
    assertSyncSessionCurrent(origin, 'find day generation job');
    const detail = body?.error?.message ? ` — ${body.error.message}` : '';
    throw new ApiError(
      `Find day job failed: ${response.status}${detail}`,
      response.status,
      body?.error?.code ?? 'FIND_DAY_JOB_FAILED',
    );
  }
  const payload = await response.json();
  assertSyncSessionCurrent(origin, 'find day generation job');
  return payload;
}

/**
 * Single-fetch job result — for 409 recovery, NOT polling.
 * Returns null on any error (non-throwing), except a reset-invalidated session.
 */
export async function fetchJobResult(
  jobId: string,
  session?: number,
): Promise<GenerationJobResponse | null> {
  const origin = resolveGenerationSession(session);
  assertSyncSessionCurrent(origin, 'fetch generation job');
  const headers = await getAuthHeaders();
  assertSyncSessionCurrent(origin, 'fetch generation job');
  const response = await fetchWithTimeout(
    `${PRIMARY_BACKEND_URL}/api/jobs/${jobId}`,
    { method: "GET", headers },
    10_000,
    origin,
    'fetch generation job',
  );
  if (!response.ok) {
    assertSyncSessionCurrent(origin, 'fetch generation job');
    return null;
  }
  const payload = await response.json();
  assertSyncSessionCurrent(origin, 'fetch generation job');
  return payload;
}

/**
 * Discover server-generated content by devotionalId + dayNumber.
 * Returns null if no completed job exists (404), throws on other errors.
 */
export async function findCompletedJob(
  devotionalId: string,
  dayNumber: number,
  session?: number,
): Promise<GenerationJobResponse | null> {
  const origin = resolveGenerationSession(session);
  assertSyncSessionCurrent(origin, 'find completed generation job');
  const headers = await getAuthHeaders();
  assertSyncSessionCurrent(origin, 'find completed generation job');
  const response = await fetchWithTimeout(
    `${PRIMARY_BACKEND_URL}/api/jobs/find-completed?devotionalId=${encodeURIComponent(devotionalId)}&dayNumber=${dayNumber}`,
    { method: "GET", headers },
    10_000,
    origin,
    'find completed generation job',
  );
  if (response.status === 404) {
    assertSyncSessionCurrent(origin, 'find completed generation job');
    return null;
  }
  if (!response.ok) {
    assertSyncSessionCurrent(origin, 'find completed generation job');
    throw new Error(`Find job failed: ${response.status}`);
  }
  const payload = await response.json();
  assertSyncSessionCurrent(origin, 'find completed generation job');
  return payload;
}

/**
 * Shared recovery path for screens that need to reconcile a completed job back
 * into local state. Uses direct job lookup for 409 recovery when possible,
 * otherwise falls back to devotionalId/dayNumber discovery.
 */
export async function recoverCompletedGenerationResult(params: {
  devotionalId: string;
  dayNumber: number;
  existingJobId?: string | null;
  session?: number;
}): Promise<CanonicalGenerationResultPayload | null> {
  const session = resolveGenerationSession(params.session);
  assertSyncSessionCurrent(session, 'recover generation result');
  const response = params.existingJobId
    ? await fetchJobResult(params.existingJobId, session).catch((error) => {
        if (error instanceof SyncSessionInvalidatedError) throw error;
        return null;
      })
    : await findCompletedJob(params.devotionalId, params.dayNumber, session);

  assertSyncSessionCurrent(session, 'recover generation result');
  if (!response?.result?.devotionalDay) return null;

  return normalizeGenerationResult(
    response.result,
    params.devotionalId,
    params.dayNumber,
  );
}
