/**
 * RevenueCat Client Module
 *
 * This module provides a centralized RevenueCat SDK wrapper that gracefully handles
 * missing configuration. The app will work fine whether or not RevenueCat is configured.
 *
 * Environment Variables:
 * - EXPO_PUBLIC_REVENUECAT_TEST_KEY: Used in development/test builds (both platforms)
 * - EXPO_PUBLIC_REVENUECAT_APPLE_KEY: Used in production builds (iOS)
 * - EXPO_PUBLIC_REVENUECAT_GOOGLE_KEY: Used in production builds (Android)
 *
 * Platform Support:
 * - iOS/Android: Fully supported via app stores
 * - Web: Disabled (RevenueCat only supports native app stores)
 *
 * The module automatically selects the correct key based on __DEV__ mode.
 *
 * This module is used to get the current customer info, offerings, and purchase packages.
 * These exported functions are found at the bottom of the file.
 */

import { Platform } from "react-native";
import { logger } from '@/lib/logger';
import { getDeviceId } from '@/lib/mmkv-storage';
import {
  isPaywallDiagnosticsEnabled,
  recordPaywallDiagnosticLazy,
  summarizeCustomerInfo,
  summarizeDiagnosticIdentifier,
  summarizeOfferings,
  summarizePackage,
  summarizeRevenueCatError,
  sanitizeDiagnosticText,
} from '@/lib/paywall-diagnostics';
import { buildRevenueCatAppUserId } from '@/lib/revenuecat-user-id';
import Purchases, {
  type PurchasesOfferings,
  type CustomerInfo,
  type CustomerInfoUpdateListener,
  type PurchasesPackage,
} from "react-native-purchases";

// Check if running on web
const isWeb = Platform.OS === "web";

// Check for environment keys
const testKey = process.env.EXPO_PUBLIC_REVENUECAT_TEST_KEY;
const appleKey = process.env.EXPO_PUBLIC_REVENUECAT_APPLE_KEY;
const googleKey = process.env.EXPO_PUBLIC_REVENUECAT_GOOGLE_KEY;

// Use __DEV__ and Platform to determine which key to use
const getApiKey = (): string | undefined => {
  if (isWeb) return undefined;

  if (__DEV__) {
    // In dev, prefer the test key. If not set, fall back to the platform key
    // so offerings still load during simulator/development testing.
    if (testKey) return testKey;
    return Platform.OS === "ios" ? appleKey : googleKey;
  }

  // Production: use platform-specific key
  return Platform.OS === "ios" ? appleKey : googleKey;
};

const apiKey = getApiKey();

// Track whether RevenueCat has API keys available. The SDK is only usable after
// the synchronous configure call below succeeds.
const hasRevenueCatApiKey = !!apiKey && !isWeb;
let revenueCatConfigured = false;
let revenueCatIdentityReadyPromise: Promise<void> | null = null;
let revenueCatIdentityError: unknown = null;

const LOG_PREFIX = "[RevenueCat]";

// Restore can hang forever if the native StoreKit call deadlocks or the App
// Store is unreachable. Cap it so the loading UI can always exit. 30s is
// generous enough for slow networks while still being an actual escape.
const RESTORE_TIMEOUT_MS = 30_000;

// Purchase can also hang indefinitely — the user might confirm on the Apple
// sheet but the server-side entitlement grant never completes. 60s gives
// room for slow networks + user confirmation time without leaving the
// loading overlay permanently stuck.
const PURCHASE_TIMEOUT_MS = 60_000;

const UNFOLD_PREMIUM_ENTITLEMENT = 'Unfold Premium';
const POST_STORE_ACTION_REFRESH_DELAYS_MS = [0, 750, 1_500] as const;

export type RevenueCatGuardReason =
  | "web_not_supported"
  | "not_configured"
  | "sdk_error"
  | "timeout"
  | "user_cancelled";

export type RevenueCatResult<T> =
  | { ok: true; data: T }
  | { ok: false; reason: RevenueCatGuardReason; error?: unknown };

