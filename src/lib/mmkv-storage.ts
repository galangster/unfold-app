/**
 * MMKV Storage Adapter for Zustand
 *
 * Replaces AsyncStorage with MMKV for the Zustand persist middleware.
 * Benefits:
 * - Encrypted at rest (encryption key stored in Keychain via expo-secure-store)
 * - Binary format (not plaintext JSON)
 * - Synchronous reads/writes (faster)
 * - More reliable than AsyncStorage
 *
 * Migration path:
 *   AsyncStorage → MMKV (unencrypted, id: 'unfold-store')
 *   → MMKV (encrypted, id: 'unfold-store-v2')
 */
import 'react-native-get-random-values';
import { MMKV } from 'react-native-mmkv';
import type { StateStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { v4 as uuidv4 } from 'uuid';
import type { File as FsFile } from 'expo-file-system';
import { logger } from '@/lib/logger';
import { resolveMmkvOpenPlan, type MmkvStoreProbeResult } from '@/lib/mmkv-open-mode';
import {
  resolveDeviceId,
  resolveKeychainRead,
  keychainV2KeyFor,
  EPHEMERAL_DEVICE_ID_PREFIX,
  type ResolveKeychainReadResult,
} from '@/lib/device-id';
import { mergeRecoveryOutbox, RECOVERY_OUTBOX_KEY } from '@/lib/mmkv-recovery-outbox';

// Re-export so consumers only need one import location (backward compat).
export type { KVAccessor } from '@/lib/mmkv-recovery-outbox';
export { mergeRecoveryOutbox, RECOVERY_OUTBOX_KEY };

// ---------------------------------------------------------------------------
// Encryption key management — stored in iOS Keychain / Android Keystore
// ---------------------------------------------------------------------------

const ENCRYPTION_KEY_ID = 'unfold-mmkv-encryption-key';
const ENCRYPTION_KEY_ID_V2 = keychainV2KeyFor(ENCRYPTION_KEY_ID);

/**
 * Accessibility for every Keychain item this module WRITES.
 *
 * expo-secure-store defaults to `kSecAttrAccessibleWhenUnlocked`
 * (SecureStoreOptions.swift), which iOS refuses to read while the device is
 * locked — `errSecInteractionNotAllowed`, on which expo-secure-store THROWS
 * (SecureStoreModule.swift). A launch that starts locked (background launch,
 * push-triggered launch, opening Unfold from the lock screen) therefore lost
 * the encryption key, opened the throwaway recovery namespace, and made a
 * fully onboarded person look like a brand-new install.
 *
 * AFTER_FIRST_UNLOCK stays readable from the first unlock after a reboot until
 * power off, which covers every launch the app can actually service, and still
 * leaves the item unreadable on a device that has not been unlocked at all.
 */
const KEYCHAIN_WRITE_OPTIONS: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK,
};

/**
 * Outcome of a Keychain read. `read` carries a PROVEN result (a value, or null
 * for a genuinely absent item); `unavailable` means the Keychain could not
 * answer at all.
 */
type KeychainReadOutcome =
  | { status: 'read'; value: string | null }
  | { status: 'unavailable'; error: unknown };

/**
 * THE RULE: SecureStore.getItem returns null ONLY when the item is genuinely
 * absent and THROWS when the Keychain is unavailable, so only a null may mint
 * a new value — a throw must never be read as absence.
 *
 * Reads the migrated (after-first-unlock) key name first and falls back to the
 * original key name, copying a value found there forward under the new
 * accessibility. Accessibility cannot be changed in place, so the copy is the
 * migration; the original item is never deleted.
 */
