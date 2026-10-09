/**
 * Persistent sync outbox for offline-tolerant change delivery.
 *
 * All changes that fail to reach /api/sync/push (network error, non-ok
 * response, rejected results) are enqueued here and drained:
 *   1. On app reconnect (NetInfo listener via useSyncOutboxDrain hook)
 *   2. On Today screen focus (today/index.tsx useFocusEffect)
 *
 * Invariants:
 *  - Single-flight drain: concurrent drainSyncOutbox() calls collapse into one.
 *  - Dedup: table+id keyed; later clientUpdatedAt wins, and on an equal
 *    timestamp the later enqueue wins (writes are ms-resolution; a flush
 *    can put several writes to one record in the same millisecond).
 *  - Durable queue is uncapped. Drain posts at most 500 changes and 5 MiB
 *    per request. Each initial snapshot is attempted once per cycle.
 *  - Never throws: drain resolves (not rejects) on network failure.
 *  - Only accepted results and conflicts with object serverData clear a
 *    submitted entry when the current snapshot equals the sent snapshot.
 *    Rejected results, especially internal error, stay queued. A valid
 *    conflict is applied locally after the outbox settles, except a live
 *    row answering a series delete: that delete is queued again.
 */

import { mmkvStorage, getDeviceId } from '@/lib/mmkv-storage';
import { isEphemeralDeviceId } from '@/lib/device-id';
import { PRIMARY_BACKEND_URL, getAuthHeaders } from '@/lib/api-config';
import { authenticatedFetch } from '@/lib/device-credential';
import {
  createSyncPushBodyEnvelope,
  selectEncodedSyncPushBatch,
  type SyncPushBodyEnvelope,
} from '@/lib/sync-push-body';
import {
  correlateSyncAcknowledgements,
  isValidConflictResult,
  resolvingAcknowledgementPairs,
  syncSnapshotsEqual,
  type SyncAcknowledgementPair,
} from '@/lib/sync-acknowledgements';
import type { SyncPushChange, SyncPushResult, SyncTable } from '@/lib/sync-types';
import { createSyncOperation } from './sync-operation';
// RS13-1: single owner — the key is defined in mmkv-recovery-outbox.ts (pure, no native deps)
// and re-exported here so all consumers import from one place via sync-outbox.
import { RECOVERY_OUTBOX_KEY } from '@/lib/mmkv-recovery-outbox';
import {
  captureSyncSession,
  isSyncSessionCurrent,
} from '@/lib/sync-session-fence';

// Re-export the type so consumers can import from one place
export type { SyncPushChange };

// Re-export the canonical key so consumers don't need to know where it lives.
export const OUTBOX_KEY = RECOVERY_OUTBOX_KEY;
const MAX_PUSH_CHANGES = 500;
const MAX_PUSH_BODY_BYTES = 5 * 1024 * 1024;

// mmkvStorage.getItem has a union return type (string | null | Promise<...>)
// for the StateStorage contract, but our adapter is synchronous. Cast once here.
function syncGet(key: string): string | null {
  const val = mmkvStorage.getItem(key);
  if (val instanceof Promise) return null; // guard; never happens with our adapter
  return val;
}

function readOutbox(): SyncPushChange[] {
  const raw = syncGet(OUTBOX_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as SyncPushChange[]) : [];
  } catch {
    return [];
  }
}

function writeOutbox(changes: SyncPushChange[]): void {
  mmkvStorage.setItem(OUTBOX_KEY, JSON.stringify(changes));
}

export function peekSyncOutbox(): SyncPushChange[] {
  return readOutbox();
}

/**
 * Replace the whole queue. Only the store migration uses this, to re-key
 * queued journal writes when entry ids became day-derived; ordinary writers
 * go through enqueueSyncChanges so dedup applies.
 */
export function replaceSyncOutbox(changes: SyncPushChange[]): void {
  writeOutbox(changes);
}

export function removeSyncChangesForRecords(records: Array<{ table: SyncTable; id: string }>): void {
  if (records.length === 0) return;
  const keys = new Set(records.map((record) => `${record.table}:${record.id}`));
  const current = readOutbox();
  const remaining = current.filter((change) => !keys.has(`${change.table}:${change.id}`));
  if (remaining.length !== current.length) writeOutbox(remaining);
}

