/**
 * Shared sign-out / data-reset teardown.
 *
 * Every sign-out path in the app — the welcome-screen escape hatch,
 * the settings Sign Out button, and the settings Reset All Data
 * button — needs to run the same sequence to avoid cross-session
 * entitlement leaks on shared devices. Previously only the escape
 * hatch set the `rc-logout-pending` guard and imperatively
 * invalidated the RevenueCat session, so the settings paths could
 * leave a window where:
 *
 *   1. User taps Sign Out, `signOut()` / `rcLogoutUser()` start
 *      running asynchronously.
 *   2. App is backgrounded or force-quit before RC logout resolves.
 *   3. Next launch boots with no `rc-logout-pending` flag, reads
 *      CustomerInfo from the still-authenticated SDK, and restores
 *      the previous user's `isPremium` into the anonymous or new
 *      session.
 *
 * That's a real tenant-isolation failure on shared devices. This
 * module is the single source of truth for the teardown order so
 * every exit path gets the same fail-closed guarantees. If you are
 * adding a new sign-out or destructive-reset UI, call this helper —
 * do not open-code the steps.
 *
 * Invariants enforced here:
 *   - Persist the forced-signed-out-clerk-id guard BEFORE clearing
 *     local state so useAuth can refuse a late Clerk positive-sync
 *     for the same user.
 *   - Set rc-logout-pending BEFORE invalidating the in-process RC
 *     session, so the re-bootstrap inside useRevenueCatSync sees
 *     the flag and refuses premium writes until it can prove a
 *     clean logOut.
 *   - Invalidate the in-process RevenueCat session synchronously,
 *     so any late CustomerInfo listener callback cannot restore
 *     `isPremium=true` into the cleared store.
 *   - Fire Clerk signOut and RC logoutUser in the background. The
 *     caller must NOT block on them — the entire point of this
 *     teardown is to stay safe even if the backend is stuck or
 *     offline.
 *   - Clear local state last (store, companion, inflight job,
 *     analytics, sentry) so any synchronous observer (e.g. a
 *     selector reading `isPremium`) already sees fail-closed
 *     values by the time it re-renders.
 *
 * The caller owns navigation (`router.replace('/')` etc.) because
 * routing requirements differ between the escape hatch (welcome),
 * settings sign-out (welcome + signedOut param), and reset data
 * (welcome via dismissAll).
 */

import * as Sentry from '@sentry/react-native';
import { useUnfoldStore } from '@/lib/store';
import { useCompanionChatStore } from '@/lib/companion-chat-store';
import { mmkvStorage, rotateDeviceId } from '@/lib/mmkv-storage';
import { Analytics } from '@/lib/analytics';
import { logger } from '@/lib/logger';
import { isRevenueCatEnabled, logoutUser as rcLogoutUser } from '@/lib/revenuecatClient';
import { invalidateRevenueCatSession } from '@/lib/revenuecat-session';
import { clearInflight } from '@/lib/inflight-job';
import { cancelTrialEndingNotification } from '@/lib/trial-notification';
import { clearBridgeCache } from '@/lib/bridge-service';
import { clearExamenCache } from '@/lib/examen-service';

const FORCED_SIGNED_OUT_KEY = 'forced-signed-out-clerk-id';
const RC_LOGOUT_PENDING_KEY = 'rc-logout-pending';
// Kept in sync with src/hooks/useRevenueCatSync.ts — the persisted
// entitlement snapshot used as the offline-bootstrap fallback. Must
// be cleared on every sign-out path, otherwise a successful logout
// followed by an offline cold-launch in a new/anonymous session
// would still read the previous user's cached premium snapshot and
// restore isPremium=true into the new session. Defined here as a
// plain string rather than imported from the hook file to avoid a
// cycle (the hook imports nothing from this module, but importing
// a constant across react/non-react modules for a magic string is
// an unnecessary coupling).
const RC_CACHED_ENTITLEMENT_KEY = 'rc-cached-entitlement-v1';

