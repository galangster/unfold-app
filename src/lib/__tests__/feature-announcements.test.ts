import { FEATURE_ANNOUNCEMENTS_KEY, hasSeenAnnouncement, recordAnnouncement } from '../feature-announcements';
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
});
