/**
 * Hook to sync RevenueCat subscription status with Zustand store
 *
 * Uses RevenueCat's real-time customer info listener for efficient updates
 * instead of aggressive polling.
 *
 * Also prefetches offerings into the React Query cache at app startup so the
 * paywall can display instantly when opened (no "loading plans" spinner).
 */

import { useEffect } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import Purchases, { type CustomerInfoUpdateListener } from 'react-native-purchases';
import { useQueryClient } from '@tanstack/react-query';
import { useUnfoldStore } from '@/lib/store';
import { mmkvStorage } from '@/lib/mmkv-storage';
import { isRevenueCatEnabled, getOfferings, logoutUser as rcLogoutUser } from '@/lib/revenuecatClient';
import { onRevenueCatSessionInvalidated } from '@/lib/revenuecat-session';
import { syncTrialEndingNotification } from '@/lib/trial-notification';
import { logger } from '@/lib/logger';

// Persisted guard set by the welcome-screen escape hatch (src/app/index.tsx)
// when a sign-out happens while Clerk is stuck. If this flag is present on
// mount it means a prior session attempted to log RevenueCat out but we have
// no proof the call completed — the app may have been force-quit mid-flight,
// the call may have failed, or the listener may have been torn down before
// resolution. In any of those cases the SDK could still be authenticated as
// the previous user, and any CustomerInfo read on this launch would leak
// their entitlement into the anonymous session.
//
// Fail-closed behavior: do NOT call getCustomerInfo, do NOT attach the
// update listener, and do NOT write isPremium until logOut() has definitively
// succeeded in THIS session. If the retry fails, leave the flag set and bail
// out of THIS attempt — but schedule another attempt on the next AppState
// 'active' transition so a transient network/SDK failure doesn't strand the
// user as non-premium for the entire app session. Offerings prefetch is
// still safe (no identity involved) and runs independently.
const RC_LOGOUT_PENDING_KEY = 'rc-logout-pending';

// Persisted snapshot of the Unfold Premium entitlement from the most
// recent authoritative getCustomerInfo() success. This is the oracle
// used to decide whether it is safe to preserve `isPremium=true` when
// a later bootstrap fetch fails.
//
// Schema (v2):
//   {
//     // RevenueCat appUserID (from Purchases.getAppUserID()) at the
//     // time of the write. Used to refuse cross-identity cache
//     // inheritance: on an RC outage at cold launch the fallback
//     // branch compares this to the *current* appUserID and rejects
//     // the cache on mismatch. Without this binding, the cache is
//     // global MMKV state and a scenario where a previous user's
//     // snapshot survives sign-out (e.g. sign-out path crashed after
//     // the cache write but before the clear, or two installs sharing
//     // the same device shared a cache key) would let an offline
//     // cold-launch of a *different* identity inherit the prior user's
//     // `isPremium=true`. appUserID includes the anonymous-id prefix
//     // for signed-out sessions, so anonymous-to-anonymous transitions
//     // also get fresh identities and do not share cache.
//     appUserId: string,
//     isPremium: boolean,
//     // expirationDateMillis at time of last successful sync. null
//     // means lifetime access (no expiration). Used to bound the
//     // offline-preserve window: we will only trust the cached
//     // `isPremium=true` as long as that expiration is still in the
//     // future. A churned/refunded/lapsed user will have an
//     // expiration in the past (or will flip to isPremium=false on
//     // the next successful fetch), so we cannot preserve stale
//     // entitlement beyond what RevenueCat already told us was the
//     // paid window.
//     expirationDateMillis: number | null,
//     // Wall-clock time of the write. Debug/diagnostic only — the
//     // entitlement-validity decision is made against
//     // expirationDateMillis, not against this timestamp.
//     syncedAtMillis: number,
//   }
//
// Previous iterations of this code used a 24-hour fixed TTL on the
// sync timestamp. That was rejected because it granted a full day of
// premium access after churn/refund even though RC itself would have
// told us the entitlement was gone if we could have reached it. The
// cached expirationDateMillis is the correct bound: it's the exact
// wall-clock moment RevenueCat last told us the entitlement stopped
// being valid.
const RC_CACHED_ENTITLEMENT_KEY = 'rc-cached-entitlement-v1';

type CachedEntitlement = {
  appUserId: string;
  isPremium: boolean;
  expirationDateMillis: number | null;
  syncedAtMillis: number;
};

