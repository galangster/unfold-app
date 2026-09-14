import { mmkvStorage } from './mmkv-storage';
import { MUSIC_ANNOUNCEMENT } from './music-announcement';

export const FEATURE_ANNOUNCEMENTS_KEY = 'feature-announcements';

const KNOWN_IDS = new Set<string>([MUSIC_ANNOUNCEMENT.id]);
const KNOWN_STATUSES = new Set(['seen', 'dismissed', 'tried']);

export type FeatureAnnouncementRecord = {
  status: string;
  at: number;
};

function readRaw(): Record<string, FeatureAnnouncementRecord> {
  try {
    const value = mmkvStorage.getItem(FEATURE_ANNOUNCEMENTS_KEY);
    if (!value || typeof value !== 'string') return {};
    const parsed = JSON.parse(value) as unknown;
    if (!parsed || typeof parsed !== 'object') return {};
    const next: Record<string, FeatureAnnouncementRecord> = {};
    for (const [id, record] of Object.entries(parsed as Record<string, unknown>)) {
      if (!KNOWN_IDS.has(id) || !record || typeof record !== 'object') continue;
      const item = record as Record<string, unknown>;
      if (typeof item.status !== 'string' || !KNOWN_STATUSES.has(item.status)) continue;
      if (typeof item.at !== 'number' || !Number.isFinite(item.at)) continue;
      next[id] = { status: item.status, at: item.at };
    }
    return next;
  } catch {
    return {};
  }
}

export function hasSeenAnnouncement(id: string): boolean {
  return !!readRaw()[id];
}

export function recordAnnouncement(id: string, status: string): void {
  if (!KNOWN_IDS.has(id) || !KNOWN_STATUSES.has(status)) return;
  const next = {
    ...readRaw(),
    [id]: { status, at: Date.now() },
  };
  try {
    mmkvStorage.setItem(FEATURE_ANNOUNCEMENTS_KEY, JSON.stringify(next));
  } catch {
    // This visit still remembers dismissal when storage is unavailable.
  }
}
