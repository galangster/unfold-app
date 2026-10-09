import { peekSyncOutbox } from './sync-outbox';

/**
 * Series deleted while the app runs, here or by a sync that applied another
 * device's delete, each with its delete's clock. A pull or full sync that was
 * already out when the delete applied still answers with the older live
 * copy, and must not restore it. A row the server kept past the delete (the
 * delete lost) is live again. Before the server has a delete made here, its
 * queued tombstone says the same.
 */
const deletedAtById = new Map<string, number>();

export function rememberDeletedSeries(devotionalId: string, deletedAt: string): void {
  const at = Date.parse(deletedAt);
  if (!Number.isFinite(at)) return;
  const known = deletedAtById.get(devotionalId);
  if (known === undefined || known < at) deletedAtById.set(devotionalId, at);
}

/** The series was deleted, and the row in hand (if any) is no newer than that delete. */
export function wasSeriesDeleted(devotionalId: string, rowUpdatedAt?: string): boolean {
  const deletedAt = deletedAtById.get(devotionalId);
  const rowAt = rowUpdatedAt ? Date.parse(rowUpdatedAt) : Number.NaN;
  if (deletedAt !== undefined && !(rowAt > deletedAt)) return true;
  return peekSyncOutbox().some((change) => change.table === 'devotionals' && change.deleted && change.id === devotionalId);
}

export function resetDeletedSeriesForTesting(): void {
  deletedAtById.clear();
}
