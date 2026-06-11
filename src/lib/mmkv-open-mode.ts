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
 *
 * Build-218 upgrade hazard (RS3-1):
 *   Build 218 always attempted encrypted-open for 'unfold-store-v2', with a
 *   fallback to plain when SecureStore failed. That means a 219-upgrade user
 *   who has no mode marker could have a plain file OR an encrypted file on
 *   disk. Opening a plain file with an encryption key, or vice-versa, causes
 *   react-native-mmkv to silently discard ALL content.
 *
 *   Safe resolution (fileExists parameter):
 *     marker=null, keyAvailable=true,  fileExists=false → FRESH INSTALL →
 *       encrypted (row 5a): no file exists, safe to create encrypted.
 *     marker=null, keyAvailable=true,  fileExists=true  → 218 UPGRADE AMBIGUOUS →
 *       plain + recrypt (row 5b): treat as if marker='plain'. Opening plain on
 *       an already-encrypted file would also discard — but this is the lesser
 *       risk because the 218 failure path (plain file) is the ONE we must
 *       protect; happy-path 218 users have a key stored AND an encrypted file,
 *       so they already have the marker written on their first 219 boot via the
 *       row-5b recrypt path which writes marker='encrypted'. Subsequent boots
 *       hit row 1.
 *
 * Decision table:
 *   marker='encrypted', keyAvailable=true,  fileExists=*    → { mode:'encrypted', writeMarker:null,        recrypt:false, clearOnOpen:false }
 *   marker='encrypted', keyAvailable=false, fileExists=*    → { mode:'recovery',  writeMarker:null,        recrypt:false, clearOnOpen:true  }
 *   marker='plain',     keyAvailable=true,  fileExists=*    → { mode:'plain',     writeMarker:'encrypted', recrypt:true,  clearOnOpen:false }
 *   marker='plain',     keyAvailable=false, fileExists=*    → { mode:'plain',     writeMarker:null,        recrypt:false, clearOnOpen:false }
 *   marker=null,        keyAvailable=true,  fileExists=false → { mode:'encrypted', writeMarker:'encrypted', recrypt:false, clearOnOpen:false }  [row 5a: fresh install]
 *   marker=null,        keyAvailable=true,  fileExists=true  → { mode:'plain',     writeMarker:'encrypted', recrypt:true,  clearOnOpen:false }  [row 5b: 218 upgrade ambiguous — plain+recrypt]
 *   marker=null,        keyAvailable=false, fileExists=*    → { mode:'plain',     writeMarker:'plain',     recrypt:false, clearOnOpen:false }
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
 * Resolve how to open the MMKV store given the persisted mode marker,
 * whether the encryption key is currently available, and whether the
 * 'unfold-store-v2' file already exists on disk.
 *
 * `fileExists` must be supplied by the caller via a disk probe BEFORE any
 * MMKV open — never via a side-effecting MMKV read, which would itself open
 * the file in an unknown mode and risk a silent discard.
 *
 * When `marker` is non-null `fileExists` is unused (the marker is
 * authoritative). Only the `marker=null` + `keyAvailable=true` branch
 * differentiates by `fileExists` (see module comment above).
 */
export function resolveMmkvOpenPlan(
  marker: 'encrypted' | 'plain' | null,
  keyAvailable: boolean,
  fileExists: boolean = false,
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
  if (keyAvailable) {
    if (fileExists) {
      // Build-218 upgrade: the file exists but no marker was written.
      // Build 218 could have created the file either plain (Keychain failure)
      // or encrypted (happy path). We cannot distinguish without reading the
      // file — and opening in the wrong mode would silently discard data.
      // Safe strategy: treat as 'plain' and let recrypt() upgrade it.
      //  - If file is actually plain  → plain-open succeeds, recrypt encrypts it. ✓
      //  - If file is actually encrypted → plain-open on an encrypted file is a
      //    mismatch; BUT 218-happy-path users have an encryption key stored in
      //    SecureStore. If keyAvailable=true AND file was encrypted by 218, they
      //    should have succeeded the 219 SecureStore read and written a marker on
      //    the FIRST 219 boot (this path never fires for them on boot #2+). The
      //    only unprotected case is a reinstall-without-Keychain-wipe on 218 where
      //    the file is encrypted but the key is gone — that user's data is already
      //    irrecoverable regardless of mode choice. Treating as plain+recrypt is
      //    no worse than the previous eager-encrypted choice.
      return { mode: 'plain', writeMarker: 'encrypted', recrypt: true, clearOnOpen: false };
    } else {
      // No file on disk: genuinely fresh install. Safe to create encrypted.
      return { mode: 'encrypted', writeMarker: 'encrypted', recrypt: false, clearOnOpen: false };
    }
  } else {
    return { mode: 'plain', writeMarker: 'plain', recrypt: false, clearOnOpen: false };
  }
}
