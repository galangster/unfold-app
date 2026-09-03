import { logger } from '@/lib/logger';
import { logBugError } from '@/lib/bug-logger';
import { captureAppError } from '@/lib/sentry';

/**
 * Reduce an `extra` payload to what is safe to leave a device.
 *
 * Unfold's journal holds what people write about their own struggles and the
 * real names of their family, so nothing user-authored may reach the crash
 * reporter. Every current `reportError` call site passes developer context
 * only — a phase, a migration step id, a devotional id, a voice id — so
 * primitives are forwarded. Anything structured is replaced by a placeholder,
 * keeping the key name as the signal.
 *
 * Never pass user-authored text in `extra`.
 */
function sanitizeExtra(extra: Record<string, unknown>): Record<string, unknown> {
  const safe: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(extra)) {
    const primitive =
      typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean';
    safe[key] = primitive ? value : '[omitted]';
  }
  return safe;
}

/**
 * Report an error locally and to the crash reporter.
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

  // Last: the local trail is already written, so a reporter that misbehaves
  // cannot cost us the bug log.
  captureAppError(source, err, extra ? sanitizeExtra(extra) : undefined);
}
