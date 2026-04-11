/**
 * Canonical inflight-generation-job read/write helpers.
 *
 * Both the home-screen wrapper (src/app/(tabs)/(today)/index.tsx) and
 * the generating screen (src/app/generating.tsx) need to make
 * ownership decisions about the persisted inflight job. Keeping the
 * logic in one place prevents the screens from racing on cleanup.
 *
 * Ownership model: the persisted payload carries an `ownerAuthUserId`
 * set at write time. On read, we compare against the current store's
 * authUserId. Any mismatch — including a missing ownerAuthUserId
 * (legacy payload from a build predating this contract) — clears the
 * key and is treated as non-resumable.
 *
 * Why legacy payloads are discarded: without server-side validation
 * we have no proof that a legacy inflight job belongs to the
 * currently-signed-in user. On a shared device or account switch
 * within the poll window, adopting a legacy payload would resume
 * another user's generation and write the result into the current
 * user's local profile — a cross-tenant content leak. The alternative
 * (stranding users who upgraded mid-generation) is a one-release UX
 * cost; the leak is a correctness failure. The call site should
 * surface a fresh-start retry path rather than attempting recovery of
 * an unprovable job.
 */

import { mmkvStorage } from './mmkv-storage';
import { logger } from './logger';

export const INFLIGHT_KEY = 'inflight-generation-job';

// Maximum time to poll before giving up (10 minutes). Keep in sync
// with the polling loop in src/app/generating.tsx.
export const MAX_POLL_DURATION_MS = 10 * 60 * 1000;

export type InflightPayload = {
  jobId: string;
  devotionalId?: string;
  submittedAt: number;
  ownerAuthUserId: string | null;
};

/**
 * Read the persisted inflight payload and resolve it against the
 * current owner. Returns null if there is nothing resumable; in that
 * case the MMKV key has been cleared as a side effect (expired,
 * cross-owner, legacy/ownerless, or unparseable).
 */
export function readInflightForOwner(currentOwner: string | null): InflightPayload | null {
  const raw = mmkvStorage.getItem(INFLIGHT_KEY) as string | null;
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<InflightPayload>;
    if (typeof parsed.jobId !== 'string' || typeof parsed.submittedAt !== 'number') {
      mmkvStorage.removeItem(INFLIGHT_KEY);
      return null;
    }

    // Expiry check first: any payload — legacy or owned — older than
    // the poll window is non-resumable regardless of identity.
    const age = Date.now() - parsed.submittedAt;
    if (age > MAX_POLL_DURATION_MS) {
      logger.warn('[inflight-job] Expired — discarding', { age });
      mmkvStorage.removeItem(INFLIGHT_KEY);
      return null;
    }

    const persistedOwner = parsed.ownerAuthUserId === undefined ? undefined : parsed.ownerAuthUserId;

    // Legacy payloads (written by a build predating the
    // ownerAuthUserId contract) carry no proof of ownership. We used
    // to adopt them for the current owner inside the poll window to
    // rescue upgrade-mid-generation users, but that path is a
    // cross-tenant leak on shared devices: if user A submitted a job
    // on the old build and user B signs in on the same device within
    // the poll window, adoption would resume A's generation as B and
    // write the result into B's local profile. Client-side we have
    // no way to validate the true owner, so discard legacy payloads
    // unconditionally. The UX cost is one-release (users who upgrade
    // mid-generation have to re-submit), the alternative is a real
    // tenant-isolation failure.
    if (persistedOwner === undefined) {
      logger.warn('[inflight-job] Legacy ownerless payload — discarding (no client-side ownership proof)');
      mmkvStorage.removeItem(INFLIGHT_KEY);
      return null;
    }

    // Explicit owner present — enforce strict match.
    if (persistedOwner !== currentOwner) {
      logger.warn('[inflight-job] Owner mismatch — discarding', {
        persistedOwner,
        currentOwner,
      });
      mmkvStorage.removeItem(INFLIGHT_KEY);
      return null;
    }
    return {
      jobId: parsed.jobId,
      devotionalId: parsed.devotionalId,
      submittedAt: parsed.submittedAt,
      ownerAuthUserId: persistedOwner,
    };
  } catch {
    mmkvStorage.removeItem(INFLIGHT_KEY);
    return null;
  }
}

/**
 * Convenience: true if there's a resumable inflight job for the
 * current owner. Non-destructive for unadoptable payloads — they are
 * cleared as a side effect of readInflightForOwner, which is the
 * correct behavior (stale/cross-owner keys should not linger).
 */
export function hasInflightJobForOwner(currentOwner: string | null): boolean {
  return readInflightForOwner(currentOwner) !== null;
}

/**
 * Write a new inflight payload bound to the given owner. Used by
 * generating.tsx on job submission.
 */
export function writeInflightForOwner(
  payload: Omit<InflightPayload, 'ownerAuthUserId'>,
  ownerAuthUserId: string | null,
): void {
  const full: InflightPayload = { ...payload, ownerAuthUserId };
  mmkvStorage.setItem(INFLIGHT_KEY, JSON.stringify(full));
}

/**
 * Remove the persisted inflight payload. Called from sign-out paths
 * and after successful job completion.
 */
export function clearInflight(): void {
  mmkvStorage.removeItem(INFLIGHT_KEY);
}
