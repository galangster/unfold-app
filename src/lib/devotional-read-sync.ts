import { PRIMARY_BACKEND_URL, getAuthHeaders } from './api-config';
import { authenticatedFetch } from './device-credential';
import { buildReadOnlyCanonicalDayData, canonicalGeneratedDayId } from './devotional-canonical-days';
import { devotionalSyncData } from './personal-data-sync-records';
import { buildSyncPushBody } from './sync-push-body';
import { isCanonicalProgressiveDevotional } from './reading-generation-policy';
import type { Devotional, DevotionalDay } from './store';
import type { SyncPushChange } from './sync-types';
import { enqueueSyncChanges, settleDirectSyncPush } from './sync-outbox';
import {
  assertSyncSessionCurrent,
  captureSyncSession,
  isSyncSessionCurrent,
  registerSyncTransport,
  SyncSessionInvalidatedError,
} from './sync-session-fence';

// Re-export for legacy consumers (api-config, etc.)
export type { SyncPushChange };

export function buildDevotionalReadSyncChanges({
  devotional,
  day,
  readAt,
}: {
  devotional: Devotional;
  day: DevotionalDay;
  readAt: string;
}): SyncPushChange[] {
  const nextCurrentDay = Math.min(
    Math.max(devotional.currentDay, day.dayNumber + 1),
    devotional.totalDays + 1,
  );

  const isCanonicalProgressive = isCanonicalProgressiveDevotional(devotional);
  const dayData = isCanonicalProgressive
    ? { ...buildReadOnlyCanonicalDayData(devotional.id, day, readAt), schemaVersion: 1 }
    : {
        schemaVersion: 1,
        devotionalId: devotional.id,
        dayNumber: day.dayNumber,
        title: day.title,
        scriptureReference: day.scriptureReference,
        scriptureText: day.scriptureText,
        bodyText: day.bodyText,
        quotableLine: day.quotableLine,
        isRead: true,
        readAt,
        content: day,
      };
  const daySyncId = isCanonicalProgressive
    ? canonicalGeneratedDayId(devotional.id, day.dayNumber)
    : day.id ?? canonicalGeneratedDayId(devotional.id, day.dayNumber);

  return [
    {
      table: 'devotional_days',
      id: daySyncId,
      clientUpdatedAt: readAt,
      data: dayData,
      deleted: false,
    },
    {
      table: 'devotionals',
      id: devotional.id,
      clientUpdatedAt: readAt,
      data: {
        ...devotionalSyncData(devotional),
        currentDay: nextCurrentDay,
      },
      deleted: false,
    },
  ];
}

export async function syncDevotionalDayRead(params: {
  devotional: Devotional;
  day: DevotionalDay;
  readAt?: string;
  isOnline?: boolean;
}): Promise<'synced' | 'queued'> {
  const session = captureSyncSession();
  assertSyncSessionCurrent(session, 'devotional read sync');
  const readAt = params.readAt ?? new Date().toISOString();
  const changes = buildDevotionalReadSyncChanges({
    devotional: params.devotional,
    day: params.day,
    readAt,
  });

  // Queued before any await. If the app is killed while the push is in
  // flight, the outbox still holds the read, and the next drain delivers it:
  // the server generates the next day only once it holds this read.
  enqueueSyncChanges(changes);
  if (params.isOnline === false) {
    return 'queued';
  }

  const controller = new AbortController();
  const unregister = registerSyncTransport(controller);
  try {
    const headers = await getAuthHeaders();
    assertSyncSessionCurrent(session, 'devotional read sync');

    const response = await authenticatedFetch(`${PRIMARY_BACKEND_URL}/api/sync/push`, {
      method: 'POST',
      headers,
      body: buildSyncPushBody(changes),
      signal: controller.signal,
    });

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new Error(`Sync read state failed: ${response.status} ${body.slice(0, 120)}`);
    }

    const payload = await response.json().catch(() => null) as { results?: Array<{ status?: string }> } | null;
    assertSyncSessionCurrent(session, 'devotional read sync');
    settleDirectSyncPush(changes, payload?.results ?? []);
    const rejected = payload?.results?.filter((result) => result.status === 'rejected') ?? [];
    if (rejected.length > 0) {
      throw new Error(`Sync read state rejected ${rejected.length} change(s)`);
    }
    return 'synced';
  } catch (err) {
    if (!isSyncSessionCurrent(session)) {
      throw err instanceof SyncSessionInvalidatedError
        ? err
        : new SyncSessionInvalidatedError('devotional read sync');
    }
    // The read stays queued for the outbox drain (useSyncOutboxDrain).
    throw err;
  } finally {
    unregister();
  }
}
