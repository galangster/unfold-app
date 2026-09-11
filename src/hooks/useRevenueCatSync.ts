/**
 * Hook to sync RevenueCat subscription status with Zustand store
 *
 * Uses RevenueCat's real-time customer info listener for efficient updates
 * instead of aggressive polling.
 *
 * Also prefetches offerings into the React Query cache at app startup so the
 * paywall can display instantly when opened (no "loading plans" spinner).
 */

import { useEffect, useRef } from 'react';
import { AppState, Platform } from 'react-native';
import type { CustomerInfo } from 'react-native-purchases';
import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useUnfoldStore } from '@/lib/store';
import { useUIState } from '@/lib/ui-state';
import {
  resolveLaterEntryExit,
  resolveVerifiedEntitlementExit,
  type VerifiedEntitlementExit,
} from '@/lib/auto-trial-exit';
import { NEW_TRIAL_MAX_AGE_MS, isSimulatedTrialCustomerInfo } from '@/lib/trial-facts';
import { getDeviceId } from '@/lib/mmkv-storage';
import { getDeviceTimezone } from '@/lib/device-timezone';
import { requestLaterEntryNotifyAsk } from '@/lib/notification-ask';
import {
  addCustomerInfoUpdateListener,
  getCustomerInfo,
  getOfferings,
  hasRevenueCatConfigurationAttemptFailed,
  isRevenueCatEnabled,
  isRevenueCatIdentityVerified,
  retryRevenueCatIdentitySync,
  subscribeRevenueCatIdentityEpoch,
  subscribeRevenueCatIdentityVerified,
} from '@/lib/revenuecatClient';
import { syncTrialEndingNotification } from '@/lib/trial-notification';
import { createSingleListenerGuard } from '@/lib/listener-registration';
import { isLocalResetInProgress, subscribeLocalResetIdle } from '@/lib/sync-session-fence';
import { logger } from '@/lib/logger';

function waitForCurrentIdentityDelivery(isCancelled: () => boolean): {
  promise: Promise<void>;
  abort: () => void;
} {
  let settle!: () => void;
  const promise = new Promise<void>((resolve) => {
    settle = resolve;
  });
  let settled = false;
  const finish = (): void => {
    if (settled) return;
    settled = true;
    unsubscribeIdle();
    unsubscribeVerified();
    settle();
  };
  const check = (): void => {
    if (isCancelled()) {
      finish();
      return;
    }
    if (!isLocalResetInProgress() && isRevenueCatIdentityVerified()) {
      finish();
    }
  };
  const unsubscribeIdle = subscribeLocalResetIdle(check);
  const unsubscribeVerified = subscribeRevenueCatIdentityVerified(check);
  check();
  return { promise, abort: finish };
}

