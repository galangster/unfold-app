/**
 * Thin API client for server-side generation job endpoints.
 *
 * Three operations:
 *   1. submitGenerationJob — POST /api/jobs/generate-day
 *   2. pollJobStatus       — GET  /api/jobs/:jobId
 *   3. retryJob            — POST /api/jobs/:jobId/retry
 */
import { PRIMARY_BACKEND_URL, getAuthHeaders } from "./api-config";
import { reconcileGenerationResultIdentity, type GenerationResultPayload } from './generation-reconciliation';
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
function fetchWithTimeout(
  url: string,
  options: RequestInit,
  ms: number
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  return fetch(url, { ...options, signal: controller.signal }).finally(() =>
    clearTimeout(timer)
  );
}

export interface GenerationJobResponse {
  jobId: string;
  status: "pending" | "processing" | "complete" | "failed";
  result?: GenerationResultPayload;
  error?: string;
  retryCount?: number;
  canRetry?: boolean;
  createdAt?: string;
  completedAt?: string;
}

export function normalizeGenerationResult(
  result: GenerationResultPayload,
  fallbackDevotionalId?: string | null,
  fallbackDayNumber?: number,
): GenerationResultPayload {
  return reconcileGenerationResultIdentity(
    result,
    fallbackDevotionalId,
    fallbackDayNumber,
  );
}

export async function submitGenerationJob(params: {
  devotionalId?: string;
  dayNumber: number;
  jobType: "initial_arc" | "day" | "onboarding";
  userContext?: {
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
  };
}): Promise<{ jobId: string; status: string }> {
  // Read cached dynamic prompt example (if any) for self-improving generation quality
  let dynamicExample: { rule: string; badText: string; goodText: string } | undefined;
  try {
    const cached = mmkvStorage.getItem(DYNAMIC_EXAMPLE_KEY);
    if (cached) {
      dynamicExample = JSON.parse(cached);
    }
  } catch {
    // Silent -- example is best-effort enrichment
  }

  const headers = await getAuthHeaders();
  const body = dynamicExample ? { ...params, dynamicExample } : params;
  const response = await fetchWithTimeout(
    `${PRIMARY_BACKEND_URL}/api/jobs/generate-day`,
    { method: "POST", headers, body: JSON.stringify(body) },
    15_000
  );

  if (response.status === 409) {
    const body = await response.json();
    throw new ApiError(
      body.error?.message ?? 'Already generated today',
      409,
      body.error?.code ?? 'ALREADY_GENERATED_TODAY',
      body.existingJobId,
    );
  }

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(
      `Submit job failed: ${response.status} — ${body.slice(0, 200)}`
    );
  }

  return response.json();
}

export async function pollJobStatus(
  jobId: string
): Promise<GenerationJobResponse> {
  const headers = await getAuthHeaders();
  const response = await fetchWithTimeout(
    `${PRIMARY_BACKEND_URL}/api/jobs/${jobId}`,
    { method: "GET", headers },
    10_000
  );

  if (!response.ok) {
    throw new Error(`Poll job failed: ${response.status}`);
  }

  return response.json();
}

export async function retryJob(
  jobId: string
): Promise<{ jobId: string; status: string }> {
  const headers = await getAuthHeaders();
  const response = await fetchWithTimeout(
    `${PRIMARY_BACKEND_URL}/api/jobs/${jobId}/retry`,
    { method: "POST", headers },
    10_000
  );

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(
      `Retry job failed: ${response.status} — ${body.slice(0, 200)}`
    );
  }

  return response.json();
}

/**
 * Single-fetch job result — for 409 recovery, NOT polling.
 * Returns null on any error (non-throwing).
 */
export async function fetchJobResult(
  jobId: string,
): Promise<GenerationJobResponse | null> {
  const headers = await getAuthHeaders();
  const response = await fetchWithTimeout(
    `${PRIMARY_BACKEND_URL}/api/jobs/${jobId}`,
    { method: "GET", headers },
    10_000,
  );
  if (!response.ok) return null;
  return response.json();
}

/**
 * Discover server-generated content by devotionalId + dayNumber.
 * Returns null if no completed job exists (404), throws on other errors.
 */
export async function findCompletedJob(
  devotionalId: string,
  dayNumber: number,
): Promise<GenerationJobResponse | null> {
  const headers = await getAuthHeaders();
  const response = await fetchWithTimeout(
    `${PRIMARY_BACKEND_URL}/api/jobs/find-completed?devotionalId=${encodeURIComponent(devotionalId)}&dayNumber=${dayNumber}`,
    { method: "GET", headers },
    10_000,
  );
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`Find job failed: ${response.status}`);
  return response.json();
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
}): Promise<GenerationResultPayload | null> {
  const response = params.existingJobId
    ? await fetchJobResult(params.existingJobId).catch(() => null)
    : await findCompletedJob(params.devotionalId, params.dayNumber);

  if (!response?.result?.devotionalDay) return null;

  return normalizeGenerationResult(
    response.result,
    params.devotionalId,
    params.dayNumber,
  );
}