function readMigratingKeychainItem(v1Key: string): KeychainReadOutcome {
  const v2Key = keychainV2KeyFor(v1Key);
  let plan: ResolveKeychainReadResult;
  try {
    // Reads pass no options: `keychainAccessible` shapes the WRITE attributes
    // only — the lookup query is built from the key and service alone.
    const v2Value = SecureStore.getItem(v2Key);
    plan = resolveKeychainRead({
      v2Value,
      // Only pay the second read when the migrated item is absent. A throw
      // here (the locked-device case for a not-yet-migrated item) leaves the
      // whole read unproven, which is exactly what must not mint.
      v1Value: v2Value === null ? SecureStore.getItem(v1Key) : null,
    });
  } catch (error) {
    return { status: 'unavailable', error };
  }

  if (plan.migrate && plan.value !== null) {
    try {
      SecureStore.setItem(v2Key, plan.value, KEYCHAIN_WRITE_OPTIONS);
      logger.log('[MMKV] Keychain item migrated to the after-first-unlock alias');
    } catch (error) {
      // Best effort: the original item still holds the value, so the next
      // launch simply retries the copy.
      logger.warn('[MMKV] Keychain accessibility migration failed; original item kept', error);
    }
  }

  return { status: 'read', value: plan.value };
}

/**
 * Get or create an encryption key for MMKV.
 * The key is stored in the device Keychain (iOS) / Keystore (Android)
 * via expo-secure-store — protected by hardware-level security.
 *
 * Returns undefined when the Keychain cannot be read (locked device, some
 * simulator configs). Callers must treat that as "unknown", never as "no key
 * exists": resolveMmkvOpenPlan answers a missing key with the throwaway
 * recovery namespace so the real encrypted file is left intact on disk.
 */
function getOrCreateEncryptionKey(): string | undefined {
  let lastError: unknown;

  // Two attempts: the original single retry for a transient Keychain error.
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const outcome = readMigratingKeychainItem(ENCRYPTION_KEY_ID);
      if (outcome.status === 'unavailable') {
        // Unproven absence. Minting here would write a brand-new key under the
        // after-first-unlock name (a write CAN succeed while a read of the old
        // item fails), permanently shadowing the real key and stranding the
        // user's encrypted store behind it.
        lastError = outcome.error;
        continue;
      }
      if (outcome.value !== null) return outcome.value;

      // Proven absence — the only case allowed to create a key.
      const bytes = new Uint8Array(16);
      crypto.getRandomValues(bytes);
      const key = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');

      SecureStore.setItem(ENCRYPTION_KEY_ID_V2, key, KEYCHAIN_WRITE_OPTIONS);
      logger.log('[MMKV] Created new encryption key in SecureStore');
      return key;
    } catch (error) {
      lastError = error; // The setItem failed — retry once, then give up.
    }
  }

  logger.warn('[MMKV] SecureStore unavailable after retry, MMKV will not be encrypted', lastError);
  return undefined;
}

// ---------------------------------------------------------------------------
// MMKV instance — encrypted, with a new ID to avoid file conflicts
// ---------------------------------------------------------------------------

const encryptionKey = getOrCreateEncryptionKey();

// ---------------------------------------------------------------------------
// Mode-marker guard — prevents opening the store file in the wrong mode.
// react-native-mmkv silently discards contents on mode mismatch.
// ---------------------------------------------------------------------------
const storageMeta = new MMKV({ id: 'unfold-storage-meta' });
const MODE_MARKER_KEY = 'unfold-store-v2-mode';

const storedMarker =
  (storageMeta.getString(MODE_MARKER_KEY) as 'encrypted' | 'plain' | undefined) ?? null;

