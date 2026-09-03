import type { ErrorUtils as ErrorUtilsShape } from 'react-native';
import { logBugError } from '@/lib/bug-logger';
import { recordCrash, recordFatalBreadcrumb, takeLastFatalBreadcrumb } from '@/lib/crash-marker';

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
 * React error boundary — are written to the bug log, sent to the crash
 * reporter and counted by the boot crash-loop marker before the previous
 * handler (RN's red box, native crash reporting) runs. Idempotent. Returns
 * false when there is no ErrorUtils.
 *
 * `flushLastFatalBreadcrumb` deliberately does NOT capture: it replays a
 * breadcrumb from a previous launch that this handler already reported, so
 * capturing there would file the same crash twice.
 *
 * The bug-log write is asynchronous (AsyncStorage behind an await) and the
 * previous handler kills the process on a production fatal, so it normally
 * does not land. A synchronous MMKV breadcrumb is written first and
 * `flushLastFatalBreadcrumb()` turns it into a bug-log entry on the next
 * launch.
 */
export function installGlobalErrorHandler(
  errorUtils: ErrorUtilsShape | null = resolveErrorUtils(),
): boolean {
  if (!errorUtils) return false;
  if (installedOn === errorUtils) return true;

  const previous = errorUtils.getGlobalHandler();
  errorUtils.setGlobalHandler((error: unknown, isFatal?: boolean) => {
    try {
      // Synchronous first: on a production fatal the process is gone before
      // the async bug-log write below can reach AsyncStorage.
      if (isFatal) {
        recordFatalBreadcrumb(error);
        recordCrash();
      }
      // One sink. `logBugError` writes the local trail and reports; capturing
      // separately would file each fatal twice, under two different sources.
      // The reporter gets the message and the fatal flag only — never anything
      // the person wrote.
      void logBugError('global-error', error, { isFatal: Boolean(isFatal) }, {
        isFatal: Boolean(isFatal),
        mechanism: 'fatal',
      });
    } catch {
      // Recording must never mask the original error.
    }
    if (typeof previous === 'function') previous(error, isFatal);
  });
  installedOn = errorUtils;
  return true;
}

/**
 * Flushes the breadcrumb left by a fatal error in a PREVIOUS launch into the
 * bug log, then clears it, so a crash that killed the process before the async
 * write landed still shows up in a bug report. Safe to call once per launch;
 * a launch with no fatal breadcrumb is a no-op. Never throws.
 */
export function flushLastFatalBreadcrumb(): boolean {
  try {
    const breadcrumb = takeLastFatalBreadcrumb();
    if (!breadcrumb) return false;
    // Local trail only. This replays a fatal from a PREVIOUS launch, whose own
    // bug-log write died with the process; the crash itself was already
    // reported natively as it happened, so reporting here would file every
    // crash a second time on the next launch.
    void logBugError(
      'global-error-fatal-previous-launch',
      breadcrumb.message,
      { isFatal: true, crashedAt: breadcrumb.ts, stack: breadcrumb.stack },
      false,
    );
    return true;
  } catch {
    return false;
  }
}
