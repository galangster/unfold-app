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

import { mmkvStorage } from '@/lib/mmkv-storage';
import { PRIMARY_BACKEND_URL, getAuthHeaders } from '@/lib/api-config';
import type { SyncPushChange } from '@/lib/sync-types';

// Re-export the type so consumers can import from one place
export type { SyncPushChange };

export const OUTBOX_KEY = 'unfold-sync-outbox-v1';
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

export function enqueueSyncChanges(changes: SyncPushChange[]): void {
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
}

// Single-flight guard — concurrent drains collapse into one POST
let inflight: Promise<void> | null = null;

export function drainSyncOutbox(): Promise<void> {
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
      // the outbox. Only keep changes the server didn't answer for (partial
      // response / malformed payload).
      const answeredCount = payload?.results?.length ?? 0;
      if (answeredCount >= changes.length) {
        writeOutbox([]);
      } else {
        // Partial answer: drop the answered prefix, keep the rest
        writeOutbox(changes.slice(answeredCount));
      }
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
