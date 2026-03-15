/**
 * Logger utility that only logs in development.
 * In production, all logging is suppressed to prevent leaking internal state.
 */
export const logger = {
  log: (...args: unknown[]) => {
    if (__DEV__) {
      console.log(...args);
    }
  },
  warn: (...args: unknown[]) => {
    if (__DEV__) {
      console.warn(...args);
    }
  },
  error: (...args: unknown[]) => {
    if (__DEV__) {
      console.error(...args);
    }
    // In production, errors are silently dropped from console.
    // Crash reporting (e.g., Sentry) should be added here if needed.
  },
};
