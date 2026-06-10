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
import { logger } from '@/lib/logger';
import { resolveMmkvOpenPlan } from '@/lib/mmkv-open-mode';
import { resolveDeviceId } from '@/lib/device-id';

// ---------------------------------------------------------------------------
// Encryption key management — stored in iOS Keychain / Android Keystore
// ---------------------------------------------------------------------------

const ENCRYPTION_KEY_ID = 'unfold-mmkv-encryption-key';

/**
 * Get or create an encryption key for MMKV.
 * The key is stored in the device Keychain (iOS) / Keystore (Android)
 * via expo-secure-store — protected by hardware-level security.
 *
 * Returns undefined if SecureStore fails (e.g., in some simulator configs),
 * so MMKV will fall back to unencrypted storage rather than crashing.
 */
function getOrCreateEncryptionKey(): string | undefined {
  const tryOnce = (): string | undefined => {
    let key = SecureStore.getItem(ENCRYPTION_KEY_ID);
    if (key) return key;

    // Generate a cryptographically secure 32-char hex key
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    key = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');

    SecureStore.setItem(ENCRYPTION_KEY_ID, key);
    logger.log('[MMKV] Created new encryption key in SecureStore');
    return key;
  };

  try {
    return tryOnce();
  } catch {
    // Transient Keychain error — retry once before giving up
    try {
      return tryOnce();
    } catch (error) {
      logger.warn('[MMKV] SecureStore unavailable after retry, MMKV will not be encrypted', error);
      return undefined;
    }
  }
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
const openPlan = resolveMmkvOpenPlan(storedMarker, encryptionKey !== undefined);

// Use 'unfold-store-v2' for the encrypted instance.
// The old 'unfold-store' (unencrypted) is migrated below and then cleared.
const mmkv =
  openPlan.mode === 'encrypted'
    ? new MMKV({ id: 'unfold-store-v2', encryptionKey })
    : openPlan.mode === 'plain'
      ? new MMKV({ id: 'unfold-store-v2' })
      : // recovery: Keychain down but the real file is encrypted — run this session
        // on a throwaway namespace; NEVER open the real file in the wrong mode.
        new MMKV({ id: 'unfold-store-v2-recovery' });

if (openPlan.clearOnOpen) {
  // Recovery sandbox must start EMPTY every session (REVM-4). This wipes only
  // the throwaway 'unfold-store-v2-recovery' namespace — the real
  // 'unfold-store-v2' file is untouched (clearOnOpen is never set for it).
  mmkv.clearAll();
}

if (openPlan.mode === 'recovery') {
  logger.error(
    '[MMKV] Keychain unavailable but store is encrypted — running in recovery namespace this session; user data preserved on disk',
  );
}
if (openPlan.recrypt && encryptionKey) {
  try {
    mmkv.recrypt(encryptionKey);
    storageMeta.set(MODE_MARKER_KEY, 'encrypted');
    logger.log('[MMKV] Upgraded plain store to encrypted via recrypt');
  } catch (error) {
    logger.warn('[MMKV] recrypt failed; staying plain', error);
  }
} else if (openPlan.writeMarker) {
  storageMeta.set(MODE_MARKER_KEY, openPlan.writeMarker);
}

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
// Device ID — stable anonymous identifier, generated once on first launch
// ---------------------------------------------------------------------------

const DEVICE_ID_KEY = 'unfold-device-id';
const SECURE_DEVICE_ID_KEY = 'unfold-device-id'; // SecureStore namespace is separate from MMKV

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
  let secureValue: string | null = null;
  let secureAvailable = true;
  try {
    secureValue = SecureStore.getItem(SECURE_DEVICE_ID_KEY);
  } catch {
    secureAvailable = false; // Keychain down — MMKV mirror keeps us working
  }

  const plan = resolveDeviceId({
    secureValue,
    mmkvValue: mmkv.getString(DEVICE_ID_KEY) ?? null,
    generate: () => uuidv4(),
  });

  if (plan.writeSecure && secureAvailable) {
    try {
      SecureStore.setItem(SECURE_DEVICE_ID_KEY, plan.id);
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
 */
export function rotateDeviceId(): string {
  const id = uuidv4();
  try {
    SecureStore.setItem(SECURE_DEVICE_ID_KEY, id);
  } catch {
    // Best-effort
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