/**
 * Minimum interval (ms) between completed drain cycles (RS10-4).
 * Two trigger sources — NetInfo + Today-focus — can both fire within
 * a few hundred milliseconds of reconnect. The guard collapses them
 * into one POST unless new entries were enqueued after the last drain.
 */
export const MIN_DRAIN_INTERVAL_MS = 15_000;

// Timestamp (Date.now()) when the last drain cycle completed successfully
// (i.e. the POST returned ok). 0 means "never drained".
let lastDrainCompletedAt = 0;

// Monotonic enqueue revision. Marks that the queued snapshot changed.
// A cycle captures this beside its immutable initial snapshot and records
// that captured value on successful same-session completion.
let enqueueRevision = 0;
let lastAttemptedEnqueueRevision = 0;

export function enqueueSyncChanges(changes: SyncPushChange[]): void {
  // FAP-LIB-1: never queue work minted under an ephemeral recovery identity.
  // Sync row ids derive from getDeviceId() (user-profile-sync, onboarding
  // sample ids), so entries built this session are keyed to an identity that
  // dies with the session — draining them later (even under the restored real
  // identity) would create permanently orphaned server rows. The recovery
  // session's local data is throwaway by design (REVM-4); dropping its queue
  // entries is the consistent choice.
  if (isEphemeralDeviceId(getDeviceId())) return;

  const current = readOutbox();

  // Build a map keyed by table:id for O(n) dedup
  const map = new Map<string, SyncPushChange>();
  for (const c of current) {
    map.set(`${c.table}:${c.id}`, c);
  }

  for (const c of changes) {
    const key = `${c.table}:${c.id}`;
    const existing = map.get(key);
    // `>=`: a later write in the same millisecond is the newer snapshot.
    if (!existing || c.clientUpdatedAt >= existing.clientUpdatedAt) {
      map.set(key, c);
    }
  }

  writeOutbox(Array.from(map.values()));
  enqueueRevision += 1;
}

/**
 * Settles a push sent outside the drain for changes that were queued first.
 * An accepted result clears its queued copy while the queue still holds the
 * snapshot that was sent. Anything else stays queued for the drain, which
 * also applies a conflict's server row.
 */
export function settleDirectSyncPush(sent: readonly SyncPushChange[], rawResults: readonly unknown[]): void {
  const accepted = correlateSyncAcknowledgements(sent, rawResults)
    .filter((pair) => pair.result.status === 'accepted');
  if (accepted.length === 0) return;
  const current = readOutbox();
  const remaining = current.filter((entry) => !accepted.some((pair) => syncSnapshotsEqual(entry, pair.change)));
  if (remaining.length !== current.length) writeOutbox(remaining);
}

function takeTransportBatch(
  initial: readonly SyncPushChange[],
  start: number,
  liveByKey: ReadonlyMap<string, SyncPushChange>,
  envelope: SyncPushBodyEnvelope,
) {
  return selectEncodedSyncPushBatch(
    initial,
    start,
    (candidate) => {
      const live = liveByKey.get(`${candidate.table}:${candidate.id}`);
      return !!live && syncSnapshotsEqual(live, candidate);
    },
    envelope,
    MAX_PUSH_CHANGES,
    MAX_PUSH_BODY_BYTES,
  );
}

/**
 * Reset drain interval state. Exported for test isolation only —
 * production code must never call this.
 */
export function resetDrainStateForTesting(): void {
  inflight = null;
  lastDrainCompletedAt = 0;
  enqueueRevision = 0;
  lastAttemptedEnqueueRevision = 0;
}

/**
 * A `conflict` result means the server kept its (newer) row and dropped
 * ours; `serverData` is that row. Its updated_at did not move, so the
 * incremental pull would never bring it down and the two devices would
 * diverge for good. Feed it through the pull mappers — same LWW guard, so a
 * newer local change still pending in the outbox is left alone.
 */
