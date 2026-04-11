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

// Timestamp of the most recent authoritative getCustomerInfo() success.
// Written every time the SDK returns a CustomerInfo we wrote through to
// the store. Used as the freshness oracle on cold-start fetch failure:
// preserving a stale `isPremium=true` across a transient RC outage is
// safe for a short window (legitimate offline launch, RC backend blip),
// but becomes a silent entitlement leak for churned users if preserved
// indefinitely. The TTL below is the bound: within the window we
// preserve the persisted value; past it we force-close to non-premium
// so a user whose subscription lapsed can't coast forever on the last
// cached `isPremium=true`. A long-lived backend outage plus a churned
// user is the exact scenario fail-open breaks, and the TTL contains it
// without hitting legitimate users on a short blip.
const RC_LAST_AUTHORITATIVE_SYNC_KEY = 'rc-last-authoritative-sync-at';
const RC_FRESHNESS_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

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
          const hasSubscription = Boolean(customerInfo.entitlements.active?.['Unfold Premium']);
          updateUser({ isPremium: hasSubscription });
          // Stamp the authoritative-sync timestamp. This is the freshness
          // oracle read on the failure path below — without writing it on
          // every success, the TTL check would never advance past its
          // initial value and the fail-closed branch would eventually
          // kick in for legitimately-active premium users.
          mmkvStorage.setItem(RC_LAST_AUTHORITATIVE_SYNC_KEY, String(Date.now()));
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
          // Transient fetch failure path. The previous two iterations
          // of this branch flip-flopped between two broken extremes:
          //
          //   (a) Fail-closed always — force isPremium=false on every
          //       bootstrap fetch failure. This solves the churned-
          //       user-offline leak but hits every legitimate premium
          //       user with the paywall on any offline launch or RC
          //       backend blip. User-visible entitlement revocation
          //       from transient dependency failure is unacceptable.
          //
          //   (b) Fail-open always — preserve persisted isPremium
          //       indefinitely until the next successful fetch. This
          //       solves the transient-failure regression but re-
          //       introduces the churned-user leak: a subscriber who
          //       cancelled last month and stays offline (or whose RC
          //       is permanently down) keeps premium forever.
          //
          // The principled middle path is a freshness TTL. Read the
          // timestamp of the last authoritative getCustomerInfo()
          // success. If it's within the TTL (24h), the last value is
          // recent enough to trust — preserve persisted isPremium and
          // schedule a retry. If the TTL has lapsed (or the stamp was
          // never written because this install has never successfully
          // synced), the cached value is too stale to rely on as an
          // entitlement guarantee — fail closed and force isPremium=
          // false. Backoff retries still run, so the moment the SDK
          // recovers the listener and fetch will correct either
          // direction.
          //
          // Fail-closed remains the right call for the rc-logout-
          // pending branch above regardless of freshness, because
          // that path is about *identity* uncertainty, not
          // *entitlement* staleness.
          const rawStamp = mmkvStorage.getItem(RC_LAST_AUTHORITATIVE_SYNC_KEY) as string | null;
          const stamp = rawStamp != null ? Number(rawStamp) : NaN;
          const age = Number.isFinite(stamp) ? Date.now() - stamp : Number.POSITIVE_INFINITY;
          if (age <= RC_FRESHNESS_TTL_MS) {
            logger.warn('[RevenueCat] Fetch failed but last authoritative sync is fresh — preserving persisted entitlement', { ageMs: age });
          } else {
            logger.warn('[RevenueCat] Fetch failed and last authoritative sync is stale or missing — failing closed to non-premium', { ageMs: Number.isFinite(age) ? age : null });
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
        const fn: CustomerInfoUpdateListener = (customerInfo) => {
          const hasSubscription = Boolean(customerInfo.entitlements.active?.['Unfold Premium']);
          updateUser({ isPremium: hasSubscription });
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
