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
 *  - Dedup: table+id keyed; later clientUpdatedAt wins.
 *  - Cap: 200 entries; oldest dropped when exceeded.
 *  - Never throws: drain resolves (not rejects) on network failure.
 *  - Server is authoritative on rejected/conflict — those are dropped, not
 *    retried forever.
 */

import { mmkvStorage, getDeviceId } from '@/lib/mmkv-storage';
import { isEphemeralDeviceId } from '@/lib/device-id';
import { PRIMARY_BACKEND_URL, getAuthHeaders } from '@/lib/api-config';
import type { SyncPushChange } from '@/lib/sync-types';
// RS13-1: single owner — the key is defined in mmkv-recovery-outbox.ts (pure, no native deps)
// and re-exported here so all consumers import from one place via sync-outbox.
import { RECOVERY_OUTBOX_KEY } from '@/lib/mmkv-recovery-outbox';

// Re-export the type so consumers can import from one place
export type { SyncPushChange };

// Re-export the canonical key so consumers don't need to know where it lives.
export const OUTBOX_KEY = RECOVERY_OUTBOX_KEY;
const OUTBOX_CAP = 200;

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
 * Minimum interval (ms) between completed drain cycles (RS10-4).
 * Two trigger sources — NetInfo + Today-focus — can both fire within
 * a few hundred milliseconds of reconnect. The guard collapses them
 * into one POST unless new entries were enqueued after the last drain.
 */
export const MIN_DRAIN_INTERVAL_MS = 15_000;

// Timestamp (Date.now()) when the last drain cycle completed successfully
// (i.e. the POST returned ok). 0 means "never drained".
let lastDrainCompletedAt = 0;

// Timestamp (Date.now()) when entries were last enqueued.
// Used to bypass the interval guard when fresh work arrived.
let lastEnqueueAt = 0;

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
    if (!existing || c.clientUpdatedAt > existing.clientUpdatedAt) {
      map.set(key, c);
    }
  }

  let merged = Array.from(map.values());

  // Cap: keep the newest OUTBOX_CAP entries by clientUpdatedAt
  if (merged.length > OUTBOX_CAP) {
    merged = merged
      .sort((a, b) => (a.clientUpdatedAt < b.clientUpdatedAt ? 1 : -1))
      .slice(0, OUTBOX_CAP);
  }

  writeOutbox(merged);
  lastEnqueueAt = Date.now();
}

/**
 * Reset drain interval state. Exported for test isolation only —
 * production code must never call this.
 */
export function resetDrainStateForTesting(): void {
  inflight = null;
  lastDrainCompletedAt = 0;
  lastEnqueueAt = 0;
}

// Single-flight guard — concurrent drains collapse into one POST
let inflight: Promise<void> | null = null;

export function drainSyncOutbox(): Promise<void> {
  // FAP-LIB-1 (orphaned-pushes): never POST under an ephemeral recovery
  // identity — the X-Device-ID header would file every change under a
  // one-session identity the real client can never read back. Keep the
  // outbox intact: entries are carried across recovery boots (RS5-4) and
  // drained after a normal boot restores the real identity (RS2-1 merge).
  if (isEphemeralDeviceId(getDeviceId())) return Promise.resolve();

  // Min-interval guard (RS10-4): skip if a drain completed recently AND no
  // new entries were enqueued since then. Bypassed by new enqueues so
  // fresh offline work always gets a chance to drain promptly.
  const now = Date.now();
  const intervalNotExpired = now - lastDrainCompletedAt < MIN_DRAIN_INTERVAL_MS;
  const noNewEnqueueSinceDrain = lastEnqueueAt <= lastDrainCompletedAt;
  if (lastDrainCompletedAt > 0 && intervalNotExpired && noNewEnqueueSinceDrain) {
    return Promise.resolve();
  }

  if (inflight) return inflight;

  inflight = (async () => {
    const changes = readOutbox();
    if (changes.length === 0) return;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15_000);

    try {
      const headers = await getAuthHeaders();
      const response = await fetch(`${PRIMARY_BACKEND_URL}/api/sync/push`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ changes }),
        signal: controller.signal,
      });

      if (!response.ok) {
        // Non-ok: keep the outbox; retry on next drain trigger
        return;
      }

      const payload = (await response.json().catch(() => null)) as {
        results?: Array<{ status?: string }>;
      } | null;

      // Server is authoritative: accepted | conflict | rejected all clear from
      // the outbox. Two things must survive (REVM-1):
      //  - changes the server didn't answer for (partial response), and
      //  - anything enqueued while the POST was in flight. So: re-read the
      //    outbox and remove exactly the answered snapshot entries — a
      //    same-key change with a NEWER clientUpdatedAt stays queued.
      const answeredCount = payload?.results?.length ?? 0;
      const answered = changes.slice(0, answeredCount);
      const answeredAt = new Map(
        answered.map((c) => [`${c.table}:${c.id}`, c.clientUpdatedAt]),
      );
      const remaining = readOutbox().filter((c) => {
        const sentAt = answeredAt.get(`${c.table}:${c.id}`);
        return sentAt === undefined || c.clientUpdatedAt > sentAt;
      });
      writeOutbox(remaining);
      // Mark successful completion for the interval guard (RS10-4).
      lastDrainCompletedAt = Date.now();
    } catch {
      // Network error / timeout / abort — keep the outbox intact for retry
    } finally {
      clearTimeout(timeoutId);
    }
  })().finally(() => {
    inflight = null;
  });

  return inflight;
}
