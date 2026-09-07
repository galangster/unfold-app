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
  /** Serialize + await any pending write. Rejects when the storage write fails. */
  flushPendingWritesAsync: () => Promise<boolean>;
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
  let inFlightOperation: Promise<void> | null = null;

  // A pending persist window must not hold a Node process (Jest) open. On
  // React Native timers are plain numbers, so unref doesn't exist and this
  // is a no-op.
  const schedule = (fn: () => void, ms: number) => {
    const timer = setTimeout(fn, ms);
    (timer as unknown as { unref?: () => void }).unref?.();
    return timer;
  };

  const clearTimers = () => {
    if (debounceTimer) clearTimeout(debounceTimer);
    if (maxWaitTimer) clearTimeout(maxWaitTimer);
    debounceTimer = null;
    maxWaitTimer = null;
  };

  const takePendingWrite = (): { name: string; serialized: string } | null => {
    if (!pending) return null;
    const { name, value } = pending;
    pending = null;
    clearTimers();
    return { name, serialized: JSON.stringify(value) };
  };

  const trackOperation = (operation: Promise<void>): Promise<void> => {
    const tracked = operation.finally(() => {
      if (inFlightOperation === tracked) inFlightOperation = null;
    });
    // Timer and synchronous flush callers cannot await an asynchronous adapter.
    // Attach a handler here while preserving rejection for awaited callers.
    void tracked.catch(() => {});
    inFlightOperation = tracked;
    return tracked;
  };

  const startOperation = (operation: () => unknown | Promise<unknown>): Promise<void> | null => {
    if (inFlightOperation) {
      const prior = inFlightOperation;
      return trackOperation(
        prior
          .catch(() => {})
          .then(operation)
          .then(() => {}),
      );
    }

    const result = operation();
    if (result && typeof (result as PromiseLike<unknown>).then === 'function') {
      return trackOperation(Promise.resolve(result).then(() => {}));
    }
    return null;
  };

  const startWrite = ({ name, serialized }: { name: string; serialized: string }): Promise<void> | null =>
    startOperation(() => inner.setItem(name, serialized));

  const writeNow = (): boolean => {
    const write = takePendingWrite();
    if (!write) return false;
    startWrite(write);
    return true;
  };

  const writeNowAsync = async (): Promise<boolean> => {
    const write = takePendingWrite();
    if (write) {
      await startWrite(write);
      return true;
    }
    if (!inFlightOperation) return false;
    await inFlightOperation;
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
        maxWaitTimer = schedule(writeNow, maxWaitMs);
      }
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = schedule(writeNow, debounceMs);
    },

    removeItem: (name) => {
      if (pending && pending.name === name) {
        pending = null;
        clearTimers();
      }
      startOperation(() => inner.removeItem(name));
    },

    flushPendingWrites: writeNow,
    flushPendingWritesAsync: writeNowAsync,
    hasPendingWrites: () => pending !== null,
  };
}
