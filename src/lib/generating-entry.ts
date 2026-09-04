/**
 * How the generating screen enters: resume an inflight job from a previous
 * session, land on the job the server's failure push named, or submit fresh.
 * The screen owns the side effects; this module owns the decision.
 */

/** An inflight record older than this is stale and must not be resumed. */
export const INFLIGHT_MAX_AGE_MS = 15 * 60 * 1000;

/** The record generating.tsx persists to MMKV for app-kill recovery. */
export type InflightGenerationRecord = {
  jobId: string;
  devotionalId?: string;
  submittedAt: number;
};

/** Route params a tapped "We hit a snag" push carries into /generating. */
export type GeneratingRouteParams = {
  jobId?: string | string[];
  devotionalId?: string | string[];
};

export type GeneratingEntry =
  | { kind: 'resume'; inflight: InflightGenerationRecord }
  | { kind: 'failed-from-push'; jobId: string; devotionalId: string | null }
  | { kind: 'submit' };

/**
 * Parses the persisted inflight record. Null when it is absent, malformed,
 * or older than INFLIGHT_MAX_AGE_MS — the caller clears the key in every
 * null case, so a stale record never survives to the next visit.
 */
export function parseInflightRecord(
  raw: string | null | undefined,
  nowMs: number,
): InflightGenerationRecord | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<InflightGenerationRecord> | null;
    if (!parsed || typeof parsed.jobId !== 'string' || !parsed.jobId) return null;
    if (typeof parsed.submittedAt !== 'number') return null;
    if (nowMs - parsed.submittedAt >= INFLIGHT_MAX_AGE_MS) return null;
    return {
      jobId: parsed.jobId,
      devotionalId: typeof parsed.devotionalId === 'string' && parsed.devotionalId ? parsed.devotionalId : undefined,
      submittedAt: parsed.submittedAt,
    };
  } catch {
    return null;
  }
}

function readParam(value: string | string[] | undefined): string | null {
  const single = Array.isArray(value) ? value[0] : value;
  return single ? single : null;
}

/**
 * A fresh inflight record always wins: polling it reaches the same failed
 * status the push announced, with the server's own error text. Without one
 * (every terminal exit clears it), a push that named a job lands the reader
 * in the failed state so Try again retries that job by id instead of
 * submitting a duplicate. With neither, submit fresh.
 */
export function resolveGeneratingEntry({
  inflightRaw,
  params,
  nowMs,
}: {
  inflightRaw: string | null | undefined;
  params: GeneratingRouteParams | null | undefined;
  nowMs: number;
}): GeneratingEntry {
  const inflight = parseInflightRecord(inflightRaw, nowMs);
  if (inflight) return { kind: 'resume', inflight };

  const jobId = readParam(params?.jobId);
  if (jobId) {
    return { kind: 'failed-from-push', jobId, devotionalId: readParam(params?.devotionalId) };
  }

  return { kind: 'submit' };
}
