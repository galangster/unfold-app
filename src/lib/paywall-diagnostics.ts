import * as FileSystem from 'expo-file-system/legacy';
import { Platform } from 'react-native';
import type {
  CustomerInfo,
  PurchasesOfferings,
  PurchasesPackage,
} from 'react-native-purchases';
import { logger } from '@/lib/logger';
import { getBuildProfile, resolvePaywallDiagnosticsEnabled } from '@/lib/build-profile';

const DIAGNOSTIC_FILE_NAME = 'unfold-paywall-diagnostics.jsonl';
const MAX_DIAGNOSTIC_LINES = 500;
const MAX_DIAGNOSTIC_BYTES = 250_000;
const MAX_OBJECT_DEPTH = 5;
const MAX_ARRAY_LENGTH = 30;
const MAX_STRING_LENGTH = 2_000;

let writeQueue: Promise<void> = Promise.resolve();

export type PaywallDiagnosticLevel = 'info' | 'warn' | 'error';

export interface PaywallDiagnosticEntry {
  ts: string;
  level: PaywallDiagnosticLevel;
  event: string;
  platform: string;
  data?: unknown;
}

/**
 * Diagnostics are a QA-build affordance: the explicit flag is required and a
 * production build (stamped `extra.buildProfile`) is always OFF — see
 * build-profile.ts for the decision table.
 */
export function isPaywallDiagnosticsEnabled(): boolean {
  return resolvePaywallDiagnosticsEnabled({
    buildProfile: getBuildProfile(),
    isDev: __DEV__,
    qaFlag: process.env.EXPO_PUBLIC_ENABLE_QA_TOOLS,
  });
}

function getDiagnosticsBaseDirectory(): string | null {
  return FileSystem.documentDirectory ?? FileSystem.cacheDirectory ?? null;
}

export function getPaywallDiagnosticsFilePath(): string | null {
  const baseDir = getDiagnosticsBaseDirectory();
  if (!baseDir) return null;
  return `${baseDir}${DIAGNOSTIC_FILE_NAME}`;
}

export function sanitizeDiagnosticText(value: string): string {
  return value
    .replace(/\b(?:appl|goog)_[A-Za-z0-9_-]+\b/g, '[REDACTED_REVENUECAT_KEY]')
    .replace(/\$RCAnonymousID:[A-Za-z0-9._:-]+/g, '[REDACTED_APP_USER_ID]')
    .replace(/\banon_[0-9a-fA-F]{8}(?:-[0-9a-fA-F]{4}){3}-[0-9a-fA-F]{12}\b/g, '[REDACTED_APP_USER_ID]')
    .replace(
      /(["']?)(app[_-]?user[_-]?id|originalAppUserId|customer[_-]?id|customerId|transactionIdentifier|transaction[_-]?id)\1(\s*[:=]\s*)(["']?)[^"',\s}]+(?:\4)?/gi,
      (_match, keyQuote: string, key: string, separator: string, valueQuote: string) =>
        `${keyQuote}${key}${keyQuote}${separator}${valueQuote}[REDACTED_IDENTIFIER]${valueQuote}`,
    )
    .replace(/\b(?:Bearer|Basic)\s+[A-Za-z0-9._~+/=-]{16,}\b/gi, '[REDACTED_AUTH_HEADER]')
    .replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, '[REDACTED_JWT]')
    .replace(/[A-Za-z0-9+/=]{80,}/g, '[REDACTED_LONG_TOKEN]')
    .slice(0, MAX_STRING_LENGTH);
}

export function summarizeDiagnosticIdentifier(value: string | null | undefined): string | null {
  if (!value) return null;

  // Callers should still place identifier summaries under sensitive keys so the
  // final object sanitizer can fully redact them before JSONL/console output.
  const sanitized = sanitizeDiagnosticText(value);
  if (sanitized.startsWith('[REDACTED')) return sanitized;
  if (sanitized.length <= 12) return sanitized;

  return `${sanitized.slice(0, 8)}…${sanitized.slice(-6)}`;
}