class RevenueCatTimeoutError extends Error {
  readonly isRevenueCatTimeout = true as const;
  constructor(label: string, ms: number) {
    super(`${label} timed out after ${ms}ms`);
    this.name = 'RevenueCatTimeoutError';
  }
}

/** Race a promise against a timeout. Rejects if the deadline hits first. */
const withTimeout = <T>(promise: Promise<T>, ms: number, label: string): Promise<T> => {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new RevenueCatTimeoutError(label, ms));
    }, ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
};

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

const hasUnfoldPremiumEntitlement = (customerInfo: CustomerInfo): boolean => {
  return Boolean(customerInfo.entitlements.active?.[UNFOLD_PREMIUM_ENTITLEMENT]);
};

const refreshCustomerInfoIfPremiumMissing = async (
  sourceAction: 'purchasePackage' | 'restorePurchases',
  customerInfo: CustomerInfo,
): Promise<CustomerInfo> => {
  if (hasUnfoldPremiumEntitlement(customerInfo)) {
    return customerInfo;
  }

  void recordPaywallDiagnosticLazy('revenuecat.customer_info.refresh_missing_entitlement_start', () => ({
    sourceAction,
    customerInfo: summarizeCustomerInfo(customerInfo),
  }), 'warn');

  let latestCustomerInfo = customerInfo;
  try {
    await Purchases.invalidateCustomerInfoCache();

    for (let attemptIndex = 0; attemptIndex < POST_STORE_ACTION_REFRESH_DELAYS_MS.length; attemptIndex += 1) {
      const delayMs = POST_STORE_ACTION_REFRESH_DELAYS_MS[attemptIndex];
      if (delayMs > 0) {
        await sleep(delayMs);
      }

      latestCustomerInfo = await Purchases.getCustomerInfo();
      void recordPaywallDiagnosticLazy('revenuecat.customer_info.refresh_missing_entitlement_result', () => ({
        sourceAction,
        attempt: attemptIndex + 1,
        customerInfo: summarizeCustomerInfo(latestCustomerInfo),
      }), hasUnfoldPremiumEntitlement(latestCustomerInfo) ? 'info' : 'warn');

      if (hasUnfoldPremiumEntitlement(latestCustomerInfo)) {
        return latestCustomerInfo;
      }
    }
  } catch (error) {
    void recordPaywallDiagnosticLazy('revenuecat.customer_info.refresh_missing_entitlement_error', () => ({
      sourceAction,
      error: summarizeRevenueCatError(error),
    }), 'warn');
  }

  return latestCustomerInfo;
};

// Internal guard to get consistent success/failure results from RevenueCat.
const guardRevenueCatUsage = async <T>(
  action: string,
  operation: () => Promise<T>,
): Promise<RevenueCatResult<T>> => {
  const startedAt = Date.now();
  if (isWeb) {
    logger.log(
      `${LOG_PREFIX} ${action} skipped: payments are not supported on web.`,
    );
    void recordPaywallDiagnosticLazy('revenuecat.operation.skipped', () => ({
      action,
      reason: 'web_not_supported',
    }), 'warn');
    return { ok: false, reason: "web_not_supported" };
  }

  if (!revenueCatConfigured) {
    logger.log(`${LOG_PREFIX} ${action} skipped: RevenueCat not configured`);
    void recordPaywallDiagnosticLazy('revenuecat.operation.skipped', () => ({
      action,
      reason: 'not_configured',
      hasRevenueCatApiKey,
    }), 'warn');
    return { ok: false, reason: "not_configured" };
  }

  try {
    void recordPaywallDiagnosticLazy('revenuecat.operation.start', () => ({ action }));
    if (revenueCatIdentityReadyPromise) {
      await revenueCatIdentityReadyPromise;
    }
    if (revenueCatIdentityError) {
      throw revenueCatIdentityError;
    }
    const data = await operation();
    void recordPaywallDiagnosticLazy('revenuecat.operation.success', () => ({
      action,
      elapsedMs: Date.now() - startedAt,
    }));
    return { ok: true, data };
  } catch (error) {
    // Our own timeout sentinel — distinguish from SDK errors so the UI can
    // show "took too long, try again" instead of "something went wrong".
    if (error instanceof RevenueCatTimeoutError) {
      logger.log(`${LOG_PREFIX} ${action}: timed out`);
      void recordPaywallDiagnosticLazy('revenuecat.operation.timeout', () => ({
        action,
        elapsedMs: Date.now() - startedAt,
        error: summarizeRevenueCatError(error),
      }), 'error');
      return { ok: false, reason: "timeout", error };
    }
    // RevenueCat sets userCancelled on the error when the user dismisses the payment sheet
    if (error && typeof error === "object" && "userCancelled" in error && (error as { userCancelled: boolean }).userCancelled) {
      logger.log(`${LOG_PREFIX} ${action}: user cancelled`);
      void recordPaywallDiagnosticLazy('revenuecat.operation.cancelled', () => ({
        action,
        elapsedMs: Date.now() - startedAt,
        error: summarizeRevenueCatError(error),
      }), 'warn');
      return { ok: false, reason: "user_cancelled" };
    }
    logger.log(`${LOG_PREFIX} ${action} failed:`, error);
    void recordPaywallDiagnosticLazy('revenuecat.operation.error', () => ({
      action,
      elapsedMs: Date.now() - startedAt,
      error: summarizeRevenueCatError(error),
    }), 'error');
    return { ok: false, reason: "sdk_error", error };
  }
};

