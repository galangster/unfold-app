/**
 * How the generating screen enters: resume the in-flight job, poll the job
 * the server's failure push named, send a stale push home, or submit fresh.
 * The screen owns the side effects; this module owns the decision. The
 * record itself is read and written by `inflight-generation-job.ts` — one
 * module, one key, no expiry: the server decides a job's fate, never a clock.
 */
import type { InflightGenerationJob } from './inflight-generation-job';

/** Route params a tapped "We hit a snag" push carries into /generating. */
export type GeneratingRouteParams = {
  jobId?: string | string[];
  devotionalId?: string | string[];
};

export type GeneratingEntry =
  | { kind: 'resume'; inflight: InflightGenerationJob }
  | { kind: 'poll-from-push'; jobId: string; devotionalId: string | null }
  /** The push names a job the reader has moved past; Today reconciles. */
  | { kind: 'stale-push'; jobId: string }
  | { kind: 'submit' };

function readParam(value: string | string[] | undefined): string | null {
  const single = Array.isArray(value) ? value[0] : value;
  return single ? single : null;
}

/**
 * A push that names a job is checked against what the reader has now. The
 * in-flight record for that same job wins: polling it reaches the status the
 * push announced, with the server's own error text. The push outlived its job
 * — iOS keeps "We hit a snag" in Notification Center — when a different job
 * is in flight, when the record was superseded by "Start over with new
 * answers", when the generation session names another series (the next one
 * was already submitted), or when the pushed series is already in the store
 * (a retry landed it after all). Try again on such a job would resurrect a
 * superseded series, so the reader goes to Today, which reconciles whatever
 * is current or in flight.
 *
 * The staleness signal is the generation session, never the store's current
 * devotional: onboarding's "I'll decide later" makes the sample current, and
 * "Start study" on a finished journey keeps that journey current, so a
 * first-series failure push always read as stale and its tap was dead
 * (Jordan, item 8).
 *
 * Without a record (every terminal exit clears it) and nothing that says the
 * reader moved on, the named job is polled by id instead of submitting a
 * duplicate; the push is never the verdict, the server's status decides what
 * the reader lands on. Without a push, the record resumes and otherwise the
 * screen submits fresh — a superseded record is nothing to resume, and the
 * submission's own write replaces it.
 */
export function resolveGeneratingEntry({
  inflight,
  params,
  sessionDevotionalId,
  landedDevotionalIds = [],
}: {
  inflight: InflightGenerationJob | null;
  params: GeneratingRouteParams | null | undefined;
  /** The series the generation flow last worked on (`generationSession.devotionalId`), if any. */
  sessionDevotionalId: string | null | undefined;
  /** Ids of the series already in the store; a pushed series among them has landed. */
  landedDevotionalIds?: readonly string[];
}): GeneratingEntry {
  const pushedJobId = readParam(params?.jobId);
  if (!pushedJobId) {
    return inflight && !inflight.superseded ? { kind: 'resume', inflight } : { kind: 'submit' };
  }

  const stale: GeneratingEntry = { kind: 'stale-push', jobId: pushedJobId };
  if (inflight) {
    return !inflight.superseded && inflight.jobId === pushedJobId ? { kind: 'resume', inflight } : stale;
  }
  const pushedDevotionalId = readParam(params?.devotionalId);
  if (sessionDevotionalId && sessionDevotionalId !== pushedDevotionalId) return stale;
  if (pushedDevotionalId && landedDevotionalIds.includes(pushedDevotionalId)) return stale;
  return { kind: 'poll-from-push', jobId: pushedJobId, devotionalId: pushedDevotionalId };
}
