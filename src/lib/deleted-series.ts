import { DELETED_SERIES_KEY, keepNewestDeletes, parseDeletedSeriesClocks } from './mmkv-recovery-outbox';
import { mmkvStorage } from './mmkv-storage';
import { peekSyncOutbox } from './sync-outbox';

export { DELETED_SERIES_KEY };

/**
 * Series deleted here, or by a sync that applied another device's delete,
 * each with its delete's clock. A pull or full sync that was already out when
 * the delete applied still answers with the older live copy, and must not
 * restore it. A row the server kept past the delete (the delete lost) is live
 * again. Before the server has a delete made here, its queued tombstone says
 * the same.
 *
 * The clocks are kept on disk, so a finished generation job that lands after
 * a restart cannot bring a deleted series back once its tombstone has left
 * the outbox. Only the newest deletes are kept. A normal boot merges the
 * clocks a recovery session wrote into the real store (`mmkv-storage.ts`).
 * `full-reset.ts` wipes the key with the account's other data.
 */
let deletedAtById: Map<string, number> | null = null;

function deletedClocks(): Map<string, number> {
  deletedAtById ??= parseDeletedSeriesClocks(mmkvStorage.getItem(DELETED_SERIES_KEY) as string | null);
  return deletedAtById;
}

export function rememberDeletedSeries(devotionalId: string, deletedAt: string): void {
  const at = Date.parse(deletedAt);
  if (!Number.isFinite(at)) return;
  const clocks = deletedClocks();
  const known = clocks.get(devotionalId);
  if (known !== undefined && known >= at) return;
  clocks.set(devotionalId, at);
  keepNewestDeletes(clocks);
  try {
    mmkvStorage.setItem(DELETED_SERIES_KEY, JSON.stringify(Object.fromEntries(clocks)));
  } catch {
    // The clock still holds for this session, and a queued tombstone covers it until it syncs.
  }
}

/** The series was deleted, and the row in hand (if any) is no newer than that delete. */
export function wasSeriesDeleted(devotionalId: string, rowUpdatedAt?: string): boolean {
  const deletedAt = deletedClocks().get(devotionalId);
  const rowAt = rowUpdatedAt ? Date.parse(rowUpdatedAt) : Number.NaN;
  if (deletedAt !== undefined && !(rowAt > deletedAt)) return true;
  return peekSyncOutbox().some((change) => change.table === 'devotionals' && change.deleted && change.id === devotionalId);
}

/** Forget the remembered deletes in memory. A full reset wipes the stored copy. */
export function clearDeletedSeriesCache(): void {
  deletedAtById = new Map();
}

export function resetDeletedSeriesForTesting(): void {
  deletedAtById = null;
  mmkvStorage.removeItem(DELETED_SERIES_KEY);
}