const synchronizeRevenueCatAppUserID = async (appUserID: string): Promise<void> => {
  void recordPaywallDiagnosticLazy('revenuecat.identity.sync_start', () => ({
    targetAppUserID: summarizeDiagnosticIdentifier(appUserID),
  }));

  const currentAppUserID = await Purchases.getAppUserID();
  if (currentAppUserID === appUserID) {
    logger.log(`${LOG_PREFIX} App user ID already synchronized`);
    void recordPaywallDiagnosticLazy('revenuecat.identity.already_synchronized', () => ({
      appUserID: summarizeDiagnosticIdentifier(appUserID),
    }));
    return;
  }

  const wasAnonymous = currentAppUserID.startsWith('$RCAnonymousID:');
  const result = await Purchases.logIn(appUserID);
  logger.log(
    `${LOG_PREFIX} App user ID synchronized (${wasAnonymous ? 'anonymous migrated' : 'custom switched'}, ${
      result.created ? 'created' : 'existing'
    } customer)`,
  );
  void recordPaywallDiagnosticLazy('revenuecat.identity.synchronized', () => ({
    previousAppUserID: summarizeDiagnosticIdentifier(currentAppUserID),
    targetAppUserID: summarizeDiagnosticIdentifier(appUserID),
    wasAnonymous,
    created: result.created,
    customerInfo: summarizeCustomerInfo(result.customerInfo),
  }));
};

