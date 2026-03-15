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
import { MMKV } from 'react-native-mmkv';
import type { StateStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
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

    // Generate a random 32-char hex key
    const chars = '0123456789abcdef';
    key = '';
    for (let i = 0; i < 32; i++) {
      key += chars[Math.floor(Math.random() * chars.length)];
    }

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
