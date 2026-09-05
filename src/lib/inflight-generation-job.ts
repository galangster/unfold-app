/**
 * The in-flight first-series generation job, persisted in MMKV so it survives
 * an app kill. One record, one key — `full-reset.ts` wipes it by this exact
 * string, so no second key may appear.
 *
 * Two screens read the record. The post-paywall /generating screen resumes
 * polling from it on mount. Today used to treat every record as app-kill
 * recovery and bounce straight back to /generating, which made the
 * "Go home — we'll keep writing" link look dead: tap, Today for one frame,
 * back on the ripple (Jordan, App Store 1.1.0, 2026-09-04). The `leftForHome`
 * marker tells "the reader chose to wait on Today" apart from "the app died
 * mid-generation"; only the latter goes back to /generating.
 *
 * The record carries no expiry. The server is the only authority on the job
 * (Jordan, item 7: a wall clock declared a running job failed), so both
 * screens ask it — /generating by polling, Today through
 * `resolveInflightResume` — and the worker's stale sweep guarantees every job
 * reaches a terminal status. A record is dropped on a server verdict, never
 * on age. "No such job" (404 / 400 on the status request) is such a verdict.
 *
 * "Start over with new answers" does not delete the record either: it keeps
 * it with the `superseded` marker. With the record gone and the session
 * cleared, nothing said the reader had abandoned the job, and the "We hit a
 * snag" push iOS keeps for it polled the job back to life — Try again then
 * re-ran the answers the reader had just walked away from. A superseded
 * record is nothing to resume or watch; the next submission's write
 * replaces it, and /generating reads any push against it as stale.
 */
import { mmkvStorage } from '@/lib/mmkv-storage';
import type { PollFailureKind } from '@/lib/generation-poll-outcome';
import type { GenerationSessionStatus } from '@/lib/store';

export const INFLIGHT_GENERATION_JOB_KEY = 'inflight-generation-job';
/** Session title written at submission, before the server names the series. */
export const GENERATING_SESSION_TITLE_PLACEHOLDER = 'Generating...';
/** What the preparing card calls the series before the server names it. */
export const PREPARING_FIRST_SERIES_FALLBACK_TITLE = 'your devotional';

export interface InflightGenerationJob {
  jobId: string;
  devotionalId?: string;
  submittedAt: number;
  /** The reader left /generating for Today; Today watches the job instead. */
  leftForHome?: true;
  /**
   * "Start over with new answers" abandoned this job. Neither screen resumes
   * or watches it; it only marks the job's failure push as stale.
   */
  superseded?: true;
}

export type InflightGenerationJobRead =
  | { kind: 'none' }
  | { kind: 'invalid' }
  | { kind: 'active'; job: InflightGenerationJob };

function toInflightGenerationJob(value: unknown): InflightGenerationJob | null {
  if (!value || typeof value !== 'object') return null;
  const record = value as Record<string, unknown>;
  if (typeof record.jobId !== 'string' || record.jobId.length === 0) return null;
  if (typeof record.submittedAt !== 'number' || !Number.isFinite(record.submittedAt)) return null;
  return {
    jobId: record.jobId,
    ...(typeof record.devotionalId === 'string' ? { devotionalId: record.devotionalId } : {}),
    submittedAt: record.submittedAt,
    ...(record.leftForHome === true ? { leftForHome: true as const } : {}),
    ...(record.superseded === true ? { superseded: true as const } : {}),
  };
}

/** Pure: classify a raw MMKV value. */
export function parseInflightGenerationJob(raw: string | null | undefined): InflightGenerationJobRead {
  if (!raw) return { kind: 'none' };
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { kind: 'invalid' };
  }
  const job = toInflightGenerationJob(parsed);
  if (!job) return { kind: 'invalid' };
  return { kind: 'active', job };
}

/**
 * Read the persisted record. An unreadable record is removed on read, as
 * both screens always did, so nothing keeps bouncing on a record nobody can
 * act on.
 */
export function readInflightGenerationJob(): InflightGenerationJobRead {
  const raw = mmkvStorage.getItem(INFLIGHT_GENERATION_JOB_KEY) as string | null;
  const read = parseInflightGenerationJob(raw);
  if (read.kind === 'invalid') clearInflightGenerationJob();
  return read;
}

export function writeInflightGenerationJob(job: InflightGenerationJob): void {
  mmkvStorage.setItem(INFLIGHT_GENERATION_JOB_KEY, JSON.stringify(job));
}

