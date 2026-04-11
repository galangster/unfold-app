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
  try {
    let key = SecureStore.getItem(ENCRYPTION_KEY_ID);
    if (key) return key;

    // Generate a cryptographically secure 32-char hex key
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    key = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');

    SecureStore.setItem(ENCRYPTION_KEY_ID, key);
    logger.log('[MMKV] Created new encryption key in SecureStore');
    return key;
  } catch (error) {
    logger.warn('[MMKV] SecureStore unavailable, MMKV will not be encrypted', error);
    return undefined;
  }
}

// ---------------------------------------------------------------------------
// MMKV instance — encrypted, with a new ID to avoid file conflicts
// ---------------------------------------------------------------------------

const encryptionKey = getOrCreateEncryptionKey();

// Use 'unfold-store-v2' for the encrypted instance.
// The old 'unfold-store' (unencrypted) is migrated below and then cleared.
const mmkv = encryptionKey
  ? new MMKV({ id: 'unfold-store-v2', encryptionKey })
  : new MMKV({ id: 'unfold-store-v2' });

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

/**
 * Get or create a stable device ID (UUID v4) for anonymous identification.
 * Stored in the encrypted MMKV instance — persists across app restarts.
 */
export function getDeviceId(): string {
  let id = mmkv.getString(DEVICE_ID_KEY);
  if (id) return id;

  id = uuidv4();
  mmkv.set(DEVICE_ID_KEY, id);
  logger.log('[MMKV] Generated new device ID:', id);
  return id;
}

/**
 * Rotate the device ID to a fresh UUID. Used by destructive teardown
 * paths (reset-all-data, delete-account).
 *
 * Why this matters: anonymous backend traffic is keyed by the
 * `X-Device-ID` header resolved from `getDeviceId()`. Without rotation,
 * a user who hits "Reset all data" or "Delete account" would come back
 * up with the *same* anonymous identity on the backend — meaning any
 * server-linked data associated with that device ID (devotionals,
 * progress, analytics, etc.) would still be reachable. That's a real
 * data-deletion gap for a UI that promises "delete everything."
 *
 * Returns the new device ID so the caller can log the transition for
 * debug purposes.
 */
export function rotateDeviceId(): string {
  const fresh = uuidv4();
  mmkv.set(DEVICE_ID_KEY, fresh);
  logger.log('[MMKV] Rotated device ID (destructive teardown):', fresh);
  return fresh;
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
