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
 * push announced, with the server's own error text. A record for a different
 * job, or a current series other than the one the push names, means the push
 * outlived the job — iOS keeps "We hit a snag" in Notification Center after
 * Start over already wrote a new series — and Try again on it would resurrect
 * a superseded series, so the reader goes to Today, which reconciles whatever
 * is current or in flight. Without a record (every terminal exit clears it)
 * the named job is polled by id instead of submitting a duplicate; the push is
 * never the verdict, the server's status decides what the reader lands on.
 * Without a push, the record resumes and otherwise the screen submits fresh.
 */
export function resolveGeneratingEntry({
  inflight,
  params,
  currentDevotionalId,
}: {
  inflight: InflightGenerationJob | null;
  params: GeneratingRouteParams | null | undefined;
  /** The series the store holds as current, if any. */
  currentDevotionalId: string | null | undefined;
}): GeneratingEntry {
  const pushedJobId = readParam(params?.jobId);
  if (!pushedJobId) {
    return inflight ? { kind: 'resume', inflight } : { kind: 'submit' };
  }

  if (inflight) {
    return inflight.jobId === pushedJobId
      ? { kind: 'resume', inflight }
      : { kind: 'stale-push', jobId: pushedJobId };
  }
  const pushedDevotionalId = readParam(params?.devotionalId);
  if (currentDevotionalId && currentDevotionalId !== pushedDevotionalId) {
    return { kind: 'stale-push', jobId: pushedJobId };
  }
  return { kind: 'poll-from-push', jobId: pushedJobId, devotionalId: pushedDevotionalId };
}