// ---------------------------------------------------------------------------
// 218-upgrade disambiguation probe (RS5-1/RS6-1).
//
// With no mode marker but an available encryption key, the store file (if it
// exists) was created by build 218 in an unknown mode: ENCRYPTED for the
// happy-path MAJORITY, plain only for the tiny Keychain-failure population.
// react-native-mmkv silently discards contents on a mode mismatch in BOTH
// directions and offers no safe in-place probe, so we classify the file by
// copying it to a DISPOSABLE scratch id and plain-opening the COPY:
//   - KNOWN KEY visible → original is PLAIN  → open plain + recrypt (rescue)
//   - known key absent  → original is ENCRYPTED (or has no zustand data)
//                         → open encrypted
//   - probe failure  → 'probe-unavailable'   → open encrypted (majority-safe;
//                      NEVER fall back to plain — that is the RS5-1/RS6-1 P0)
// The real file is never opened in an unproven mode; only the disposable copy
// ever absorbs a mismatch, and it is deleted in `finally`.
//
// FAP-X-1 — why a KNOWN-KEY check instead of getAllKeys().length > 0:
// a plain-open of encrypted bytes is NOT guaranteed to discard to an empty
// store. MMKV core's decoder (MiniPBCoder::decodeOneMap) retains entries
// parsed before a mid-stream protobuf exception, and the copied .crc sibling
// guarantees the CRC gate passes (same raw payload bytes in both modes), so
// AES-CFB ciphertext has a material per-user probability of decoding to one
// or more garbage pseudo-keys. Under any-key classification those phantom
// keys would mark the (encrypted, MAJORITY-population) original as plain →
// plain-open silently discards it → recrypt() seals the loss → marker makes
// it permanent. Requiring PERSIST_ROOT_KEY closes that: phantom keys from
// decoding ciphertext can never equal the known key, and a genuine 218
// legacy-plain store that LACKS the key has no zustand data to lose, so the
// encrypted-open it gets classified into is harmless.
//
// MMKV file layout: <documentDirectory>/mmkv/<id> plus a <id>.crc sibling
// (copied too so the CRC check on the copy cannot misclassify a healthy plain
// file as corrupt). The new expo-file-system File API is synchronous
// (`copySync`/`delete`/`exists`); no MMKV instance touches the real file here.
// Dynamic require keeps expo-file-system off the default Jest module graph
// (native bindings); tests mock it explicitly.
// ---------------------------------------------------------------------------

const STORE_ID = 'unfold-store-v2';
const PROBE_ID = 'unfold-store-v2-probe';
// Zustand persist root key — MUST match the persist config name in store.ts
// (`name: 'unfold-storage'`). Every 218 store with user data contains it.
const PERSIST_ROOT_KEY = 'unfold-storage';

function probeAmbiguousStoreFile(): MmkvStoreProbeResult {
  let probeFile: FsFile | null = null;
  let probeCrcFile: FsFile | null = null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { File, Paths } = require('expo-file-system') as typeof import('expo-file-system');
    const storeFile = new File(Paths.document, `mmkv/${STORE_ID}`);
    if (!storeFile.exists) return 'no-file';

    probeFile = new File(Paths.document, `mmkv/${PROBE_ID}`);
    probeCrcFile = new File(Paths.document, `mmkv/${PROBE_ID}.crc`);
    // Remove stale probe files left behind by a previous crashed probe so the
    // copy below starts from a clean slate.
    if (probeFile.exists) probeFile.delete();
    if (probeCrcFile.exists) probeCrcFile.delete();

    storeFile.copySync(probeFile);
    const storeCrcFile = new File(Paths.document, `mmkv/${STORE_ID}.crc`);
    if (storeCrcFile.exists) storeCrcFile.copySync(probeCrcFile);

    // Plain-open the disposable COPY. If the original is plain, its keys are
    // readable and the zustand root key is present; if the original is
    // encrypted, MMKV discards only the COPY's contents (the original is
    // untouched) — usually to empty, but possibly to garbage pseudo-keys
    // (FAP-X-1, see block comment above), so classification requires the
    // KNOWN persist root key rather than any non-empty key set.
    const probeStore = new MMKV({ id: PROBE_ID });
    return probeStore.contains(PERSIST_ROOT_KEY) ? 'plain-data' : 'no-plain-data';
  } catch (error) {
    logger.warn(
      '[MMKV] 218-upgrade probe failed — falling back to encrypted open (majority-safe)',
      error,
    );
    return 'probe-unavailable';
  } finally {
    try {
      if (probeFile?.exists) probeFile.delete();
    } catch {
      // Best-effort cleanup; a stale copy is removed at the start of the next probe.
    }
    try {
      if (probeCrcFile?.exists) probeCrcFile.delete();
    } catch {
      // Best-effort cleanup.
    }
  }
}

