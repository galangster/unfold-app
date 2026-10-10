/**
 * Recovery-outbox merge helper (RS2-1).
 *
 * On a normal (non-recovery) MMKV boot, drain any sync-outbox entries written
 * during a previous recovery session (when the Keychain was down and the app
 * ran on the throwaway 'unfold-store-v2-recovery' namespace) into the real
 * store. Entries are deduplicated by table:id@clientUpdatedAt (newer wins;
 * on an equal timestamp the recovery entry wins — it was written later).
 * The recovery namespace key is cleared afterwards so it stays EMPTY (REVM-4).
 * The series delete clocks cross the same way, newest clock per id.
 *
 * Separated from mmkv-storage.ts so the pure merge logic can be unit-tested
 * without pulling in native MMKV / expo-secure-store / uuid bindings.
 */

/**
 * Single owner of the outbox MMKV key (RS13-1).
 * Both the normal sync path (sync-outbox.ts) and the recovery merge path
 * operate on the same logical key — defined here once and re-exported by
 * sync-outbox.ts so all consumers import from one canonical location.
 */
export const RECOVERY_OUTBOX_KEY = 'unfold-sync-outbox-v1';

/** Minimal KV accessor used by the recovery-outbox merge logic. */
export interface KVAccessor {
  getString(key: string): string | undefined;
  set(key: string, value: string): void;
  delete(key: string): void;
}

type OutboxEntry = { table: string; id: string; clientUpdatedAt: string; [k: string]: unknown };

function parseOutboxJson(raw: string | undefined): OutboxEntry[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as OutboxEntry[]) : [];
  } catch {
    return [];
  }
}

/**
 * Pure merge helper: reads recovery-outbox entries from `recoveryKV`, merges
 * them (newer clientUpdatedAt wins per table:id) into `realKV`, then deletes
 * the recovery-outbox key so the recovery namespace stays empty (REVM-4).
 *
 * Exported for unit testing; called at mmkv-storage module init.
 */
export function mergeRecoveryOutbox(
  realKV: KVAccessor,
  recoveryKV: KVAccessor,
  outboxKey: string,
): void {
  const recoveryEntries = parseOutboxJson(recoveryKV.getString(outboxKey));
  if (recoveryEntries.length === 0) {
    recoveryKV.delete(outboxKey); // clean up even if empty
    return;
  }

  const realEntries = parseOutboxJson(realKV.getString(outboxKey));

  const map = new Map<string, OutboxEntry>();
  for (const c of realEntries) {
    map.set(`${c.table}:${c.id}`, c);
  }
  for (const c of recoveryEntries) {
    const key = `${c.table}:${c.id}`;
    const existing = map.get(key);
    if (!existing || c.clientUpdatedAt >= existing.clientUpdatedAt) {
      map.set(key, c);
    }
  }

  realKV.set(outboxKey, JSON.stringify(Array.from(map.values())));
  recoveryKV.delete(outboxKey);
}

/**
 * Single owner of the series delete-clock key, re-exported by
 * deleted-series.ts. During a recovery session the clocks are written to the
 * recovery namespace, so they cross to the real store with the outbox. A
 * delete made during recovery must still stop a finished generation job once
 * its tombstone has left the outbox.
 */
export const DELETED_SERIES_KEY = 'deleted-series-v1';
const MAX_REMEMBERED_DELETES = 100;

/** Delete clocks by series id, read from their stored JSON. */
export function parseDeletedSeriesClocks(raw: string | null | undefined): Map<string, number> {
  try {
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return new Map();
    return new Map(Object.entries(parsed).filter((entry): entry is [string, number] => Number.isFinite(entry[1])));
  } catch {
    return new Map();
  }
}

/** Keep only the newest deletes. */
export function keepNewestDeletes(clocks: Map<string, number>): void {
  if (clocks.size <= MAX_REMEMBERED_DELETES) return;
  const oldest = [...clocks].sort((a, b) => b[1] - a[1]).slice(MAX_REMEMBERED_DELETES);
  for (const [id] of oldest) clocks.delete(id);
}

/**
 * Merges the delete clocks a recovery session wrote into the real store,
 * newest clock per id, then clears the recovery copy (REVM-4).
 */
export function mergeRecoveryDeletedSeries(realKV: KVAccessor, recoveryKV: KVAccessor): void {
  const recovered = parseDeletedSeriesClocks(recoveryKV.getString(DELETED_SERIES_KEY));
  if (recovered.size > 0) {
    const clocks = parseDeletedSeriesClocks(realKV.getString(DELETED_SERIES_KEY));
    for (const [id, at] of recovered) {
      const known = clocks.get(id);
      if (known === undefined || at > known) clocks.set(id, at);
    }
    keepNewestDeletes(clocks);
    realKV.set(DELETED_SERIES_KEY, JSON.stringify(Object.fromEntries(clocks)));
  }
  recoveryKV.delete(DELETED_SERIES_KEY);
}
