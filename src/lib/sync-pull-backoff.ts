/**
 * The backend answered a sync pull with 429: this user's read budget for the
 * minute is spent. Expected backpressure, not a fault.
 */
export class SyncPullRateLimitedError extends Error {
  constructor(readonly retryAfterSeconds: number | null) {
    super('Sync pull failed: 429');
    this.name = 'SyncPullRateLimitedError';
  }
}

const SYNC_CHECK_COOLDOWN_MS = 10_000;
const RATE_LIMIT_MIN_WAIT_SECONDS = 10;
const RATE_LIMIT_MAX_WAIT_SECONDS = 60;
const RATE_LIMIT_FALLBACK_WAIT_SECONDS = 30;

export type SyncCheckCooldown = { until: number };

const readBudgetListeners = new Set<() => void>();
let readBudgetWindowEnd = 0;
let readBudgetEndTimer: ReturnType<typeof setTimeout> | null = null;

function notifyReadBudgetListeners(): void {
  for (const listener of readBudgetListeners) listener();
}

function scheduleReadBudgetEnd(delayMs: number, expectedEnd: number): void {
  if (readBudgetEndTimer) clearTimeout(readBudgetEndTimer);
  readBudgetEndTimer = setTimeout(() => {
    readBudgetEndTimer = null;
    if (readBudgetWindowEnd !== expectedEnd) return;
    readBudgetWindowEnd = 0;
    notifyReadBudgetListeners();
  }, delayMs);
}

export function noteReadBudgetRateLimited(
  retryAfterSeconds: number | null,
  now = Date.now(),
): void {
  const seconds = Math.min(
    Math.max(retryAfterSeconds ?? RATE_LIMIT_FALLBACK_WAIT_SECONDS, RATE_LIMIT_MIN_WAIT_SECONDS),
    RATE_LIMIT_MAX_WAIT_SECONDS,
  );
  const nextEnd = Math.max(readBudgetWindowEnd, now + seconds * 1000);
  if (nextEnd === readBudgetWindowEnd) return;

  readBudgetWindowEnd = nextEnd;
  scheduleReadBudgetEnd(nextEnd - now, nextEnd);
  notifyReadBudgetListeners();
}

export function readBudgetRetryAfterMs(now = Date.now()): number {
  return Math.max(0, readBudgetWindowEnd - now);
}

export function subscribeReadBudget(listener: () => void): () => void {
  readBudgetListeners.add(listener);
  return () => {
    readBudgetListeners.delete(listener);
  };
}

export function resetReadBudgetForTests(): void {
  if (readBudgetEndTimer) clearTimeout(readBudgetEndTimer);
  readBudgetEndTimer = null;
  if (readBudgetWindowEnd === 0) return;
  readBudgetWindowEnd = 0;
  notifyReadBudgetListeners();
}

/** Quiet period after an ordinary manual check that did not find the day. */
export function syncCheckCooldown(now: number): SyncCheckCooldown {
  return { until: now + SYNC_CHECK_COOLDOWN_MS };
}