// Initialize RevenueCat if key exists
if (hasRevenueCatApiKey) {
  try {
    const keyType = __DEV__
      ? (testKey ? 'test' : (Platform.OS === 'ios' ? 'apple (dev fallback)' : 'google (dev fallback)'))
      : (Platform.OS === 'ios' ? 'apple' : 'google');

    if (isPaywallDiagnosticsEnabled()) {
      void Purchases.setLogLevel(Purchases.LOG_LEVEL.INFO).catch((error) => {
        void recordPaywallDiagnosticLazy('revenuecat.sdk_log_level_error', () => ({
          error: summarizeRevenueCatError(error),
        }), 'warn');
      });
    }

    // Set up custom log handler to suppress Test Store and expected errors
    // These are non-errors thrown as errors by the SDK, and will be confusing to the user.
    Purchases.setLogHandler((logLevel, message) => {
      if (isPaywallDiagnosticsEnabled()) {
        void recordPaywallDiagnosticLazy('revenuecat.sdk_log', () => ({
          logLevel,
          message: sanitizeDiagnosticText(message),
        }), logLevel === Purchases.LOG_LEVEL.ERROR ? 'error' : logLevel === Purchases.LOG_LEVEL.WARN ? 'warn' : 'info');
      }

      // Log ERROR messages normally
      if (logLevel === Purchases.LOG_LEVEL.ERROR) {
        logger.log(LOG_PREFIX, message);
      }
    });

    const appUserID = buildRevenueCatAppUserId(getDeviceId());
    void recordPaywallDiagnosticLazy('revenuecat.configure.attempt', () => ({
      keyType,
      platform: Platform.OS,
      isDev: __DEV__,
      targetAppUserID: summarizeDiagnosticIdentifier(appUserID),
    }));

    // Configure without appUserID first so update installs keep the SDK's
    // cached anonymous customer, then logIn to alias/migrate that customer to
    // our deterministic device-scoped ID before any guarded SDK operation runs.
    Purchases.configure({ apiKey: apiKey! });
    revenueCatConfigured = true;
    revenueCatIdentityReadyPromise = synchronizeRevenueCatAppUserID(appUserID).catch((error) => {
      revenueCatIdentityError = error;
      logger.error(`${LOG_PREFIX} App user ID synchronization failed:`, error);
      void recordPaywallDiagnosticLazy('revenuecat.identity.sync_error', () => ({
        targetAppUserID: summarizeDiagnosticIdentifier(appUserID),
        error: summarizeRevenueCatError(error),
      }), 'error');
    });
    logger.log(`${LOG_PREFIX} SDK initialized successfully (${keyType} key, ${Platform.OS})`);
    void recordPaywallDiagnosticLazy('revenuecat.configure.success', () => ({
      keyType,
      platform: Platform.OS,
      targetAppUserID: summarizeDiagnosticIdentifier(appUserID),
    }));
  } catch (error) {
    logger.error(`${LOG_PREFIX} Failed to initialize:`, error);
    void recordPaywallDiagnosticLazy('revenuecat.configure.error', () => ({
      platform: Platform.OS,
      error: summarizeRevenueCatError(error),
    }), 'error');
  }
} else {
  logger.log(
    `${LOG_PREFIX} SDK NOT initialized — isWeb: ${isWeb}, testKey: ${!!testKey}, appleKey: ${!!appleKey}, googleKey: ${!!googleKey}, __DEV__: ${__DEV__}`,
  );
  void recordPaywallDiagnosticLazy('revenuecat.configure.skipped', () => ({
    isWeb,
    hasTestKey: Boolean(testKey),
    hasAppleKey: Boolean(appleKey),
    hasGoogleKey: Boolean(googleKey),
    isDev: __DEV__,
  }), 'warn');
}

/**
 * Check if RevenueCat is configured and enabled
 *
 * @returns true if RevenueCat is configured with valid API keys
 *
 * @example
 * if (isRevenueCatEnabled()) {
 *   // Show subscription features
 * } else {
 *   // Hide or disable subscription UI
 * }
 */
export const isRevenueCatEnabled = (): boolean => {
  return revenueCatConfigured;
};

export const hasRevenueCatConfigurationAttemptFailed = (): boolean => {
  return hasRevenueCatApiKey && !revenueCatConfigured;
};

/**
 * Get available offerings from RevenueCat
 *
 * @returns RevenueCatResult containing PurchasesOfferings data or a failure reason
 *
 * @example
 * const offeringsResult = await getOfferings();
 * if (offeringsResult.ok && offeringsResult.data.current) {
 *   // Display packages from offeringsResult.data.current.availablePackages
 * }
 */
export const getOfferings = (): Promise<
  RevenueCatResult<PurchasesOfferings>
> => {
  return guardRevenueCatUsage("getOfferings", async () => {
    const offerings = await Purchases.getOfferings();
    void recordPaywallDiagnosticLazy('revenuecat.offerings.result', () => ({
      offerings: summarizeOfferings(offerings),
    }));
    return offerings;
  });
};

/**
 * Purchase a package
 *
 * @param packageToPurchase - The package to purchase
 * @returns RevenueCatResult containing CustomerInfo data or a failure reason
 *
 * @example
 * const purchaseResult = await purchasePackage(selectedPackage);
 * if (purchaseResult.ok) {
 *   // Purchase successful, check entitlements
 * }
 */
