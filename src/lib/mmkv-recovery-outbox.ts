/**
 * Recovery-outbox merge helper (RS2-1).
 *
 * On a normal (non-recovery) MMKV boot, drain any sync-outbox entries written
 * during a previous recovery session (when the Keychain was down and the app
 * ran on the throwaway 'unfold-store-v2-recovery' namespace) into the real
 * store. Entries are deduplicated by table:id@clientUpdatedAt (newer wins).
 * The recovery namespace key is cleared afterwards so it stays EMPTY (REVM-4).
 *
 * Separated from mmkv-storage.ts so the pure merge logic can be unit-tested
 * without pulling in native MMKV / expo-secure-store / uuid bindings.
 */

export const RECOVERY_OUTBOX_KEY = 'unfold-sync-outbox-v1'; // same key as sync-outbox.ts

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
    if (!existing || c.clientUpdatedAt > existing.clientUpdatedAt) {
      map.set(key, c);
    }
  }

  realKV.set(outboxKey, JSON.stringify(Array.from(map.values())));
  recoveryKV.delete(outboxKey);
}