function applyConflictResults(results: SyncPushResult[]): void {
  const conflicts = results.filter(isValidConflictResult);
  if (conflicts.length === 0) return;
  try {
    // full-sync-pull imports the store, and the store reaches this module
    // through personal-data-sync-records: a static import here would be a
    // cycle. The mappers are only needed once a conflict actually arrives.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const pull = require('./full-sync-pull') as typeof import('./full-sync-pull');
    pull.applyServerConflictRecords(conflicts);
  } catch {
    // Best effort: the outbox entry is already resolved either way.
  }
}

/**
 * A server write (worker, cron) can stamp a series after it was deleted here
 * and before the delete went out. The server then answers the delete with its
 * live row, and applying that row would restore the series. Day rows the
 * server keeps cannot restore anything: a day applies only under a series this
 * phone still holds.
 */
function isLostSeriesDelete(pair: SyncAcknowledgementPair): boolean {
  return pair.change.table === 'devotionals'
    && pair.change.deleted
    && isValidConflictResult(pair.result)
    && !pair.result.serverData?.deletedAt;
}

/** The latest clock on the server row, in ms, or now when the row carries none. */
function serverRowClock(result: SyncPushResult): number {
  const row = result.serverData ?? {};
  const clocks = [row.clientUpdatedAt, row.updatedAt, result.serverUpdatedAt]
    .map((value) => (typeof value === 'string' ? Date.parse(value) : Number.NaN))
    .filter(Number.isFinite);
  return clocks.length > 0 ? Math.max(...clocks) : Date.now();
}

function rememberLostSeriesDelete(id: string, deletedAt: string): void {
  // deleted-series reads this queue, so a static import here would be a cycle.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const deleted = require('./deleted-series') as typeof import('./deleted-series');
  deleted.rememberDeletedSeries(id, deletedAt);
}

// Single-flight guard — concurrent drains collapse into one POST
type InFlightDrain = {
  session: number;
  promise: Promise<void>;
};

type SyncDrainOptions = { deadlineAt?: number };

let inflight: InFlightDrain | null = null;
const acknowledgementListeners = new Set<(pair: SyncAcknowledgementPair, session: number) => void>();

/** Observe the acknowledgement of this exact snapshot, never infer it from queue removal. */
export async function drainSyncChange(
  change: SyncPushChange,
  session = captureSyncSession(),
  options: SyncDrainOptions = {},
): Promise<SyncPushResult | undefined> {
  if (!isSyncSessionCurrent(session)) return undefined;
  let acknowledged: SyncPushResult | undefined;
  const listener = (pair: SyncAcknowledgementPair, acknowledgedSession: number) => {
    if (acknowledgedSession === session && syncSnapshotsEqual(pair.change, change)) {
      acknowledged = pair.result;
    }
  };
  acknowledgementListeners.add(listener);
  const joinedOlderDrain = inflight?.session === session;
  const observer = createSyncOperation({ action: 'sync acknowledgement', session, deadlineAt: options.deadlineAt });
  try {
    observer.assertCurrent();
    await observer.wait(drainSyncOutbox());
    // A single-flight cycle has an immutable initial snapshot. Fresh work
    // queued during that cycle gets its own cycle, using the existing backoff.
    if (!acknowledged && joinedOlderDrain && isSyncSessionCurrent(session)
      && peekSyncOutbox().some((entry) => syncSnapshotsEqual(entry, change))) {
      observer.assertCurrent();
      await observer.wait(drainSyncOutbox());
    }
    return isSyncSessionCurrent(session) ? acknowledged : undefined;
  } catch {
    return undefined;
  } finally {
    observer.dispose();
    acknowledgementListeners.delete(listener);
  }
}

