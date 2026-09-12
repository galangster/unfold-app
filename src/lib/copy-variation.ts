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
 * stable across launches and reinstalls: two readers are never drawing the
 * same sequence on the same day, and one reader's sequence does not reset
 * when the app restarts.
 *
 * A recovery session returns an ephemeral id and a locked Keychain throws.
 * Variation still works in both — it just reshuffles, which is invisible next
 * to the failure that caused it.
 */
let cachedSeed: string | null = null;

export function copySeed(): string {
  // The install id cannot change within a session, and the home screen asks
  // for a variation on every render — so read the Keychain at most once.
  if (cachedSeed !== null) return cachedSeed;
  try {
    cachedSeed = getDeviceId();
  } catch {
    // Do NOT cache the fallback: a Keychain that is merely locked at boot
    // reads fine later, and caching 'unfold' here would pin every reader on
    // this device to the same sequence for the whole session.
    return 'unfold';
  }
  return cachedSeed;
}


/** The draw for the local calendar day of `date`. */
export function copyVariationFor(date: Date): CopyVariation {
  return { seed: copySeed(), dayIndex: dayIndexFor(date) };
}
