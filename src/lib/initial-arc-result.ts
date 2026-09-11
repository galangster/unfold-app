/**
 * Landing a finished first-series (`initial_arc`) job in the store. Moved out
 * of /generating so Today can land the same result when the reader chose to
 * wait there instead: same devotional shell, same scripture bookkeeping, same
 * session bookkeeping, whichever screen sees the job finish.
 */
import { useUnfoldStore, type Devotional, type DevotionalDay, type SeriesArc, type UserProfile } from '@/lib/store';
import { readAutoTrialIntent, settleLandedAutoTrialSeries, transitionAutoTrialIntent } from '@/lib/auto-trial-intent';
import { clearInflightGenerationJob } from '@/lib/inflight-generation-job';
import { clearInitialGenerationRequestId } from '@/lib/initial-generation-request';
import { extractBookFromReference } from '@/lib/devotional-service';
import type { InflightInitialArcWatchOutcome } from '@/lib/inflight-initial-arc-watch';
import { logBugEvent, logBugError } from '@/lib/bug-logger';
import { logger } from '@/lib/logger';
import {
  assertSyncSessionCurrent,
  isGenerationSessionInvalidatedError,
  isSyncSessionCurrent,
} from '@/lib/generation-session';

export const DEFAULT_SERIES_TITLE = 'Your Devotional';

export interface InitialArcResult {
  devotionalDay: DevotionalDay;
  seriesTitle?: string;
  totalDays?: number;
  arc?: SeriesArc;
  devotionalId?: string | null;
  seriesStartDate?: string;
}

interface InitialArcResultContext {
  user: UserProfile | null | undefined;
  devotionalLength: number;
  /** Originating reset session. Required so a late apply cannot recapture. */
  session: number;
}

interface AppliedInitialArcResult {
  devotionalId: string;
  seriesTitle: string;
  day1: DevotionalDay;
}

export function requireCanonicalDevotionalId(devotionalId?: string | null, context = 'generation completion'): string {
  if (!devotionalId) {
    throw new Error(`${context} did not return a canonical devotionalId`);
  }

  return devotionalId;
}

/**
 * Put day 1 in the store, record its scripture, drop the in-flight record and
 * mark the generation session complete. Idempotent: when the shell already
 * exists (a retry, or the sync pull landed it first) only the day is added,
 * and the store ignores a day it already holds.
 */
export function applyInitialArcResult(
  result: InitialArcResult,
  { user, devotionalLength, session }: InitialArcResultContext,
): AppliedInitialArcResult {
  assertSyncSessionCurrent(session, 'apply initial arc');
  const devotionalId = requireCanonicalDevotionalId(result.devotionalId);
  const seriesTitle = result.seriesTitle ?? DEFAULT_SERIES_TITLE;
  const totalDays = result.totalDays ?? devotionalLength;
  const day1 = result.devotionalDay;
  const store = useUnfoldStore.getState();

  const existingDevotional = store.devotionals.find((d) => d.id === devotionalId);

  if (existingDevotional) {
    store.addGeneratedDay(devotionalId, day1);
  } else {
    const serverAnchor = [result.seriesStartDate, day1.generatedAt].find(
      (value): value is string => typeof value === 'string' && !Number.isNaN(new Date(value).getTime()),
    );
    const seriesStartDate = serverAnchor ?? new Date().toISOString();
    const newDevotional: Devotional = {
      id: devotionalId,
      title: seriesTitle,
      totalDays,
      currentDay: 1,
      days: [day1],
      createdAt: seriesStartDate,
      seriesStartDate,
      userContext: {
        name: user?.name ?? '',
        aboutMe: user?.aboutMe ?? '',
        currentSituation: user?.currentSituation ?? '',
        emotionalState: user?.emotionalState ?? '',
      },
      themeCategory: user?.selectedTheme,
      devotionalType: user?.selectedType || 'personal',
      studySubject: user?.selectedStudySubject,
      generationMode: 'progressive',
      seriesArc: result.arc,
      progressiveMemory: { fullDays: [], summaries: [], narrative: null },
    };
    store.addDevotional(newDevotional);
  }

  const intent = readAutoTrialIntent();
  if (intent && intent.devotionalId === devotionalId && result.arc?.seriesKind === 'auto_trial') {
    settleLandedAutoTrialSeries(intent, devotionalId);
  }

  if (day1.scriptureReference) {
    // The same book key the scripture variance engine writes, so day 1's
    // reference counts against the books it avoids.
    store.addUsedScriptures([{
      reference: day1.scriptureReference,
      book: extractBookFromReference(day1.scriptureReference),
      usedAt: new Date().toISOString(),
      devotionalId,
    }]);
  }

  // Generation succeeded — nothing is in flight any more.
  clearInflightGenerationJob();
  clearInitialGenerationRequestId();
  store.completeGenerationSession({ title: seriesTitle });

  return { devotionalId, seriesTitle, day1 };
}

/**
 * Settle a Today-side watch the way /generating settles its own poll loop:
 * a finished job lands in the store, a failed one clears the in-flight record
 * and marks the session failed. An unreachable server is not a verdict: the
 * session takes the connection copy so Today shows the failed card, but the
 * record stays for the next attempt. A cancelled watch leaves everything for
 * the next watcher.
 */
export function settleInflightInitialArcWatch(
  outcome: InflightInitialArcWatchOutcome,
  { jobId, session }: { jobId: string; session: number },
): void {
  if (outcome.kind === 'cancelled') return;
  if (!isSyncSessionCurrent(session)) return;

  const store = useUnfoldStore.getState();

  if (outcome.kind === 'complete') {
    try {
      const user = store.user;
      const applied = applyInitialArcResult(outcome.result, {
        user,
        devotionalLength: user?.devotionalLength ?? 7,
        session,
      });
      void logBugEvent('generation', 'server-generation-complete', {
        devotionalId: applied.devotionalId,
        title: applied.seriesTitle,
        dayTitle: applied.day1.title,
        landedOn: 'today',
      });
    } catch (err) {
      if (isGenerationSessionInvalidatedError(err) || !isSyncSessionCurrent(session)) {
        return;
      }
      const message = err instanceof Error ? err.message : String(err);
      logger.error('[home] Could not land the finished first series:', message);
      clearInflightGenerationJob();
      store.failGenerationSession(message);
      void logBugError('generation', err, { jobId, phase: 'today-apply-initial-arc' });
    }
    return;
  }

  if (outcome.kind === 'unreachable') {
    if (!isSyncSessionCurrent(session)) return;
    logger.warn('[home] server-poll-unreachable:', outcome.message);
    store.failGenerationSession(outcome.message);
    void logBugError('generation', new Error(outcome.message), { jobId, phase: 'server-poll-unreachable' });
    return;
  }

  if (!isSyncSessionCurrent(session)) return;
  logger.error(`[home] ${outcome.phase}:`, outcome.message);
  clearInflightGenerationJob();
  store.failGenerationSession(outcome.message);
  void logBugError('generation', new Error(outcome.message), { jobId, phase: outcome.phase });

  const writeFailed = outcome.kind === 'failed' && (
    (outcome.phase === 'server-poll' && outcome.canRetry === false)
    || outcome.phase === 'server-poll-invalid-result'
  );
  if (!writeFailed) return;
  const intent = readAutoTrialIntent();
  if (intent?.status !== 'submitted' || intent.jobId !== jobId) return;
  transitionAutoTrialIntent('failed', { failureCode: outcome.phase }, { nowMs: Date.now() });
}
