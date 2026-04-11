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

export function useRevenueCatSync() {
  const updateUser = useUnfoldStore((s) => s.updateUser);
  const queryClient = useQueryClient();

  useEffect(() => {
    // Only sync if RevenueCat is configured
    if (!isRevenueCatEnabled()) {
      return;
    }

    let cancelled = false;
    // Track the currently-attached listener (if any). Once we've
    // successfully cleared any pending logout and attached the
    // CustomerInfo listener, `listener` is non-null and further
    // retry attempts become no-ops — we only need to run the
    // pending-logout resolve path once per session.
    let listener: CustomerInfoUpdateListener | undefined;
    // Prevents overlapping attempts: if an AppState 'active' event
    // fires while a prior attempt is still in flight, skip instead of
    // racing a second Purchases.logOut() against the first.
    let attemptInFlight = false;

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

    const attemptSync = async () => {
      // Already attached — nothing to do. Steady-state after a
      // successful initial sync.
      if (listener) return;
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
            // in-memory leak), and bail out of THIS attempt. Do not
            // attach the listener — we don't want a late
            // CustomerInfo callback restoring the previous user's
            // entitlement. The AppState 'active' subscription below
            // will schedule another attempt when the app next
            // foregrounds, so a transient failure recovers without
            // needing a full app restart.
            logger.warn('[RevenueCat] Logout retry failed, will retry on foreground:', result.reason);
            updateUser({ isPremium: false });
            return;
          }
          mmkvStorage.removeItem(RC_LOGOUT_PENDING_KEY);
        }

        // Fetch current subscription status.
        try {
          const customerInfo = await Purchases.getCustomerInfo();
          if (cancelled) return;
          const hasSubscription = Boolean(customerInfo.entitlements.active?.['Unfold Premium']);
          updateUser({ isPremium: hasSubscription });
          // Re-validate the trial-ending local notification against the
          // latest customer info. Fire-and-forget.
          void syncTrialEndingNotification();
        } catch {
          // Silently fail — stale store value is acceptable as a
          // fallback. The listener below will correct it when
          // connectivity returns, and foreground events will retry
          // the whole flow.
        }

        if (cancelled || listener) return;

        // Attach real-time listener. Once attached, subsequent calls
        // to attemptSync() are no-ops (see early return at top).
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
      } finally {
        attemptInFlight = false;
      }
    };

    // Initial attempt on mount.
    void attemptSync();

    // Foreground retry: if a prior attempt bailed out (pending-logout
    // retry failed, getCustomerInfo errored and we never attached),
    // re-run when the app next becomes active. Connectivity has often
    // recovered by then. Once the listener is attached, attemptSync
    // short-circuits so this is a no-op at steady state.
    const onAppStateChange = (state: AppStateStatus) => {
      if (state === 'active') {
        void attemptSync();
      }
    };
    const appStateSub = AppState.addEventListener('change', onAppStateChange);

    return () => {
      cancelled = true;
      appStateSub.remove();
      if (listener) {
        Purchases.removeCustomerInfoUpdateListener(listener);
      }
    };
  }, [updateUser, queryClient]);
}