// Probe ONLY in the ambiguous 218-upgrade case (marker=null + key available).
// Every other row's plan ignores probeResult, so it must not pay the probe IO.
const probeResult: MmkvStoreProbeResult =
  storedMarker === null && encryptionKey !== undefined
    ? probeAmbiguousStoreFile()
    : 'probe-unavailable';

const openPlan = resolveMmkvOpenPlan(storedMarker, encryptionKey !== undefined, probeResult);

// Use 'unfold-store-v2' for the encrypted instance.
// The old 'unfold-store' (unencrypted) is migrated below and then cleared.
const mmkv =
  openPlan.mode === 'encrypted'
    ? new MMKV({ id: STORE_ID, encryptionKey })
    : openPlan.mode === 'plain'
      ? new MMKV({ id: STORE_ID })
      : // recovery: Keychain down but the real file is encrypted — run this session
        // on a throwaway namespace; NEVER open the real file in the wrong mode.
        new MMKV({ id: 'unfold-store-v2-recovery' });

if (openPlan.clearOnOpen) {
  // Recovery sandbox must start EMPTY every session (REVM-4). This wipes only
  // the throwaway 'unfold-store-v2-recovery' namespace — the real
  // 'unfold-store-v2' file is untouched (clearOnOpen is never set for it).
  //
  // RS5-4 (cleanup ordering): the sync outbox queued during a PREVIOUS
  // recovery session is only drained into the real store on a NORMAL boot
  // (mergeRecoveryOutboxOnNormalBoot below) — but this wipe runs on every
  // recovery boot, so back-to-back recovery sessions would destroy those
  // unmerged entries before the merge ever gets a chance to run. Carry the
  // outbox across the wipe: it is a pending-upload queue, not the "current"
  // session data REVM-4 exists to keep from resurrecting, and the eventual
  // merge dedupes per table:id (newer clientUpdatedAt wins).
  const unmergedOutbox = mmkv.getString(RECOVERY_OUTBOX_KEY);
  mmkv.clearAll();
  if (unmergedOutbox !== undefined) {
    mmkv.set(RECOVERY_OUTBOX_KEY, unmergedOutbox);
  }
}

if (openPlan.mode === 'recovery') {
  logger.error(
    '[MMKV] Keychain unavailable but store is encrypted — running in recovery namespace this session; user data preserved on disk',
  );
}
if (openPlan.recrypt) {
  // Recrypt rows open plain and upgrade in place. The marker we persist must
  // reflect the ACTUAL resulting file mode (RS5-3): recrypt() can throw,
  // leaving the file plain on disk. The old code skipped the marker write
  // entirely in that case (the else-if never fired), so the next boot saw
  // marker=null again instead of a deterministic 'plain' retry.
  let recrypted = false;
  if (encryptionKey !== undefined) {
    try {
      mmkv.recrypt(encryptionKey);
      recrypted = true;
      logger.log('[MMKV] Upgraded plain store to encrypted via recrypt');
    } catch (error) {
      logger.warn(
        '[MMKV] recrypt failed; file remains plain — marker=plain so next boot retries the upgrade',
        error,
      );
    }
  }
  storageMeta.set(MODE_MARKER_KEY, recrypted ? 'encrypted' : 'plain');
} else if (openPlan.writeMarker) {
  storageMeta.set(MODE_MARKER_KEY, openPlan.writeMarker);
}

// ---------------------------------------------------------------------------
// Recovery-outbox merge (RS2-1): on a normal (non-recovery) open, drain any
// sync-outbox entries written during a previous recovery session into the real
// store. See mmkv-recovery-outbox.ts for the pure merge logic + unit tests.
// ---------------------------------------------------------------------------

