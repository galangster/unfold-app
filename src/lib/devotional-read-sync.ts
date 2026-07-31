import { PRIMARY_BACKEND_URL, getAuthHeaders } from './api-config';
import { buildReadOnlyCanonicalDayData, canonicalGeneratedDayId } from './devotional-canonical-days';
import { isCanonicalProgressiveDevotional } from './reading-generation-policy';
import type { Devotional, DevotionalDay } from './store';
import type { SyncPushChange } from './sync-types';
import { enqueueSyncChanges } from './sync-outbox';

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
        schemaVersion: 1,
        title: devotional.title,
        totalDays: devotional.totalDays,
        currentDay: nextCurrentDay,
        userContext: devotional.userContext,
        themeCategory: devotional.themeCategory,
        devotionalType: devotional.devotionalType,
        studySubject: devotional.studySubject,
        generationMode: devotional.generationMode,
        usedStoryIds: devotional.usedStoryIds,
        seriesArc: devotional.seriesArc,
        progressiveMemory: devotional.progressiveMemory,
        seriesStartDate: devotional.seriesStartDate,
        // archivedAt is deliberately NOT sent here. Lifecycle is only ever
        // written by archive/resume pushes, which carry the archivedStateAt
        // intent clock. Including it on a content push would let a stale
        // device silently reverse a decision made on another one, with no
        // intent timestamp to arbitrate.
      },
      deleted: false,
    },
  ];
}

export async function syncDevotionalDayRead(params: {
  devotional: Devotional;
  day: DevotionalDay;
  readAt?: string;
}): Promise<void> {
  const readAt = params.readAt ?? new Date().toISOString();
  const headers = await getAuthHeaders();
  const changes = buildDevotionalReadSyncChanges({
    devotional: params.devotional,
    day: params.day,
    readAt,
  });

  try {
    const response = await fetch(`${PRIMARY_BACKEND_URL}/api/sync/push`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ changes }),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new Error(`Sync read state failed: ${response.status} ${body.slice(0, 120)}`);
    }

    const payload = await response.json().catch(() => null) as { results?: Array<{ status?: string }> } | null;
    const rejected = payload?.results?.filter((result) => result.status === 'rejected') ?? [];
    if (rejected.length > 0) {
      throw new Error(`Sync read state rejected ${rejected.length} change(s)`);
    }
  } catch (err) {
    // Enqueue for retry via the outbox drain hook (useSyncOutboxDrain)
    enqueueSyncChanges(changes);
    throw err;
  }
}
