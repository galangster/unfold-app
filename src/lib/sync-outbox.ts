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
 *    conflict is applied locally after the outbox settles.
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
  isValidConflictResult,
  resolvingAcknowledgementPairs,
  syncSnapshotsEqual,
} from '@/lib/sync-acknowledgements';
import type { SyncPushChange, SyncPushResult, SyncTable } from '@/lib/sync-types';
// RS13-1: single owner — the key is defined in mmkv-recovery-outbox.ts (pure, no native deps)
// and re-exported here so all consumers import from one place via sync-outbox.
import { RECOVERY_OUTBOX_KEY } from '@/lib/mmkv-recovery-outbox';
import {
  captureSyncSession,
  isSyncSessionCurrent,
  registerSyncTransport,
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

// Single-flight guard — concurrent drains collapse into one POST
type InFlightDrain = {
  session: number;
  promise: Promise<void>;
};

let inflight: InFlightDrain | null = null;

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

  const promise = (async () => {
    if (!isSyncSessionCurrent(session)) return;
    const initial = readOutbox();
    const capturedRevision = enqueueRevision;
    if (initial.length === 0) return;

    const controller = new AbortController();
    let timeoutId = setTimeout(() => controller.abort(), 15_000);
    const unregister = registerSyncTransport(controller);

    try {
      const headers = await getAuthHeaders();
      if (!isSyncSessionCurrent(session)) return;

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

        clearTimeout(timeoutId);
        timeoutId = setTimeout(() => controller.abort(), 15_000);

        const response = await authenticatedFetch(`${PRIMARY_BACKEND_URL}/api/sync/push`, {
          method: 'POST',
          headers,
          body,
          signal: controller.signal,
        });

        if (!response.ok) {
          completed = false;
          break;
        }

        const payload = (await response.json().catch(() => null)) as {
          results?: unknown[];
        } | null;

        if (!isSyncSessionCurrent(session)) {
          completed = false;
          break;
        }

        const resolving = resolvingAcknowledgementPairs(batch, payload?.results ?? []);
        const resolvingByKey = new Map(
          resolving.map((pair) => [`${pair.change.table}:${pair.change.id}`, pair] as const),
        );
        const remaining = readOutbox().filter((entry) => {
          const pair = resolvingByKey.get(`${entry.table}:${entry.id}`);
          return !pair || !syncSnapshotsEqual(entry, pair.change);
        });
        writeOutbox(remaining);
        const conflictsToApply = resolving
          .filter((pair) => isValidConflictResult(pair.result))
          .filter((pair) => !remaining.some((entry) => (
            entry.table === pair.change.table && entry.id === pair.change.id
          )))
          .map((pair) => pair.result);
        applyConflictResults(conflictsToApply);
      }
      if (completed && isSyncSessionCurrent(session)) {
        lastAttemptedEnqueueRevision = capturedRevision;
        lastDrainCompletedAt = Date.now();
      }
    } catch {
      // Network error / timeout / abort — keep the outbox intact for retry
    } finally {
      clearTimeout(timeoutId);
      unregister();
    }
  })().finally(() => {
    if (inflight?.promise === promise) inflight = null;
  });

  inflight = { session, promise };
  return promise;
}
