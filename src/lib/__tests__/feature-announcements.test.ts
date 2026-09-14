import {
  BOOKSHELF_ANNOUNCEMENT_ID,
  COMPANION_ANNOUNCEMENT_ID,
  FEATURE_ANNOUNCEMENTS_KEY,
  REFLECTION_ANNOUNCEMENT_ID,
  canAnnounceFeatures,
  dismissAnnouncementPages,
  hasSeenAnnouncement,
  listPendingAnnouncementPages,
  recordAnnouncement,
} from '../feature-announcements';
import { MUSIC_ANNOUNCEMENT } from '../music-announcement';

const mockValues = new Map<string, string>();

jest.mock('../mmkv-storage', () => ({
  mmkvStorage: {
    getItem: (name: string) => mockValues.get(name) ?? null,
    setItem: (name: string, value: string) => {
      mockValues.set(name, value);
    },
    removeItem: (name: string) => {
      mockValues.delete(name);
    },
  },
}));

jest.mock('../../../assets/audio/previews/still-waters.m4a', () => 99, { virtual: true });

const allAvailable = { bookshelf: true, companion: true, music: true, reflection: true };

const openGate = {
  isTodayHome: true,
  todayReadingAvailable: true,
  soundOff: true,
  timerIdle: true,
  narrationActive: false,
  voiceActive: false,
  keyboardVisible: false,
  appActive: true,
  pendingCount: 1,
};

describe('feature announcements', () => {
  beforeEach(() => {
    mockValues.clear();
  });

  it('records a known announcement once and ignores private text', () => {
    expect(hasSeenAnnouncement(MUSIC_ANNOUNCEMENT.id)).toBe(false);
    recordAnnouncement(MUSIC_ANNOUNCEMENT.id, 'seen');
    expect(hasSeenAnnouncement(MUSIC_ANNOUNCEMENT.id)).toBe(true);
    recordAnnouncement('private-note', 'seen');
    recordAnnouncement(MUSIC_ANNOUNCEMENT.id, 'secret-status');
    const raw = mockValues.get(FEATURE_ANNOUNCEMENTS_KEY) ?? '';
    expect(raw).toContain(MUSIC_ANNOUNCEMENT.id);
    expect(raw).not.toContain('private-note');
    expect(raw).not.toContain('secret-status');
  });

  it('keeps unseen features eligible and treats seen or dismissed as settled', () => {
    expect(listPendingAnnouncementPages(allAvailable).map((page) => page.id)).toEqual([
      BOOKSHELF_ANNOUNCEMENT_ID,
      COMPANION_ANNOUNCEMENT_ID,
      MUSIC_ANNOUNCEMENT.id,
      REFLECTION_ANNOUNCEMENT_ID,
    ]);
    recordAnnouncement(BOOKSHELF_ANNOUNCEMENT_ID, 'seen');
    recordAnnouncement(COMPANION_ANNOUNCEMENT_ID, 'seen');
    recordAnnouncement(REFLECTION_ANNOUNCEMENT_ID, 'dismissed');
    expect(listPendingAnnouncementPages(allAvailable).map((page) => page.id)).toEqual([
      MUSIC_ANNOUNCEMENT.id,
    ]);
  });

  it('keeps an unseen feature eligible after a skipped-feature history', () => {
    mockValues.set(
      FEATURE_ANNOUNCEMENTS_KEY,
      JSON.stringify({
        [MUSIC_ANNOUNCEMENT.id]: { status: 'seen', at: 1_700_000_000_000 },
      }),
    );
    expect(hasSeenAnnouncement(MUSIC_ANNOUNCEMENT.id)).toBe(true);
    expect(listPendingAnnouncementPages(allAvailable).map((page) => page.id)).toEqual([
      BOOKSHELF_ANNOUNCEMENT_ID,
      COMPANION_ANNOUNCEMENT_ID,
      REFLECTION_ANNOUNCEMENT_ID,
    ]);
  });

  it('does not mark unknown or unavailable features', () => {
    recordAnnouncement('qa-only-preview', 'seen');
    dismissAnnouncementPages(['qa-only-preview', MUSIC_ANNOUNCEMENT.id]);
    expect(hasSeenAnnouncement(MUSIC_ANNOUNCEMENT.id)).toBe(true);
    const raw = mockValues.get(FEATURE_ANNOUNCEMENTS_KEY) ?? '';
    expect(raw).not.toContain('qa-only-preview');
    expect(listPendingAnnouncementPages({
      bookshelf: false,
      companion: true,
      music: false,
      reflection: false,
    }).map((page) => page.id)).toEqual([COMPANION_ANNOUNCEMENT_ID]);
    expect(hasSeenAnnouncement(REFLECTION_ANNOUNCEMENT_ID)).toBe(false);
  });

  it('closes remaining pages without nags and keeps existing music records valid', () => {
    recordAnnouncement(BOOKSHELF_ANNOUNCEMENT_ID, 'seen');
    recordAnnouncement(COMPANION_ANNOUNCEMENT_ID, 'seen');
    dismissAnnouncementPages([MUSIC_ANNOUNCEMENT.id, REFLECTION_ANNOUNCEMENT_ID]);
    expect(hasSeenAnnouncement(MUSIC_ANNOUNCEMENT.id)).toBe(true);
    expect(hasSeenAnnouncement(REFLECTION_ANNOUNCEMENT_ID)).toBe(true);
    expect(listPendingAnnouncementPages(allAvailable)).toEqual([]);
    expect(JSON.parse(mockValues.get(FEATURE_ANNOUNCEMENTS_KEY) ?? '{}')[MUSIC_ANNOUNCEMENT.id].status).toBe('dismissed');
  });

  it('keeps the existing announcement gates', () => {
    expect(canAnnounceFeatures(openGate)).toBe(true);
    expect(canAnnounceFeatures({ ...openGate, pendingCount: 0 })).toBe(false);
    expect(canAnnounceFeatures({ ...openGate, keyboardVisible: true })).toBe(false);
    expect(canAnnounceFeatures({ ...openGate, voiceActive: true })).toBe(false);
    expect(canAnnounceFeatures({ ...openGate, narrationActive: true })).toBe(false);
    expect(canAnnounceFeatures({ ...openGate, isTodayHome: false })).toBe(false);
    expect(canAnnounceFeatures({ ...openGate, todayReadingAvailable: false })).toBe(false);
    expect(canAnnounceFeatures({ ...openGate, appActive: false })).toBe(false);
    expect(canAnnounceFeatures({ ...openGate, soundOff: false })).toBe(false);
  });
});
