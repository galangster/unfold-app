/**
 * The device's IANA timezone, or null when the runtime cannot report one.
 * Sent with sync pushes so the server paces "one day per calendar day" on
 * the reader's own calendar rather than the America/Chicago default.
 */
export function getDeviceTimezone(): string | null {
  try {
    const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return typeof timeZone === 'string' && timeZone.length > 0 ? timeZone : null;
  } catch {
    return null;
  }
}