function isSensitiveKey(key: string): boolean {
  return /api[_-]?key|authorization|bearer|credential|password|private[_-]?key|receipt|secret|token|app[_-]?user[_-]?id|originalAppUserId|customer[_-]?id|transactionIdentifier|transaction[_-]?id/i.test(key);
}

export function sanitizeDiagnosticValue(value: unknown, depth = 0): unknown {
  if (value === null || value === undefined) return value;

  if (typeof value === 'string') {
    return sanitizeDiagnosticText(value);
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }

  if (value instanceof Error) {
    return {
      name: sanitizeDiagnosticText(value.name),
      message: sanitizeDiagnosticText(value.message),
    };
  }

  if (depth >= MAX_OBJECT_DEPTH) {
    return '[MAX_DEPTH]';
  }

  if (Array.isArray(value)) {
    const trimmed = value.slice(0, MAX_ARRAY_LENGTH).map((item) =>
      sanitizeDiagnosticValue(item, depth + 1),
    );
    if (value.length > MAX_ARRAY_LENGTH) {
      trimmed.push(`[TRUNCATED_${value.length - MAX_ARRAY_LENGTH}_ITEMS]`);
    }
    return trimmed;
  }

  if (typeof value === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      result[key] = isSensitiveKey(key)
        ? '[REDACTED]'
        : sanitizeDiagnosticValue(item, depth + 1);
    }
    return result;
  }

  return String(value);
}

export function summarizeRevenueCatError(error: unknown): unknown {
  if (error instanceof Error) {
    return sanitizeDiagnosticValue(error);
  }

  if (!error || typeof error !== 'object') {
    return sanitizeDiagnosticValue(error);
  }

  const record = error as Record<string, unknown>;
  return sanitizeDiagnosticValue({
    name: record.name,
    message: record.message,
    code: record.code,
    readableErrorCode: record.readableErrorCode,
    domain: record.domain,
    userCancelled: record.userCancelled,
    underlyingErrorMessage: record.underlyingErrorMessage,
  });
}

export function summarizeCustomerInfo(customerInfo: CustomerInfo): unknown {
  const subscriptionsByProductIdentifier = customerInfo.subscriptionsByProductIdentifier ?? {};

  return sanitizeDiagnosticValue({
    originalAppUserId: summarizeDiagnosticIdentifier(customerInfo.originalAppUserId),
    firstSeen: customerInfo.firstSeen,
    requestDate: customerInfo.requestDate,
    activeEntitlements: Object.keys(customerInfo.entitlements?.active ?? {}),
    allEntitlements: Object.keys(customerInfo.entitlements?.all ?? {}),
    activeSubscriptions: customerInfo.activeSubscriptions ?? [],
    allPurchasedProductIdentifiers: customerInfo.allPurchasedProductIdentifiers ?? [],
    latestExpirationDate: customerInfo.latestExpirationDate,
    allExpirationDates: customerInfo.allExpirationDates ?? {},
    allPurchaseDates: customerInfo.allPurchaseDates ?? {},
    subscriptionSummaries: Object.fromEntries(
      Object.entries(subscriptionsByProductIdentifier).map(([productIdentifier, subscription]) => [
        productIdentifier,
        {
          isActive: subscription.isActive,
          willRenew: subscription.willRenew,
          isSandbox: subscription.isSandbox,
          store: subscription.store,
          purchaseDate: subscription.purchaseDate,
          expiresDate: subscription.expiresDate,
          periodType: subscription.periodType,
          ownershipType: subscription.ownershipType,
        },
      ]),
    ),
    managementURLPresent: Boolean(customerInfo.managementURL),
  });
}

