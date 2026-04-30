const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function buildRevenueCatAppUserId(deviceId: string): string {
  const trimmed = deviceId.trim();
  if (!UUID_RE.test(trimmed)) {
    throw new Error('RevenueCat app user id requires a UUID device id');
  }
  return `anon_${trimmed}`;
}