function mergeRecoveryOutboxOnNormalBoot(): void {
  if (openPlan.mode === 'recovery') return; // This session IS recovery — nothing to merge yet.

  try {
    const recoveryMmkv = new MMKV({ id: 'unfold-store-v2-recovery' });
    // Quick-exit: skip if the recovery namespace has nothing for this key.
    if (!recoveryMmkv.getString(RECOVERY_OUTBOX_KEY)) return;

    mergeRecoveryOutbox(mmkv, recoveryMmkv, RECOVERY_OUTBOX_KEY);
    logger.log('[MMKV] Merged recovery-outbox entries into real store');
  } catch (error) {
    logger.warn('[MMKV] Recovery-outbox merge failed; entries may be lost', error);
  }
}

mergeRecoveryOutboxOnNormalBoot();

// Track whether migration has been attempted this session
let migrationAttempted = false;

/**
 * One-time migration from old unencrypted MMKV ('unfold-store') to the new
 * encrypted instance ('unfold-store-v2'). Also handles AsyncStorage migration
 * for very old installs.
 */
function migrateData(): void {
  if (migrationAttempted) return;
  migrationAttempted = true;

  // FAP-X-3: never migrate during a recovery session. The active instance is
  // the throwaway recovery namespace, so migrating would copy legacy sources
  // INTO the sandbox (wiped on the next recovery boot) and then CLEAR the
  // legacy original — losing the data on both ends. Legacy sources stay
  // untouched until a normal boot performs the migration into the real store.
  if (openPlan.mode === 'recovery') {
    logger.log('[MMKV] Recovery session — deferring legacy migration to the next normal boot');
    return;
  }

  try {
    // If encrypted instance already has data, skip
    if (mmkv.getString('unfold-storage')) {
      logger.log('[MMKV] v2 instance already has data, skipping migration');
      return;
    }

    // Try to read from the old unencrypted MMKV instance
    try {
      const oldMmkv = new MMKV({ id: 'unfold-store' });
      const oldData = oldMmkv.getString('unfold-storage');
      if (oldData) {
        mmkv.set('unfold-storage', oldData);
        oldMmkv.clearAll();
        logger.log('[MMKV] Migrated from unencrypted v1 to encrypted v2');
        return;
      }
    } catch {
      // Old instance doesn't exist or can't be read — continue
    }

    // Try AsyncStorage (for very old installs that never migrated to MMKV v1)
    AsyncStorage.getItem('unfold-storage')
      .then((asyncData) => {
        if (asyncData && !mmkv.getString('unfold-storage')) {
          mmkv.set('unfold-storage', asyncData);
          AsyncStorage.removeItem('unfold-storage').catch(() => {});
          logger.log('[MMKV] Migrated from AsyncStorage to encrypted v2');
        }
      })
      .catch(() => {});
  } catch (error) {
    logger.error('[MMKV] Migration failed', error);
  }
}

// Run migration on module load
migrateData();

/**
 * Returns the MMKV encryption key (already resolved at module load).
 * Other MMKV cache instances can reuse this to avoid creating separate keys.
 */
export function getSharedEncryptionKey(): string | undefined {
  return encryptionKey;
}

// ---------------------------------------------------------------------------
// Recovery-session full reset (FAP-LIB-2/FAP-X-2)
// ---------------------------------------------------------------------------

const LEGACY_STORE_ID = 'unfold-store';

/**
 * True when this session runs on the throwaway recovery namespace
 * (marker='encrypted' + Keychain down — the real file cannot be opened).
 */
export function isRecoverySession(): boolean {
  return openPlan.mode === 'recovery';
}

