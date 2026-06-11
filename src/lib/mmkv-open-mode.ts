/**
 * Pure decision function for how to open the MMKV store.
 *
 * The marker stored in 'unfold-storage-meta' tells us what mode the
 * 'unfold-store-v2' file was last successfully opened in. We must NEVER open
 * the file in the wrong mode — react-native-mmkv silently discards the
 * contents on a mode mismatch IN BOTH DIRECTIONS (plain-open of an encrypted
 * file AND encrypted-open of a plain file), and offers no safe probe against
 * the real file.
 *
 * Build-218 upgrade hazard (RS3-1 → RS5-1/RS6-1 history):
 *   Build 218 shipped no marker system. It opened 'unfold-store-v2' encrypted
 *   whenever the SecureStore key was available — the MAJORITY population has
 *   an ENCRYPTED file — and plain only on a rare Keychain failure (tiny
 *   LEGACY-PLAIN population). A 219-upgrade user with no marker can therefore
 *   have either file mode on disk.
 *
 *   Round 1 (d9bbd6c) inferred 'encrypted' for marker=null + keyAvailable:
 *   correct for the majority, destroys legacy-plain stores (RS3-1).
 *   Round 2 (96bf578) flipped the ambiguous case to plain+recrypt: that
 *   destroyed the MAJORITY instead — plain-opening an encrypted file silently
 *   discards everything, then recrypt() re-encrypts the now-empty store
 *   (P0 RS5-1/RS6-1).
 *
 *   Resolution — DISPOSABLE-COPY PROBE, performed by the caller
 *   (mmkv-storage.ts) in the ambiguous case ONLY (marker=null + keyAvailable):
 *   copy the store file (and its .crc sibling) to a scratch id, plain-open the
 *   COPY, and classify the original by whether readable data appears. The
 *   original file is never opened in an unproven mode; only the disposable
 *   copy ever absorbs a mismatch. This function stays pure — it receives the
 *   probe RESULT as an input and performs no IO.
 *
 * `probeResult` values (disk state, supplied by the caller):
 *   'no-file'           → 'unfold-store-v2' does not exist. Fresh install;
 *                         safe to create encrypted.
 *   'plain-data'        → plain-open of the disposable COPY surfaced data, so
 *                         the original is PLAIN (218 legacy-plain). Open plain
 *                         and recrypt (rescue path).
 *   'no-plain-data'     → plain-open of the COPY surfaced nothing, so the
 *                         original is ENCRYPTED or genuinely empty. Encrypted
 *                         open is correct for the former and harmless for the
 *                         latter (zero risk).
 *   'probe-unavailable' → the probe could not run (copy failed,
 *                         expo-file-system unavailable). Fall back to the
 *                         MAJORITY-SAFE choice: encrypted open (the d9bbd6c
 *                         behavior). Truthful caveat: if the file was actually
 *                         218-legacy-plain (tiny population) its contents are
 *                         discarded — the alternative (plain open) would
 *                         destroy the majority instead, which is exactly the
 *                         RS5-1/RS6-1 P0. Never fall back to plain.
 *
 * Rows with a non-null marker ignore `probeResult` (the marker is
 * authoritative) and the caller must not perform any probe IO for them.
 *
 * Decision table (every row tells the truth):
 *   marker='encrypted', key=true,  probe=*                   → { mode:'encrypted', writeMarker:null,        recrypt:false, clearOnOpen:false }
 *   marker='encrypted', key=false, probe=*                   → { mode:'recovery',  writeMarker:null,        recrypt:false, clearOnOpen:true  }
 *   marker='plain',     key=true,  probe=*                   → { mode:'plain',     writeMarker:'encrypted', recrypt:true,  clearOnOpen:false }
 *   marker='plain',     key=false, probe=*                   → { mode:'plain',     writeMarker:null,        recrypt:false, clearOnOpen:false }
 *   marker=null,        key=true,  probe='no-file'           → { mode:'encrypted', writeMarker:'encrypted', recrypt:false, clearOnOpen:false }  [fresh install]
 *   marker=null,        key=true,  probe='plain-data'        → { mode:'plain',     writeMarker:'encrypted', recrypt:true,  clearOnOpen:false }  [218 legacy-plain rescue]
 *   marker=null,        key=true,  probe='no-plain-data'     → { mode:'encrypted', writeMarker:'encrypted', recrypt:false, clearOnOpen:false }  [218 majority: encrypted (or empty) file]
 *   marker=null,        key=true,  probe='probe-unavailable' → { mode:'encrypted', writeMarker:'encrypted', recrypt:false, clearOnOpen:false }  [majority-safe fallback; legacy-plain caveat above]
 *   marker=null,        key=false, probe=*                   → { mode:'plain',     writeMarker:'plain',     recrypt:false, clearOnOpen:false }
 *
 * Residual windows (documented, accepted):
 *   - marker=null + keyAvailable=false (last row): we infer 'plain'. If the
 *     file was actually encrypted this is a mismatch — one-launch exposure on
 *     a first 219 boot that ALSO hits a Keychain failure, same exposure 218
 *     itself had. Eliminated for subsequent launches by the marker backfill.
 *   - probe='probe-unavailable' (row 8): legacy-plain caveat above.
 */

