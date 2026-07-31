/**
 * DEV-only cold-start hydration measurement for the persisted Unfold store.
 *
 * The persisted blob is one JSON document holding every devotional, note,
 * journal entry, highlight and bookmark the user owns, and it is read +
 * `JSON.parse`d + (on version bumps) migrated synchronously on the JS thread
 * before the first screen can render. Nobody had a number for what that costs
 * on a real account, so partialize/exclusion work had no baseline to justify
 * it. These wrappers produce that number.
 *
 * Measurement only — this changes nothing about how state is persisted, and it
 * compiles away to identity functions outside `__DEV__`.
 *
 * Timing anchors (all inside zustand-persist's synchronous hydrate path):
 *   readStart → readEnd   MMKV read of the raw string
 *   readEnd  → migrate    JSON.parse of that string
 *   migrate               version migration (only runs on a version bump)
 *   migrate  → rehydrate  merge into the live store
 */
import type { StateStorage } from 'zustand/middleware';
import { logger } from '@/lib/logger';

const now = (): number =>
  typeof globalThis.performance?.now === 'function' ? globalThis.performance.now() : Date.now();

const round = (ms: number): number => Math.round(ms * 100) / 100;

let rawBytes = 0;
let readMs = 0;
let readEndAt = 0;
let migrateMs = 0;
let captured = false;
let logged = false;

/**
 * Wraps the raw MMKV adapter to capture the size and read cost of the first
 * (i.e. cold-start) persisted-state read.
 */
export function instrumentPersistRead(inner: StateStorage): StateStorage {
  if (!__DEV__) return inner;
  return {
    ...inner,
    getItem: (name: string) => {
      if (captured) return inner.getItem(name);
      const start = now();
      const raw = inner.getItem(name);
      if (typeof raw === 'string') {
        captured = true;
        readEndAt = now();
        readMs = readEndAt - start;
        rawBytes = raw.length;
      }
      return raw;
    },
  };
}

/** Wraps persist's `migrate` so its cost is separable from parse + merge. */
export function instrumentMigrate<TMigrate extends (persistedState: unknown, version: number) => unknown>(
  migrate: TMigrate,
): TMigrate {
  if (!__DEV__) return migrate;
  return ((persistedState: unknown, version: number) => {
    const start = now();
    try {
      return migrate(persistedState, version);
    } finally {
      migrateMs = now() - start;
    }
  }) as TMigrate;
}

/**
 * Emits the one-shot cold-start summary. Call from `onRehydrateStorage`'s
 * post-hydration callback, i.e. once the parsed state is merged into the store.
 */
export function logColdStartHydrationCost(): void {
  if (!__DEV__ || logged || !captured) return;
  logged = true;
  const afterReadMs = now() - readEndAt;
  logger.log('[store] cold-start hydration cost', {
    payloadKB: round(rawBytes / 1024),
    mmkvReadMs: round(readMs),
    // parse + merge; `migrate` only runs when the persisted version is stale
    parseAndMergeMs: round(afterReadMs - migrateMs),
    migrateMs: round(migrateMs),
    totalMs: round(readMs + afterReadMs),
  });
}
