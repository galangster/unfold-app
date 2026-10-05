import type { Devotional } from './store';
import type { DailyGenerationRecoveryState } from './daily-generation-recovery';
import { getTodayReaderDayNumber, isPausedSeriesUnpreparedDay } from './devotional-day-access';
import { shouldWatchForGeneratedDay } from './generated-day-watch';
import { lifecycleTimestampMs } from './devotional-lifecycle';
import { assertSyncSessionCurrent, isSyncSessionCurrent } from './sync-session-fence';

/** Session-local clocks; a rejected lifecycle never becomes a store mutation. */
export class PausedSeriesResumeClocks {
  private session: number | null = null;
  private readonly clocks = new Map<string, number>();

  nextIntentAt(session: number, devotionalId: string, devotionals: readonly Devotional[], now = Date.now()): string {
    assertSyncSessionCurrent(session, 'paused series resume');
    if (this.session !== session) {
      this.session = session;
      this.clocks.clear();
    }
    let clock = now;
    for (const observed of this.clocks.values()) clock = Math.max(clock, observed);
    for (const series of devotionals) {
      clock = Math.max(clock, lifecycleTimestampMs(series.createdAt), lifecycleTimestampMs(series.archivedStateAt));
    }
    const next = clock + 1;
    this.clocks.set(devotionalId, next);
    return new Date(next).toISOString();
  }

  observe(session: number, devotionalId: string, archivedStateAt: string | undefined): void {
    if (this.session !== session || !isSyncSessionCurrent(session)) return;
    this.clocks.set(devotionalId, Math.max(this.clocks.get(devotionalId) ?? 0, lifecycleTimestampMs(archivedStateAt)));
  }
}

// Today/Study and reader re-entry share knowledge until the identity/session changes.
export const pausedSeriesResumeClocks = new PausedSeriesResumeClocks();

export interface PausedSeriesRecoveryContext {
  devotional: Devotional | null | undefined;
  currentDevotionalId: string | null;
  dayNumber: number;
  confirmedMissingDayKey: string | null;
  discoveredAbsentKey: string | null;
  generationState: DailyGenerationRecoveryState;
  isCheckingForSyncedDay: boolean;
  isFocused: boolean;
  isOnline: boolean;
  readBudgetBlocked: boolean;
}

/** A continuation offer requires a missing current reading, not a history visit. */
export function getPausedSeriesContinuationDay(
  context: PausedSeriesRecoveryContext,
  now = new Date(),
): number | null {
  const { devotional, dayNumber, generationState } = context;
  if (!devotional || !context.isFocused || !context.isOnline
    || context.isCheckingForSyncedDay || context.readBudgetBlocked) return null;
  if (devotional.id === context.currentDevotionalId
    || !isPausedSeriesUnpreparedDay(devotional, dayNumber, true)) return null;
  const key = `${devotional.id}:${dayNumber}`;
  if (context.confirmedMissingDayKey !== key || context.discoveredAbsentKey !== key) return null;
  // A stored absence verdict must not hide a newer job, connection, or service state.
  if (generationState.status !== 'idle' || generationState.discovered !== true) return null;
  if (dayNumber !== getTodayReaderDayNumber(devotional, now)
    || !shouldWatchForGeneratedDay(devotional, dayNumber, now)) return null;
  return dayNumber;
}