export function useRevenueCatSync() {
  const updateUser = useUnfoldStore((s) => s.updateUser);
  const queryClient = useQueryClient();
  const router = useRouter();
  const routerRef = useRef(router);
  useEffect(() => {
    routerRef.current = router;
  });

  useEffect(() => {
    // Only sync if RevenueCat is configured
    if (!isRevenueCatEnabled()) {
      if (hasRevenueCatConfigurationAttemptFailed()) {
        logger.log('[RevenueCat] Configuration failed; leaving premium policy unresolved');
        return;
      }
      // No external source to wait for — mark as resolved so downstream
      // tri-state gates (usePremiumAccessPolicy) don't stay in `unknown`
      // forever. In this state, premium falls back to persisted user.isPremium
      // (usually false in dev without RC keys) or the __DEV__ override.
      useUIState.getState().setRevenueCatResolved();
      return;
    }

    let didCancel = false;

    const applyCustomerInfo = (customerInfo: CustomerInfo) => {
      if (didCancel) return;
      if (isLocalResetInProgress()) return;
      const ui = useUIState.getState();
      const store = useUnfoldStore.getState();
      const nowMs = Date.now();
      const hasSubscription = Boolean(customerInfo.entitlements.active?.['Unfold Premium']);
      updateUser({ isPremium: hasSubscription });
      // Any first-hand answer from RevenueCat counts as resolved for this
      // session — even a "no subscription" answer.
      ui.setRevenueCatResolved();
      // Re-sync the trial-ending local notification whenever entitlements
      // change (purchase, restore, lapse). Fire-and-forget.
      void syncTrialEndingNotification();
      if (!hasSubscription) return;
      const marker = ui.pendingPaywallGrant;
      if (!marker) return;
      ui.setPendingPaywallGrant(null);
      if (nowMs - marker.setAtMs > NEW_TRIAL_MAX_AGE_MS) return;

      const exit: VerifiedEntitlementExit = { source: 'lateGrant', customerInfo };
      void (async () => {
        if (didCancel) return;
        const decision = marker.entry === 'later'
          ? await resolveLaterEntryExit(
            exit,
            marker.surface === 'churned_sheet' ? 'churned_sheet' : 'paywall_route',
          )
          : await resolveVerifiedEntitlementExit({
            exit,
            surface: 'onboarding_paywall',
            deviceId: getDeviceId(),
            nowMs,
            platform: Platform.OS,
            timeZone: getDeviceTimezone() ?? '',
            profile: store.user
              ? { hasCompletedOnboarding: store.user?.hasCompletedOnboarding === true }
              : null,
            devotionalIds: (store.devotionals ?? []).map((devotional) => devotional.id),
            simulated: isSimulatedTrialCustomerInfo(customerInfo),
          });
        if (didCancel) return;
        if (decision.kind === 'auto') {
          if (store.user?.hasCompletedOnboarding === true) {
            routerRef.current.push('/generating');
          }
          return;
        }
        void requestLaterEntryNotifyAsk(customerInfo);
      })();
    };

    // Fetch current subscription status on launch. This waits for the
    // RevenueCat anonymous→deterministic ID migration before reading customer
    // info, so update installs do not briefly demote active anonymous-ID users.
    getCustomerInfo()
      .then((result) => {
        if (result.ok) {
          applyCustomerInfo(result.data);
          return;
        }
        logger.log('[RevenueCat] Initial customer info sync returned non-ok result:', result.reason);
      })
      .catch(() => {
        // Silently fail — stale store value is acceptable as a fallback.
        // IMPORTANT: do NOT setRevenueCatResolved() here. A failure means
        // the source has not told us anything this session; downstream gates
        // must continue to treat premium policy as `unknown` and fail closed.
        // The listener below will correct it (and flip resolved) when
        // connectivity returns.
      });

    // Prefetch offerings into React Query cache so the paywall opens instantly.
    // Uses prefetchQuery which won't throw — failures are silently cached and
    // the paywall's own useQuery will retry as needed.
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

    // Set up real-time listener for subscription changes. ONE guard owns
    // registration for both the launch path and the foreground-recovery path
    // (REVM-6) — registration also waits for the deterministic identity.
    const listenerGuard = createSingleListenerGuard(async () => {
      const result = await addCustomerInfoUpdateListener(applyCustomerInfo);
      if (!result.ok) {
        logger.log('[RevenueCat] Customer info listener not registered:', result.reason);
      }
      return result;
    });
    void listenerGuard.ensure();

    // Foreground recovery: if RevenueCat identity sync failed at session start
    // and the user backgrounds+foregrounds the app (network may have returned),
    // retry once. Naturally rate-limited to foreground transitions.
    const appStateSub = AppState.addEventListener('change', (next) => {
      if (next !== 'active') return;
      if (isLocalResetInProgress()) return;
      if (useUIState.getState().revenueCatResolved) return; // recovered already
      void (async () => {
        await retryRevenueCatIdentitySync();
        const result = await getCustomerInfo();
        if (result.ok) applyCustomerInfo(result.data);
        void listenerGuard.ensure();
      })();
    });

    let refreshGeneration = 0;
    let abortDeliveryWait: (() => void) | null = null;

    const unsubscribeIdentityEpoch = subscribeRevenueCatIdentityEpoch(() => {
      if (didCancel) return;
      useUIState.getState().clearRevenueCatResolved();
      refreshGeneration += 1;
      const generation = refreshGeneration;
      abortDeliveryWait?.();
      const deliveryWait = waitForCurrentIdentityDelivery(
        () => didCancel || generation !== refreshGeneration,
      );
      abortDeliveryWait = deliveryWait.abort;
      void deliveryWait.promise.then(async () => {
        if (didCancel || generation !== refreshGeneration) return;
        const result = await getCustomerInfo();
        if (didCancel || generation !== refreshGeneration) return;
        if (result.ok) applyCustomerInfo(result.data);
        void listenerGuard.ensure();
      }).catch(() => {
        // Fail closed until the current identity reports.
      });
    });

    return () => {
      didCancel = true;
      abortDeliveryWait?.();
      unsubscribeIdentityEpoch();
      listenerGuard.dispose();
      appStateSub.remove();
    };
  }, [updateUser, queryClient]);
}
