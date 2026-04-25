import type { Devotional } from './store';
import type { PulledDevotionalContent } from './devotional-sync-pull';

type SyncedDevotionalMetadata = NonNullable<PulledDevotionalContent['devotional']>;

export type DevotionalSyncMetadataPatch = Partial<Pick<Devotional, 'title' | 'totalDays' | 'currentDay' | 'updatedAt'>>;

export function buildDevotionalSyncMetadataPatch(
  local: Pick<Devotional, 'id' | 'title' | 'totalDays' | 'currentDay'>,
  synced?: SyncedDevotionalMetadata,
): DevotionalSyncMetadataPatch {
  if (!synced || synced.id !== local.id) return {};

  const patch: DevotionalSyncMetadataPatch = {};

  if (synced.title && synced.title !== local.title) {
    patch.title = synced.title;
  }

  if (typeof synced.totalDays === 'number' && Number.isFinite(synced.totalDays) && synced.totalDays > local.totalDays) {
    patch.totalDays = synced.totalDays;
  }

  if (typeof synced.currentDay === 'number' && Number.isFinite(synced.currentDay) && synced.currentDay > local.currentDay) {
    patch.currentDay = synced.currentDay;
  }

  if (synced.updatedAt) {
    patch.updatedAt = synced.updatedAt;
  }

  return patch;
}
