/**
 * Thin API client for server-side generation job endpoints.
 *
 * Three operations:
 *   1. submitGenerationJob — POST /api/jobs/generate-day
 *   2. pollJobStatus       — GET  /api/jobs/:jobId
 *   3. retryJob            — POST /api/jobs/:jobId/retry
 */
import { PRIMARY_BACKEND_URL, getAuthHeaders } from "./api-config";

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
  result?: {
    devotionalDay: import("./store").DevotionalDay;
    seriesTitle?: string;
    totalDays?: number;
    arc?: import("./store").SeriesArc;
    devotionalId?: string;
  };
  error?: string;
  retryCount?: number;
  canRetry?: boolean;
  createdAt?: string;
  completedAt?: string;
}

export async function submitGenerationJob(params: {
  devotionalId?: string;
  dayNumber: number;
  jobType: "initial_arc" | "day" | "extension_eval" | "arc_extension";
  userContext?: {
    name: string;
    aboutMe: string;
    situation: string;
    emotion: string;
    seeking: string;
    themeCategory: string;
    devotionalType: string;
    studySubject?: string;
    readingDuration?: number;
    devotionalLength?: number;
    bibleTranslation?: string;
    writingStyle?: Record<string, string>;
  };
}): Promise<{ jobId: string; status: string }> {
  const headers = await getAuthHeaders();
  const response = await fetchWithTimeout(
    `${PRIMARY_BACKEND_URL}/api/jobs/generate-day`,
    { method: "POST", headers, body: JSON.stringify(params) },
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
