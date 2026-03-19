import * as Sentry from '@sentry/react-native';
import { logger } from '@/lib/logger';

/**
 * Report an error to Sentry and log it locally.
 * Use in catch blocks for user-facing failures.
 */
export function reportError(
  source: string,
  error: unknown,
  extra?: Record<string, unknown>,
): void {
  const err = error instanceof Error ? error : new Error(String(error));

  logger.error(`[${source}]`, err.message);

  Sentry.captureException(err, {
    tags: { source },
    extra,
  });
}
