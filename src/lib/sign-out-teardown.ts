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
import { mmkvStorage } from '@/lib/mmkv-storage';
import { Analytics } from '@/lib/analytics';
import { logger } from '@/lib/logger';
import { isRevenueCatEnabled, logoutUser as rcLogoutUser } from '@/lib/revenuecatClient';
import { invalidateRevenueCatSession } from '@/lib/revenuecat-session';
import { clearInflight } from '@/lib/inflight-job';

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
  source: 'welcome-escape-hatch' | 'settings-sign-out' | 'settings-reset-data';
};

/**
 * Run the fail-closed teardown sequence shared by every sign-out or
 * destructive-reset path. Synchronous from the caller's perspective:
 * returns after local state is cleared; RC/Clerk network calls
 * continue in the background and clear their guards on success. The
 * caller navigates away (`router.replace('/')`) immediately after
 * this returns.
 */
export function performSignOutTeardown(options: SignOutTeardownOptions): void {
  const { clerkSignOut, source } = options;

  logger.log('[sign-out-teardown] Running teardown', { source });

  // 1. Capture authUserId BEFORE reset() so we can persist the
  //    forced-signed-out guard. useAuth will honor this on any
  //    subsequent late Clerk sync for the same userId.
  const preSignOutAuthUserId =
    useUnfoldStore.getState().user?.authUserId ?? null;
  if (preSignOutAuthUserId !== null) {
    mmkvStorage.setItem(FORCED_SIGNED_OUT_KEY, preSignOutAuthUserId);
  }

  // 2. Persist the RC logout-pending guard BEFORE invalidating the
  //    session, so the re-bootstrap triggered by the invalidation
  //    sees the flag and refuses premium writes until it can prove
  //    a clean logOut. Also wipe the persisted entitlement cache:
  //    that cache is a global MMKV key keyed on nothing, so if we
  //    leave it in place a subsequent offline cold-launch in a new
  //    or anonymous session would read the previous user's
  //    `isPremium=true` snapshot and restore it. Clearing it here
  //    is safe because any still-valid premium session will
  //    repopulate the cache on its next successful
  //    `getCustomerInfo()` — and any session that never reaches
  //    that success will have stayed fail-closed regardless.
  if (isRevenueCatEnabled()) {
    mmkvStorage.setItem(RC_LOGOUT_PENDING_KEY, '1');
    mmkvStorage.removeItem(RC_CACHED_ENTITLEMENT_KEY);
    invalidateRevenueCatSession();
  }

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

  // 4. Clear local state. Order matters only in that inflight-job
  //    and companion conversations come after reset() so their
  //    own in-memory caches don't race a fresh Zustand identity.
  useUnfoldStore.getState().reset();
  useCompanionChatStore.getState().clearAllConversations();
  clearInflight();
  Analytics.setUserId(null);
  Sentry.setUser(null);

  // 5. Background RC logout. Same fire-and-forget pattern as the
  //    escape hatch — on success we clear the pending flag, on
  //    failure we leave it set so the next useRevenueCatSync bootstrap
  //    (this session via the re-bootstrap, or next launch) retries.
  if (isRevenueCatEnabled()) {
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
}
