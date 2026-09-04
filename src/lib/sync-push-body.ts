import { getDeviceTimezone } from './device-timezone';
import type { SyncPushChange } from './sync-types';

/**
 * Request body for `/api/sync/push`. Every caller sends the device timezone
 * with its changes: the server paces "one day per calendar day" on the
 * reader's calendar and creates their cron config from it.
 */
export function buildSyncPushBody(changes: SyncPushChange[]): string {
  const deviceTimezone = getDeviceTimezone();
  return JSON.stringify(deviceTimezone ? { changes, deviceTimezone } : { changes });
}
