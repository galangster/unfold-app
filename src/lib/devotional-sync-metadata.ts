import type { Devotional } from './store';
import type { PulledDevotionalContent } from './devotional-sync-pull';
import {
  clampCurrentDayToSeriesBoundary,
  getServerOwnedSeriesTotalDays,
} from './devotional-series-boundary';

type SyncedDevotionalMetadata = NonNullable<PulledDevotionalContent['devotional']>;

export type DevotionalSyncMetadataPatch = Partial<Pick<Devotional, 'title' | 'totalDays' | 'currentDay' | 'seriesArc' | 'seriesStartDate' | 'updatedAt'>>;

export function buildDevotionalSyncMetadataPatch(
  local: Pick<Devotional, 'id' | 'title' | 'totalDays' | 'currentDay' | 'seriesArc' | 'seriesStartDate' | 'createdAt'>,
  synced?: SyncedDevotionalMetadata,
): DevotionalSyncMetadataPatch {
  if (!synced || synced.id !== local.id) return {};

  const patch: DevotionalSyncMetadataPatch = {};
  const boundarySource = {
    totalDays: typeof synced.totalDays === 'number' && Number.isFinite(synced.totalDays)
      ? synced.totalDays
      : local.totalDays,
    seriesArc: synced.seriesArc ?? local.seriesArc,
  };
  const serverOwnedTotalDays = getServerOwnedSeriesTotalDays(boundarySource);

  if (synced.title && synced.title !== local.title) {
    patch.title = synced.title;
  }

  if (synced.seriesArc && synced.seriesArc !== local.seriesArc) {
    patch.seriesArc = synced.seriesArc;
  }

  // Never leave the calendar anchor undefined — getCalendarDayNumber() returns
  // null without it and the tomorrow-lock then fails closed, pinning catch-up
  // users to the day they read today.
  const nextSeriesStartDate =
    synced.seriesStartDate ?? local.seriesStartDate ?? local.createdAt;
  if (nextSeriesStartDate && nextSeriesStartDate !== local.seriesStartDate) {
    patch.seriesStartDate = nextSeriesStartDate;
  }


  if (serverOwnedTotalDays > 0 && local.totalDays !== serverOwnedTotalDays) {
    patch.totalDays = serverOwnedTotalDays;
  } else if (
    typeof synced.totalDays === 'number'
    && Number.isFinite(synced.totalDays)
    && synced.totalDays > local.totalDays
    && (serverOwnedTotalDays <= 0 || synced.totalDays <= serverOwnedTotalDays)
  ) {
    patch.totalDays = synced.totalDays;
  }

  if (serverOwnedTotalDays > 0 && local.currentDay > serverOwnedTotalDays + 1) {
    patch.currentDay = clampCurrentDayToSeriesBoundary(local.currentDay, boundarySource);
  } else if (
    typeof synced.currentDay === 'number'
    && Number.isFinite(synced.currentDay)
    && synced.currentDay > local.currentDay
    && (serverOwnedTotalDays <= 0 || synced.currentDay <= serverOwnedTotalDays + 1)
  ) {
    patch.currentDay = synced.currentDay;
  }

  if (synced.updatedAt) {
    patch.updatedAt = synced.updatedAt;
  }

  return patch;
}