function readCachedEntitlement(): CachedEntitlement | null {
  const raw = mmkvStorage.getItem(RC_CACHED_ENTITLEMENT_KEY) as string | null;
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<CachedEntitlement>;
    // v2 requires appUserId. v1 entries lack it — fail-closed reject
    // on migration so no identity is silently inherited.
    if (typeof parsed.appUserId !== 'string' || parsed.appUserId.length === 0) return null;
    if (typeof parsed.isPremium !== 'boolean') return null;
    if (parsed.expirationDateMillis !== null && typeof parsed.expirationDateMillis !== 'number') return null;
    if (typeof parsed.syncedAtMillis !== 'number') return null;
    return {
      appUserId: parsed.appUserId,
      isPremium: parsed.isPremium,
      expirationDateMillis: parsed.expirationDateMillis ?? null,
      syncedAtMillis: parsed.syncedAtMillis,
    };
  } catch {
    return null;
  }
}

function writeCachedEntitlement(snapshot: CachedEntitlement): void {
  mmkvStorage.setItem(RC_CACHED_ENTITLEMENT_KEY, JSON.stringify(snapshot));
}

/**
 * Resolve the RC appUserID for a cache read/write. This is a local
 * SDK call — it does not hit the network, so it succeeds even in the
 * fail-closed fallback branch where getCustomerInfo() just failed.
 * Returns null if the SDK throws (extremely unlikely but we treat
 * "cannot prove identity" as a cache-reject signal).
 */
async function resolveAppUserId(): Promise<string | null> {
  try {
    const id = await Purchases.getAppUserID();
    return typeof id === 'string' && id.length > 0 ? id : null;
  } catch (err) {
    logger.warn('[RevenueCat] getAppUserID threw — treating as no identity', { err });
    return null;
  }
}

