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
import Purchases, {
  type PurchasesOfferings,
  type CustomerInfo,
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

// Track if RevenueCat is enabled
const isEnabled = !!apiKey && !isWeb;

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

// Internal guard to get consistent success/failure results from RevenueCat.
const guardRevenueCatUsage = async <T>(
  action: string,
  operation: () => Promise<T>,
): Promise<RevenueCatResult<T>> => {
  if (isWeb) {
    logger.log(
      `${LOG_PREFIX} ${action} skipped: payments are not supported on web.`,
    );
    return { ok: false, reason: "web_not_supported" };
  }

  if (!isEnabled) {
    logger.log(`${LOG_PREFIX} ${action} skipped: RevenueCat not configured`);
    return { ok: false, reason: "not_configured" };
  }

  try {
    const data = await operation();
    return { ok: true, data };
  } catch (error) {
    // Our own timeout sentinel — distinguish from SDK errors so the UI can
    // show "took too long, try again" instead of "something went wrong".
    if (error instanceof RevenueCatTimeoutError) {
      logger.log(`${LOG_PREFIX} ${action}: timed out`);
      return { ok: false, reason: "timeout", error };
    }
    // RevenueCat sets userCancelled on the error when the user dismisses the payment sheet
    if (error && typeof error === "object" && "userCancelled" in error && (error as { userCancelled: boolean }).userCancelled) {
      logger.log(`${LOG_PREFIX} ${action}: user cancelled`);
      return { ok: false, reason: "user_cancelled" };
    }
    logger.log(`${LOG_PREFIX} ${action} failed:`, error);
    return { ok: false, reason: "sdk_error", error };
  }
};

// Initialize RevenueCat if key exists
if (isEnabled) {
  try {
    // Set up custom log handler to suppress Test Store and expected errors
    // These are non-errors thrown as errors by the SDK, and will be confusing to the user.
    Purchases.setLogHandler((logLevel, message) => {

      // Log ERROR messages normally
      if (logLevel === Purchases.LOG_LEVEL.ERROR) {
        logger.log(LOG_PREFIX, message);
      }
    });

    Purchases.configure({ apiKey: apiKey! });
    const keyType = __DEV__
      ? (testKey ? 'test' : (Platform.OS === 'ios' ? 'apple (dev fallback)' : 'google (dev fallback)'))
      : (Platform.OS === 'ios' ? 'apple' : 'google');
    logger.log(`${LOG_PREFIX} SDK initialized successfully (${keyType} key, ${Platform.OS})`);
  } catch (error) {
    logger.error(`${LOG_PREFIX} Failed to initialize:`, error);
  }
} else {
  logger.log(
    `${LOG_PREFIX} SDK NOT initialized — isWeb: ${isWeb}, testKey: ${!!testKey}, appleKey: ${!!appleKey}, googleKey: ${!!googleKey}, __DEV__: ${__DEV__}`,
  );
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
  return isEnabled;
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
  return guardRevenueCatUsage("getOfferings", () => Purchases.getOfferings());
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
    const { customerInfo } = await withTimeout(
      Purchases.purchasePackage(packageToPurchase),
      PURCHASE_TIMEOUT_MS,
      "purchasePackage",
    );
    return customerInfo;
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
  return guardRevenueCatUsage("getCustomerInfo", () =>
    Purchases.getCustomerInfo(),
  );
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
  return guardRevenueCatUsage("restorePurchases", () =>
    withTimeout(
      Purchases.restorePurchases(),
      RESTORE_TIMEOUT_MS,
      "restorePurchases",
    ),
  );
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
  if (!isEnabled || Platform.OS !== "ios") return false;
  try {
    const result = await Purchases.checkTrialOrIntroductoryPriceEligibility([
      productIdentifier,
    ]);
    const entry = result[productIdentifier];
    // INTRO_ELIGIBILITY_STATUS_ELIGIBLE = 2 (see @revenuecat/purchases-typescript-internal/offerings.d.ts)
    return entry?.status === 2;
  } catch (error) {
    logger.warn(`${LOG_PREFIX} trial eligibility check failed`, error);
    return false;
  }
};
