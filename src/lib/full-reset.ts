/**
 * Canonical full data reset.
 *
 * Implements product decision #1 for DAT-6, extended in P3-4 item 3:
 *   - Ask the server to erase this device's data FIRST, under the OLD
 *     identity (best-effort, short timeout — never blocks the local wipe,
 *     but the outcome is returned so Settings can be honest about it)
 *   - Cancel EVERY scheduled OS notification (frozen payloads would keep
 *     firing against content that no longer exists)
 *   - Clear all personal-data stores
 *   - Remove every MMKV key that may hold user-specific state, including
 *     prefixed key families swept from the live key list
 *   - Clear AI caches derived from personal context
 *   - Clear the bug log (plaintext AsyncStorage), the review-prompt marker,
 *     the paywall-diagnostics JSONL, and the TTS audio cache
 *   - Delete the profile photo (document directory) and the exported share
 *     cards / devotional workbook PDFs (cache directory)
 *   - Push an empty timeline to the iOS widgets (App Group data)
 *   - Log RevenueCat out best-effort so the next launch re-establishes the
 *     identity from the new device id
 *   - Rotate device identity LAST
 *
 * NOTE (RevenueCat identity, pre-existing): `configuredAppUserID` in
 * revenuecatClient.ts is module scope, set once when the SDK is configured at
 * launch, and rotateDeviceId() does not update it — it keeps the OLD
 * device-scoped id for the rest of the session. logoutUser() above only drops
 * the SDK's current user, so if the identity sync had failed this session,
 * `retryRevenueCatIdentitySync()` (fired by useRevenueCatSync on foreground
 * while `revenueCatResolved` is still false) can log the OLD identity back in
 * AFTER the reset. The next cold start establishes the new id. Entitlement
 * recovery for the user is Apple/Google restore-purchases either way.
 *
 * Unifies the previously split user path ((you)/index.tsx) and QA path
 * (debug-reset-beginning.tsx) — vault rule deterministic-twin-paths-must-
 * share-one-helper.
 */

import { cancelAllScheduledNotifications } from '@/lib/notifications';
import { useUnfoldStore } from '@/lib/store';
import { useCompanionChatStore } from '@/lib/companion-chat-store';
import {
  mmkvStorage,
  getMmkvKeys,
  rotateDeviceId,
  purgeRealStoreForRecoveryReset,
} from '@/lib/mmkv-storage';
import { clearBridgeCache } from '@/lib/bridge-service';
import { clearExamenCache } from '@/lib/examen-service';
import { clearScriptureExplainCache } from '@/lib/scripture-explain-api';
import { clearVerseCache } from '@/lib/bible-api';
import { clearTrialNotificationMirror } from '@/lib/trial-notification';
import { clearBugLogEntries } from '@/lib/bug-logger';
import { clearReviewPromptState } from '@/lib/review-prompt';
import { clearPaywallDiagnosticsFile } from '@/lib/paywall-diagnostics';
import { clearAudioCache } from '@/lib/tts-service';
import { clearWidgets } from '@/lib/widget-bridge';
import { logoutUser } from '@/lib/revenuecatClient';
import {
  requestServerAccountErase,
  SERVER_ERASE_TIMEOUT_MS,
  type ServerEraseResult,
} from '@/lib/account-erase';
import { logger } from '@/lib/logger';
import { cacheDirectory, deleteAsync, documentDirectory, readDirectoryAsync } from 'expo-file-system/legacy';
// RS13-1: import the canonical keys — don't repeat the string literals here.
import { OUTBOX_KEY } from '@/lib/sync-outbox';
import { DEVOTIONAL_PULL_CURSOR_KEY } from '@/lib/devotional-pull-cursor';
import { LAST_PULLED_AT_KEY } from '@/lib/full-sync-pull';
import { MIGRATION_KEY as GENERATION_MIGRATION_KEY } from '@/lib/generation-migration';
import { STORE_KEY as ONBOARDING_SAMPLE_JOB_KEY } from '@/lib/onboarding-sample-job-store';
import { DYNAMIC_EXAMPLE_KEY } from '@/lib/generation-api';
import { RATE_LIMIT_STORAGE_KEY } from '@/lib/rate-limit';

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
  OUTBOX_KEY,
  // Devotional pull cursor is scoped to the device id; rotation below would
  // already invalidate it, but a wiped store must never carry a delta cursor.
  DEVOTIONAL_PULL_CURSOR_KEY,
  // P3-4 item 3 — sync + generation bookkeeping: a wiped install must pull
  // from scratch, re-run the (idempotent) generation migration, never resume
  // a stale onboarding sample job, and drop the cached prompt example.
  LAST_PULLED_AT_KEY,
  GENERATION_MIGRATION_KEY,
  ONBOARDING_SAMPLE_JOB_KEY,
  DYNAMIC_EXAMPLE_KEY,
  // NOTE: 'unfold-trial-notification' is an MMKV INSTANCE id, not a key here — cleared via clearTrialNotificationMirror() below (REVM-8).
] as const;