export const purchasePackage = (
  packageToPurchase: PurchasesPackage,
): Promise<RevenueCatResult<CustomerInfo>> => {
  return guardRevenueCatUsage("purchasePackage", async () => {
    const purchaseStartedAt = Date.now();
    void recordPaywallDiagnosticLazy('revenuecat.purchase.native_call_start', () => ({
      package: summarizePackage(packageToPurchase),
    }));

    const purchaseResult = await withTimeout(
      Purchases.purchasePackage(packageToPurchase),
      PURCHASE_TIMEOUT_MS,
      "purchasePackage",
    );

    void recordPaywallDiagnosticLazy('revenuecat.purchase.native_resolved', () => ({
      elapsedMs: Date.now() - purchaseStartedAt,
      productIdentifier: purchaseResult.productIdentifier,
      transaction: purchaseResult.transaction
        ? {
            transactionIdentifier: summarizeDiagnosticIdentifier(purchaseResult.transaction.transactionIdentifier),
            productIdentifier: purchaseResult.transaction.productIdentifier,
            purchaseDate: purchaseResult.transaction.purchaseDate,
          }
        : null,
      customerInfo: summarizeCustomerInfo(purchaseResult.customerInfo),
    }));

    return refreshCustomerInfoIfPremiumMissing('purchasePackage', purchaseResult.customerInfo);
  });
};

/**
 * Get current customer info including active entitlements
 *
 * @returns RevenueCatResult containing CustomerInfo data or a failure reason
 *
 * @example
 * const customerInfoResult = await getCustomerInfo();
 * if (
 *   customerInfoResult.ok &&
 *   customerInfoResult.data.entitlements.active["premium"]
 * ) {
 *   // User has active premium entitlement
 * }
 */
export const getCustomerInfo = (): Promise<RevenueCatResult<CustomerInfo>> => {
  return guardRevenueCatUsage("getCustomerInfo", async () => {
    const customerInfo = await Purchases.getCustomerInfo();
    void recordPaywallDiagnosticLazy('revenuecat.customer_info.result', () => ({
      customerInfo: summarizeCustomerInfo(customerInfo),
    }));
    return customerInfo;
  });
};

/**
 * Restore previous purchases
 *
 * @returns RevenueCatResult containing CustomerInfo data or a failure reason
 *
 * @example
 * const restoreResult = await restorePurchases();
 * if (restoreResult.ok) {
 *   // Purchases restored successfully
 * }
 */
export const restorePurchases = (): Promise<
  RevenueCatResult<CustomerInfo>
> => {
  return guardRevenueCatUsage("restorePurchases", async () => {
    const restoreStartedAt = Date.now();
    const customerInfo = await withTimeout(
      Purchases.restorePurchases(),
      RESTORE_TIMEOUT_MS,
      "restorePurchases",
    );
    void recordPaywallDiagnosticLazy('revenuecat.restore.result', () => ({
      elapsedMs: Date.now() - restoreStartedAt,
      customerInfo: summarizeCustomerInfo(customerInfo),
    }));
    return refreshCustomerInfoIfPremiumMissing('restorePurchases', customerInfo);
  });
};

export const addCustomerInfoUpdateListener = (
  listener: CustomerInfoUpdateListener,
): Promise<RevenueCatResult<() => boolean>> => {
  return guardRevenueCatUsage("addCustomerInfoUpdateListener", async () => {
    if (!isPaywallDiagnosticsEnabled()) {
      Purchases.addCustomerInfoUpdateListener(listener);
      return () => Purchases.removeCustomerInfoUpdateListener(listener);
    }

    const diagnosticListener: CustomerInfoUpdateListener = (customerInfo) => {
      void recordPaywallDiagnosticLazy('revenuecat.customer_info.listener_update', () => ({
        customerInfo: summarizeCustomerInfo(customerInfo),
      }));
      listener(customerInfo);
    };

    Purchases.addCustomerInfoUpdateListener(diagnosticListener);
    return () => Purchases.removeCustomerInfoUpdateListener(diagnosticListener);
  });
};

/**
 * Log out the current user
 *
 * @returns RevenueCatResult<void> describing success/failure
 *
 * @example
 * const result = await logoutUser();
 * if (!result.ok) {
 *   // Handle failure case
 * }
 */