export function summarizePackage(pkg: PurchasesPackage | null | undefined): unknown {
  if (!pkg) return null;

  const product = pkg.product;
  return sanitizeDiagnosticValue({
    packageIdentifier: pkg.identifier,
    packageType: pkg.packageType,
    offeringIdentifier: pkg.offeringIdentifier,
    presentedOfferingContext: pkg.presentedOfferingContext
      ? {
          offeringIdentifier: pkg.presentedOfferingContext.offeringIdentifier,
          placementIdentifier: pkg.presentedOfferingContext.placementIdentifier,
          targetingRevision: pkg.presentedOfferingContext.targetingContext?.revision ?? null,
          targetingRuleId: pkg.presentedOfferingContext.targetingContext?.ruleId ?? null,
        }
      : null,
    product: {
      identifier: product.identifier,
      title: product.title,
      description: product.description,
      price: product.price,
      priceString: product.priceString,
      currencyCode: product.currencyCode,
      productCategory: product.productCategory,
      productType: product.productType,
      subscriptionPeriod: product.subscriptionPeriod,
      hasIntroPrice: Boolean(product.introPrice),
      introPrice: product.introPrice
        ? {
            price: product.introPrice.price,
            priceString: product.introPrice.priceString,
            period: product.introPrice.period,
            periodNumberOfUnits: product.introPrice.periodNumberOfUnits,
            periodUnit: product.introPrice.periodUnit,
            cycles: product.introPrice.cycles,
          }
        : null,
      discountsCount: product.discounts?.length ?? 0,
    },
  });
}

export function summarizeOfferings(offerings: PurchasesOfferings | null | undefined): unknown {
  if (!offerings) return null;

  return sanitizeDiagnosticValue({
    currentOfferingIdentifier: offerings.current?.identifier ?? null,
    allOfferingIdentifiers: Object.keys(offerings.all ?? {}),
    currentPackageIdentifiers: offerings.current?.availablePackages.map((pkg) => pkg.identifier) ?? [],
    currentProductIdentifiers: offerings.current?.availablePackages.map((pkg) => pkg.product.identifier) ?? [],
    currentPackages: offerings.current?.availablePackages.map(summarizePackage) ?? [],
  });
}

function trimDiagnosticLog(content: string): string {
  const lines = content.split('\n').filter(Boolean).slice(-MAX_DIAGNOSTIC_LINES);
  let next = `${lines.join('\n')}\n`;

  if (next.length > MAX_DIAGNOSTIC_BYTES) {
    next = next.slice(next.length - MAX_DIAGNOSTIC_BYTES);
    const firstNewline = next.indexOf('\n');
    if (firstNewline >= 0) {
      next = next.slice(firstNewline + 1);
    }
  }

  return next;
}

async function appendDiagnosticEntry(entry: PaywallDiagnosticEntry): Promise<void> {
  const path = getPaywallDiagnosticsFilePath();
  if (!path) return;

  const line = JSON.stringify(entry);
  const info = await FileSystem.getInfoAsync(path);
  const existing = info.exists
    ? await FileSystem.readAsStringAsync(path, { encoding: FileSystem.EncodingType.UTF8 })
    : '';
  const separator = existing && !existing.endsWith('\n') ? '\n' : '';
  await FileSystem.writeAsStringAsync(
    path,
    trimDiagnosticLog(`${existing}${separator}${line}\n`),
    { encoding: FileSystem.EncodingType.UTF8 },
  );
}

export function recordPaywallDiagnostic(
  event: string,
  data?: unknown,
  level: PaywallDiagnosticLevel = 'info',
): Promise<void> {
  if (!isPaywallDiagnosticsEnabled()) {
    return Promise.resolve();
  }

  const entry: PaywallDiagnosticEntry = {
    ts: new Date().toISOString(),
    level,
    event,
    platform: Platform.OS,
    data: sanitizeDiagnosticValue(data),
  };

  // Keep this as a real console line even in production QA/TestFlight builds so
  // Xcode/Console captures the same breadcrumb if file extraction fails.
  console.log('[PaywallDiagnostics]', JSON.stringify(entry));

  writeQueue = writeQueue.then(() => appendDiagnosticEntry(entry)).catch((error) => {
    logger.warn('[PaywallDiagnostics] failed to write diagnostic entry', error);
  });

  return writeQueue;
}

export function recordPaywallDiagnosticLazy(
  event: string,
  getData?: () => unknown,
  level: PaywallDiagnosticLevel = 'info',
): Promise<void> {
  if (!isPaywallDiagnosticsEnabled()) {
    return Promise.resolve();
  }

  try {
    return recordPaywallDiagnostic(event, getData?.(), level);
  } catch (error) {
    return recordPaywallDiagnostic(`${event}.payload_error`, {
      error: sanitizeDiagnosticValue(error),
    }, 'error');
  }
}