export function drainSyncOutbox(): Promise<void> {
  // FAP-LIB-1 (orphaned-pushes): never POST under an ephemeral recovery
  // identity — the X-Device-ID header would file every change under a
  // one-session identity the real client can never read back. Keep the
  // outbox intact: entries are carried across recovery boots (RS5-4) and
  // drained after a normal boot restores the real identity (RS2-1 merge).
  if (isEphemeralDeviceId(getDeviceId())) return Promise.resolve();

  const session = captureSyncSession();
  if (!isSyncSessionCurrent(session)) return Promise.resolve();

  // Min-interval guard (RS10-4): skip if a drain completed recently AND no
  // new enqueue revision exists since that cycle's captured revision.
  // Fresh work bypasses the 15-second wall-clock retry used for unchanged
  // rejected snapshots.
  const now = Date.now();
  const intervalNotExpired = now - lastDrainCompletedAt < MIN_DRAIN_INTERVAL_MS;
  const noNewEnqueueSinceLastAttempt = enqueueRevision <= lastAttemptedEnqueueRevision;
  if (lastDrainCompletedAt > 0 && intervalNotExpired && noNewEnqueueSinceLastAttempt) {
    return Promise.resolve();
  }

  if (inflight && inflight.session === session) return inflight.promise;
  const operation = createSyncOperation({ action: 'sync push', session, deadlineAt: Date.now() + 15_000 });

  const promise = (async () => {
    try {
      operation.assertCurrent();
      const initial = readOutbox();
      const capturedRevision = enqueueRevision;
      if (initial.length === 0) return;
      const headers = await operation.wait(getAuthHeaders());

      const envelope = createSyncPushBodyEnvelope();
      let offset = 0;
      let completed = true;
      while (offset < initial.length) {
        if (!isSyncSessionCurrent(session)) {
          completed = false;
          break;
        }

        const liveByKey = new Map(
          readOutbox().map((entry) => [`${entry.table}:${entry.id}`, entry] as const),
        );
        const { batch, next, body } = takeTransportBatch(initial, offset, liveByKey, envelope);
        offset = next;
        if (batch.length === 0) continue;

        operation.setDeadlineAt(Date.now() + 15_000);
        operation.assertCurrent();

        const response = await operation.wait(authenticatedFetch(`${PRIMARY_BACKEND_URL}/api/sync/push`, {
          method: 'POST',
          headers,
          body,
          signal: operation.signal,
        }));

        if (!response.ok) {
          completed = false;
          break;
        }

        const payload = (await operation.wait(response.json().catch(() => null))) as {
          results?: unknown[];
        } | null;

        operation.assertCurrent();

        const resolving = resolvingAcknowledgementPairs(batch, payload?.results ?? []);
        const resolvingByKey = new Map(
          resolving.map((pair) => [`${pair.change.table}:${pair.change.id}`, pair] as const),
        );
        const remaining = readOutbox().filter((entry) => {
          const pair = resolvingByKey.get(`${entry.table}:${entry.id}`);
          return !pair || !syncSnapshotsEqual(entry, pair.change);
        });
        // A lost series delete is queued again, stamped past the server's
        // clock, for the next drain. Its live row is never applied: the
        // requeued delete keeps it out of conflictsToApply below.
        for (const pair of resolving.filter(isLostSeriesDelete)) {
          if (remaining.some((entry) => entry.table === pair.change.table && entry.id === pair.change.id)) continue;
          const retriedAt = new Date(Math.max(serverRowClock(pair.result), Date.now()) + 1).toISOString();
          remaining.push({ ...pair.change, clientUpdatedAt: retriedAt });
          // Remembered at the retry's own clock: a server write that lands
          // while the retry is out is older than it, so its row cannot
          // restore the series once the retry leaves the outbox.
          rememberLostSeriesDelete(pair.change.id, retriedAt);
        }
        writeOutbox(remaining);
        const conflictsToApply = resolving
          .filter((pair) => isValidConflictResult(pair.result))
          .filter((pair) => !remaining.some((entry) => (
            entry.table === pair.change.table && entry.id === pair.change.id
          )))
          .map((pair) => pair.result);
        applyConflictResults(conflictsToApply);
        operation.assertCurrent();
        for (const pair of resolving) {
          for (const listener of acknowledgementListeners) listener(pair, session);
        }
      }
      if (completed && isSyncSessionCurrent(session)) {
        lastAttemptedEnqueueRevision = capturedRevision;
        lastDrainCompletedAt = Date.now();
      }
    } catch {
      // Network error / timeout / abort — keep the outbox intact for retry
    } finally {
      operation.dispose();
    }
  })().finally(() => {
    if (inflight?.promise === promise) inflight = null;
  });

  inflight = { session, promise };
  return promise;
}