export type SignOutTeardownOptions = {
  /**
   * Clerk sign-out function (typically `useClerk().signOut` or the
   * convenience from `useAuth()`). Fired-and-forgotten. Pass
   * `undefined` from destructive-reset paths that only want to wipe
   * local state without touching Clerk (e.g. "Reset all data" on a
   * session that is not backed by an external auth provider).
   *
   * Warning: omitting this leaves the existing Clerk session alive,
   * so useAuth will re-write the cleared authUserId back into the
   * store on the next effect run. Only pass `undefined` when the
   * caller intends to leave auth state untouched — otherwise always
   * pass the Clerk signOut.
   */
  clerkSignOut?: () => Promise<unknown>;

  /**
   * A label for logs / Sentry breadcrumbs so we can distinguish the
   * escape hatch from the settings flows when debugging. Not shown
   * to the user.
   */
  source:
    | 'welcome-escape-hatch'
    | 'settings-sign-out'
    | 'settings-reset-data'
    | 'settings-delete-account';

  /**
   * Escalates this teardown from "ordinary sign-out" to "this user
   * is leaving the device entirely and every byte they put on it
   * should be unreachable." Triggered by Reset-All-Data and
   * Delete-Account — paths whose UI promises full data removal.
   *
   * A destructive teardown additionally:
   *   - Rotates the anonymous device ID, so the backend no longer
   *     links future anonymous traffic to the prior user's data
   *     (anonymous requests are keyed by `X-Device-ID`).
   *   - Clears the bridge and examen caches (they hold personalized
   *     generated text — leaving them on disk after a delete is
   *     real PII residue on shared devices).
   *   - Wipes the trial-notification MMKV mirror alongside the
   *     notification itself.
   *
   * An ordinary sign-out does NOT do these things: a transient
   * sign-out should not wipe the device identity or force a fresh
   * server-side account link, and keeping the generated content
   * caches around means a sign-back-in to the same account sees
   * its own content instantly. Only the explicit delete/reset UIs
   * should set this flag.
   */
  destructive?: boolean;
};

/**
 * Source tag for the standalone RC-teardown helper below. Every
 * string here names a code path where we need the fail-closed
 * RevenueCat teardown without doing a full local-state wipe.
 */
export type RevenueCatTeardownSource =
  | 'welcome-escape-hatch'
  | 'settings-sign-out'
  | 'settings-reset-data'
  | 'settings-delete-account'
  | 'useauth-clerk-signed-out';

/**
 * Shared RevenueCat teardown for every sign-out path — both the full
 * `performSignOutTeardown` (which ALSO wipes local state) and the
 * passive Clerk-confirmed signed-out branch in `useAuth` (which must
 * NOT wipe local devotionals/journal/etc because Clerk sign-outs can
 * be transient and the user's own content is tenant-safe as long as
 * the RC entitlement state can't leak).
 *
 * Why this exists: before extraction, `useAuth`'s authoritative
 * signed-out branch only fire-and-forgot `rcLogoutUser()`. With the
 * offline-cache fallback added to `useRevenueCatSync`, any
 * Clerk-driven sign-out that didn't go through the settings UI
 * (session expiry, token revocation, external sign-out) left:
 *   - `rc-cached-entitlement-v1` live in MMKV
 *   - `rc-logout-pending` unset
 *   - The in-process RC listener still attached
 * and the next cold launch with a degraded/offline RC would
 * rehydrate the previous user's `isPremium=true` into the now-
 * signed-out session. Real cross-session entitlement leak on
 * shared devices.
 *
 * This helper enforces the same fail-closed sequence every path
 * needs:
 *   1. Set `rc-logout-pending` BEFORE invalidating the session so
 *      the re-bootstrap refuses premium writes.
 *   2. Clear the persisted entitlement snapshot so offline cold-
 *      launch cannot restore premium.
 *   3. Invalidate the in-process RC session so any late
 *      CustomerInfo listener callback is torn down.
 *   4. Fire-and-forget `rcLogoutUser()`; clear the pending flag on
 *      success, leave it set on failure so the next bootstrap
 *      retries.
 *
 * Does NOT touch Zustand, companion store, inflight job, Analytics,
 * or Sentry — those are the caller's responsibility (and differ
 * between the full teardown and the useAuth branch).
 */
export function performRevenueCatTeardown(source: RevenueCatTeardownSource): void {
  if (!isRevenueCatEnabled()) return;

  // Steps 1-3 are synchronous and must land BEFORE any further
  // re-render so that a concurrent `useRevenueCatSync` re-bootstrap
  // sees the guard + cleared cache on its first read.
  mmkvStorage.setItem(RC_LOGOUT_PENDING_KEY, '1');
  mmkvStorage.removeItem(RC_CACHED_ENTITLEMENT_KEY);
  invalidateRevenueCatSession();

  // Step 4: background RC logout. Fire-and-forget — if RC is stuck
  // we must not block the caller. On success we clear the pending
  // flag; on failure we leave it set so the next bootstrap retries.
  void (async () => {
    try {
      const result = await rcLogoutUser();
      if (result.ok) {
        mmkvStorage.removeItem(RC_LOGOUT_PENDING_KEY);
        logger.log('[sign-out-teardown] RC logout succeeded, cleared pending flag', { source });
      } else {
        logger.warn('[sign-out-teardown] RC logout failed, leaving pending flag set', {
          source,
          reason: result.reason,
        });
      }
    } catch (err) {
      logger.warn('[sign-out-teardown] RC logout threw, leaving pending flag set', { source, err });
    }
  })();
}