/**
 * FAP-LIB-2/FAP-X-2: during a recovery session every mmkvStorage write goes
 * to the throwaway 'unfold-store-v2-recovery' namespace, so the
 * performFullLocalReset() key wipe never touches the user's REAL store —
 * the reset would silently no-op on the data the user asked to delete, and
 * it would all resurrect on the next normal boot.
 *
 * The real file cannot be OPENED this session (encrypted, key unavailable),
 * but it can be DELETED: no MMKV instance holds it open (the recovery
 * namespace is active instead, the probe never runs when the marker is
 * authoritative, and the outbox merge skips recovery sessions), so we remove
 * the files on disk via expo-file-system — store id + .crc sibling — for the
 * real store AND the legacy v1 store (which may still hold data a later
 * normal boot would migrate straight back in). The mode marker is cleared
 * ONLY after the real file is gone, so the next boot takes the clean
 * fresh-install row; if deletion fails the marker stays 'encrypted', which
 * remains the truth for the file left on disk.
 *
 * Strict NO-OP outside recovery sessions: the normal reset path wipes
 * through the OPEN instance, and deleting the file under a live MMKV
 * instance is never safe.
 */
export function purgeRealStoreForRecoveryReset(): void {
  if (openPlan.mode !== 'recovery') return;

  let realFileGone = false;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { File, Paths } = require('expo-file-system') as typeof import('expo-file-system');
    const deleteStoreFiles = (id: string): void => {
      const storeFile = new File(Paths.document, `mmkv/${id}`);
      const crcFile = new File(Paths.document, `mmkv/${id}.crc`);
      if (storeFile.exists) storeFile.delete();
      if (crcFile.exists) crcFile.delete();
    };

    deleteStoreFiles(STORE_ID);
    realFileGone = true;

    try {
      deleteStoreFiles(LEGACY_STORE_ID);
    } catch (error) {
      logger.warn('[MMKV] Recovery reset: legacy v1 store delete failed', error);
    }
  } catch (error) {
    logger.warn(
      '[MMKV] Recovery reset: real store file delete failed — keeping marker so the file stays recoverable',
      error,
    );
  }

  if (realFileGone) {
    try {
      storageMeta.delete(MODE_MARKER_KEY);
      logger.warn('[MMKV] Recovery reset: real store files purged; next boot is a fresh start');
    } catch (error) {
      logger.warn('[MMKV] Recovery reset: marker clear failed', error);
    }
  }

  // Legacy AsyncStorage source (very old installs) — also unreachable through
  // the recovery namespace's key wipe.
  AsyncStorage.removeItem(PERSIST_ROOT_KEY).catch(() => {});
}

// ---------------------------------------------------------------------------
// Device ID — stable anonymous identifier, generated once on first launch
// ---------------------------------------------------------------------------

const DEVICE_ID_KEY = 'unfold-device-id';
const SECURE_DEVICE_ID_KEY = 'unfold-device-id'; // SecureStore namespace is separate from MMKV
const SECURE_DEVICE_ID_KEY_V2 = keychainV2KeyFor(SECURE_DEVICE_ID_KEY);

// FAP-LIB-1/FAP-X-4: one-session identity for recovery sessions with no
// readable Keychain value. In-memory ONLY — never persisted (see getDeviceId).
let ephemeralDeviceId: string | null = null;

/**
 * Get or create a stable device ID (UUID v4) for anonymous identification.
 *
 * Identity is stored in the iOS Keychain / Android Keystore (via SecureStore)
 * so it survives a reinstall — MMKV is cleared on reinstall but the Keychain
 * is not. MMKV holds a mirror so that Keychain failures fall back gracefully.
 *
 * Consumers: api-config.ts (X-Device-ID header), revenuecatClient.ts (RC
 * app-user-id seed). Both are module-scope synchronous — this must stay sync.
 */
