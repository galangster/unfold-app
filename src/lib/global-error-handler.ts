import type { ErrorUtils as ErrorUtilsShape } from 'react-native';
import { logBugError } from '@/lib/bug-logger';
import { recordCrash } from '@/lib/crash-marker';

let installedOn: ErrorUtilsShape | null = null;

/** React Native installs ErrorUtils as a global at startup; web and jest have none. */
export function resolveErrorUtils(): ErrorUtilsShape | null {
  const candidate = (globalThis as { ErrorUtils?: Partial<ErrorUtilsShape> }).ErrorUtils;
  if (
    !candidate ||
    typeof candidate.setGlobalHandler !== 'function' ||
    typeof candidate.getGlobalHandler !== 'function'
  ) {
    return null;
  }
  return candidate as ErrorUtilsShape;
}

/**
 * Wraps the global JS error handler so fatal errors — which never reach a
 * React error boundary — are written to the bug log and counted by the boot
 * crash-loop marker before the previous handler (RN's red box, native crash
 * reporting) runs. Idempotent. Returns false when there is no ErrorUtils.
 */
export function installGlobalErrorHandler(
  errorUtils: ErrorUtilsShape | null = resolveErrorUtils(),
): boolean {
  if (!errorUtils) return false;
  if (installedOn === errorUtils) return true;

  const previous = errorUtils.getGlobalHandler();
  errorUtils.setGlobalHandler((error: unknown, isFatal?: boolean) => {
    try {
      void logBugError('global-error', error, { isFatal: Boolean(isFatal) });
      if (isFatal) recordCrash();
    } catch {
      // Recording must never mask the original error.
    }
    if (typeof previous === 'function') previous(error, isFatal);
  });
  installedOn = errorUtils;
  return true;
}
