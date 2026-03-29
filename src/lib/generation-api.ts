/**
 * Thin API client for server-side generation job endpoints.
 *
 * Three operations:
 *   1. submitGenerationJob — POST /api/jobs/generate-day
 *   2. pollJobStatus       — GET  /api/jobs/:jobId
 *   3. retryJob            — POST /api/jobs/:jobId/retry
 */
import { PRIMARY_BACKEND_URL, getAuthHeaders } from "./api-config";

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
  const response = await fetch(`${PRIMARY_BACKEND_URL}/api/jobs/generate-day`, {
    method: "POST",
    headers,
    body: JSON.stringify(params),
    signal: AbortSignal.timeout(15_000),
  });

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
  const response = await fetch(`${PRIMARY_BACKEND_URL}/api/jobs/${jobId}`, {
    method: "GET",
    headers,
    signal: AbortSignal.timeout(10_000),
  });

  if (!response.ok) {
    throw new Error(`Poll job failed: ${response.status}`);
  }

  return response.json();
}

export async function retryJob(
  jobId: string
): Promise<{ jobId: string; status: string }> {
  const headers = await getAuthHeaders();
  const response = await fetch(
    `${PRIMARY_BACKEND_URL}/api/jobs/${jobId}/retry`,
    {
      method: "POST",
      headers,
      signal: AbortSignal.timeout(10_000),
    }
  );

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(
      `Retry job failed: ${response.status} — ${body.slice(0, 200)}`
    );
  }

  return response.json();
}