/**
 * Key families identified by prefix (one key per endpoint, e.g.
 * `@unfold_rate_limits_companion`). Swept by enumerating the live key list
 * so a newly rate-limited endpoint can never be missed.
 */
export const FULL_RESET_MMKV_KEY_PREFIXES: readonly string[] = [
  `${RATE_LIMIT_STORAGE_KEY}_`,
] as const;

const REVENUECAT_LOGOUT_TIMEOUT_MS = 5_000;

export interface FullResetOptions {
  /** Test hook — production callers use SERVER_ERASE_TIMEOUT_MS. */
  serverEraseTimeoutMs?: number;
  /** Test hook — production callers use REVENUECAT_LOGOUT_TIMEOUT_MS. */
  revenueCatLogoutTimeoutMs?: number;
}

export interface FullResetResult {
  /** Outcome of the server-side erase; the local wipe always completes. */
  serverErase: ServerEraseResult;
}

/** Run one external-system step; a failure is logged and never aborts the reset. */
async function bestEffort(step: string, run: () => Promise<unknown> | unknown): Promise<void> {
  try {
    await run();
  } catch (error) {
    logger.warn(`[reset] ${step} failed (continuing)`, error);
  }
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

/**
 * ProfileAvatar saves the photo as `documentDirectory/profile-avatar-<ts>.jpg`
 * and stores only the file name in `user.profilePicture` (older builds stored
 * the full URI); only the PREVIOUS photo was ever deleted, on replacement.
 * Mirrors ProfileAvatar's own file-name resolution: the last path segment,
 * joined onto the current document directory — never an arbitrary URI.
 */
function profileAvatarFileName(value: string | null | undefined): string | null {
  if (!value) return null;
  const segments = value.trim().split('/').filter(Boolean);
  const fileName = segments.length ? segments[segments.length - 1] : null;
  return fileName && fileName !== '.' && fileName !== '..' ? fileName : null;
}

async function deleteProfilePhoto(profilePicture: string | null | undefined): Promise<void> {
  const fileName = profileAvatarFileName(profilePicture);
  if (!fileName || !documentDirectory) return;
  await deleteAsync(`${documentDirectory}${fileName}`, { idempotent: true });
}

/**
 * Files other flows leave in the cache directory that embed personal content:
 * share-card.tsx writes `share-card-<ts>.png`; pdf-export.ts moves the
 * workbook (journal entries, check-ins) to `<Devotional title>.pdf`. Top level
 * only, and never the Bible DB (documentDirectory/SQLite — non-personal
 * downloaded content).
 */
function isExportedPersonalFile(name: string): boolean {
  return /^share-card-.*\.png$/i.test(name) || /\.pdf$/i.test(name);
}

async function sweepExportedPersonalFiles(): Promise<void> {
  if (!cacheDirectory) return;
  const names = await readDirectoryAsync(cacheDirectory);
  for (const name of names.filter(isExportedPersonalFile)) {
    try {
      await deleteAsync(`${cacheDirectory}${name}`, { idempotent: true });
    } catch (error) {
      logger.warn(`[reset] could not delete exported file ${name} (continuing)`, error);
    }
  }
}

export async function performFullLocalReset(options: FullResetOptions = {}): Promise<FullResetResult> {
  // 0. Server erase under the OLD identity — MUST run before rotateDeviceId()
  //    (step 12): the current X-Device-ID is the only thing the server can
  //    match. Best-effort with a short timeout; never throws.
  const serverErase = await requestServerAccountErase({
    timeoutMs: options.serverEraseTimeoutMs ?? SERVER_ERASE_TIMEOUT_MS,
  });
  if (!serverErase.ok) {
    logger.warn(`[reset] Server data NOT confirmed deleted (${serverErase.reason}); continuing with local reset`);
  }

  // 1. Cancel every scheduled OS notification BEFORE wiping the store —
  //    frozen payloads would otherwise keep firing against content that no
  //    longer exists. The OS-wide cancel covers reminders, uniform + per-day
  //    check-ins, the trial-ending notification, tap tests, and any family
  //    added later, without enumerating ids.
  await bestEffort('cancel scheduled notifications', cancelAllScheduledNotifications);

  // 1b. Profile photo — its file name lives only in `user.profilePicture`,
  //     which the store reset below wipes, so read the store first (one
  //     snapshot serves both steps). Idempotent: a missing file is fine.
  const store = useUnfoldStore.getState();
  await bestEffort('delete profile photo', () => deleteProfilePhoto(store.user?.profilePicture));

  // 2. Zustand store reset
  store.reset();
  useCompanionChatStore.getState().clearAllConversations();

  // 3. MMKV key wipe — enumerated keys, then prefixed families from the live key list
  for (const key of FULL_RESET_MMKV_KEYS) {
    mmkvStorage.removeItem(key);
  }
  try {
    for (const key of getMmkvKeys()) {
      if (FULL_RESET_MMKV_KEY_PREFIXES.some((prefix) => key.startsWith(prefix))) {
        mmkvStorage.removeItem(key);
      }
    }
  } catch (error) {
    logger.warn('[reset] MMKV prefix sweep failed (continuing)', error);
  }

  // 3b. Recovery sessions (FAP-LIB-2/FAP-X-2): the wipe above only touched
  //     the throwaway recovery namespace — the user's REAL store file is
  //     encrypted and unopenable this session, so without this the reset
  //     silently no-ops and everything resurrects on the next normal boot.
  //     Delete the real store files on disk + clear the mode marker so the
  //     next boot is a true fresh start. Strict no-op on normal sessions.
  purgeRealStoreForRecoveryReset();

  // 4. AI caches derived from personal context
  clearBridgeCache();
  clearExamenCache();
  clearScriptureExplainCache();
  clearVerseCache();

  // 5. Trial-notification mirror (the OS notification itself went in step 1)
  clearTrialNotificationMirror();

  // 6. Bug log (plaintext AsyncStorage)
  await clearBugLogEntries();

  // 7. Review-prompt once-per-version marker (AsyncStorage)
  await bestEffort('clear review-prompt marker', clearReviewPromptState);

  // 8. Paywall diagnostics JSONL (document directory, QA builds only)
  await bestEffort('delete paywall diagnostics file', clearPaywallDiagnosticsFile);

  // 9. TTS audio cache (cache directory) + LRU metadata
  await bestEffort('clear TTS audio cache', clearAudioCache);

  // 9b. Exported personal files left in the cache directory: share cards and
  //     devotional workbook PDFs that embed journal entries.
  await bestEffort('sweep exported personal files', sweepExportedPersonalFiles);

  // 10. iOS widgets — App Group data keeps showing the old devotional until
  //     the next syncWidgets(); push an empty timeline now.
  await bestEffort('clear widgets', clearWidgets);

  // 11. RevenueCat — logoutUser() is already guarded (web / not configured /
  //     SDK errors resolve to { ok: false }); the timeout keeps a hung SDK
  //     from blocking the reset. The next launch logs in under the new id.
  await bestEffort('RevenueCat logout', () =>
    withTimeout(
      logoutUser(),
      options.revenueCatLogoutTimeoutMs ?? REVENUECAT_LOGOUT_TIMEOUT_MS,
      'RevenueCat logout',
    ),
  );

  // 12. Rotate device identity LAST — server data (if the erase above did not
  //     confirm) becomes permanently unreachable from this install.
  rotateDeviceId();
  logger.warn('[reset] Device identity rotated; RevenueCat identity refreshes on next launch');

  return { serverErase };
}
