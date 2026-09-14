import { mmkvStorage } from './mmkv-storage';
import { MUSIC_ANNOUNCEMENT } from './music-announcement';

export const FEATURE_ANNOUNCEMENTS_KEY = 'feature-announcements';

export const BOOKSHELF_ANNOUNCEMENT_ID = 'bookshelf-v1';
export const COMPANION_ANNOUNCEMENT_ID = 'companion-v1';
export const REFLECTION_ANNOUNCEMENT_ID = 'reflection-navigation-v1';

export type FeatureAnnouncementKind = 'bookshelf' | 'companion' | 'music' | 'reflection';

export type FeatureAnnouncementPage = {
  id: string;
  kind: FeatureAnnouncementKind;
  title: string;
  body: string;
};

export type FeatureAnnouncementAvailability = {
  bookshelf: boolean;
  companion: boolean;
  music: boolean;
  reflection: boolean;
};

export const FEATURE_ANNOUNCEMENT_CATALOG: readonly FeatureAnnouncementPage[] = [
  {
    id: BOOKSHELF_ANNOUNCEMENT_ID,
    kind: 'bookshelf',
    title: 'Your new bookshelf.',
    body: 'Open your devotional series to find today’s reading and return to earlier days, chapter by chapter.',
  },
  {
    id: COMPANION_ANNOUNCEMENT_ID,
    kind: 'companion',
    title: 'Meet your Companion.',
    body: 'Choose a gentle, thoughtful, or encouraging Companion in Settings.',
  },
  {
    id: MUSIC_ANNOUNCEMENT.id,
    kind: 'music',
    title: MUSIC_ANNOUNCEMENT.title,
    body: MUSIC_ANNOUNCEMENT.description,
  },
  {
    id: REFLECTION_ANNOUNCEMENT_ID,
    kind: 'reflection',
    title: 'Move through your reflections.',
    body: 'Use Previous and Next above the keyboard to move between questions. Your draft stays with you as you go.',
  },
];

const KNOWN_IDS = new Set(FEATURE_ANNOUNCEMENT_CATALOG.map((page) => page.id));
const KNOWN_STATUSES = new Set(['seen', 'dismissed', 'tried']);

export type FeatureAnnouncementRecord = {
  status: string;
  at: number;
};

export type FeatureAnnouncementGateInput = {
  isTodayHome: boolean;
  todayReadingAvailable: boolean;
  soundOff: boolean;
  timerIdle: boolean;
  narrationActive: boolean;
  voiceActive: boolean;
  keyboardVisible: boolean;
  appActive: boolean;
  pendingCount: number;
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

export function isKnownAnnouncementId(id: string): boolean {
  return KNOWN_IDS.has(id);
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

export function listPendingAnnouncementPages(
  availability: FeatureAnnouncementAvailability,
): FeatureAnnouncementPage[] {
  const records = readRaw();
  return FEATURE_ANNOUNCEMENT_CATALOG.filter((page) => availability[page.kind] && !records[page.id]);
}

export function dismissAnnouncementPages(ids: readonly string[]): void {
  for (const id of ids) {
    if (!KNOWN_IDS.has(id) || hasSeenAnnouncement(id)) continue;
    recordAnnouncement(id, 'dismissed');
  }
}

export function canAnnounceFeatures(input: FeatureAnnouncementGateInput): boolean {
  return (
    input.todayReadingAvailable
    && input.isTodayHome
    && input.soundOff
    && input.timerIdle
    && !input.narrationActive
    && !input.voiceActive
    && !input.keyboardVisible
    && input.appActive
    && input.pendingCount > 0
  );
}
