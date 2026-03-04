/**
 * MMKV Storage Adapter for Zustand
 *
 * Replaces AsyncStorage with MMKV for the Zustand persist middleware.
 * Benefits:
 * - Binary format (not plaintext JSON editable with a text editor)
 * - Synchronous reads/writes (faster)
 * - More reliable than AsyncStorage
 *
 * Includes one-time migration from AsyncStorage → MMKV on first launch.
 */
import { MMKV } from 'react-native-mmkv';
import type { StateStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { logger } from '@/lib/logger';

// Create MMKV instance for the main store
const mmkv = new MMKV({ id: 'unfold-store' });

// Track whether migration has been attempted this session
let migrationAttempted = false;

/**
 * One-time migration from AsyncStorage to MMKV.
 * Called lazily on first getItem if MMKV is empty.
 */
async function migrateFromAsyncStorage(): Promise<void> {
  if (migrationAttempted) return;
  migrationAttempted = true;

  try {
    // Check if we already have data in MMKV
    const existingData = mmkv.getString('unfold-storage');
    if (existingData) {
      logger.log('[MMKV] Data already exists in MMKV, skipping migration');
      return;
    }

    // Try to read from AsyncStorage
    const asyncData = await AsyncStorage.getItem('unfold-storage');
    if (!asyncData) {
      logger.log('[MMKV] No AsyncStorage data to migrate');
      return;
    }

    // Migrate to MMKV
    mmkv.set('unfold-storage', asyncData);
    logger.log('[MMKV] Migrated store data from AsyncStorage to MMKV');

    // Clear old AsyncStorage data after successful migration
    await AsyncStorage.removeItem('unfold-storage');
    logger.log('[MMKV] Cleared old AsyncStorage data');
  } catch (error) {
    logger.error('[MMKV] Migration failed, will use MMKV fresh', error);
  }
}

/**
 * Zustand-compatible storage adapter using MMKV.
 *
 * Uses synchronous MMKV for reads/writes, with an async migration
 * fallback on first read if MMKV is empty.
 */
export const mmkvStorage: StateStorage = {
  getItem: (name: string): string | null => {
    const value = mmkv.getString(name);

    // If MMKV is empty and we haven't tried migration yet,
    // kick off async migration (will be available on next rehydration)
    if (!value && !migrationAttempted) {
      migrateFromAsyncStorage().catch(() => {});
    }

    return value ?? null;
  },

  setItem: (name: string, value: string): void => {
    mmkv.set(name, value);
  },

  removeItem: (name: string): void => {
    mmkv.delete(name);
  },
};
