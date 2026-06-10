/**
 * Canonical full local-data reset.
 *
 * Implements product decision #1 for DAT-6:
 *   - Cancel OS notifications first (frozen payloads would keep firing)
 *   - Clear all personal-data stores
 *   - Remove all MMKV keys that may hold user-specific state
 *   - Clear AI caches derived from personal context
 *   - Clear the bug log (plaintext AsyncStorage)
 *   - Rotate device identity (server data orphaned-by-design — server-side
 *     DELETE endpoint does not exist; filed as follow-up)
 *
 * NOTE: RevenueCat identity is module-scope at launch; after rotation the
 * old anon_<uuid> RC identity stays stale until the next cold start. The
 * entitlement recovery path is Apple/Google restore-purchases.
 *
 * Unifies the previously split user path ((you)/index.tsx) and QA path
 * (debug-reset-beginning.tsx) — vault rule deterministic-twin-paths-must-
 * share-one-helper.
 */

import { cancelAllReminders } from '@/lib/notifications';
import { useUnfoldStore } from '@/lib/store';
import { useCompanionChatStore } from '@/lib/companion-chat-store';
import { mmkvStorage, rotateDeviceId } from '@/lib/mmkv-storage';
import { clearBridgeCache } from '@/lib/bridge-service';
import { clearExamenCache } from '@/lib/examen-service';
import { clearScriptureExplainCache } from '@/lib/scripture-explain-api';
import { clearVerseCache } from '@/lib/bible-api';
import { clearTrialNotificationMirror } from '@/lib/trial-notification';
import { clearBugLogEntries } from '@/lib/bug-logger';
import { logger } from '@/lib/logger';

/**
 * All MMKV keys that hold user-specific data and must be cleared on reset.
 * Do NOT include unfold-bible-meta or the Bible DB path — those hold
 * non-personal downloaded content.
 */
export const FULL_RESET_MMKV_KEYS: readonly string[] = [
  'unfold-storage',
  'unfold-companion-chat',
  '@unfold_companion_daily',
  '@unfold_exclusive_offer_seen',
  '@unfold_onboarding_offer_seen',
  'inflight-generation-job',
  'unfold-sync-outbox-v1',
  'unfold-trial-notification',
] as const;

export async function performFullLocalReset(): Promise<void> {
  // 1. Cancel OS notifications BEFORE wiping store — frozen payloads
  //    would otherwise keep firing against content that no longer exists.
  await cancelAllReminders();

  // 2. Zustand store reset
  useUnfoldStore.getState().reset();
  useCompanionChatStore.getState().clearAllConversations();

  // 3. MMKV key wipe
  for (const key of FULL_RESET_MMKV_KEYS) {
    mmkvStorage.removeItem(key);
  }

  // 4. AI caches derived from personal context
  clearBridgeCache();
  clearExamenCache();
  clearScriptureExplainCache();
  clearVerseCache();

  // 5. Trial-notification mirror
  clearTrialNotificationMirror();

  // 6. Bug log (plaintext AsyncStorage)
  await clearBugLogEntries();

  // 7. Rotate device identity — server data becomes permanently unreachable
  //    (orphaned-by-design; backend DELETE endpoint filed as follow-up).
  rotateDeviceId();
  logger.warn('[reset] Device identity rotated; RevenueCat identity refreshes on next launch');
}
