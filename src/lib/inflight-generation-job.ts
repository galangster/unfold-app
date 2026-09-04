/**
 * The in-flight first-series generation job, persisted in MMKV so it survives
 * an app kill. One record, one key — `full-reset.ts` wipes it by this exact
 * string, so no second key may appear.
 *
 * Two screens read the record. The post-paywall /generating screen resumes
 * polling from it on mount. Today used to treat every unexpired record as
 * app-kill recovery and bounce straight back to /generating, which made the
 * "Go home — we'll keep writing" link look dead: tap, Today for one frame,
 * back on the ripple (Jordan, App Store 1.1.0, 2026-09-04). The `leftForHome`
 * marker tells "the reader chose to wait on Today" apart from "the app died
 * mid-generation"; only the latter goes back to /generating.
 */
import { mmkvStorage } from '@/lib/mmkv-storage';

export const INFLIGHT_GENERATION_JOB_KEY = 'inflight-generation-job';
/** A record older than this is stale: the server job is long done or dead. */
export const INFLIGHT_JOB_TTL_MS = 15 * 60 * 1000;
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
}

export type InflightGenerationJobRead =
  | { kind: 'none' }
  | { kind: 'invalid' }
  | { kind: 'expired'; job: InflightGenerationJob }
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
  };
}

/** Pure: classify a raw MMKV value. */
export function parseInflightGenerationJob(
  raw: string | null | undefined,
  now = Date.now(),
): InflightGenerationJobRead {
  if (!raw) return { kind: 'none' };
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { kind: 'invalid' };
  }
  const job = toInflightGenerationJob(parsed);
  if (!job) return { kind: 'invalid' };
  // Negated `<` so a NaN clock lands on expired rather than active.
  if (!(now - job.submittedAt < INFLIGHT_JOB_TTL_MS)) return { kind: 'expired', job };
  return { kind: 'active', job };
}

/**
 * Read the persisted record. A stale or unreadable record is removed on read,
 * as both screens always did, so nothing keeps bouncing on a dead job.
 */
export function readInflightGenerationJob(now = Date.now()): InflightGenerationJobRead {
  const raw = mmkvStorage.getItem(INFLIGHT_GENERATION_JOB_KEY) as string | null;
  const read = parseInflightGenerationJob(raw, now);
  if (read.kind === 'expired' || read.kind === 'invalid') clearInflightGenerationJob();
  return read;
}

export function writeInflightGenerationJob(job: InflightGenerationJob): void {
  mmkvStorage.setItem(INFLIGHT_GENERATION_JOB_KEY, JSON.stringify(job));
}

export function clearInflightGenerationJob(): void {
  mmkvStorage.removeItem(INFLIGHT_GENERATION_JOB_KEY);
}

export type TodayInflightDecision =
  | { action: 'none' }
  /** App-kill recovery: the reader never chose to leave, so /generating owns the wait. */
  | { action: 'resume-on-generating'; job: InflightGenerationJob }
  /** The reader chose Today: keep the record, show preparing, watch from here. */
  | { action: 'watch-on-today'; job: InflightGenerationJob };

/** Pure: what Today does with the record it finds on mount. */
export function resolveTodayInflightAction(read: InflightGenerationJobRead): TodayInflightDecision {
  if (read.kind !== 'active') return { action: 'none' };
  return read.job.leftForHome
    ? { action: 'watch-on-today', job: read.job }
    : { action: 'resume-on-generating', job: read.job };
}

/**
 * "Go home — we'll keep writing": mark the active record as left for Today
 * and return it (null when no job was submitted yet). The record is kept, not
 * removed, so the server job keeps running and Today can watch it. Synchronous
 * on purpose: nothing may sit between the tap and the navigation.
 */
export function markInflightJobLeftForHome(now = Date.now()): InflightGenerationJob | null {
  const read = readInflightGenerationJob(now);
  if (read.kind !== 'active') return null;
  const record = { ...read.job, leftForHome: true as const };
  writeInflightGenerationJob(record);
  return record;
}

/** Title for the preparing card while the first series has no name yet. */
export function resolvePreparingFirstSeriesTitle(sessionTitle: string | null | undefined): string {
  const trimmed = sessionTitle?.trim();
  if (!trimmed || trimmed === GENERATING_SESSION_TITLE_PLACEHOLDER) return PREPARING_FIRST_SERIES_FALLBACK_TITLE;
  return trimmed;
}