export function getDeviceId(): string {
  // Same rule as the encryption key: a THROW is "unavailable", never "absent".
  const outcome = readMigratingKeychainItem(SECURE_DEVICE_ID_KEY);
  const secureAvailable = outcome.status === 'read';
  const secureValue = outcome.status === 'read' ? outcome.value : null;
  const mmkvValue = mmkv.getString(DEVICE_ID_KEY) ?? null;

  // FAP-LIB-1/FAP-X-4: during a recovery session the MMKV mirror lives in the
  // just-wiped throwaway namespace, so with no Keychain value resolveDeviceId
  // would mint a fresh UUID on EVERY recovery boot and persist it into the
  // void — churning the RevenueCat identity and keying sync writes to
  // one-session identities (orphaned server rows). And if the Keychain came
  // back EMPTY mid-session, persisting a new id would permanently shadow the
  // real mirror id (unreachable this session) on the next normal boot. Use a
  // session-scoped EPHEMERAL id instead: in-memory only, never persisted,
  // prefixed so sync-outbox refuses to queue/push under it.
  //
  // The second guard covers a NORMAL session on a locked device: the Keychain
  // THREW, so absence is unproven, and the mirror is empty too. Minting there
  // would write a new identity under the after-first-unlock key name — a write
  // that succeeds while the read of the old item fails — and every later boot
  // would resolve that new id in preference to the user's real one, orphaning
  // their server rows for good.
  const mustNotMint =
    (openPlan.mode === 'recovery' && secureValue === null) ||
    (!secureAvailable && mmkvValue === null);
  if (mustNotMint) {
    ephemeralDeviceId ??= EPHEMERAL_DEVICE_ID_PREFIX + uuidv4();
    return ephemeralDeviceId;
  }

  const plan = resolveDeviceId({
    secureValue,
    mmkvValue,
    generate: () => uuidv4(),
  });

  if (plan.writeSecure && secureAvailable) {
    try {
      SecureStore.setItem(SECURE_DEVICE_ID_KEY_V2, plan.id, KEYCHAIN_WRITE_OPTIONS);
    } catch {
      // Best-effort; MMKV mirror provides fallback
    }
  }
  if (plan.writeMmkv) mmkv.set(DEVICE_ID_KEY, plan.id);

  return plan.id;
}

/**
 * Rotate the device identity — generates a new UUID and writes it to both
 * SecureStore and MMKV. Called by performFullLocalReset() after a data wipe
 * so that server-side data becomes permanently unreachable (orphaned by
 * design per product decision #1).
 *
 * FAP-LIB-3 (atomicity): SecureStore is the AUTHORITATIVE source in
 * resolveDeviceId, so it must commit FIRST; the MMKV mirror is only updated
 * after the Keychain write succeeds. The old best-effort order updated the
 * mirror even when the Keychain write failed, leaving keychain=old vs
 * mirror=new — the session ran under the new id while the next boot silently
 * resolved the OLD id (keychain wins), orphaning everything written under
 * the "new" identity. On Keychain failure the rotation now ABORTS cleanly:
 * the old identity stays everywhere and the CURRENT identity is returned.
 */
export function rotateDeviceId(): string {
  const id = uuidv4();
  try {
    // Written under the migrated key name, which getDeviceId reads FIRST, so
    // the stale value left under the original name can never win.
    SecureStore.setItem(SECURE_DEVICE_ID_KEY_V2, id, KEYCHAIN_WRITE_OPTIONS);
  } catch (error) {
    logger.warn(
      '[MMKV] Device ID rotation aborted — Keychain write failed; keeping current identity',
      error,
    );
    return getDeviceId();
  }
  mmkv.set(DEVICE_ID_KEY, id);
  logger.log('[MMKV] Device ID rotated');
  return id;
}

/**
 * Zustand-compatible storage adapter using MMKV.
 */
export const mmkvStorage: StateStorage = {
  getItem: (name: string): string | null => {
    return mmkv.getString(name) ?? null;
  },

  setItem: (name: string, value: string): void => {
    mmkv.set(name, value);
  },

  removeItem: (name: string): void => {
    mmkv.delete(name);
  },
};

/**
 * Every key currently stored in the active mmkvStorage instance. Used by the
 * full reset to sweep prefixed key families (e.g. `@unfold_rate_limits_<endpoint>`)
 * without hand-enumerating each member.
 */
export function getMmkvKeys(): string[] {
  return mmkv.getAllKeys();
}
