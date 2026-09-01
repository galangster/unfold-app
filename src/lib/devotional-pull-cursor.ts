/**
 * Cursor policy for the Today-tab devotional pull (`devotional-sync-pull.ts`).
 *
 * Pure module — no native deps — so `full-reset.ts` can import the MMKV key
 * and tests can exercise the decision table without mocking storage.
 *
 * Why a separate cursor from `unfold-last-pulled-at` (full-sync-pull.ts):
 * the devotional pull keeps only `devotionals` + `devotional_days` for ONE
 * devotional and discards the other 14 tables. Sharing the app-start cursor
 * would silently starve the app-start pull of every record the devotional
 * pull threw away.
 *
 * Contract with the server (backend src/routes/sync.ts pull handler):
 *   - `timestamp` is the SERVER clock captured before the per-table SELECTs;
 *     it is the only value ever sent back as `lastPulledAt`. The device clock
 *     is used solely to pace the periodic full reconcile.
 *   - with `lastPulledAt` set, every table is filtered `updatedAt > since`;
 *     deletes are soft (`deletedAt` set AND `updatedAt` bumped in the same
 *     write) so tombstones ride along in deltas as `deleted: true`.
 *   - the server has no "cursor too old" signal and never paginates, so the
 *     only staleness guard is the client-side reconcile interval below.
 *
 * Residual risk the reconcile interval covers: a row whose `updatedAt` was
 * stamped inside a still-open transaction when the pull's `timestamp` was
 * captured commits with `updatedAt < timestamp` and is skipped by the next
 * delta. The send-side overlap window absorbs that in practice; the periodic
 * full pull is the backstop.
 */

export const DEVOTIONAL_PULL_CURSOR_KEY = 'unfold-devotional-pull-cursor';

/** Bump to force every installed client back to one full pull. */
export const DEVOTIONAL_PULL_CURSOR_SCHEMA = 1;

/** Full reconcile cadence (device clock). */
export const DEVOTIONAL_FULL_PULL_INTERVAL_MS = 24 * 60 * 60 * 1000;

/**
 * Re-request records updated this long before the stored cursor. Rows are
 * upserted idempotently, so the only cost is re-receiving a record or two;
 * the benefit is immunity to the stamp-before-commit race described above.
 */
export const DEVOTIONAL_PULL_CURSOR_OVERLAP_MS = 2 * 60 * 1000;

export type DevotionalPullMode = 'full' | 'incremental';

/** Identity the cursor is valid for. Any mismatch forces a full pull. */
export type DevotionalPullScope = {
  deviceId: string;
  devotionalId: string;
  /** App version + build + store persist version fingerprint. */
  versionMarker: string;
};

export type DevotionalPullCursor = DevotionalPullScope & {
  v: number;
  /** Server-provided `timestamp` of the last committed pull (full or delta). */
  lastPulledAt: string;
  /** Device clock (ms) when the last committed FULL pull was requested. */
  lastFullPullAt: number;
};

export type PullCursorReason =
  | 'incremental'
  | 'forced'
  | 'no-local-content'
  | 'no-cursor'
  | 'schema-changed'
  | 'device-changed'
  | 'devotional-changed'
  | 'version-changed'
  | 'invalid-cursor'
  | 'clock-backwards'
  | 'reconcile-interval';

export type PullCursorDecision = {
  /** Value to POST as `lastPulledAt`; `null` requests a full pull. */
  lastPulledAt: string | null;
  mode: DevotionalPullMode;
  reason: PullCursorReason;
};

export type ResolvePullCursorInput = {
  /** Persisted cursor (already parsed), or null when none is stored. */
  cursor: DevotionalPullCursor | null;
  /** Identity of the pull being made now. */
  scope: DevotionalPullScope;
  /** Device clock, ms. */
  now: number;
  forceFull?: boolean;
  /**
   * False when the devotional (or any of its days) is missing locally — a
   * delta cannot rebuild a shell, so the pull must be full.
   */
  hasLocalContent?: boolean;
  fullPullIntervalMs?: number;
  overlapMs?: number;
};

export function isValidTimestamp(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && Number.isFinite(Date.parse(value));
}

function isPositiveFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

export function parseDevotionalPullCursor(raw: string | null | undefined): DevotionalPullCursor | null {
  if (!raw) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
  const record = parsed as Record<string, unknown>;

  if (typeof record.v !== 'number' || !Number.isFinite(record.v)) return null;
  if (!isNonEmptyString(record.deviceId)) return null;
  if (!isNonEmptyString(record.devotionalId)) return null;
  if (!isNonEmptyString(record.versionMarker)) return null;
  if (!isNonEmptyString(record.lastPulledAt)) return null;
  if (typeof record.lastFullPullAt !== 'number') return null;

  return {
    v: record.v,
    deviceId: record.deviceId,
    devotionalId: record.devotionalId,
    versionMarker: record.versionMarker,
    lastPulledAt: record.lastPulledAt,
    lastFullPullAt: record.lastFullPullAt,
  };
}

