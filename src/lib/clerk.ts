/**
 * Clerk authentication module.
 *
 * Provides token caching, a module-level token getter ref (bridges
 * Clerk's React hooks to non-React service files), and auth helpers.
 */

import * as SecureStore from 'expo-secure-store';
import { logger } from '@/lib/logger';

/* ─────────────────────────────────────────────────────────
 * Token cache — persists Clerk tokens in Secure Store
 * ───────────────────────────────────────────────────────── */

export const tokenCache = {
  async getToken(key: string): Promise<string | null> {
    try {
      return await SecureStore.getItemAsync(key);
    } catch (err) {
      logger.error('[Clerk] tokenCache.getToken error:', err);
      return null;
    }
  },
  async saveToken(key: string, value: string): Promise<void> {
    try {
      await SecureStore.setItemAsync(key, value);
    } catch (err) {
      logger.error('[Clerk] tokenCache.saveToken error:', err);
    }
  },
  async clearToken(key: string): Promise<void> {
    try {
      await SecureStore.deleteItemAsync(key);
    } catch (err) {
      logger.error('[Clerk] tokenCache.clearToken error:', err);
    }
  },
};

/* ─────────────────────────────────────────────────────────
 * Module-level token getter ref
 *
 * Clerk's getToken() is only available via useAuth() React hook.
 * The root _layout.tsx syncs the hook's getToken function here
 * so non-React service files (api-config.ts) can fetch tokens.
 * ───────────────────────────────────────────────────────── */

let _getToken: (() => Promise<string | null>) | null = null;

export function setTokenGetter(fn: () => Promise<string | null>) {
  _getToken = fn;
}

export async function getClerkToken(): Promise<string | null> {
  if (!_getToken) return null;
  try {
    return await _getToken();
  } catch (err) {
    logger.error('[Clerk] getClerkToken error:', err);
    return null;
  }
}