/**
 * Run the fail-closed teardown sequence shared by every sign-out or
 * destructive-reset path. Synchronous from the caller's perspective:
 * returns after local state is cleared; RC/Clerk network calls
 * continue in the background and clear their guards on success. The
 * caller navigates away (`router.replace('/')`) immediately after
 * this returns.
 */
export function performSignOutTeardown(options: SignOutTeardownOptions): void {
  const { clerkSignOut, source, destructive = false } = options;

  logger.log('[sign-out-teardown] Running teardown', { source, destructive });

  // 1. Capture authUserId BEFORE reset() so we can persist the
  //    forced-signed-out guard. useAuth will honor this on any
  //    subsequent late Clerk sync for the same userId.
  const preSignOutAuthUserId =
    useUnfoldStore.getState().user?.authUserId ?? null;
  if (preSignOutAuthUserId !== null) {
    mmkvStorage.setItem(FORCED_SIGNED_OUT_KEY, preSignOutAuthUserId);
  }

  // 2. Fail-closed RevenueCat teardown — guards + cache clear +
  //    session invalidate, plus fire-and-forget logout. Delegated
  //    to performRevenueCatTeardown so this sequence stays in lock-
  //    step with useAuth's Clerk-signed-out branch.
  performRevenueCatTeardown(source);

  // 3. Fire Clerk signOut in the background. Do not await — if
  //    Clerk is stuck (the exact scenario the escape hatch handles)
  //    awaiting would trap the caller forever.
  if (clerkSignOut) {
    void Promise.resolve()
      .then(() => clerkSignOut())
      .catch((err) => {
        logger.warn('[sign-out-teardown] Clerk signOut failed', { source, err });
      });
  }

  // 4. Cancel the trial-ending local notification and clear its
  //    MMKV mirror. This notification is scheduled with a stable
  //    identifier specifically so it survives app restarts — which
  //    means without this step, a signed-out or deleted account
  //    can still receive the previous user's "your trial ends in
  //    2 days" push. User-visible privacy leakage on shared
  //    devices, especially confusing if the new user never
  //    started a trial. Fire-and-forget: cancelTrialEndingNotification
  //    is async and we don't want to block navigation on the OS
  //    notification-center round-trip.
  void cancelTrialEndingNotification().catch((err) => {
    logger.warn('[sign-out-teardown] cancelTrialEndingNotification failed', { source, err });
  });

  // 5. Clear local state. Order matters only in that inflight-job
  //    and companion conversations come after reset() so their
  //    own in-memory caches don't race a fresh Zustand identity.
  useUnfoldStore.getState().reset();
  useCompanionChatStore.getState().clearAllConversations();
  clearInflight();
  Analytics.setUserId(null);
  Sentry.setUser(null);

  // 6. Destructive escalation. Paths whose UI explicitly promises
  //    full data removal (Reset-All-Data, Delete-Account) must go
  //    beyond "sign out + keep personal content caches" because
  //    leaving those caches behind would be a real data-residue
  //    bug on shared devices:
  //      - Bridge/examen caches hold personalized generated text
  //        keyed by devotional/day/date. Not tenant-isolated by
  //        user id. Must be wiped.
  //      - The anonymous device id keys backend traffic via
  //        `X-Device-ID`. Without rotation, a fresh anonymous
  //        session on the same device reuses the prior user's
  //        server-linked data. Rotate it so the new anonymous
  //        session starts from zero.
  //
  //    Ordinary sign-out skips this block: a transient sign-out
  //    should not force the next sign-in to rebuild every cache
  //    from scratch or look like a brand-new device to the
  //    backend.
  if (destructive) {
    try {
      clearBridgeCache();
    } catch (err) {
      logger.warn('[sign-out-teardown] clearBridgeCache failed', { source, err });
    }
    try {
      clearExamenCache();
    } catch (err) {
      logger.warn('[sign-out-teardown] clearExamenCache failed', { source, err });
    }
    try {
      const freshId = rotateDeviceId();
      logger.log('[sign-out-teardown] device id rotated', { source, freshId });
    } catch (err) {
      logger.warn('[sign-out-teardown] rotateDeviceId failed', { source, err });
    }
  }
}