export function serializeDevotionalPullCursor(cursor: DevotionalPullCursor): string {
  return JSON.stringify({
    v: cursor.v,
    deviceId: cursor.deviceId,
    devotionalId: cursor.devotionalId,
    versionMarker: cursor.versionMarker,
    lastPulledAt: cursor.lastPulledAt,
    lastFullPullAt: cursor.lastFullPullAt,
  });
}

function full(reason: Exclude<PullCursorReason, 'incremental'>): PullCursorDecision {
  return { lastPulledAt: null, mode: 'full', reason };
}

/**
 * Decide whether the next pull is incremental (send the stored server
 * timestamp, minus the overlap window) or full (`lastPulledAt: null`).
 *
 * Every branch that cannot PROVE the stored cursor is trustworthy falls back
 * to a full pull — a full pull is always correct, only more expensive.
 */
export function resolvePullCursor(input: ResolvePullCursorInput): PullCursorDecision {
  const {
    cursor,
    scope,
    now,
    forceFull = false,
    hasLocalContent = true,
    fullPullIntervalMs = DEVOTIONAL_FULL_PULL_INTERVAL_MS,
    overlapMs = DEVOTIONAL_PULL_CURSOR_OVERLAP_MS,
  } = input;

  if (forceFull) return full('forced');
  if (!hasLocalContent) return full('no-local-content');
  if (!cursor) return full('no-cursor');
  if (cursor.v !== DEVOTIONAL_PULL_CURSOR_SCHEMA) return full('schema-changed');
  if (cursor.deviceId !== scope.deviceId) return full('device-changed');
  if (cursor.devotionalId !== scope.devotionalId) return full('devotional-changed');
  if (cursor.versionMarker !== scope.versionMarker) return full('version-changed');

  if (!isValidTimestamp(cursor.lastPulledAt) || !isPositiveFiniteNumber(cursor.lastFullPullAt)) {
    return full('invalid-cursor');
  }
  if (!Number.isFinite(now)) return full('invalid-cursor');

  // Device clock moved behind the last full pull — the interval math is
  // meaningless, so reconcile now rather than trust an unbounded gap.
  if (now < cursor.lastFullPullAt) return full('clock-backwards');
  if (now - cursor.lastFullPullAt >= fullPullIntervalMs) return full('reconcile-interval');

  const cursorMs = Date.parse(cursor.lastPulledAt);
  const since = new Date(Math.max(0, cursorMs - Math.max(0, overlapMs))).toISOString();
  return { lastPulledAt: since, mode: 'incremental', reason: 'incremental' };
}

export type CommittedDevotionalPull = {
  scope: DevotionalPullScope;
  mode: DevotionalPullMode;
  /** Server `timestamp` from the applied response. */
  timestamp: string;
  /** Device clock (ms) when the request was made. */
  startedAt: number;
};

/**
 * Cursor to persist after a pull's content has been APPLIED. Returns null when
 * nothing should be written:
 *   - the applied response carried no valid server timestamp;
 *   - an incremental pull whose stored cursor vanished or changed identity
 *     under it (reset/rotation mid-flight) — it only ever extends a matching
 *     record, because it cannot vouch for a full-pull baseline.
 * The stored `lastPulledAt` never moves backwards: an older response
 * committing after a newer one keeps the newer (both were applied, so the
 * union is covered through the later timestamp).
 */
export function buildNextDevotionalPullCursor(
  stored: DevotionalPullCursor | null,
  committed: CommittedDevotionalPull,
): DevotionalPullCursor | null {
  if (!isValidTimestamp(committed.timestamp)) return null;
  if (!isPositiveFiniteNumber(committed.startedAt)) return null;

  const matching = stored
    && stored.v === DEVOTIONAL_PULL_CURSOR_SCHEMA
    && stored.deviceId === committed.scope.deviceId
    && stored.devotionalId === committed.scope.devotionalId
    && stored.versionMarker === committed.scope.versionMarker
    && isValidTimestamp(stored.lastPulledAt)
    && isPositiveFiniteNumber(stored.lastFullPullAt)
    ? stored
    : null;

  const lastPulledAt = matching && Date.parse(matching.lastPulledAt) > Date.parse(committed.timestamp)
    ? matching.lastPulledAt
    : committed.timestamp;

  const base = {
    v: DEVOTIONAL_PULL_CURSOR_SCHEMA,
    deviceId: committed.scope.deviceId,
    devotionalId: committed.scope.devotionalId,
    versionMarker: committed.scope.versionMarker,
    lastPulledAt,
  };

  if (committed.mode === 'full') {
    return { ...base, lastFullPullAt: Math.max(committed.startedAt, matching?.lastFullPullAt ?? 0) };
  }

  if (!matching) return null;
  return { ...base, lastFullPullAt: matching.lastFullPullAt };
}
