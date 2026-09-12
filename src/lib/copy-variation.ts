/**
 * Resolves which copy draw this device is on.
 *
 * Kept separate from the pools (constants/check-in-messages.ts) and from the
 * bag itself (lib/variation-bag.ts) so both of those stay pure and testable
 * without a Keychain. This is the only place that reaches for identity.
 *
 * The home screen cards and the notifications both go through here, so the
 * card a reader sees at noon and the banner that fired at 12:30 are the same
 * draw rather than two independent ones.
 */

import type { CopyVariation } from '@/constants/check-in-messages';
import { getDeviceId } from '@/lib/mmkv-storage';
import { dayIndexFor } from '@/lib/variation-bag';

/**
 * Seed for the copy shuffle bags. The install id is Keychain-backed, so it is
 * normally stable across launches and reinstalls: two readers are never
 * drawing the same sequence on the same day, and one reader's sequence does
 * not reset when the app restarts.
 *
 * `getDeviceId()` does NOT throw when the Keychain is unreadable — a recovery
 * session, or a normal boot on a locked device, returns a session-scoped
 * `ephemeral-` id instead, memoised for that session (see mmkv-storage.ts).
 * So the seed is always stable within a session; an ephemeral one just draws
 * a different sequence on the next launch. That is invisible next to the
 * failure that caused it, and no reason to reach for a shared fallback.
 */
let cachedSeed: string | null = null;

export function copySeed(): string {
  // The install id cannot change within a session, and the home screen asks
  // for a variation on every render — so resolve it at most once.
  if (cachedSeed !== null) return cachedSeed;
  try {
    cachedSeed = getDeviceId();
  } catch {
    // Last resort only. getDeviceId handles an unreadable Keychain itself and
    // returns an ephemeral id, so reaching here means something unexpected
    // threw. Deliberately not cached: whatever broke may not be broken on the
    // next call, and pinning this literal would hold the reader on one
    // sequence for the rest of the session.
    return 'unfold';
  }
  return cachedSeed;
}


/** The draw for the local calendar day of `date`. */
export function copyVariationFor(date: Date): CopyVariation {
  return { seed: copySeed(), dayIndex: dayIndexFor(date) };
}
