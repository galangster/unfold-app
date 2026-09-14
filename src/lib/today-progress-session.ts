export interface ProgressHistoryRef {
  current: { seriesKey: string; progress: number } | null;
}

// Keep one observed series in memory. A cold entry has no history, and
// switching identity or series discards it instead of replaying old progress.
let session: { identityKey: string; seriesKey: string; history: ProgressHistoryRef } | null = null;

export function getTodayProgressHistory(identityKey: string, seriesKey: string): ProgressHistoryRef {
  if (session?.identityKey !== identityKey || session.seriesKey !== seriesKey) {
    clearTodayProgressHistory();
    session = { identityKey, seriesKey, history: { current: null } };
  }
  return session.history;
}

export function clearTodayProgressHistory(): void {
  if (session) session.history.current = null;
  session = null;
}
