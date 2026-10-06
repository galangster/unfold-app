import { getPausedSeriesContinuationDay, pausedSeriesResumeClocks } from '../paused-series-recovery';
import { beginLocalResetSession, captureSyncSession, endLocalResetSession } from '../sync-session-fence';
import type { PausedSeriesRecoveryContext } from '../paused-series-recovery';
import type { Devotional } from '../store';

const now = new Date(2026, 9, 5, 12);
const yesterday = new Date(2026, 9, 4, 12).toISOString();

function context(): PausedSeriesRecoveryContext {
  return {
    devotional: {
      id: 'series-a', title: 'Saved series', currentDay: 2, totalDays: 7,
      generationMode: 'progressive', seriesStartDate: yesterday,
      days: [{ id: 'day-series-a-1', dayNumber: 1, isRead: true, readAt: yesterday }],
    } as Devotional,
    currentDevotionalId: 'series-b', dayNumber: 2,
    confirmedMissingDayKey: 'series-a:2', discoveredAbsentKey: 'series-a:2',
    generationState: { status: 'idle', discovered: true },
    isCheckingForSyncedDay: false, isFocused: true, isOnline: true,
    readBudgetBlocked: false,
  };
}

describe('paused series continuation', () => {
  it('observes a canonical sibling before the first intent in a new session', () => {
    const token = beginLocalResetSession();
    endLocalResetSession(token);
    const session = captureSyncSession();
    pausedSeriesResumeClocks.observeCanonical(session, [{ id: 'remote-sibling', createdAt: new Date(60_000).toISOString() }]);
    expect(pausedSeriesResumeClocks.nextIntentAt(session, 'series-a', [], 1000)).toBe('1970-01-01T00:01:00.001Z');
  });

  it('fences remembered clocks when the identity/session changes', () => {
    const session = captureSyncSession();
    pausedSeriesResumeClocks.nextIntentAt(session, 'series-a', [], 1000);
    pausedSeriesResumeClocks.observe(session, 'series-a', new Date(60_000).toISOString());
    const resetToken = beginLocalResetSession();
    expect(() => pausedSeriesResumeClocks.nextIntentAt(session, 'series-a', [], 1000)).toThrow('sync session is not current');
    pausedSeriesResumeClocks.observe(session, 'series-a', new Date(120_000).toISOString());
    endLocalResetSession(resetToken);
    expect(pausedSeriesResumeClocks.nextIntentAt(captureSyncSession(), 'series-a', [], 1000)).toBe('1970-01-01T00:00:01.001Z');
  });
  it('offers the missing current reading without changing saved progress or the start date', () => {
    const recovery = context();
    const before = JSON.stringify(recovery);
    expect(getPausedSeriesContinuationDay(recovery, now)).toBe(2);
    expect(JSON.stringify(recovery)).toBe(before);
  });

  it.each(['confirmedMissingDayKey', 'discoveredAbsentKey'] as const)(
    'requires the current-day proof from %s', (key) => {
      expect(getPausedSeriesContinuationDay({ ...context(), [key]: 'series-a:3' }, now)).toBeNull();
    },
  );

  it.each(['checking', 'running', 'slow', 'offline', 'service-error', 'blocked', 'complete'] as const)(
    'keeps %s recovery from becoming a continuation offer', (status) => {
      const recovery = context();
      recovery.generationState = { status } as PausedSeriesRecoveryContext['generationState'];
      expect(getPausedSeriesContinuationDay(recovery, now)).toBeNull();
    },
  );

  it.each(['isCheckingForSyncedDay', 'readBudgetBlocked'] as const)(
    'waits while %s is true', (key) => {
      expect(getPausedSeriesContinuationDay({ ...context(), [key]: true }, now)).toBeNull();
    },
  );

  it.each(['isFocused', 'isOnline'] as const)('waits while %s is false', (key) => {
    expect(getPausedSeriesContinuationDay({ ...context(), [key]: false }, now)).toBeNull();
  });

  it('does not offer continuation for the active series', () => {
    expect(getPausedSeriesContinuationDay({ ...context(), currentDevotionalId: 'series-a' }, now)).toBeNull();
  });

  it('does not offer continuation for an onboarding sample', () => {
    const recovery = context();
    recovery.devotional!.id = 'onboarding-sample-series-a';
    recovery.confirmedMissingDayKey = recovery.discoveredAbsentKey = 'onboarding-sample-series-a:2';
    expect(getPausedSeriesContinuationDay(recovery, now)).toBeNull();
  });

  it('does not offer continuation for a ready reading or a read day needing restoration', () => {
    for (const isRead of [false, true]) {
      const recovery = context();
      recovery.devotional!.days.push({ id: 'day-series-a-2', dayNumber: 2, isRead } as Devotional['days'][number]);
      expect(getPausedSeriesContinuationDay(recovery, now)).toBeNull();
    }
    const local = context();
    local.devotional!.days.push({ id: 'local-day-2', dayNumber: 2, isRead: true } as Devotional['days'][number]);
    expect(getPausedSeriesContinuationDay(local, now)).toBeNull();
  });

  it('does not skip progress for an arbitrary future deep link', () => {
    const recovery = context();
    recovery.dayNumber = 3;
    recovery.confirmedMissingDayKey = recovery.discoveredAbsentKey = 'series-a:3';
    expect(getPausedSeriesContinuationDay(recovery, now)).toBeNull();
  });

  it('keeps the next day closed until local midnight after a reading today', () => {
    const recovery = context();
    recovery.devotional!.days[0].readAt = new Date(2026, 9, 5, 9).toISOString();
    expect(getPausedSeriesContinuationDay(recovery, now)).toBeNull();
    expect(getPausedSeriesContinuationDay(recovery, new Date(2026, 9, 6, 0, 1))).toBe(2);
  });
});