export function clearInflightGenerationJob(): void {
  mmkvStorage.removeItem(INFLIGHT_GENERATION_JOB_KEY);
}

/**
 * "Start over with new answers": the job is abandoned, not finished. With a
 * known job the record stays under the same key, marked superseded, so the
 * failure push iOS keeps for that job cannot poll it back to life. With no
 * job there is nothing a push could name, so the record is simply cleared.
 */
export function supersedeInflightGenerationJob(jobId: string | null): void {
  if (!jobId) {
    clearInflightGenerationJob();
    return;
  }
  writeInflightGenerationJob({ jobId, submittedAt: Date.now(), superseded: true });
}

export type TodayInflightDecision =
  | { action: 'none' }
  /** App-kill recovery: the reader never chose to leave, so /generating owns the wait. */
  | { action: 'resume-on-generating'; job: InflightGenerationJob }
  /** The reader chose Today: keep the record, show preparing, watch from here. */
  | { action: 'watch-on-today'; job: InflightGenerationJob };

/**
 * Pure: what Today does with the record it finds on focus. A record the
 * reader left for Today is watched from there — unless the session already
 * holds a failure. With the marker set that failure is the watch's own
 * give-up (the server could not be reached six polls running), so the failed
 * card owns the moment: Try again re-enters /generating on the kept record,
 * Dismiss clears the session and the watch starts again. A superseded record
 * is nothing to resume or watch.
 */
export function resolveTodayInflightAction(
  read: InflightGenerationJobRead,
  sessionStatus: GenerationSessionStatus,
): TodayInflightDecision {
  if (read.kind !== 'active' || read.job.superseded) return { action: 'none' };
  if (!read.job.leftForHome) return { action: 'resume-on-generating', job: read.job };
  return sessionStatus === 'error' ? { action: 'none' } : { action: 'watch-on-today', job: read.job };
}

export type InflightResumeDecision = 'resume' | 'discard' | 'keep';

/**
 * Pure: whether Today re-enters /generating for an unmarked record (app-kill
 * recovery). The server is the authority: resume while it reports the job
 * alive or complete; discard on its failure verdict — Today settles that
 * failure itself so the reader sees the failed card, not /generating's error
 * state; keep the record, and ask again on the next focus, when the status
 * could not be fetched — unless the server answered that it does not hold
 * the job at all (`pollFailure` 'job-gone'), which is a verdict: discard.
 */
export function resolveInflightResume(
  serverStatus: string | null | undefined,
  pollFailure?: PollFailureKind | null,
): InflightResumeDecision {
  if (pollFailure === 'job-gone') return 'discard';
  switch (serverStatus) {
    case 'pending':
    case 'processing':
    case 'complete':
      return 'resume';
    case 'failed':
      return 'discard';
    default:
      return 'keep';
  }
}

/**
 * "Go home — we'll keep writing": mark the active record as left for Today
 * and return it (null when no job was submitted yet). The record is kept, not
 * removed, so the server job keeps running and Today can watch it. Synchronous
 * on purpose: nothing may sit between the tap and the navigation.
 */
export function markInflightJobLeftForHome(): InflightGenerationJob | null {
  const read = readInflightGenerationJob();
  if (read.kind !== 'active' || read.job.superseded) return null;
  const record = { ...read.job, leftForHome: true as const };
  writeInflightGenerationJob(record);
  return record;
}

/**
 * Pure: whether the series a job, or the session it started, names has
 * reached the store. Today drives its preparing and failed cards from this
 * rather than from "no devotional at all": a reader who taps "Start study" on
 * a finished journey and goes home still has that journey, and the card must
 * say the new one is being written instead of offering "Start study" again.
 * A record with no id (an adopted job whose devotional was never known) falls
 * back to the older test, whether any series is current.
 */
export function hasInflightSeriesLanded(
  devotionalId: string | null | undefined,
  devotionals: readonly { id: string }[],
  hasCurrentDevotional: boolean,
): boolean {
  if (!devotionalId) return hasCurrentDevotional;
  return devotionals.some((devotional) => devotional.id === devotionalId);
}

/** Title for the preparing card while the first series has no name yet. */
export function resolvePreparingFirstSeriesTitle(sessionTitle: string | null | undefined): string {
  const trimmed = sessionTitle?.trim();
  if (!trimmed || trimmed === GENERATING_SESSION_TITLE_PLACEHOLDER) return PREPARING_FIRST_SERIES_FALLBACK_TITLE;
  return trimmed;
}