export function useRevenueCatSync() {
  const updateUser = useUnfoldStore((s) => s.updateUser);
  const queryClient = useQueryClient();

  useEffect(() => {
    // Only sync if RevenueCat is configured
    if (!isRevenueCatEnabled()) {
      return;
    }

    let cancelled = false;
    // Bootstrapped = we have completed the full happy path this
    // session: (a) any pending logout has been cleared, (b)
    // getCustomerInfo() has returned an authoritative result and we've
    // written isPremium from it, and (c) the CustomerInfo listener is
    // attached. Only when all three are true do we consider sync
    // "done" and stop retrying. Attaching the listener alone is NOT
    // enough — a listener without a successful bootstrap means the
    // store holds stale/fail-closed state until an entitlement-
    // changing event happens to fire the callback, which for an
    // offline-at-launch user is essentially never.
    let bootstrapped = false;
    // Track the currently-attached listener so cleanup can remove it.
    let listener: CustomerInfoUpdateListener | undefined;
    // Prevents overlapping attempts: if a backoff tick or AppState
    // 'active' event fires while a prior attempt is still in flight,
    // skip instead of racing a second Purchases.logOut() or
    // getCustomerInfo() against the first.
    let attemptInFlight = false;
    // Bounded backoff schedule for in-session retries while not yet
    // bootstrapped. After the initial attempt on mount, failures
    // queue the next tick from this schedule (2s → 5s → 15s → 60s,
    // then 60s indefinitely). This recovers users whose first
    // attempt failed while they stay in the foreground (connectivity
    // recovery, RC backend blip, etc.) without requiring them to
    // background the app. Bounded to avoid hammering a down backend
    // or a permanently offline device.
    const RETRY_SCHEDULE_MS: readonly number[] = [2000, 5000, 15000, 60000];
    let retryIndex = 0;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;

    const scheduleRetry = () => {
      if (cancelled || bootstrapped) return;
      if (retryTimer) return; // already queued
      const delay = RETRY_SCHEDULE_MS[Math.min(retryIndex, RETRY_SCHEDULE_MS.length - 1)];
      retryIndex += 1;
      retryTimer = setTimeout(() => {
        retryTimer = undefined;
        void attemptSync();
      }, delay);
    };

    // Prefetch offerings unconditionally — offerings are identity-agnostic
    // and safe to prime even while logout is pending.
    queryClient.prefetchQuery({
      queryKey: ['revenuecat', 'offerings'],
      queryFn: getOfferings,
      staleTime: 1000 * 60 * 10, // 10 min — offerings rarely change
    }).then(() => {
      const cached = queryClient.getQueryData<Awaited<ReturnType<typeof getOfferings>>>(['revenuecat', 'offerings']);
      if (cached?.ok) {
        const pkgCount = cached.data.current?.availablePackages?.length ?? 0;
        logger.log(`[RevenueCat] Offerings prefetched: ${pkgCount} packages available`);
      } else {
        logger.log('[RevenueCat] Offerings prefetch returned non-ok result:', cached && !cached.ok ? cached.reason : 'no data');
      }
    });

    async function attemptSync(): Promise<void> {
      // Already done — nothing to do. Steady-state after a successful
      // bootstrap.
      if (bootstrapped) return;
      if (attemptInFlight) return;
      attemptInFlight = true;

      try {
        // Honor the escape-hatch logout guard. If a previous session
        // (or an earlier attempt this session) started an RC logout
        // and we can't prove it completed, retry the logout here
        // BEFORE touching CustomerInfo.
        const pending = mmkvStorage.getItem(RC_LOGOUT_PENDING_KEY);
        if (pending) {
          logger.warn('[RevenueCat] rc-logout-pending flag set — retrying logOut before syncing');
          const result = await rcLogoutUser();
          if (cancelled) return;
          if (!result.ok) {
            // Retry failed. Leave the flag set, force the store to
            // the non-premium state (defense against any earlier
            // in-memory leak), and queue another retry on the
            // backoff schedule. Do NOT attach the listener — a late
            // CustomerInfo callback on a still-authenticated SDK
            // could restore the previous user's entitlement.
            logger.warn('[RevenueCat] Logout retry failed, scheduling backoff retry:', result.reason);
            updateUser({ isPremium: false });
            scheduleRetry();
            return;
          }
          mmkvStorage.removeItem(RC_LOGOUT_PENDING_KEY);
        }

        // Fetch authoritative customer info. This is the gate to
        // "bootstrapped" — we will NOT mark the sync as done or
        // attach the listener until this succeeds at least once.
        let fetched = false;
        try {
          const customerInfo = await Purchases.getCustomerInfo();
          if (cancelled) return;
          const entitlement = customerInfo.entitlements.active?.['Unfold Premium'];
          const hasSubscription = Boolean(entitlement);
          updateUser({ isPremium: hasSubscription });
          // Persist the entitlement snapshot for fail-closed bootstrapping
          // on future launches. Store the expirationDateMillis verbatim
          // from RevenueCat — it's the authoritative "entitlement is
          // valid until" cutoff. For non-premium users we still write
          // the snapshot (with isPremium=false) so the cache reflects
          // the latest known state rather than a stale premium=true.
          // Bind to the current RC appUserID so the cache can't be
          // inherited across identities on a future launch.
          const appUserId = await resolveAppUserId();
          if (cancelled) return;
          if (appUserId !== null) {
            writeCachedEntitlement({
              appUserId,
              isPremium: hasSubscription,
              expirationDateMillis: entitlement?.expirationDateMillis ?? null,
              syncedAtMillis: Date.now(),
            });
          } else {
            // No identity to bind — drop any stale cache rather than
            // persisting an unidentifiable snapshot.
            logger.warn('[RevenueCat] Cannot resolve appUserID on success — clearing cache');
            mmkvStorage.removeItem(RC_CACHED_ENTITLEMENT_KEY);
          }
          // Re-validate the trial-ending local notification against the
          // latest customer info. Fire-and-forget.
          void syncTrialEndingNotification();
          fetched = true;
        } catch (error) {
          // Transient fetch failure — could be offline launch, RC
          // backend blip, network mid-switch. Do not attach the
          // listener: if we did, this attempt would short-circuit all
          // future retries even though we never got an authoritative
          // result. Queue a backoff retry instead.
          logger.warn('[RevenueCat] getCustomerInfo failed, scheduling backoff retry:', error);
        }

        if (cancelled) return;
        if (!fetched) {
          // Transient fetch failure path. Prior iterations of this
          // branch flip-flopped between fail-open-always (leaked
          // premium indefinitely to churned users) and fail-closed-
          // always (revoked entitlement from legitimate premium
          // users on any transient blip). A 24h fixed TTL was then
          // introduced but rejected because it still granted a full
          // day of premium access after churn/refund, even though
          // RC itself would have reported the entitlement as gone
          // if we could have reached it.
          //
          // The correct bound is not a clock-based TTL — it's the
          // entitlement's own expirationDateMillis, which is the
          // exact wall-clock cutoff RevenueCat gave us at the last
          // successful sync. That's the furthest point in the
          // future we can honestly claim the user paid through.
          //
          // Policy:
          //   - No cached snapshot → fail closed. This install has
          //     never had an authoritative read, so we have no
          //     proof of entitlement at all.
          //   - Cached isPremium=false → leave the store alone
          //     (it's already the fail-closed value; any earlier
          //     write has the same effect). Schedule a retry.
          //   - Cached isPremium=true, expirationDateMillis === null
          //     → lifetime access. Preserve. A lifetime grant has
          //     no bound; revoking it on offline launch would be
          //     wrong every time.
          //   - Cached isPremium=true, expirationDateMillis > now
          //     → paid window still valid. Preserve. The user paid
          //     for this window; a transient RC failure should not
          //     revoke access they already purchased.
          //   - Cached isPremium=true, expirationDateMillis <= now
          //     → the paid window has closed since the last sync.
          //     Fail closed. If RC is reachable the retry will
          //     confirm; if it's not, we correctly refuse to grant
          //     premium on an expired entitlement.
          //
          // Fail-closed remains the right call for the rc-logout-
          // pending branch above regardless of cache state, because
          // that path is about *identity* uncertainty, not
          // *entitlement* staleness.
          //
          // Identity binding: before trusting the cache, compare the
          // cached appUserId to the *current* RC appUserID. If they
          // don't match, the cache belongs to a different identity
          // (different Clerk user, different anonymous session, or
          // a v1 cache entry with no identity at all — readCachedEntitlement
          // rejects those shape-wise). Refuse the cache and fail
          // closed. This closes the defense-in-depth hole where a
          // sign-out path that crashed after the cache write (or any
          // edge case where the cache survives an identity change)
          // could otherwise leak premium across users.
          const cached = readCachedEntitlement();
          const currentAppUserId = await resolveAppUserId();
          if (cancelled) return;
          if (!cached) {
            logger.warn('[RevenueCat] Fetch failed with no cached entitlement — failing closed to non-premium');
            updateUser({ isPremium: false });
          } else if (currentAppUserId === null || cached.appUserId !== currentAppUserId) {
            logger.warn('[RevenueCat] Fetch failed; cached entitlement belongs to a different RC identity — rejecting cache and failing closed', {
              cachedAppUserId: cached.appUserId,
              currentAppUserId,
            });
            updateUser({ isPremium: false });
          } else if (!cached.isPremium) {
            logger.warn('[RevenueCat] Fetch failed; cached entitlement is non-premium — preserving fail-closed state');
            updateUser({ isPremium: false });
          } else if (cached.expirationDateMillis === null) {
            // Lifetime grant. Actively write `isPremium: true` — do
            // NOT rely on the store already holding it. On a cold
            // launch, Zustand hydration may have restored
            // `isPremium=false` (e.g. fresh install after reinstall,
            // or a prior session that fail-closed before this one).
            // "Preserving premium" without a write is only
            // "preserving non-premium" in those cases, which
            // falsely locks out a legitimate lifetime subscriber.
            logger.warn('[RevenueCat] Fetch failed; cached entitlement is lifetime — restoring premium from cache');
            updateUser({ isPremium: true });
          } else if (cached.expirationDateMillis > Date.now()) {
            // Paid window still valid. Same rationale as the lifetime
            // branch: the store's starting state cannot be trusted
            // to already reflect the paid entitlement, so we must
            // actively write it.
            logger.warn('[RevenueCat] Fetch failed; cached entitlement still within paid window — restoring premium from cache', {
              msRemaining: cached.expirationDateMillis - Date.now(),
            });
            updateUser({ isPremium: true });
          } else {
            logger.warn('[RevenueCat] Fetch failed; cached entitlement expired — failing closed to non-premium', {
              msPastExpiration: Date.now() - cached.expirationDateMillis,
            });
            updateUser({ isPremium: false });
          }
          scheduleRetry();
          return;
        }

        // Success path. Attach the real-time listener, mark as
        // bootstrapped, and cancel any queued backoff.
        // RevenueCat's add/remove API uses the listener identity
        // itself as the handle, so we track the function reference
        // and hand it back to removeCustomerInfoUpdateListener in
        // the cleanup path.
        //
        // The listener also refreshes the persisted entitlement
        // cache. Without this mirror, the cache could go stale
        // mid-session: e.g. a user's subscription renews (new
        // expirationDateMillis), or lapses/is refunded, and the
        // listener updates in-memory isPremium but the persisted
        // snapshot still reflects the stale bootstrap value. On
        // the next cold-launch with a transient RC failure, the
        // fallback branch would then make its preserve/fail-
        // closed decision from outdated expiration data — leaking
        // premium past a revoke, or incorrectly locking out an
        // active subscriber after a renewal. Writing here keeps
        // the cache as fresh as the most recent authoritative
        // update RC pushed to us.
        const fn: CustomerInfoUpdateListener = (customerInfo) => {
          const entitlement = customerInfo.entitlements.active?.['Unfold Premium'];
          const hasSubscription = Boolean(entitlement);
          updateUser({ isPremium: hasSubscription });
          // Fire-and-forget: resolveAppUserId is async, and the
          // listener signature is sync. The store update above
          // already reflects the new entitlement immediately; the
          // persisted cache refresh runs in the background and
          // catches up. We intentionally do NOT await it — listener
          // callbacks must stay non-blocking, and a resolve-identity
          // failure here should not block the store write from
          // propagating to UI.
          void (async () => {
            if (cancelled) return;
            const appUserId = await resolveAppUserId();
            if (cancelled || appUserId === null) return;
            writeCachedEntitlement({
              appUserId,
              isPremium: hasSubscription,
              expirationDateMillis: entitlement?.expirationDateMillis ?? null,
              syncedAtMillis: Date.now(),
            });
          })();
          void syncTrialEndingNotification();
        };
        Purchases.addCustomerInfoUpdateListener(fn);
        listener = fn;
        bootstrapped = true;
        if (retryTimer) {
          clearTimeout(retryTimer);
          retryTimer = undefined;
        }
      } finally {
        attemptInFlight = false;
      }
    }

    // Initial attempt on mount.
    void attemptSync();

    // Mid-session invalidation. The welcome-screen escape hatch
    // (src/app/index.tsx handleSignOut) sets the `rc-logout-pending`
    // MMKV flag when Clerk is stuck and the user hits the recovery
    // button. Without this subscription, the already-bootstrapped
    // sync would never re-read the flag, its listener would stay
    // attached, and any late CustomerInfo callback from RevenueCat
    // could restore the previous user's isPremium=true on the now-
    // anonymous session. Reset synchronously: remove the listener,
    // force isPremium=false, flip bootstrapped back to false, cancel
    // any queued backoff, then kick off a fresh attemptSync() which
    // will now see the pending flag and block premium writes until
    // it can prove a clean logOut.
    const unsubInvalidate = onRevenueCatSessionInvalidated(() => {
      if (cancelled) return;
      if (listener) {
        try {
          Purchases.removeCustomerInfoUpdateListener(listener);
        } catch {
          // Defensive: if removal throws we still want to continue
          // the reset so the fail-closed flow takes over.
        }
        listener = undefined;
      }
      bootstrapped = false;
      retryIndex = 0;
      if (retryTimer) {
        clearTimeout(retryTimer);
        retryTimer = undefined;
      }
      // Force fail-closed state before the retry runs so no UI
      // surface reads stale isPremium=true between the invalidation
      // fire and the async attemptSync() write.
      updateUser({ isPremium: false });
      void attemptSync();
    });

    // Foreground retry: when the app returns to active, reset the
    // backoff index (user re-engagement is a strong signal to try
    // fresh) and kick off an immediate attempt. Once bootstrapped,
    // attemptSync short-circuits and this becomes a no-op.
    const onAppStateChange = (state: AppStateStatus) => {
      if (state !== 'active') return;
      if (bootstrapped) return;
      retryIndex = 0;
      if (retryTimer) {
        clearTimeout(retryTimer);
        retryTimer = undefined;
      }
      void attemptSync();
    };
    const appStateSub = AppState.addEventListener('change', onAppStateChange);

    return () => {
      cancelled = true;
      unsubInvalidate();
      appStateSub.remove();
      if (retryTimer) {
        clearTimeout(retryTimer);
        retryTimer = undefined;
      }
      if (listener) {
        Purchases.removeCustomerInfoUpdateListener(listener);
      }
    };
  }, [updateUser, queryClient]);
}
