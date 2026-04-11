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
// out entirely — the user stays non-premium until the next launch tries
// again. Offerings prefetch is still safe (no identity involved) and runs
// independently.
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
    let listener: CustomerInfoUpdateListener | undefined;

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

    const runSync = async () => {
      // Honor the escape-hatch logout guard. If a previous session
      // started an RC logout and we can't prove it completed, retry the
      // logout here BEFORE touching CustomerInfo. See the comment on
      // RC_LOGOUT_PENDING_KEY above for the full rationale.
      const pending = mmkvStorage.getItem(RC_LOGOUT_PENDING_KEY);
      if (pending) {
        logger.warn('[RevenueCat] rc-logout-pending flag set — retrying logOut before syncing');
        const result = await rcLogoutUser();
        if (cancelled) return;
        if (!result.ok) {
          // Retry failed. Leave the flag set, force the store to the
          // non-premium state (defense against any earlier in-memory
          // leak), and bail out. Do not attach the listener — we don't
          // want a late CustomerInfo callback restoring the previous
          // user's entitlement. Next launch will retry.
          logger.warn('[RevenueCat] Logout retry failed, bailing out of sync:', result.reason);
          updateUser({ isPremium: false });
          return;
        }
        mmkvStorage.removeItem(RC_LOGOUT_PENDING_KEY);
      }

      // Fetch current subscription status on launch.
      // This catches lapses that occurred between app sessions.
      try {
        const customerInfo = await Purchases.getCustomerInfo();
        if (cancelled) return;
        const hasSubscription = Boolean(customerInfo.entitlements.active?.['Unfold Premium']);
        updateUser({ isPremium: hasSubscription });
        // Re-validate the trial-ending local notification against the latest
        // customer info. Fire-and-forget — failures are logged internally.
        void syncTrialEndingNotification();
      } catch {
        // Silently fail — stale store value is acceptable as a fallback.
        // The listener below will correct it when connectivity returns.
      }

      if (cancelled) return;

      // Set up real-time listener for subscription changes.
      // This is triggered on purchases, restores, and when entitlements change.
      // RevenueCat's add/remove API uses the listener identity itself as
      // the handle, so we track the function reference and hand it back
      // to removeCustomerInfoUpdateListener in the cleanup path.
      listener = (customerInfo) => {
        const hasSubscription = Boolean(customerInfo.entitlements.active?.['Unfold Premium']);
        updateUser({ isPremium: hasSubscription });
        // Re-sync the trial-ending notification whenever entitlements change
        // (purchase, restore, lapse). Fire-and-forget.
        void syncTrialEndingNotification();
      };
      Purchases.addCustomerInfoUpdateListener(listener);
    };

    void runSync();

    return () => {
      cancelled = true;
      if (listener) {
        Purchases.removeCustomerInfoUpdateListener(listener);
      }
    };
  }, [updateUser, queryClient]);
}
