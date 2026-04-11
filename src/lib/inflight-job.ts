/**
 * Canonical inflight-generation-job read/write helpers.
 *
 * Both the home-screen wrapper (src/app/(tabs)/(today)/index.tsx) and
 * the generating screen (src/app/generating.tsx) need to make
 * ownership decisions about the persisted inflight job. Keeping the
 * logic in one place prevents the screens from racing on cleanup —
 * home was previously reading the key first and deleting any payload
 * without an explicit ownerAuthUserId, which clobbered the legacy
 * migration that generating.tsx was about to perform.
 *
 * Ownership model: the persisted payload carries an `ownerAuthUserId`
 * set at write time. On read, we compare against the current store's
 * authUserId. Any explicit mismatch clears the key. A missing field
 * (legacy payload from a build predating this contract) is adopted
 * ONLY when a signed-in user exists this session AND the payload is
 * still within the poll window — see the comment in
 * `readInflightForOwner` below for the full tenant-safety argument.
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
 * cross-owner, unparseable, or unadoptable legacy). If the payload is
 * a legacy format (no ownerAuthUserId) and adoption is safe, the
 * payload is rewritten in place with the current owner so subsequent
 * reads hit the clean isolation path.
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
    // ownerAuthUserId contract) have no explicit owner. We can adopt
    // them for the CURRENT session if — and only if — we can prove
    // continuity: there must be a signed-in user right now
    // (currentOwner !== null) AND the payload must still be within
    // the poll window (checked above). On adoption we rewrite the
    // key with the current owner so subsequent reads follow the
    // clean tenant-isolation path.
    //
    // Why this is tenant-safe: the only way a legacy payload could
    // belong to a different user than the current session is if
    // user A submitted a job on the old build, signed out without
    // the inflight key being cleared, user B signed in, and then
    // the app was upgraded — all within the 10-minute poll window.
    // That specific sequence is extremely narrow on a personal
    // device and requires a bug in the old sign-out path. The
    // alternative (unconditionally discarding all legacy payloads)
    // strands every user who happens to upgrade mid-generation,
    // which is the common case. One-release migration window trades
    // a narrow theoretical leak for everyday upgrade recovery.
    //
    // Anonymous sessions (currentOwner === null) cannot adopt:
    // with no signed-in identity we have no basis on which to claim
    // the job, and adopting into anonymous state would make the
    // NEXT sign-in read someone else's pointer.
    if (persistedOwner === undefined) {
      if (currentOwner === null) {
        logger.warn('[inflight-job] Legacy payload in anonymous session — discarding');
        mmkvStorage.removeItem(INFLIGHT_KEY);
        return null;
      }
      logger.log('[inflight-job] Adopting legacy payload for current owner', { currentOwner });
      const adopted: InflightPayload = {
        jobId: parsed.jobId,
        devotionalId: parsed.devotionalId,
        submittedAt: parsed.submittedAt,
        ownerAuthUserId: currentOwner,
      };
      mmkvStorage.setItem(INFLIGHT_KEY, JSON.stringify(adopted));
      return adopted;
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