export const logoutUser = (): Promise<RevenueCatResult<void>> => {
  return guardRevenueCatUsage("logoutUser", async () => {
    await Purchases.logOut();
  });
};

/**
 * Check if user has a specific entitlement active
 *
 * @param entitlementId - The entitlement identifier (e.g., "premium", "pro")
 * @returns RevenueCatResult<boolean> describing entitlement state or failure
 *
 * @example
 * const premiumResult = await hasEntitlement("premium");
 * if (premiumResult.ok && premiumResult.data) {
 *   // Show premium features
 * }
 */
export const hasEntitlement = async (
  entitlementId: string,
): Promise<RevenueCatResult<boolean>> => {
  const customerInfoResult = await getCustomerInfo();

  if (!customerInfoResult.ok) {
    return {
      ok: false,
      reason: customerInfoResult.reason,
      error: customerInfoResult.error,
    };
  }

  const isActive = Boolean(
    customerInfoResult.data.entitlements.active?.[entitlementId],
  );
  return { ok: true, data: isActive };
};

/**
 * Check if user has any active subscription
 *
 * @returns RevenueCatResult<boolean> describing subscription state or failure
 *
 * @example
 * const subscriptionResult = await hasActiveSubscription();
 * if (subscriptionResult.ok && subscriptionResult.data) {
 *   // User is a paying subscriber
 * }
 */
export const hasActiveSubscription = async (): Promise<
  RevenueCatResult<boolean>
> => {
  const customerInfoResult = await getCustomerInfo();

  if (!customerInfoResult.ok) {
    return {
      ok: false,
      reason: customerInfoResult.reason,
      error: customerInfoResult.error,
    };
  }

  const hasSubscription = Boolean(
    customerInfoResult.data.entitlements.active?.['Unfold Premium'],
  );
  return { ok: true, data: hasSubscription };
};

/**
 * Get a specific package from the current offering
 *
 * @param packageIdentifier - The package identifier (e.g., "$rc_monthly", "$rc_annual")
 * @returns RevenueCatResult containing the package (or null) or a failure reason
 *
 * @example
 * const packageResult = await getPackage("$rc_monthly");
 * if (packageResult.ok && packageResult.data) {
 *   // Display monthly subscription option
 * }
 */
export const getPackage = async (
  packageIdentifier: string,
): Promise<RevenueCatResult<PurchasesPackage | null>> => {
  const offeringsResult = await getOfferings();

  if (!offeringsResult.ok) {
    return {
      ok: false,
      reason: offeringsResult.reason,
      error: offeringsResult.error,
    };
  }

  const pkg =
    offeringsResult.data.current?.availablePackages.find(
      (availablePackage) => availablePackage.identifier === packageIdentifier,
    ) ?? null;

  return { ok: true, data: pkg };
};

/**
 * Check whether this user is eligible for the intro/trial offer on a given
 * product. Returns `true` ONLY when RevenueCat definitively says the user is
 * eligible. Every other status — ineligible, unknown, no-offer-exists — returns
 * `false`, which is the safe default per RevenueCat's own guidance: when in
 * doubt, show non-trial pricing so we never promise a trial the user won't
 * actually get (Apple Guideline 3.1.2).
 *
 * iOS-only surface. Android always returns UNKNOWN per SDK, so this helper
 * returns `false` on Android too.
 */
export const isTrialEligibleForProduct = async (
  productIdentifier: string,
): Promise<boolean> => {
  if (Platform.OS !== "ios") return false;

  const eligibilityResult = await guardRevenueCatUsage("trialEligibility", async () => {
    const result = await Purchases.checkTrialOrIntroductoryPriceEligibility([
      productIdentifier,
    ]);
    const entry = result[productIdentifier];
    // INTRO_ELIGIBILITY_STATUS_ELIGIBLE = 2 (see @revenuecat/purchases-typescript-internal/offerings.d.ts)
    return entry?.status === 2;
  });

  if (!eligibilityResult.ok) return false;
  return eligibilityResult.data;
};
