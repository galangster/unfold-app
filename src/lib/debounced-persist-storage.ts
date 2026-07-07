/**
 * Write-coalescing storage adapter for zustand's persist middleware (WR-23).
 *
 * With `createJSONStorage`, every store `set()` re-serializes the ENTIRE
 * state (all devotionals, notes, journal entries, highlights…) to a JSON
 * string on the JS thread before handing it to MMKV. While the user types in
 * any autosaving editor that meant a full-store stringify every ~1-2s.
 *
 * This adapter receives the raw `StorageValue` object from persist and defers
 * BOTH the stringify and the MMKV write to a trailing debounce, so a burst of
 * store writes costs one serialization. A max-wait bound keeps sustained
 * typing from starving persistence, and callers flush pending writes when the
 * app backgrounds (see store.ts) so nothing is lost on app switch.
 *
 * Durability tradeoff, accepted deliberately: a hard crash can lose up to
 * `debounceMs` of store changes. Backgrounding (including the app switcher on
 * the way to a force-kill) triggers a flush, and content also reaches the
 * sync outbox independently.
 *
 * The wire format (`JSON.stringify({ state, version })` under the same key)
 * is byte-compatible with `createJSONStorage` — no migration needed in
 * either direction.
 */
import type { StateStorage, PersistStorage, StorageValue } from 'zustand/middleware';

export const STORE_PERSIST_DEBOUNCE_MS = 1000;
export const STORE_PERSIST_MAX_WAIT_MS = 3000;

export type DebouncedPersistStorage<S> = PersistStorage<S> & {
  /** Serialize + write any pending value immediately. Returns true if a write happened. */
  flushPendingWrites: () => boolean;
  hasPendingWrites: () => boolean;
};

export function createDebouncedJSONStorage<S>(
  inner: StateStorage,
  {
    debounceMs = STORE_PERSIST_DEBOUNCE_MS,
    maxWaitMs = STORE_PERSIST_MAX_WAIT_MS,
  }: { debounceMs?: number; maxWaitMs?: number } = {},
): DebouncedPersistStorage<S> {
  let pending: { name: string; value: StorageValue<S> } | null = null;
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  let maxWaitTimer: ReturnType<typeof setTimeout> | null = null;

  const clearTimers = () => {
    if (debounceTimer) clearTimeout(debounceTimer);
    if (maxWaitTimer) clearTimeout(maxWaitTimer);
    debounceTimer = null;
    maxWaitTimer = null;
  };

  const writeNow = (): boolean => {
    if (!pending) return false;
    const { name, value } = pending;
    pending = null;
    clearTimers();
    void inner.setItem(name, JSON.stringify(value));
    return true;
  };

  return {
    getItem: (name) => {
      // Serve a not-yet-written value so a rehydrate inside the debounce
      // window never reads stale data.
      if (pending && pending.name === name) return pending.value;

      const parse = (raw: string | null): StorageValue<S> | null => {
        if (raw == null) return null;
        return JSON.parse(raw) as StorageValue<S>;
      };

      const raw = inner.getItem(name);
      if (raw instanceof Promise) {
        return raw.then(parse);
      }
      return parse(raw);
    },

    setItem: (name, value) => {
      pending = { name, value };

      if (!maxWaitTimer) {
        maxWaitTimer = setTimeout(writeNow, maxWaitMs);
      }
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(writeNow, debounceMs);
    },

    removeItem: (name) => {
      if (pending && pending.name === name) {
        pending = null;
        clearTimers();
      }
      void inner.removeItem(name);
    },

    flushPendingWrites: writeNow,
    hasPendingWrites: () => pending !== null,
  };
}
