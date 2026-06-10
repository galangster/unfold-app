/**
 * Pure decision function for how to open the MMKV store.
 *
 * The marker stored in 'unfold-storage-meta' tells us what mode the
 * 'unfold-store-v2' file was last successfully opened in. We must NEVER open
 * the file in the wrong mode — react-native-mmkv silently discards the
 * contents when the mode mismatches.
 *
 * Residual window (legacy installs, no marker yet): if the first launch of
 * this build hits a transient Keychain failure, we infer 'plain' (row 6) —
 * one-launch exposure. Eliminated for all subsequent launches by the marker
 * backfill written on this run.
 */

export type MmkvMode = 'encrypted' | 'plain' | 'recovery';

export interface MmkvOpenPlan {
  mode: MmkvMode;
  writeMarker: 'encrypted' | 'plain' | null;
  recrypt: boolean;
  /** Recovery only: wipe the throwaway namespace so it is an EMPTY
   *  one-session sandbox — a previous outage's writes must not resurrect
   *  as "current" data (REVM-4). Never true for the real store file. */
  clearOnOpen: boolean;
}

/**
 * Resolve how to open the MMKV store given the persisted mode marker and
 * whether the encryption key is currently available.
 *
 * Decision table:
 *   marker='encrypted', keyAvailable=true  → { mode:'encrypted', writeMarker:null,        recrypt:false, clearOnOpen:false }
 *   marker='encrypted', keyAvailable=false → { mode:'recovery',  writeMarker:null,        recrypt:false, clearOnOpen:true  }
 *   marker='plain',     keyAvailable=true  → { mode:'plain',     writeMarker:'encrypted', recrypt:true,  clearOnOpen:false }
 *   marker='plain',     keyAvailable=false → { mode:'plain',     writeMarker:null,        recrypt:false, clearOnOpen:false }
 *   marker=null,        keyAvailable=true  → { mode:'encrypted', writeMarker:'encrypted', recrypt:false, clearOnOpen:false }
 *   marker=null,        keyAvailable=false → { mode:'plain',     writeMarker:'plain',     recrypt:false, clearOnOpen:false }
 */
export function resolveMmkvOpenPlan(
  marker: 'encrypted' | 'plain' | null,
  keyAvailable: boolean,
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

  // marker === null: legacy install — no marker written yet.
  // Status-quo inference: if the key is available, assume the file was created
  // with encryption (the happy-path first launch). If not, assume plain.
  if (keyAvailable) {
    return { mode: 'encrypted', writeMarker: 'encrypted', recrypt: false, clearOnOpen: false };
  } else {
    return { mode: 'plain', writeMarker: 'plain', recrypt: false, clearOnOpen: false };
  }
}