export type MmkvMode = 'encrypted' | 'plain' | 'recovery';

/**
 * Result of the caller-side disposable-copy probe of 'unfold-store-v2'.
 * Only meaningful for marker=null + keyAvailable=true (the ambiguous
 * 218-upgrade case); ignored on every other row.
 */
export type MmkvStoreProbeResult =
  | 'no-file'
  | 'plain-data'
  | 'no-plain-data'
  | 'probe-unavailable';

export interface MmkvOpenPlan {
  mode: MmkvMode;
  /**
   * Marker to persist for the SUCCESS path. When `recrypt` is true the caller
   * must only write 'encrypted' after recrypt() actually succeeds; if recrypt
   * throws, the file on disk is still plain and the caller must write 'plain'
   * instead so the next boot retries the upgrade (RS5-3).
   */
  writeMarker: 'encrypted' | 'plain' | null;
  recrypt: boolean;
  /** Recovery only: wipe the throwaway namespace so it is an EMPTY
   *  one-session sandbox — a previous outage's writes must not resurrect
   *  as "current" data (REVM-4). Never true for the real store file.
   *  (The unmerged sync outbox is carried across the wipe by the caller —
   *  RS5-4 — because it is a pending-upload queue, not "current" data.) */
  clearOnOpen: boolean;
}

/**
 * Resolve how to open the MMKV store given the persisted mode marker, whether
 * the encryption key is currently available, and the result of the
 * disposable-copy probe of the 'unfold-store-v2' file.
 *
 * `probeResult` must come from probing a disposable COPY of the store file —
 * never from opening the real file, which would itself risk a silent discard.
 * It defaults to 'probe-unavailable' (the majority-safe encrypted fallback).
 *
 * When `marker` is non-null, `probeResult` is unused (the marker is
 * authoritative). Only the `marker=null` + `keyAvailable=true` branch
 * differentiates by `probeResult` (see module comment above).
 */
export function resolveMmkvOpenPlan(
  marker: 'encrypted' | 'plain' | null,
  keyAvailable: boolean,
  probeResult: MmkvStoreProbeResult = 'probe-unavailable',
): MmkvOpenPlan {
  if (marker === 'encrypted') {
    if (keyAvailable) {
      return { mode: 'encrypted', writeMarker: null, recrypt: false, clearOnOpen: false };
    } else {
      // Key unavailable but file IS encrypted — do NOT open in plain mode.
      // Use a throwaway recovery namespace to preserve the real file.
      return { mode: 'recovery', writeMarker: null, recrypt: false, clearOnOpen: true };
    }
  }

  if (marker === 'plain') {
    if (keyAvailable) {
      // File is plain but we now have a key — open plain (matches file),
      // then recrypt() to upgrade to encrypted.
      return { mode: 'plain', writeMarker: 'encrypted', recrypt: true, clearOnOpen: false };
    } else {
      return { mode: 'plain', writeMarker: null, recrypt: false, clearOnOpen: false };
    }
  }

  // marker === null: no marker written yet (218 upgrade or fresh install).
  if (keyAvailable) {
    if (probeResult === 'plain-data') {
      // The disposable-copy probe POSITIVELY identified a plain file
      // (218 legacy-plain population). Open plain — the only matching mode —
      // then recrypt() to upgrade. Encrypted-open would silently discard it.
      return { mode: 'plain', writeMarker: 'encrypted', recrypt: true, clearOnOpen: false };
    }
    // 'no-file'           → fresh install, safe to create encrypted.
    // 'no-plain-data'     → file is encrypted (correct) or empty (harmless).
    // 'probe-unavailable' → majority-safe fallback: the encrypted-file
    //   population vastly outnumbers legacy-plain; plain-opening here is the
    //   RS5-1/RS6-1 P0. Accepted caveat: a legacy-plain file is discarded.
    return { mode: 'encrypted', writeMarker: 'encrypted', recrypt: false, clearOnOpen: false };
  } else {
    // No marker and no key: infer plain (the only mode we can open without a
    // key). Residual one-launch mismatch window if the file was actually
    // encrypted — see module comment.
    return { mode: 'plain', writeMarker: 'plain', recrypt: false, clearOnOpen: false };
  }
}
