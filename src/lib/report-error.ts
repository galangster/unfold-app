import { logger } from '@/lib/logger';
import { logBugError } from '@/lib/bug-logger';

/**
 * Report an error locally.
 * Use in catch blocks for user-facing failures.
 */
export function reportError(
  source: string,
  error: unknown,
  extra?: Record<string, unknown>,
): void {
  const err = error instanceof Error ? error : new Error(String(error));

  logger.error(`[${source}]`, err.message);

  if (extra) {
    logger.error(`[${source}] extra`, extra);
  }

  void logBugError(source, err, extra);
}
