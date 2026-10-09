import { peekSyncOutbox } from './sync-outbox';

/**
 * Series deleted while the app runs, here or by a sync that applied another
 * device's delete. A pull that was already out when the delete applied still
 * answers with the live copy, and must not restore it. Before the server has a
 * delete made here, its queued tombstone says the same.
 */
const deletedSeriesIds = new Set<string>();

export function rememberDeletedSeries(devotionalId: string): void {
  deletedSeriesIds.add(devotionalId);
}

/** The reader's series was deleted: during this run, or by a delete still in the outbox. */
export function wasSeriesDeleted(devotionalId: string): boolean {
  return deletedSeriesIds.has(devotionalId)
    || peekSyncOutbox().some((change) => change.table === 'devotionals' && change.deleted && change.id === devotionalId);
}

export function resetDeletedSeriesForTesting(): void {
  deletedSeriesIds.clear();
}
