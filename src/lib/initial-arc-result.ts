/**
 * Landing a finished first-series (`initial_arc`) job in the store. Moved out
 * of /generating so Today can land the same result when the reader chose to
 * wait there instead: same devotional shell, same scripture bookkeeping, same
 * session bookkeeping, whichever screen sees the job finish.
 */
import { flushUnfoldStorePersist, useUnfoldStore, type Devotional, type DevotionalDay, type SeriesArc, type UserProfile } from '@/lib/store';
import { readAutoTrialIntent, settleLandedAutoTrialSeries, transitionAutoTrialIntent } from '@/lib/auto-trial-intent';
import { isOnboardingFirstReading, isOnboardingSampleDevotionalId } from '@/lib/auto-trial-series';
import { isSeriesComplete } from '@/lib/book-of-seasons';
import { isDevotionalArchived } from '@/lib/devotional-lifecycle';
import { isStrictActiveSeriesWinner } from '@/lib/devotional-active-selection';
import { clearInflightGenerationJob } from '@/lib/inflight-generation-job';
import { clearInitialGenerationRequestId } from '@/lib/initial-generation-request';
import { extractBookFromReference } from '@/lib/devotional-service';
import type { InflightInitialArcWatchOutcome } from '@/lib/inflight-initial-arc-watch';
import { logBugEvent, logBugError } from '@/lib/bug-logger';
import { logger } from '@/lib/logger';
import { clearReplacedSeries, readReplacedSeries } from '@/lib/series-replacement';
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

type ReaderContext = Pick<Devotional, 'userContext' | 'themeCategory' | 'devotionalType' | 'studySubject'>;

/**
 * Today holds no series the reader chose: none, one that is gone or
 * archived, or onboarding's first reading.
 */
function holdsNoChosenSeries(current: Devotional | undefined): boolean {
  return !current
    || isDevotionalArchived(current)
    || isOnboardingSampleDevotionalId(current.id)
    || isOnboardingFirstReading(current);
}

/**
 * Whether a landed series the store already holds may become current. The
 * sync pull inserts a new series without selecting it (it adopts only an
 * explicit resume), so a pull that beats the job result used to leave Today
 * empty. Select it as a fresh shell is selected, but only in place of no
 * chosen series, the finished journey it was started from, or this
 * generation's own series: never over a live series the reader picked
 * meanwhile. An archived row is never selected, because selecting it would
 * unarchive a series archived on another device. And only the series the
 * server writes, the strict active winner, is selected: beside a newer live
 * series (one another device started, say) this one stays off Today, where
 * its later days would be refused as not active.
 */
function canSelectLandedSeries(landed: Devotional): boolean {
  if (isDevotionalArchived(landed)) return false;
  const { currentDevotionalId, devotionals } = useUnfoldStore.getState();
  if (!isStrictActiveSeriesWinner(landed.id, devotionals)) return false;
  if (currentDevotionalId === landed.id) return true;
  const current = devotionals.find((row) => row.id === currentDevotionalId);
  return holdsNoChosenSeries(current) || isSeriesComplete(current);
}

/**
 * A shell the sync pull landed first carries only the series columns. Give
 * it the reader context the land-first shell is built with, on this device
 * only, without replacing anything the row already holds.
 */
function fillMissingReaderContext(devotionalId: string, context: ReaderContext): void {
  useUnfoldStore.setState((state) => ({
    devotionals: state.devotionals.map((row) => (row.id !== devotionalId ? row : {
      ...row,
      userContext: Object.values(row.userContext ?? {}).some(Boolean) ? row.userContext : context.userContext,
      themeCategory: row.themeCategory ?? context.themeCategory,
      devotionalType: row.devotionalType ?? context.devotionalType,
      studySubject: row.studySubject ?? context.studySubject,
    })),
  }));
}

/**
 * Put day 1 in the store, record its scripture, drop the in-flight record and
 * mark the generation session complete. Idempotent: when the shell already
 * exists (a retry, or the sync pull landed it first) only the day is added,
 * and the store ignores a day it already holds; the series still becomes
 * current when the server writes it and nothing the reader chose holds Today.
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

  // The series "Start a new series" replaces ends now that this one exists.
  // First, so Today moves off the old series: to this one when a sync pull
  // already landed it, otherwise to the shell added below.
  const replacedId = readReplacedSeries();
  if (replacedId && replacedId !== devotionalId) {
    useUnfoldStore.getState().archiveReplacedDevotional(replacedId, devotionalId);
  }

  const store = useUnfoldStore.getState();

  const existingDevotional = store.devotionals.find((d) => d.id === devotionalId);
  const readerContext: ReaderContext = {
    userContext: {
      name: user?.name ?? '',
      aboutMe: user?.aboutMe ?? '',
      currentSituation: user?.currentSituation ?? '',
      emotionalState: user?.emotionalState ?? '',
    },
    themeCategory: user?.selectedTheme,
    devotionalType: user?.selectedType || 'personal',
    studySubject: user?.selectedStudySubject,
  };

  if (existingDevotional) {
    store.addGeneratedDay(devotionalId, day1);
    fillMissingReaderContext(devotionalId, readerContext);
    if (canSelectLandedSeries(existingDevotional)) {
      store.setCurrentDevotional(devotionalId);
    }
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
      ...readerContext,
      generationMode: 'progressive',
      seriesArc: result.arc,
      progressiveMemory: { fullDays: [], summaries: [], narrative: null },
    };
    store.addDevotional(newDevotional);
  }

  const intent = readAutoTrialIntent();
  if (intent && intent.devotionalId === devotionalId) {
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

  // Generation succeeded — nothing is in flight any more. The new series and
  // the replaced one's end reach disk before their recovery records go: the
  // outbox already holds that end, and a crash before the store's delayed
  // write would otherwise leave no new series and no way to land it again.
  // Landing the same result twice is safe.
  store.completeGenerationSession({ title: seriesTitle });
  flushUnfoldStorePersist();
  if (replacedId) clearReplacedSeries();
  clearInflightGenerationJob();
  clearInitialGenerationRequestId();

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
