/**
 * The backend answered a sync pull with 429: this user's read budget for the
 * minute is spent. Expected backpressure, not a fault. Callers wait
 * `retryAfterSeconds` (null when the server sent no window) instead of
 * retrying into the limit or reporting it as an error.
 */
export class SyncPullRateLimitedError extends Error {
  constructor(readonly retryAfterSeconds: number | null) {
    super('Sync pull failed: 429');
    this.name = 'SyncPullRateLimitedError';
  }
}

/** Quiet period after a manual check that did not find the missing day. */
const SYNC_CHECK_COOLDOWN_MS = 10_000;

// The backend's per-user read limit resets on a 60-second window.
const RATE_LIMIT_MIN_WAIT_SECONDS = 10;
const RATE_LIMIT_MAX_WAIT_SECONDS = 60;
const RATE_LIMIT_FALLBACK_WAIT_SECONDS = 30;

export type SyncCheckCooldown = { until: number; reason: 'checked' | 'rate-limited' };

/**
 * When the reader may offer the next manual "Check for Day N". Every check is
 * a full pull plus a job lookup against the per-user read budget that Today
 * and the generation watch share, so repeated taps must not spend it.
 */
export function syncCheckCooldown(now: number, rateLimit?: SyncPullRateLimitedError): SyncCheckCooldown {
  if (!rateLimit) return { until: now + SYNC_CHECK_COOLDOWN_MS, reason: 'checked' };
  const seconds = Math.min(
    Math.max(rateLimit.retryAfterSeconds ?? RATE_LIMIT_FALLBACK_WAIT_SECONDS, RATE_LIMIT_MIN_WAIT_SECONDS),
    RATE_LIMIT_MAX_WAIT_SECONDS,
  );
  return { until: now + seconds * 1000, reason: 'rate-limited' };
}

/** Keep whichever wait ends later, so an ordinary pause never cuts a rate-limit wait short. */
export function extendSyncCheckCooldown(
  current: SyncCheckCooldown | null,
  next: SyncCheckCooldown,
): SyncCheckCooldown {
  return current && current.until >= next.until ? current : next;
}
